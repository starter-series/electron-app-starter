// Preload script — the only code that can safely cross the context isolation
// boundary. Keeps `nodeIntegration: false` and `sandbox: true` honest by
// exposing a whitelisted, minimal API on `window`.
//
// Two patterns are demonstrated:
//   1. Request/response   -> ipcRenderer.invoke  (paired with ipcMain.handle)
//   2. Event subscription -> ipcRenderer.on      (paired with webContents.send)
//
// Channel names are inlined below because `sandbox: true` restricts preload
// to Electron built-ins only (no local-file requires). The canonical list
// lives in `src/shared/ipc-contract.js`; a unit test asserts these strings
// match so the whitelist cannot silently drift from the handler table.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Keep these literals in sync with `src/shared/ipc-contract.js`.
const INVOKE_CHANNELS = Object.freeze(['system-info', 'get-app-version']);
const EVENT_CHANNELS = Object.freeze(['power-event', 'update-downloaded']);

const invokeAllowed = new Set(INVOKE_CHANNELS);
const eventAllowed = new Set(EVENT_CHANNELS);

/**
 * Reject anything not on the whitelist. Raising here (rather than silently
 * ignoring) makes typos obvious in development.
 *
 * @param {Set<string>} allowed
 * @param {string} channel
 */
function assertAllowed(allowed, channel) {
  if (!allowed.has(channel)) {
    throw new Error(`IPC channel not whitelisted: ${channel}`);
  }
}

const api = {
  // --- 1. Request/response --------------------------------------------------
  getSystemInfo() {
    const channel = 'system-info';
    assertAllowed(invokeAllowed, channel);
    return ipcRenderer.invoke(channel);
  },

  // --- 2. Event subscription ------------------------------------------------
  onPowerEvent(callback) {
    const channel = 'power-event';
    assertAllowed(eventAllowed, channel);

    // Wrap so the untrusted renderer callback never sees the raw IpcEvent
    // (which exposes `sender` and can leak internals).
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);

    // Return an unsubscribe that removes *this* listener, not all of them —
    // multiple panels may be subscribed at once.
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

// Back-compat: keep the original `electronAPI` surface that the existing
// renderer.js uses. New code should prefer `window.api`.
contextBridge.exposeInMainWorld('electronAPI', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateDownloaded: (callback) => {
    const channel = 'update-downloaded';
    assertAllowed(eventAllowed, channel);
    ipcRenderer.once(channel, (_event, version) => callback(version));
  },
});
