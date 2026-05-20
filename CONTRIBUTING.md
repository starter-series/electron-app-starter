# Contributing to electron-app-starter

Thanks for taking a look. This repo is a **template** — most consumers fork it and never come back, so contributions are best aimed at things that benefit every fork (CI hardening, security defaults, documentation clarity) rather than feature-specific code that only matters to one downstream app.

## Before you open a PR

1. **Read [`AGENTS.md`](AGENTS.md).** It captures the design intent — what's deliberately thin, what's load-bearing, and what *not* to change. The "Do NOT Modify" section there is non-negotiable without prior discussion.
2. **Open an issue first** for anything larger than a typo or a one-line fix. A 5-minute conversation usually saves an hour of rework.
3. **Check the [README.md "Non-goals" section](README.md#non-goals)** — proposals that pull the template toward Forge/electron-vite territory, add a bundler, or layer in a framework will be politely declined.

## Local setup

```bash
git clone https://github.com/starter-series/electron-app-starter
cd electron-app-starter
npm install
npm test
npm start
```

You need Node 22+ (`.nvmrc` pins it). `npm test` runs Jest with a coverage gate — keep your changes covered.

## What CI gates on

Every PR runs:

- `gitleaks` (secret scan, pinned by sha256)
- `npm audit --audit-level=high`
- `npx license-checker` (no GPL family in dependencies)
- ESLint v9 flat config
- Jest with coverage threshold (currently 95% statement/branch/function/line, actuals 100%)
- A dry-run `electron-builder --dir` to catch packaging regressions
- CodeQL (push/PR + weekly)

`main` is protected: CI must pass, linear history is required, force-push is disabled.

## Style

- **Vanilla JavaScript, CommonJS in the main process.** ESM in Electron main has ongoing caveats (top-level await, electron-builder entry loader); we stay on CJS until those settle.
- **`node:` prefix everywhere** — `require('node:path')`, not `require('path')`. Lint will likely enforce this eventually; do it by hand for now.
- **IPC channels live in `src/shared/ipc-contract.js`** — the single source of truth for the preload whitelist and the main-process handler table. Don't add `ipcMain.handle(...)` in main.js without also adding the channel name to the contract.
- **No new top-level dependencies without justification.** The runtime dep count is 1 (electron-updater); the dev count is 6. Every addition makes the supply-chain surface bigger.

## Commit messages

Conventional commits style (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`). Scope optional. No `Co-Authored-By` trailers — single-author project.

## Releasing (maintainers only)

1. `npm run version:patch` (or `minor` / `major`).
2. Commit and push to `main`.
3. **Actions** tab → **Build & Release** → **Run workflow**.
4. The CD pipeline runs CI as a gate, builds on macOS/Windows/Linux in parallel, attests build provenance, and publishes a GitHub Release with all installers attached.
5. `update-changelog.yml` mirrors the release notes into `CHANGELOG.md` automatically.

## Security

Vulnerabilities go to the [SECURITY.md](SECURITY.md) channel — **not** a public issue.

## License

By contributing, you agree your contribution is licensed under the [MIT License](LICENSE) of this project.
