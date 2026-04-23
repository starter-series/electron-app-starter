const { buildSystemInfo } = require('../src/system-info.js');

/**
 * These tests deliberately do NOT require('electron'). The whole point of
 * extracting `buildSystemInfo` is that it takes injected deps, so we can
 * unit-test the handler body without booting Electron.
 */
describe('buildSystemInfo', () => {
  const deps = () => ({
    os: {
      platform: () => 'darwin',
      arch: () => 'arm64',
      hostname: () => 'test-host.local',
    },
    electronApp: {
      getVersion: () => '1.2.3',
    },
    process: {
      versions: { electron: '41.0.1' },
    },
  });

  test('returns the full SystemInfo shape', () => {
    const info = buildSystemInfo(deps());
    expect(info).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      hostname: 'test-host.local',
      electronVersion: '41.0.1',
      appVersion: '1.2.3',
    });
  });

  test('has exactly the documented keys and no extras', () => {
    const info = buildSystemInfo(deps());
    expect(Object.keys(info).sort()).toEqual([
      'appVersion',
      'arch',
      'electronVersion',
      'hostname',
      'platform',
    ]);
  });

  test('falls back to "unknown" when process.versions.electron is missing', () => {
    const d = deps();
    d.process = { versions: {} };
    const info = buildSystemInfo(d);
    expect(info.electronVersion).toBe('unknown');
  });

  // Mutation-check: if someone "refactors" buildSystemInfo to ignore the
  // injected hostname and call os.hostname() directly from node:os, this
  // test fails — guards against dep injection getting accidentally bypassed.
  test('uses the injected os.hostname — not ambient node:os', () => {
    const d = deps();
    d.os.hostname = () => 'INJECTED';
    expect(buildSystemInfo(d).hostname).toBe('INJECTED');
  });

  test('propagates app version from electronApp.getVersion', () => {
    const d = deps();
    d.electronApp.getVersion = () => '9.9.9';
    expect(buildSystemInfo(d).appVersion).toBe('9.9.9');
  });
});
