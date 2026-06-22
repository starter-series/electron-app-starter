'use strict';

/**
 * Register every invoke channel declared by the IPC contract.
 *
 * Failing fast here keeps a half-wired channel from looking healthy in the
 * renderer: if the contract grows, the main-process handler table must grow
 * with it before the app can boot.
 *
 * @param {{ handle: (channel: string, handler: Function) => void }} ipcMain
 * @param {readonly string[]} invokeChannels
 * @param {Map<string, Function>} invokeHandlers
 */
function registerInvokeHandlers(ipcMain, invokeChannels, invokeHandlers) {
  for (const channel of invokeChannels) {
    const handler = invokeHandlers.get(channel);
    if (!handler) {
      throw new Error(`Missing ipcMain handler for invoke channel: ${channel}`);
    }
    ipcMain.handle(channel, handler);
  }
}

module.exports = { registerInvokeHandlers };
