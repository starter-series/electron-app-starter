const { app, BrowserWindow, ipcMain, powerMonitor, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('node:os');
const path = require('path');
const { buildSystemInfo } = require('./system-info.js');
const { INVOKE_CHANNELS, EVENT_CHANNELS } = require('./shared/ipc-contract.js');

let mainWindow;

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

function checkForUpdates() {
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('Auto-update error:', err.message);
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
