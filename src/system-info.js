// Pure builder for the `system-info` IPC payload.
// Split from `main.js` so it can be unit-tested without booting Electron.

'use strict';

/**
 * @typedef {import('./shared/ipc-contract.js').SystemInfo} SystemInfo
 *
 * @typedef {Object} BuildSystemInfoDeps
 * @property {{ platform: () => NodeJS.Platform, arch: () => string, hostname: () => string }} os
 * @property {{ getVersion: () => string }} electronApp
 * @property {{ versions: { electron?: string } }} process
 */

/**
 * Assemble a `SystemInfo` object from injected runtime deps. Keeping this
 * pure (no direct `require('electron')` / `require('os')`) makes it trivial
 * to mock in Jest.
 *
 * @param {BuildSystemInfoDeps} deps
 * @returns {SystemInfo}
 */
function buildSystemInfo({ os, electronApp, process: proc }) {
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    electronVersion: proc.versions.electron || 'unknown',
    appVersion: electronApp.getVersion(),
  };
}

module.exports = { buildSystemInfo };
