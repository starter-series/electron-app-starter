'use strict';

const { registerInvokeHandlers } = require('../src/ipc-registration.js');

describe('registerInvokeHandlers', () => {
  test('registers every invoke contract channel', () => {
    const ipcMain = { handle: jest.fn() };
    const handlers = new Map([
      ['alpha', jest.fn()],
      ['beta', jest.fn()],
    ]);

    registerInvokeHandlers(ipcMain, ['alpha', 'beta'], handlers);

    expect(ipcMain.handle).toHaveBeenCalledTimes(2);
    expect(ipcMain.handle).toHaveBeenCalledWith('alpha', handlers.get('alpha'));
    expect(ipcMain.handle).toHaveBeenCalledWith('beta', handlers.get('beta'));
  });

  test('throws when the contract declares a channel without a handler', () => {
    const ipcMain = { handle: jest.fn() };

    expect(() => registerInvokeHandlers(
      ipcMain,
      ['missing-handler'],
      new Map(),
    )).toThrow(/Missing ipcMain handler for invoke channel: missing-handler/);
    expect(ipcMain.handle).not.toHaveBeenCalled();
  });
});
