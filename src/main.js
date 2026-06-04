const { app, BrowserWindow, ipcMain, powerMonitor, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('node:os');
const path = require('node:path');
const { buildSystemInfo } = require('./system-info.js');
const { isAllowedNavigation: isAllowedNavigationImpl } = require('./navigation-policy.js');
const { INVOKE_CHANNELS, EVENT_CHANNELS } = require('./shared/ipc-contract.js');

const RENDERER_DIR = path.resolve(__dirname, 'renderer');

let mainWindow;

// Tunables for the renderer crash-recovery loop. A renderer that throws
// during load (bad bundle, failed `loadFile`, OOM on first paint) dies
// immediately, which fires `render-process-gone` again the instant we
// relaunch it — an unbounded `createWindow()` here would spin
// createWindow -> crash -> createWindow forever and peg a CPU core.
// Same shape as AUTO_UPDATE_FAILURE_LIMIT below: cap the consecutive
// attempts, then stop and surface the failure instead of looping. The
// counter resets once a renderer survives past RENDERER_RELAUNCH_RESET_MS,
// so a healthy app that crashes once an hour never exhausts the cap.
const RENDERER_RELAUNCH_LIMIT = 3;
const RENDERER_RELAUNCH_RESET_MS = 60_000;
let rendererRelaunchCount = 0;
let lastRendererCrashAt = 0;

// Last-resort crash handlers — registered at module top so they catch
// failures during require() and pre-whenReady startup too, not just
// errors during the steady-state event loop. We log to stderr and
// relaunch the primary window when its renderer dies; swap console.error
// for your telemetry sink if you have one.
process.on('uncaughtException', (err) => {
  console.error('uncaughtException in main process:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection in main process:', reason);
});
app.on('render-process-gone', (_event, webContents, details) => {
  console.error('render-process-gone:', details);
  // Only relaunch if the dead renderer was the primary and nothing else is open.
  if (
    !mainWindow
    || webContents !== mainWindow.webContents
    || BrowserWindow.getAllWindows().length > 1
  ) {
    return;
  }

  // If the last crash was long enough ago, treat this as a fresh incident
  // rather than a continuation of a tight crash-loop, and reset the cap.
  const now = Date.now();
  if (now - lastRendererCrashAt > RENDERER_RELAUNCH_RESET_MS) {
    rendererRelaunchCount = 0;
  }
  lastRendererCrashAt = now;
  rendererRelaunchCount += 1;

  if (rendererRelaunchCount > RENDERER_RELAUNCH_LIMIT) {
    // The renderer is crash-looping (almost always a load-time fault that
    // relaunching can't fix). Stop retrying and fail loudly so CI / a
    // supervisor / the user sees it, instead of burning CPU forever.
    console.error(
      `render-process-gone: renderer crashed ${rendererRelaunchCount - 1}× `
      + `within ${RENDERER_RELAUNCH_RESET_MS}ms — giving up on relaunch.`,
    );
    mainWindow = undefined;
    app.exit(1);
    return;
  }

  console.error(
    `render-process-gone: relaunching primary window `
    + `(attempt ${rendererRelaunchCount}/${RENDERER_RELAUNCH_LIMIT})`,
  );
  createWindow();
});
app.on('child-process-gone', (_event, details) => {
  console.error('child-process-gone:', details);
});

// Explicit origin allowlist for non-file schemes. file: is allowed only
// for the on-disk renderer bundle directory — see navigation-policy.js.
// Add your production hosts here (e.g. 'https://app.example.com') before
// shipping if the renderer needs to talk to a remote origin.
const ALLOWED_NAVIGATION_ORIGINS = new Set([]);

function isAllowedNavigation(targetUrl) {
  return isAllowedNavigationImpl(targetUrl, RENDERER_DIR, ALLOWED_NAVIGATION_ORIGINS);
}

/**
 * Lock down a freshly created BrowserWindow against the two classic
 * sandbox-escape vectors:
 *
 * - `window.open()` / `target="_blank"` opening a new BrowserWindow with
 *   default webPreferences (i.e. nodeIntegration=true). Force every popup
 *   through shell.openExternal so it lands in the user's browser.
 * - In-window navigation to attacker-controlled origins. Block any
 *   `will-navigate` to an origin not explicitly allowlisted; defer
 *   external links to shell.openExternal too.
 *
 * Both guards remain effective even if a future webPreferences regression
 * weakens contextIsolation/sandbox, so they're cheap defense-in-depth.
 */
/**
 * Hand an external http(s) URL to the OS browser. shell.openExternal
 * returns a promise that rejects when the OS has no handler / the user
 * cancels the open dialog / the protocol is blocked — a swallowed
 * rejection there hides a real "the link did nothing" failure from
 * whoever is reading logs, so we surface it on stderr.
 *
 * @param {string} url
 */
function openExternalUrl(url) {
  shell.openExternal(url).catch((err) => {
    console.error('shell.openExternal failed for', url, err);
  });
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      // Allow the popup if the target is allowlisted; inherits parent's
      // hardened webPreferences via the default BrowserWindow contract.
      return { action: 'allow' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      openExternalUrl(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        openExternalUrl(url);
      }
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  hardenWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// --- IPC: request/response ---------------------------------------------------

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('system-info', () => buildSystemInfo({ os, electronApp: app, process }));

// --- IPC: main -> renderer broadcast ----------------------------------------

/**
 * Subscribe to native `powerMonitor` events and fan them out to every live
 * BrowserWindow. Real apps often react to sleep/resume (e.g. reopen sockets)
 * or AC/battery (e.g. throttle background work on battery) — this demo just
 * forwards them so the renderer can log them.
 */
function registerPowerEventBridge() {
  /** @param {import('./shared/ipc-contract.js').PowerEvent['kind']} kind */
  const forward = (kind) => {
    const payload = { kind, at: Date.now() };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('power-event', payload);
    }
  };

  powerMonitor.on('suspend', () => forward('suspend'));
  powerMonitor.on('resume', () => forward('resume'));
  powerMonitor.on('on-ac', () => forward('on-ac'));
  powerMonitor.on('on-battery', () => forward('on-battery'));
}

// --- Auto-update -------------------------------------------------------------

// Tunable: if the auto-updater fails this many consecutive times, we
// purge the partial-download cache and stop retrying for the session so
// a corrupted download doesn't loop forever on restart.
const AUTO_UPDATE_FAILURE_LIMIT = 3;
let autoUpdateFailures = 0;

/**
 * Remove electron-updater's partial-download cache (userData/pending) so the
 * next session starts from a clean slate after a run of failed updates.
 *
 * Returns whether the purge actually succeeded. The caller uses this to gate
 * loop-escape: if the directory could not be removed (e.g. EBUSY because the
 * file is still locked), tearing down the updater listeners would strand the
 * app on the same corrupt cache with no further retries and no surfaced
 * reason. So a failure is logged to stderr *and* reported back, and the
 * updater stays armed to try again on the next error.
 *
 * @returns {boolean} true if the cache was cleared, false if removal failed
 */
function clearAutoUpdateCache() {
  const fs = require('node:fs');
  const pendingDir = path.join(app.getPath('userData'), 'pending');
  try {
    fs.rmSync(pendingDir, { recursive: true, force: true });
    console.log('Auto-update cache cleared:', pendingDir);
    return true;
  } catch (err) {
    console.error('Failed to clear auto-update cache:', pendingDir, err);
    return false;
  }
}

function checkForUpdates() {
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    autoUpdateFailures = 0;
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    autoUpdateFailures += 1;
    console.log('Auto-update error:', err.message);
    // Symmetric to update-downloaded: tell the renderer so it can show UI
    // (toast / settings page indicator) instead of the user wondering why
    // the app never updates.
    if (mainWindow) {
      mainWindow.webContents.send('update-error', {
        message: err.message,
        attempts: autoUpdateFailures,
      });
    }
    if (autoUpdateFailures >= AUTO_UPDATE_FAILURE_LIMIT) {
      console.log(`Auto-update failed ${autoUpdateFailures}× — purging cache`);
      // Only stop retrying once the corrupt cache is actually gone. If the
      // purge failed (it returns false and logs to stderr), keep the
      // listeners armed so a later error gets another chance to clear it.
      if (clearAutoUpdateCache()) {
        autoUpdater.removeAllListeners();
      }
    }
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  createWindow();
  registerPowerEventBridge();

  // Only check for updates in packaged builds
  if (app.isPackaged) {
    checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Exported for structure tests / tooling — do not import from renderer.
module.exports = { INVOKE_CHANNELS, EVENT_CHANNELS };
