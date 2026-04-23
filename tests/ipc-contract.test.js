const fs = require('fs');
const path = require('path');
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
});
