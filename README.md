<div align="center">

# Electron App Starter

**Cross-platform builds + GitHub Actions CI/CD + code signing + auto-update.**

Build your desktop app. Push to release.

[![CI](https://github.com/starter-series/electron-app-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/starter-series/electron-app-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F.svg)](https://www.electronjs.org/)

**English** | [한국어](README.ko.md)

</div>

---

> **Part of [Starter Series](https://github.com/starter-series/starter-series)** — Stop explaining CI/CD to your AI every time. Clone and start.
>
> [Docker Deploy](https://github.com/starter-series/docker-deploy-starter) · [Discord Bot](https://github.com/starter-series/discord-bot-starter) · [Telegram Bot](https://github.com/starter-series/telegram-bot-starter) · [Browser Extension](https://github.com/starter-series/browser-extension-starter) · **Electron App** · [npm Package](https://github.com/starter-series/npm-package-starter) · [React Native](https://github.com/starter-series/react-native-starter) · [VS Code Extension](https://github.com/starter-series/vscode-extension-starter) · [MCP Server](https://github.com/starter-series/mcp-server-starter) · [Python MCP Server](https://github.com/starter-series/python-mcp-server-starter) · [Cloudflare Pages](https://github.com/starter-series/cloudflare-pages-starter)

---

## Quick Start

```bash
# 1. Click "Use this template" on GitHub (or clone)
git clone https://github.com/starter-series/electron-app-starter.git my-app
cd my-app

# 2. Install dependencies
npm install

# 3. Run the app
npm start

# 4. Build for your platform
npm run dist
```

## What's Included

```
├── src/
│   ├── main.js                 # Main process (BrowserWindow, IPC, auto-update)
│   ├── preload.js              # Preload script (contextBridge + IPC whitelist)
│   ├── system-info.js          # Pure handler body for the system-info channel
│   ├── shared/
│   │   └── ipc-contract.js     # Single source of truth for IPC channels + types
│   └── renderer/
│       ├── index.html          # Renderer HTML
│       ├── renderer.js         # Renderer logic (consumes window.api)
│       └── styles.css          # Minimal styles
├── assets/
│   └── icon.png                # App icon placeholder (replace with yours)
├── tests/
│   ├── app.test.js                    # Structure tests
│   ├── ipc-contract.test.js           # Channel contract + preload whitelist
│   └── system-info-handler.test.js    # Pure-function handler (DI mocked)
├── docs/
│   ├── CODE_SIGNING.md         # macOS + Windows code signing setup
│   └── AUTO_UPDATE.md          # electron-updater configuration guide
├── scripts/
│   └── bump-version.js         # Semver version bumper
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # Lint, test
│   │   ├── cd.yml              # Cross-platform build + GitHub Release
│   │   └── setup.yml           # Auto setup checklist on first use
│   └── PULL_REQUEST_TEMPLATE.md
├── eslint.config.js            # ESLint v9 flat config
└── package.json
```

## Features

- **Cross-platform** — macOS (dmg, zip), Windows (NSIS installer), Linux (AppImage, deb)
- **CI Pipeline** — Security audit, ESLint, Jest on every push and PR
- **CD Pipeline** — One-click cross-platform build + GitHub Release via matrix strategy
- **Auto-update** — `electron-updater` checks GitHub Releases on startup, downloads and installs automatically
- **Code signing** — Optional macOS notarization + Windows signing via GitHub Secrets
- **Security** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, Content Security Policy
- **IPC bridge example** — Request/response + event subscription demo with a whitelist-based preload ([details](#ipc-bridge-example))
- **Version management** — `npm run version:patch/minor/major`
- **Template setup** — Auto-creates setup checklist issue on first use

## CI/CD

### CI (every PR + push to main)

| Step | What it does |
|------|-------------|
| Security audit | `npm audit` for dependency vulnerabilities |
| Lint | ESLint v9 flat config |
| Test | Jest (passes with no tests by default) |

### Security & Maintenance

| Workflow | What it does |
|----------|-------------|
| CodeQL (`codeql.yml`) | Static analysis for security vulnerabilities (push/PR + weekly) |
| Maintenance (`maintenance.yml`) | Weekly CI health check — auto-creates issue on failure |
| Stale (`stale.yml`) | Labels inactive issues/PRs after 30 days, auto-closes after 7 more |

### CD (manual trigger via Actions tab)

| Step | What it does |
|------|-------------|
| CI gate | Runs full CI first, build only proceeds if CI passes |
| Version guard | Fails if git tag already exists for this version |
| Matrix build | Builds on macOS, Windows, and Linux in parallel |
| Upload artifacts | Saves all platform builds as GitHub Actions artifacts |
| GitHub Release | Creates a tagged release with all platform binaries attached |

**How to release:**

1. Bump version: `npm run version:patch` (or `version:minor` / `version:major`)
2. Commit and push to `main`
3. Go to **Actions** tab > **Build & Release** > **Run workflow**
4. When done, a GitHub Release with all platform builds is created automatically
5. Existing users with auto-update receive the new version automatically

### GitHub Secrets (code signing - optional)

Code signing is **optional**. Builds work without it (apps will be unsigned). See [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md) for setup details.

#### macOS

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.p12` Developer ID certificate |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

#### Windows

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.pfx` code signing certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

## Development

```bash
# Run the app
npm start

# Run with logging enabled
npm run dev

# Bump version (updates package.json)
npm run version:patch   # 1.0.0 → 1.0.1
npm run version:minor   # 1.0.0 → 1.1.0
npm run version:major   # 1.0.0 → 2.0.0

# Build for current platform
npm run dist

# Build for specific platform
npm run dist:mac
npm run dist:win
npm run dist:linux

# Lint & test
npm run lint
npm test
```

## IPC bridge example

The starter ships with a working IPC bridge that covers the two patterns real Electron apps need. All channel names live in [`src/shared/ipc-contract.js`](src/shared/ipc-contract.js) — the main process and the preload both read from it so the whitelist can never drift from the handler table.

**1. Request / response** — `ipcRenderer.invoke` ↔ `ipcMain.handle`

```js
// src/preload.js — whitelist-enforced API on window.api
contextBridge.exposeInMainWorld('api', {
  getSystemInfo() {
    assertAllowed(invokeAllowed, 'system-info');
    return ipcRenderer.invoke('system-info');
  },
  // ...
});
```

```js
// src/main.js — pure handler, testable without Electron
ipcMain.handle('system-info', () =>
  buildSystemInfo({ os, electronApp: app, process }),
);
```

**2. Event subscription** — `webContents.send` → `ipcRenderer.on`

```js
// src/preload.js — returns an unsubscribe function
onPowerEvent(callback) {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on('power-event', listener);
  return () => ipcRenderer.removeListener('power-event', listener);
}
```

```js
// src/main.js — fan out native powerMonitor events
powerMonitor.on('suspend', () => broadcast('suspend'));
powerMonitor.on('resume',  () => broadcast('resume'));
```

**Renderer usage** ([`src/renderer/renderer.js`](src/renderer/renderer.js)):

```js
window.api.getSystemInfo().then(renderInfoBlock);

const off = window.api.onPowerEvent(renderLogLine);
window.addEventListener('beforeunload', off); // always unsubscribe
```

**Security stance** — the preload never exposes `ipcRenderer` itself, only the specific methods above, and rejects any channel that's not on the whitelist. The BrowserWindow runs with `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: true`**, and a strict CSP (`default-src 'self'`). See [Electron's Context Isolation docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) for the threat model this protects against.

## Why This Over Electron Forge / Electron Vite?

[Electron Forge](https://www.electronforge.io/) and [electron-vite](https://electron-vite.org/) are excellent **toolchains** that manage Electron's build complexity. This template takes a different approach:

|  | This template | Forge / electron-vite |
|---|---|---|
| Philosophy | Thin starter with CI/CD | Full toolchain with plugins |
| Build system | electron-builder (config in package.json) | Forge makers/publishers or Vite |
| CI/CD | Full pipeline with matrix builds + auto-update | Not included |
| Code signing | GitHub Secrets setup guide included | Manual setup |
| Auto-update | Works out of the box with GitHub Releases | Manual configuration |
| Dependencies | 1 runtime, 6 dev | 50+ |
| AI/vibe-coding | LLMs generate clean vanilla JS | LLMs must understand plugin system |

**Choose this template if:**
- You want production CI/CD and auto-update from day one
- You need cross-platform builds with code signing via GitHub Actions
- You're using AI tools to generate app code
- Your app is utility-scale, not a complex framework app

**Choose Forge/electron-vite if:**
- You need React/Vue/Svelte with HMR in the renderer
- You want the Forge plugin ecosystem
- Your app has complex native module requirements

### What about TypeScript?

This template uses vanilla JavaScript. If you need TypeScript:

1. Add `typescript` to devDependencies
2. Add a `tsconfig.json`
3. Rename `.js` files to `.ts`
4. Update ESLint config for TypeScript

## Contributing

PRs welcome. Please use the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## License

[MIT](LICENSE)
