// Behavioural tests for src/main.js, driven through a mocked electron /
// electron-updater runtime (tests/helpers/electron-mock.js). These replace
// the old fs.readFileSync grep guards in harden-window.test.js and
// renderer-relaunch.test.js: instead of asserting the source *text* contains
// `setWindowOpenHandler`, we boot the real module, capture the handlers it
// actually wires, invoke them, and assert on the real side effects. Each
// test fails if the corresponding bug is reintroduced.
//
// Loading model: main.js require()s electron + electron-updater at module
// top and runs createWindow() inside app.whenReady().then(...). We
// jest.resetModules() + jest.doMock(...) per test (doMock is NOT hoisted),
// then require main.js and `await tick()` so the whenReady microtask runs
// before we assert.

'use strict';

const {
  makeElectronMock,
  makeUpdaterMock,
  primaryWindow,
} = require('./helpers/electron-mock');
const { INVOKE_CHANNELS } = require('../src/shared/ipc-contract.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));

// main.js attaches process-level uncaughtException/unhandledRejection
// listeners at module top. Re-require()ing it per test would accumulate them
// on the real `process` and trip MaxListenersExceededWarning, so we snapshot
// the existing listeners before each load and strip any main.js added after.
const PROC_EVENTS = ['uncaughtException', 'unhandledRejection'];
let procSnapshot = {};

function snapshotProcessListeners() {
  procSnapshot = {};
  for (const ev of PROC_EVENTS) {
    procSnapshot[ev] = new Set(process.listeners(ev));
  }
}

function restoreProcessListeners() {
  for (const ev of PROC_EVENTS) {
    for (const fn of process.listeners(ev)) {
      if (!procSnapshot[ev] || !procSnapshot[ev].has(fn)) {
        process.removeListener(ev, fn);
      }
    }
  }
}

// The listener main.js added for `ev` since the last snapshot (so we can
// invoke it directly instead of process.emit(), which would also trip jest's
// own uncaughtException handler).
function mainProcessListener(ev) {
  return process.listeners(ev).find((fn) => !procSnapshot[ev].has(fn));
}

/**
 * Reset the module registry, install electron + electron-updater doubles,
 * require the real src/main.js, and wait for the whenReady() boot. Returns
 * the mock handles plus the primary BrowserWindow main.js created.
 *
 * @param {object} [opts] passed to makeElectronMock (e.g. { isPackaged })
 * @param {object} [extraMocks] map of module-id -> factory for extra doMocks
 */
async function loadMain(opts = {}, extraMocks = {}) {
  jest.resetModules();
  snapshotProcessListeners();
  const electronHandles = makeElectronMock(opts);
  const updaterHandles = makeUpdaterMock();

  jest.doMock('electron', () => electronHandles.electron);
  jest.doMock('electron-updater', () => ({ autoUpdater: updaterHandles.autoUpdater }));
  for (const [id, factory] of Object.entries(extraMocks)) {
    jest.doMock(id, factory);
  }

  require('../src/main.js');
  await tick(); // let app.whenReady().then(createWindow) run

  return {
    ...electronHandles,
    ...updaterHandles,
    window: primaryWindow(),
  };
}

afterEach(() => {
  restoreProcessListeners();
  jest.restoreAllMocks();
  jest.resetModules();
});

// ---------------------------------------------------------------------------
// hardenWindow: window-open handler (MAJOR finding — openExternal rejection +
// the allow/deny security contract)
// ---------------------------------------------------------------------------

describe('createWindow: the BrowserWindow is created with hardened webPreferences', () => {
  test('contextIsolation on, nodeIntegration off, sandbox on, preload set', async () => {
    const path = require('node:path');
    const { window } = await loadMain();

    // Behavioural replacement for the old source grep: assert the actual
    // options object main.js passed to `new BrowserWindow(...)`. If a future
    // edit flips any of these, a renderer compromise regains node access —
    // this test fails instead of a text match passing on a stale string.
    expect(window.opts.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(window.opts.webPreferences.preload).toBe(
      path.join(path.resolve(__dirname, '..', 'src'), 'preload.js'),
    );
  });

  test('loads the renderer bundle index.html', async () => {
    const path = require('node:path');
    const { window } = await loadMain();
    expect(window.loadFile).toHaveBeenCalledWith(
      path.join(path.resolve(__dirname, '..', 'src'), 'renderer', 'index.html'),
    );
  });
});

describe('IPC invoke registration', () => {
  test('registers every invoke contract channel with ipcMain.handle', async () => {
    const { ipcMain } = await loadMain();

    expect([...ipcMain.handlers.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort());
    for (const channel of INVOKE_CHANNELS) {
      expect(ipcMain.handle).toHaveBeenCalledWith(channel, expect.any(Function));
    }
  });

});

describe('hardenWindow: setWindowOpenHandler (allow vs deny + openExternal)', () => {
  test('denies an external http URL and routes it to shell.openExternal', async () => {
    const { window, shell } = await loadMain();
    const handler = window.webContents.windowOpenHandler;
    expect(typeof handler).toBe('function');

    const result = handler({ url: 'https://evil.example.com/popup' });

    expect(result).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith('https://evil.example.com/popup');
  });

  test('allows an allowlisted file:// URL inside the bundle dir (no external open)', async () => {
    const path = require('node:path');
    const { window, shell } = await loadMain();
    const handler = window.webContents.windowOpenHandler;

    // RENDERER_DIR in main.js is <src>/renderer; build a file URL inside it.
    const bundleFile = `file://${path.resolve(__dirname, '..', 'src', 'renderer', 'index.html')}`;
    const result = handler({ url: bundleFile });

    expect(result).toEqual({ action: 'allow' });
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  test('denies a dangerous scheme without handing it to openExternal', async () => {
    const { window, shell } = await loadMain();
    const handler = window.webContents.windowOpenHandler;

    const result = handler({ url: 'javascript:alert(1)' });

    expect(result).toEqual({ action: 'deny' });
    // javascript: is neither http nor https, so it must NOT be opened externally.
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  test('logs (does not swallow) a shell.openExternal rejection', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { window, shell } = await loadMain();
    // Make the OS-open reject, as it does when no handler / user cancels.
    shell.openExternal.mockReturnValueOnce(Promise.reject(new Error('no handler')));

    const handler = window.webContents.windowOpenHandler;
    handler({ url: 'https://evil.example.com/popup' });
    await tick();

    // The bug was `.catch(() => {})`. Reintroducing it makes this fail.
    expect(errSpy).toHaveBeenCalledWith(
      'shell.openExternal failed for',
      'https://evil.example.com/popup',
      expect.any(Error),
    );
  });
});

// ---------------------------------------------------------------------------
// hardenWindow: will-navigate handler (MAJOR finding)
// ---------------------------------------------------------------------------

describe('hardenWindow: will-navigate (preventDefault for denied, allow for permitted)', () => {
  test('preventDefault + openExternal for a denied external URL', async () => {
    const { window, shell } = await loadMain();
    const event = { preventDefault: jest.fn() };

    window.webContents.emit('will-navigate', event, 'https://evil.example.com/');

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).toHaveBeenCalledWith('https://evil.example.com/');
  });

  test('does NOT preventDefault for an allowlisted bundle file', async () => {
    const path = require('node:path');
    const { window, shell } = await loadMain();
    const event = { preventDefault: jest.fn() };
    const bundleFile = `file://${path.resolve(__dirname, '..', 'src', 'renderer', 'index.html')}`;

    window.webContents.emit('will-navigate', event, bundleFile);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  test('denied non-http scheme is blocked but not opened externally', async () => {
    const { window, shell } = await loadMain();
    const event = { preventDefault: jest.fn() };

    window.webContents.emit('will-navigate', event, 'data:text/html,<script>1</script>');

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  test('logs (does not swallow) a shell.openExternal rejection on navigation', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { window, shell } = await loadMain();
    shell.openExternal.mockReturnValueOnce(Promise.reject(new Error('no handler')));
    const event = { preventDefault: jest.fn() };

    window.webContents.emit('will-navigate', event, 'https://evil.example.com/');
    await tick();

    expect(errSpy).toHaveBeenCalledWith(
      'shell.openExternal failed for',
      'https://evil.example.com/',
      expect.any(Error),
    );
  });
});

// ---------------------------------------------------------------------------
// render-process-gone: bounded crash-recovery (CRITICAL-shaped finding)
// ---------------------------------------------------------------------------

describe('render-process-gone: bounded relaunch vs reset on spacing', () => {
  // Emit render-process-gone on the *current* primary window's webContents,
  // then mark that window destroyed — modelling Electron tearing down the
  // dead renderer's window so the relaunched one is the only live window
  // (otherwise main.js's `getAllWindows().length > 1` guard would early-return
  // and the relaunch counter would never advance).
  function crashPrimary(app, BrowserWindow, nowSpy, atMs) {
    nowSpy.mockReturnValue(atMs);
    const current = BrowserWindow.getAllWindows().slice(-1)[0];
    app.emit('render-process-gone', {}, current.webContents, { reason: 'crashed' });
    current.destroyed = true;
  }

  test('N consecutive renderer crashes trigger app.exit, not infinite relaunch', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const nowSpy = jest.spyOn(Date, 'now');

    const { app, BrowserWindow } = await loadMain();

    // Limit is 3 relaunches; the 4th consecutive crash exceeds the cap.
    // Keep all crashes tightly spaced so the reset window never triggers.
    let t = 1_000;
    const crash = () => {
      crashPrimary(app, BrowserWindow, nowSpy, t);
      t += 100; // well under RENDERER_RELAUNCH_RESET_MS (60_000)
    };

    crash(); // attempt 1 -> relaunch (new window created)
    crash(); // attempt 2 -> relaunch
    crash(); // attempt 3 -> relaunch
    expect(app.exit).not.toHaveBeenCalled();

    crash(); // 4th consecutive within window -> exceeds cap -> exit
    expect(app.exit).toHaveBeenCalledWith(1);
  });

  test('crashes spaced beyond the reset window never exhaust the cap', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const nowSpy = jest.spyOn(Date, 'now');

    const { app, BrowserWindow } = await loadMain();

    // Each crash is > RENDERER_RELAUNCH_RESET_MS apart, so the counter
    // resets every time and the cap is never reached.
    let t = 1_000;
    const crashSpaced = () => {
      crashPrimary(app, BrowserWindow, nowSpy, t);
      t += 120_000; // > 60_000 reset window
    };

    for (let i = 0; i < 8; i += 1) {
      crashSpaced();
    }

    expect(app.exit).not.toHaveBeenCalled();
  });

  test('does not relaunch when the dead renderer is not the primary window', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app, BrowserWindow } = await loadMain();
    const beforeCount = BrowserWindow.instances.length;

    // A webContents that is not mainWindow.webContents.
    const otherWebContents = { id: 'other' };
    app.emit('render-process-gone', {}, otherWebContents, { reason: 'crashed' });

    expect(app.exit).not.toHaveBeenCalled();
    // No new window created for a non-primary crash.
    expect(BrowserWindow.instances.length).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// Auto-update cache purge gate (CRITICAL finding)
// ---------------------------------------------------------------------------

describe('auto-update: cache-purge failure is surfaced and gates loop-escape', () => {
  function emitErrors(autoUpdater, n) {
    for (let i = 0; i < n; i += 1) {
      autoUpdater.emit('error', new Error(`update failed #${i + 1}`));
    }
  }

  test('successful purge removes listeners (stops retrying)', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const rmSync = jest.fn(); // succeeds (no throw)

    const { autoUpdater } = await loadMain(
      { isPackaged: true },
      { 'node:fs': () => ({ ...jest.requireActual('node:fs'), rmSync }) },
    );

    emitErrors(autoUpdater, 3); // hits AUTO_UPDATE_FAILURE_LIMIT

    expect(rmSync).toHaveBeenCalledTimes(1);
    expect(autoUpdater.removeAllListeners).toHaveBeenCalledTimes(1);
  });

  test('FAILED purge is logged via console.error and listeners are KEPT armed', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const rmErr = new Error('EBUSY: resource busy');
    const rmSync = jest.fn(() => {
      throw rmErr;
    });

    const { autoUpdater } = await loadMain(
      { isPackaged: true },
      { 'node:fs': () => ({ ...jest.requireActual('node:fs'), rmSync }) },
    );

    emitErrors(autoUpdater, 3);

    // The bug was: swallow as console.log + removeAllListeners() unconditionally.
    // Fix: error surfaced AND listeners NOT removed when the purge failed.
    expect(rmSync).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      'Failed to clear auto-update cache:',
      expect.stringContaining('pending'),
      rmErr,
    );
    expect(autoUpdater.removeAllListeners).not.toHaveBeenCalled();
  });

  test('does not purge before the failure limit is reached', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const rmSync = jest.fn();

    const { autoUpdater } = await loadMain(
      { isPackaged: true },
      { 'node:fs': () => ({ ...jest.requireActual('node:fs'), rmSync }) },
    );

    emitErrors(autoUpdater, 2); // below the limit of 3

    expect(rmSync).not.toHaveBeenCalled();
    expect(autoUpdater.removeAllListeners).not.toHaveBeenCalled();
  });

  test('a later successful purge after a failed one DOES remove listeners', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    let call = 0;
    const rmSync = jest.fn(() => {
      call += 1;
      if (call === 1) {
        throw new Error('EBUSY');
      }
      // 2nd attempt succeeds
    });

    const { autoUpdater } = await loadMain(
      { isPackaged: true },
      { 'node:fs': () => ({ ...jest.requireActual('node:fs'), rmSync }) },
    );

    emitErrors(autoUpdater, 3); // 3rd error -> purge attempt #1 throws -> kept armed
    expect(autoUpdater.removeAllListeners).not.toHaveBeenCalled();

    emitErrors(autoUpdater, 1); // 4th error -> purge attempt #2 succeeds -> detach
    expect(rmSync).toHaveBeenCalledTimes(2);
    expect(autoUpdater.removeAllListeners).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// IPC handlers + power bridge wiring (proves the boot actually registers them)
// ---------------------------------------------------------------------------

describe('main boot: IPC handlers and power-event bridge are wired', () => {
  test('registers get-app-version and system-info invoke handlers', async () => {
    const { ipcMain, app } = await loadMain({ appVersion: '4.5.6' });

    expect(ipcMain.handlers.has('get-app-version')).toBe(true);
    expect(ipcMain.handlers.has('system-info')).toBe(true);

    // get-app-version returns app.getVersion() — behavioural, not a grep.
    expect(ipcMain.handlers.get('get-app-version')()).toBe('4.5.6');
    expect(app.getVersion).toHaveBeenCalled();

    const info = ipcMain.handlers.get('system-info')();
    expect(info).toMatchObject({ appVersion: '4.5.6' });
  });

  test.each(['suspend', 'resume', 'on-ac', 'on-battery'])(
    'forwards powerMonitor "%s" to every window with the matching kind',
    async (nativeEvent) => {
      const { powerMonitor, window } = await loadMain();

      powerMonitor.emit(nativeEvent);

      expect(window.webContents.send).toHaveBeenCalledWith(
        'power-event',
        expect.objectContaining({ kind: nativeEvent, at: expect.any(Number) }),
      );
    },
  );

  test('does NOT start the auto-updater when the app is not packaged', async () => {
    const { autoUpdater } = await loadMain({ isPackaged: false });
    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  test('starts the auto-updater when the app is packaged', async () => {
    const { autoUpdater } = await loadMain({ isPackaged: true });
    expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// auto-update: renderer notifications (update-downloaded / update-error) and
// the failure-counter reset on a successful download.
// ---------------------------------------------------------------------------

describe('auto-update: renderer notifications', () => {
  test('forwards update-downloaded to the renderer with the version', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const { autoUpdater, window } = await loadMain({ isPackaged: true });

    autoUpdater.emit('update-downloaded', { version: '2.0.0' });

    expect(window.webContents.send).toHaveBeenCalledWith('update-downloaded', '2.0.0');
  });

  test('forwards update-error to the renderer with message + attempt count', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { autoUpdater, window } = await loadMain({ isPackaged: true });

    autoUpdater.emit('error', new Error('boom'));

    expect(window.webContents.send).toHaveBeenCalledWith('update-error', {
      message: 'boom',
      attempts: 1,
    });
  });

  test('a successful download resets the consecutive-failure counter', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const rmSync = jest.fn();
    const { autoUpdater } = await loadMain(
      { isPackaged: true },
      { 'node:fs': () => ({ ...jest.requireActual('node:fs'), rmSync }) },
    );

    // Two failures, then a success, then two more failures: the counter
    // restarts after the download, so the purge (limit 3) must NOT fire.
    autoUpdater.emit('error', new Error('e1'));
    autoUpdater.emit('error', new Error('e2'));
    autoUpdater.emit('update-downloaded', { version: '3.0.0' });
    autoUpdater.emit('error', new Error('e3'));
    autoUpdater.emit('error', new Error('e4'));

    expect(rmSync).not.toHaveBeenCalled();

    // The 5th and 6th errors (3rd & 4th in the new streak) reach the limit.
    autoUpdater.emit('error', new Error('e5')); // streak hits 3 -> purge
    expect(rmSync).toHaveBeenCalledTimes(1);
  });

  test('logs an available update (update-available handler is wired)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { autoUpdater } = await loadMain({ isPackaged: true });

    autoUpdater.emit('update-available', { version: '5.5.5' });

    expect(logSpy).toHaveBeenCalledWith('Update available:', '5.5.5');
  });

  test('update events are safe when no primary window exists (post crash-exit)', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const nowSpy = jest.spyOn(Date, 'now');
    const { app, autoUpdater, BrowserWindow } = await loadMain({ isPackaged: true });

    // Exhaust the renderer relaunch cap so main.js sets mainWindow = undefined.
    let t = 1_000;
    for (let i = 0; i < 4; i += 1) {
      nowSpy.mockReturnValue(t);
      t += 100;
      const current = BrowserWindow.getAllWindows().slice(-1)[0];
      app.emit('render-process-gone', {}, current.webContents, { reason: 'crashed' });
      current.destroyed = true;
    }
    expect(app.exit).toHaveBeenCalledWith(1);

    const sendCallsBefore = BrowserWindow.instances.reduce(
      (n, w) => n + w.webContents.send.mock.calls.length,
      0,
    );

    // Now an updater event arrives with no live window: must not throw and
    // must not try to send to a torn-down window (the `if (mainWindow)` guard).
    expect(() => {
      autoUpdater.emit('update-downloaded', { version: '9.9.9' });
      autoUpdater.emit('error', new Error('late error'));
    }).not.toThrow();

    const sendCallsAfter = BrowserWindow.instances.reduce(
      (n, w) => n + w.webContents.send.mock.calls.length,
      0,
    );
    expect(sendCallsAfter).toBe(sendCallsBefore);
  });
});

// ---------------------------------------------------------------------------
// Last-resort process + child-process crash handlers, activate, and
// window-all-closed lifecycle.
// ---------------------------------------------------------------------------

describe('main: lifecycle and last-resort crash handlers', () => {
  test('uncaughtException handler logs the error to stderr', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await loadMain();
    const handler = mainProcessListener('uncaughtException');
    expect(typeof handler).toBe('function');

    const err = new Error('kaboom');
    handler(err);

    expect(errSpy).toHaveBeenCalledWith('uncaughtException in main process:', err);
  });

  test('unhandledRejection handler logs the reason to stderr', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await loadMain();
    const handler = mainProcessListener('unhandledRejection');

    handler('some-rejection-reason');

    expect(errSpy).toHaveBeenCalledWith(
      'unhandledRejection in main process:',
      'some-rejection-reason',
    );
  });

  test('child-process-gone is logged', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = await loadMain();

    const details = { type: 'GPU', reason: 'crashed' };
    app.emit('child-process-gone', {}, details);

    expect(errSpy).toHaveBeenCalledWith('child-process-gone:', details);
  });

  test('activate recreates a window only when none are open', async () => {
    const { app, BrowserWindow } = await loadMain();
    const afterBoot = BrowserWindow.getAllWindows().length;
    expect(afterBoot).toBe(1);

    // With a window already open, activate must NOT spawn another.
    app.emit('activate');
    expect(BrowserWindow.getAllWindows().length).toBe(1);

    // Close all windows, then activate -> a fresh window is created.
    BrowserWindow.instances.forEach((w) => {
      w.destroyed = true;
    });
    app.emit('activate');
    expect(BrowserWindow.getAllWindows().length).toBe(1);
  });

  test('window-all-closed quits on non-darwin and stays alive on darwin', async () => {
    const original = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const linux = await loadMain();
      linux.app.emit('window-all-closed');
      expect(linux.app.quit).toHaveBeenCalledTimes(1);

      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const mac = await loadMain();
      mac.app.emit('window-all-closed');
      expect(mac.app.quit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });
});
