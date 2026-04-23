// Renderer — runs in the sandboxed, contextIsolated web page. The only way
// to reach the main process is through the whitelisted API that `preload.js`
// exposed on `window.api` (new) and `window.electronAPI` (legacy).

// --- Legacy: version badges + update banner ---------------------------------
document.getElementById('electron-version').textContent = window.electronAPI.versions.electron;
document.getElementById('chrome-version').textContent = window.electronAPI.versions.chrome;
document.getElementById('node-version').textContent = window.electronAPI.versions.node;

window.electronAPI.getAppVersion().then((version) => {
  document.getElementById('app-version').textContent = version;
});

window.electronAPI.onUpdateDownloaded((version) => {
  const banner = document.getElementById('update-banner');
  banner.textContent = `Update v${version} downloaded. Restart to apply.`;
  banner.hidden = false;
});

// --- New: IPC bridge demo ----------------------------------------------------

// 1. Request/response — one-shot call into the main process.
window.api.getSystemInfo().then((info) => {
  document.getElementById('system-info').textContent = JSON.stringify(info, null, 2);
}).catch((err) => {
  document.getElementById('system-info').textContent = `error: ${err.message}`;
});

// 2. Event subscription — main-process broadcast fan-out.
const powerLog = document.getElementById('power-log');

const unsubscribePower = window.api.onPowerEvent((event) => {
  // Drop the "waiting..." placeholder on first real event.
  const placeholder = powerLog.querySelector('.power-empty');
  if (placeholder) placeholder.remove();

  const li = document.createElement('li');
  const time = new Date(event.at).toLocaleTimeString();
  li.textContent = `[${time}] ${event.kind}`;
  powerLog.prepend(li);

  // Cap the list so it cannot grow unbounded during a long session.
  while (powerLog.children.length > 20) {
    powerLog.removeChild(powerLog.lastElementChild);
  }
});

// Always hand the listener back on teardown. Without this the main process
// keeps broadcasting to a dead WebContents reference until the app quits.
window.addEventListener('beforeunload', () => {
  unsubscribePower();
});
