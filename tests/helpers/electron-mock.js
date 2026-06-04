// Test double for the `electron` and `electron-updater` runtimes so the
// real src/main.js and src/preload.js can be require()d under jest and
// driven *behaviourally* — i.e. we capture the handlers main.js actually
// wires (will-navigate, window-open, render-process-gone, autoUpdater
// 'error', powerMonitor events) and invoke them, asserting on the real
// side effects. This is the opposite of the old fs.readFileSync grep
// tests: if a handler stops calling preventDefault / openExternal / app.exit,
// or the cache-purge gate regresses, these doubles let the assertion catch it.

'use strict';

const { EventEmitter } = require('node:events');

/**
 * A webContents stand-in. EventEmitter so `.on('will-navigate', cb)` and
 * `.on('did-finish-load', cb)` register real listeners we can `emit`.
 * `setWindowOpenHandler` stores the handler so a test can call it directly
 * with a `{ url }` and inspect the returned `{ action }`.
 */
class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.windowOpenHandler = null;
    this.send = jest.fn();
  }

  setWindowOpenHandler(fn) {
    this.windowOpenHandler = fn;
  }
}

/**
 * A BrowserWindow stand-in. Every instance is pushed onto `instances` so a
 * test can grab the one main.js created inside createWindow().
 */
class FakeBrowserWindow {
  constructor(opts) {
    this.opts = opts;
    this.webContents = new FakeWebContents();
    this.loadFile = jest.fn();
    this.destroyed = false;
    FakeBrowserWindow.instances.push(this);
  }

  static getAllWindows() {
    return FakeBrowserWindow.instances.filter((w) => !w.destroyed);
  }
}
FakeBrowserWindow.instances = [];

/**
 * Build a fresh set of electron mocks. Returns the module object to feed
 * jest.mock('electron', ...) plus handles to drive/inspect it.
 *
 * @param {{ isPackaged?: boolean, appVersion?: string }} [opts]
 */
function makeElectronMock(opts = {}) {
  FakeBrowserWindow.instances = [];

  const app = new EventEmitter();
  app.isPackaged = opts.isPackaged ?? false;
  app.getVersion = jest.fn(() => opts.appVersion ?? '1.0.0');
  app.getPath = jest.fn((name) => `/tmp/fake-userData/${name}`);
  app.quit = jest.fn();
  app.exit = jest.fn();
  // whenReady resolves on the next microtask; tests await a tick after
  // require() so the createWindow()/registerPowerEventBridge() boot runs.
  app.whenReady = jest.fn(() => Promise.resolve());

  const ipcMain = {
    handlers: new Map(),
    handle: jest.fn((channel, fn) => {
      ipcMain.handlers.set(channel, fn);
    }),
  };

  const powerMonitor = new EventEmitter();

  const shell = {
    openExternal: jest.fn(() => Promise.resolve()),
  };

  const electron = {
    app,
    ipcMain,
    powerMonitor,
    shell,
    BrowserWindow: FakeBrowserWindow,
  };

  return { electron, app, ipcMain, powerMonitor, shell, BrowserWindow: FakeBrowserWindow };
}

/**
 * electron-updater stand-in. `autoUpdater` is an EventEmitter so main.js's
 * `autoUpdater.on('error', ...)` / `'update-downloaded'` register real
 * listeners we can emit. `removeAllListeners` is spied so we can assert the
 * cache-purge gate (the CRITICAL finding): it must fire only when the purge
 * actually succeeded.
 */
function makeUpdaterMock() {
  const autoUpdater = new EventEmitter();
  autoUpdater.checkForUpdatesAndNotify = jest.fn(() => Promise.resolve());
  // Spy on the real EventEmitter.removeAllListeners so listeners still get
  // detached when called, but we can assert call count.
  jest.spyOn(autoUpdater, 'removeAllListeners');
  return { autoUpdater };
}

/**
 * Return the single BrowserWindow main.js created during boot.
 */
function primaryWindow() {
  const [win] = FakeBrowserWindow.instances;
  return win;
}

module.exports = {
  FakeWebContents,
  FakeBrowserWindow,
  makeElectronMock,
  makeUpdaterMock,
  primaryWindow,
};
