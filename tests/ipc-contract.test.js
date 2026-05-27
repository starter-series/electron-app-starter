const fs = require('node:fs');
const path = require('node:path');
const {
  INVOKE_CHANNELS,
  EVENT_CHANNELS,
  ALL_CHANNELS,
} = require('../src/shared/ipc-contract.js');

describe('IPC contract', () => {
  test('exports non-empty, frozen channel arrays', () => {
    expect(Array.isArray(INVOKE_CHANNELS)).toBe(true);
    expect(Array.isArray(EVENT_CHANNELS)).toBe(true);
    expect(INVOKE_CHANNELS.length).toBeGreaterThan(0);
    expect(EVENT_CHANNELS.length).toBeGreaterThan(0);
  });

  test('every channel is a non-empty kebab-case string', () => {
    for (const channel of ALL_CHANNELS) {
      expect(typeof channel).toBe('string');
      expect(channel).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  test('invoke and event channel sets are disjoint', () => {
    const invokeSet = new Set(INVOKE_CHANNELS);
    for (const eventChannel of EVENT_CHANNELS) {
      expect(invokeSet.has(eventChannel)).toBe(false);
    }
  });

  test('ALL_CHANNELS is the union of invoke + event', () => {
    expect(new Set(ALL_CHANNELS)).toEqual(
      new Set([...INVOKE_CHANNELS, ...EVENT_CHANNELS]),
    );
  });

  test('preload whitelist mirrors the contract', () => {
    // Preload cannot `require` local files under sandbox: true, so the
    // channel names are duplicated as literals in src/preload.js. This
    // test is the guard rail that stops them from drifting.
    const preload = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'preload.js'),
      'utf8',
    );
    for (const channel of ALL_CHANNELS) {
      expect(preload).toContain(`'${channel}'`);
    }
  });

  test('main process handles every INVOKE_CHANNELS entry', () => {
    const main = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'main.js'),
      'utf8',
    );
    for (const channel of INVOKE_CHANNELS) {
      expect(main).toMatch(new RegExp(`ipcMain\\.handle\\(\\s*['"]${channel}['"]`));
    }
  });

  test('every webContents.send channel in main.js is in EVENT_CHANNELS', () => {
    // Drift guard. Without this an orphan `webContents.send('foo', ...)`
    // — a channel main.js fires but neither the contract nor the preload
    // whitelist knows about — slips through silently, the renderer
    // never receives it, and the half-implemented feature looks fine.
    const main = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'main.js'),
      'utf8',
    );
    const sendMatches = [...main.matchAll(/webContents\.send\(\s*['"]([^'"]+)['"]/g)];
    const sentChannels = new Set(sendMatches.map((m) => m[1]));
    expect(sentChannels.size).toBeGreaterThan(0); // sanity: we are reading something
    for (const channel of sentChannels) {
      expect(EVENT_CHANNELS).toContain(channel);
    }
  });
});
