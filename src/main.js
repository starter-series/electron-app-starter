const { app, BrowserWindow, ipcMain, powerMonitor, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('node:os');
const path = require('node:path');
const { buildSystemInfo } = require('./system-info.js');
const { INVOKE_CHANNELS, EVENT_CHANNELS } = require('./shared/ipc-contract.js');

let mainWindow;

/**
 * Last-resort crash handlers. Without these, an uncaught error in the
 * main process silently kills the app, an unhandled rejection bubbles
 * to a deprecated default that may change between Node majors, and a
 * renderer crash leaves a blank BrowserWindow with no recourse.
 *
 * We can't always recover, but we can at least leave a trail on stderr
 * (visible in `--enable-logging`, OS-level logs, and the user's
 * `~/Library/Logs/<app>` directory on macOS) and try to relaunch the
 * primary window when the renderer dies.
 *
 * Real apps should swap console.error for whatever telemetry sink they
 * use; the template keeps it on stderr so the AGENTS.md "no paid SaaS"
 * rule isn't violated by default.
 */
function registerCrashHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException in main process:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection in main process:', reason);
  });
  app.on('render-process-gone', (_event, webContents, details) => {
    console.error('render-process-gone:', details);
    // If the primary window died and no other window is alive, relaunch
    // a fresh one so the app isn't a zombie. Skip if multiple windows
    // are still up — let the user keep working in those.
    if (
      mainWindow
      && webContents === mainWindow.webContents
      && BrowserWindow.getAllWindows().length <= 1
    ) {
      mainWindow = null;
      createWindow();
    }
  });
  app.on('child-process-gone', (_event, details) => {
    console.error('child-process-gone:', details);
  });
}

// Origins the renderer is allowed to navigate to in-window. Anything else
// stays in-app via shell.openExternal (or is denied for the popup case).
// Add your production hosts here before shipping.
const ALLOWED_NAVIGATION_ORIGINS = new Set([
  'file://', // local renderer html bundle
]);

function isAllowedNavigation(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'file:') return true;
    return ALLOWED_NAVIGATION_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
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
function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      // Allow the popup if the target is allowlisted; inherits parent's
      // hardened webPreferences via the default BrowserWindow contract.
      return { action: 'allow' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url).catch(() => {});
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

function clearAutoUpdateCache() {
  // electron-updater writes partial downloads under userData/pending/.
  // Removing it forces the next session to start from a clean slate.
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const pendingDir = path.join(app.getPath('userData'), 'pending');
    fs.rmSync(pendingDir, { recursive: true, force: true });
    console.log('Auto-update cache cleared:', pendingDir);
  } catch (err) {
    console.log('Failed to clear auto-update cache:', err.message);
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
      clearAutoUpdateCache();
      autoUpdater.removeAllListeners();
    }
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  registerCrashHandlers();
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
