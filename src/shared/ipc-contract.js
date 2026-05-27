// IPC contract — single source of truth for channel names and payload shapes.
// Imported by both the main process and the preload script so the whitelist
// and the handler table can never drift. The renderer sees the exposed API
// via `window.api` (typed below for editor autocomplete).

'use strict';

/**
 * Channels invoked from the renderer and handled in the main process
 * (request/response via `ipcRenderer.invoke` <-> `ipcMain.handle`).
 */
const INVOKE_CHANNELS = /** @type {const} */ (['system-info', 'get-app-version']);

/**
 * Channels pushed from the main process to the renderer
 * (subscription via `webContents.send` -> `ipcRenderer.on`).
 */
const EVENT_CHANNELS = /** @type {const} */ ([
  'power-event',
  'update-downloaded',
  'update-error',
]);

/**
 * Every channel the preload bridge is allowed to touch. Anything else is
 * rejected — this is the security crux of the IPC surface.
 */
const ALL_CHANNELS = /** @type {const} */ ([
  ...INVOKE_CHANNELS,
  ...EVENT_CHANNELS,
]);

/**
 * @typedef {typeof INVOKE_CHANNELS[number]} IpcInvokeChannel
 * @typedef {typeof EVENT_CHANNELS[number]} IpcEventChannel
 * @typedef {IpcInvokeChannel | IpcEventChannel} IpcChannel
 */

/**
 * Payload returned by `api.getSystemInfo()`.
 *
 * @typedef {Object} SystemInfo
 * @property {NodeJS.Platform} platform
 * @property {string} arch
 * @property {string} hostname
 * @property {string} electronVersion
 * @property {string} appVersion
 */

/**
 * Broadcast whenever the OS power state changes. `kind` mirrors the
 * `powerMonitor` events we subscribe to.
 *
 * @typedef {Object} PowerEvent
 * @property {'suspend' | 'resume' | 'on-ac' | 'on-battery'} kind
 * @property {number} at  Unix epoch millis when the event was emitted.
 */

/**
 * Broadcast when electron-updater fails to download or install an update.
 * The renderer can surface this so the user knows why the app isn't
 * updating instead of wondering at a silent failure.
 *
 * @typedef {Object} UpdateError
 * @property {string} message
 * @property {number} attempts  Consecutive failure count this session.
 */

/**
 * The API exposed on `window.api` in the renderer.
 *
 * @typedef {Object} ExposedApi
 * @property {() => Promise<SystemInfo>} getSystemInfo
 * @property {(cb: (event: PowerEvent) => void) => () => void} onPowerEvent
 *   Subscribe to power events. Returns an `unsubscribe` function that
 *   removes the listener — always call it on teardown (e.g. `beforeunload`).
 */

module.exports = {
  INVOKE_CHANNELS,
  EVENT_CHANNELS,
  ALL_CHANNELS,
};
