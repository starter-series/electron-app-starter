const { app, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('node:os');
const path = require('path');
const { buildSystemInfo } = require('./system-info.js');
const { INVOKE_CHANNELS, EVENT_CHANNELS } = require('./shared/ipc-contract.js');

let mainWindow;

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
