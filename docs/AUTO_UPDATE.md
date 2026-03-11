# Auto-Update with electron-updater

This starter uses `electron-updater` to deliver automatic updates via GitHub Releases.

## How it works

1. You build and release your app using the CD workflow (or manually)
2. The app checks GitHub Releases for new versions on startup
3. If a new version is found, it downloads in the background
4. The user is notified and the update installs on next app restart

## Setup

Auto-update works out of the box when you:

1. Publish releases to GitHub (the CD workflow does this automatically)
2. Use the `"publish": { "provider": "github" }` config in `package.json` (already set)

No additional configuration is needed.

## How the code works

### Main process (`src/main.js`)

```js
// Only checks for updates in packaged builds (not during development)
if (app.isPackaged) {
  autoUpdater.checkForUpdatesAndNotify();
}
```

### Preload (`src/preload.js`)

```js
// Exposes update event to renderer
onUpdateDownloaded: (callback) => {
  ipcRenderer.on('update-downloaded', (_event, version) => callback(version));
}
```

### Renderer (`src/renderer/renderer.js`)

```js
// Shows a banner when update is ready
window.electronAPI.onUpdateDownloaded((version) => {
  // Display update notification to user
});
```

## Platform-specific behavior

| Platform | Update format | Method |
|----------|--------------|--------|
| macOS | `.zip` | Downloads zip, extracts, replaces app |
| Windows | `.exe` (NSIS) | Downloads full installer, runs on quit |
| Linux | `.AppImage` | Downloads new AppImage, replaces old |

**Important:** macOS auto-update requires the `.zip` target (included in this template's build config). The `.dmg` is for first-time installs; the `.zip` is for updates.

## Customizing update behavior

### Check frequency

By default, the app checks once on startup. To add periodic checks:

```js
// Check every 4 hours
setInterval(() => {
  autoUpdater.checkForUpdatesAndNotify();
}, 4 * 60 * 60 * 1000);
```

### Manual update trigger

```js
// In main process
ipcMain.handle('check-for-updates', () => {
  return autoUpdater.checkForUpdatesAndNotify();
});

// In preload
checkForUpdates: () => ipcRenderer.invoke('check-for-updates')

// In renderer
document.getElementById('check-update-btn').addEventListener('click', () => {
  window.electronAPI.checkForUpdates();
});
```

### Disable auto-download

```js
autoUpdater.autoDownload = false;

autoUpdater.on('update-available', (info) => {
  // Ask user before downloading
  // Then call: autoUpdater.downloadUpdate();
});
```

## Testing locally

Auto-update only works in packaged builds. To test:

1. Build a v1.0.0 release: `npm run dist`
2. Bump version: `npm run version:patch`
3. Build and publish v1.0.1 to GitHub Releases
4. Install and run v1.0.0 — it should detect and download v1.0.1

## Troubleshooting

| Issue | Solution |
|-------|---------|
| "No published versions" error | Ensure you have at least one GitHub Release with artifacts |
| Update not detected | Check that `package.json` version is lower than the latest release |
| macOS update fails | Ensure `.zip` target is included in build config |
| "Cannot check for updates in dev" | Normal — auto-update only works in packaged builds |
| Windows update fails silently | Check the app log at `%APPDATA%/<app-name>/logs/` |

## Private repositories

For private repos, you need a GitHub token:

```js
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-username',
  repo: 'your-repo',
  token: process.env.GH_TOKEN,
});
```

Store the token securely (e.g., in the system keychain via `keytar`).
