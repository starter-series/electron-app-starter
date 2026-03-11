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
