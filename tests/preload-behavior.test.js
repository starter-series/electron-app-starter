// Behavioural tests for src/preload.js. The old app.test.js only grepped
// the source for `contextBridge` / `exposeInMainWorld`. Here we require the
// real preload under a mocked electron, capture the API it actually exposes
// on window, and assert the security-critical behaviour:
//   - the whitelist guard (assertAllowed) THROWS for a non-whitelisted channel
//   - getSystemInfo invokes the whitelisted channel and nothing else
//   - onPowerEvent's unsubscribe removes ONLY its own listener (not all of them)

'use strict';

const { EventEmitter } = require('node:events');

/**
 * Reset modules, install an electron double whose ipcRenderer is a real
 * EventEmitter (so on/removeListener actually track listeners) and whose
 * contextBridge records every exposed world. Require the real preload, then
 * return the captured worlds + the ipcRenderer + the preload exports.
 */
function loadPreload() {
  jest.resetModules();

  const ipcRenderer = new EventEmitter();
  ipcRenderer.setMaxListeners(50);
  ipcRenderer.invoke = jest.fn(() => Promise.resolve('invoke-result'));
  // `on` / `once` / `removeListener` exist on EventEmitter already; spy so we
  // can assert calls while keeping the real listener bookkeeping.
  jest.spyOn(ipcRenderer, 'on');
  jest.spyOn(ipcRenderer, 'once');
  jest.spyOn(ipcRenderer, 'removeListener');

  const exposed = {};
  const contextBridge = {
    exposeInMainWorld: jest.fn((key, value) => {
      exposed[key] = value;
    }),
  };

  jest.doMock('electron', () => ({ contextBridge, ipcRenderer }));
  const preloadExports = require('../src/preload.js');

  return { exposed, ipcRenderer, contextBridge, preloadExports };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('preload: exposes the bridged API on window', () => {
  test('exposes `api` and `electronAPI` worlds', () => {
    const { exposed } = loadPreload();
    expect(typeof exposed.api).toBe('object');
    expect(typeof exposed.api.getSystemInfo).toBe('function');
    expect(typeof exposed.api.onPowerEvent).toBe('function');
    expect(typeof exposed.electronAPI).toBe('object');
  });
});

describe('preload: assertAllowed whitelist guard', () => {
  test('THROWS for a channel that is not whitelisted', () => {
    const { preloadExports } = loadPreload();
    const { assertAllowed, INVOKE_CHANNELS } = preloadExports;
    const allowed = new Set(INVOKE_CHANNELS);

    expect(() => assertAllowed(allowed, 'totally-not-a-real-channel')).toThrow(
      /not whitelisted/,
    );
    // And the rejected channel name is in the message (helps debugging typos).
    expect(() => assertAllowed(allowed, 'fs-read-arbitrary')).toThrow(
      /fs-read-arbitrary/,
    );
  });

  test('does NOT throw for a whitelisted channel', () => {
    const { preloadExports } = loadPreload();
    const { assertAllowed, INVOKE_CHANNELS } = preloadExports;
    const allowed = new Set(INVOKE_CHANNELS);
    expect(() => assertAllowed(allowed, 'system-info')).not.toThrow();
  });
});

describe('preload: getSystemInfo goes through the whitelisted invoke channel', () => {
  test('invokes ipcRenderer.invoke with exactly "system-info"', async () => {
    const { exposed, ipcRenderer } = loadPreload();

    await exposed.api.getSystemInfo();

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('system-info');
  });
});

describe('preload: onPowerEvent unsubscribe removes ONLY its own listener', () => {
  test('two subscribers; unsubscribing one leaves the other live', () => {
    const { exposed, ipcRenderer } = loadPreload();

    const calls = [];
    const unsubA = exposed.api.onPowerEvent((p) => calls.push(['A', p]));
    const unsubB = exposed.api.onPowerEvent((p) => calls.push(['B', p]));

    // Both registered on the same channel.
    expect(ipcRenderer.listenerCount('power-event')).toBe(2);

    // Emit -> both fire.
    ipcRenderer.emit('power-event', {}, { kind: 'suspend', at: 1 });
    expect(calls).toEqual([
      ['A', { kind: 'suspend', at: 1 }],
      ['B', { kind: 'suspend', at: 1 }],
    ]);

    // Unsubscribe A only.
    unsubA();
    expect(ipcRenderer.listenerCount('power-event')).toBe(1);

    // Emit again -> only B fires; A is gone, B survived.
    calls.length = 0;
    ipcRenderer.emit('power-event', {}, { kind: 'resume', at: 2 });
    expect(calls).toEqual([['B', { kind: 'resume', at: 2 }]]);

    // removeListener was called with B's own listener, not removeAllListeners.
    unsubB();
    expect(ipcRenderer.listenerCount('power-event')).toBe(0);
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(2);
  });

  test('the callback never receives the raw IpcEvent (only the payload)', () => {
    const { exposed, ipcRenderer } = loadPreload();
    const received = [];
    exposed.api.onPowerEvent((...args) => received.push(args));

    const rawEvent = { sender: 'SECRET_INTERNALS' };
    ipcRenderer.emit('power-event', rawEvent, { kind: 'on-battery', at: 9 });

    // Exactly one arg — the payload — and never the event object.
    expect(received).toEqual([[{ kind: 'on-battery', at: 9 }]]);
    expect(received[0]).toHaveLength(1);
    expect(received[0][0]).not.toBe(rawEvent);
  });
});

describe('preload: legacy electronAPI surface', () => {
  test('forwards process.versions verbatim (node/chrome/electron)', () => {
    const { exposed } = loadPreload();
    // Behavioural: the bridge must surface the *real* process.versions
    // fields, not hardcoded strings. (chrome/electron are undefined under
    // bare node/jest, which is exactly what process.versions reports here —
    // the assertion still fails if preload reads the wrong field name.)
    expect(exposed.electronAPI.versions).toEqual({
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    });
    expect(exposed.electronAPI.versions.node).toEqual(expect.any(String));
  });

  test('getAppVersion invokes the whitelisted get-app-version channel', async () => {
    const { exposed, ipcRenderer } = loadPreload();
    await exposed.electronAPI.getAppVersion();
    expect(() => exposed.electronAPI.getAppVersion()).not.toThrow();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-app-version');
  });

  test('onUpdateDownloaded subscribes once and unwraps the version payload', () => {
    const { exposed, ipcRenderer } = loadPreload();
    const seen = [];
    exposed.electronAPI.onUpdateDownloaded((v) => seen.push(v));

    // `once` was used (one-shot), not `on`.
    expect(ipcRenderer.once).toHaveBeenCalledWith('update-downloaded', expect.any(Function));

    ipcRenderer.emit('update-downloaded', {}, '7.7.7');
    expect(seen).toEqual(['7.7.7']);
    // one-shot: a second emit does nothing.
    ipcRenderer.emit('update-downloaded', {}, '8.8.8');
    expect(seen).toEqual(['7.7.7']);
  });

  test('onUpdateError returns an unsubscribe that removes only its own listener', () => {
    const { exposed, ipcRenderer } = loadPreload();
    const seen = [];
    const unsub = exposed.electronAPI.onUpdateError((p) => seen.push(p));

    expect(ipcRenderer.listenerCount('update-error')).toBe(1);
    ipcRenderer.emit('update-error', {}, { message: 'x', attempts: 2 });
    expect(seen).toEqual([{ message: 'x', attempts: 2 }]);

    unsub();
    expect(ipcRenderer.listenerCount('update-error')).toBe(0);
    ipcRenderer.emit('update-error', {}, { message: 'y', attempts: 3 });
    expect(seen).toEqual([{ message: 'x', attempts: 2 }]); // no further delivery
  });
});
