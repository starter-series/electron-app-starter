<div align="center">

# Electron App Starter

**크로스 플랫폼 빌드 + GitHub Actions CI/CD + 코드 서명 + 자동 업데이트.**

데스크톱 앱을 만들고, push로 릴리즈하세요.

[![CI](https://github.com/starter-series/electron-app-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/starter-series/electron-app-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42-47848F.svg)](https://www.electronjs.org/)

[English](README.md) | **한국어**

</div>

---

> **[Starter Series](https://github.com/starter-series/starter-series)** — 매번 AI한테 CI/CD 설명하지 마세요. clone하고 바로 시작하세요.
>
> [Docker Deploy](https://github.com/starter-series/docker-deploy-starter) · [Discord Bot](https://github.com/starter-series/discord-bot-starter) · [Telegram Bot](https://github.com/starter-series/telegram-bot-starter) · [Browser Extension](https://github.com/starter-series/browser-extension-starter) · **Electron App** · [npm Package](https://github.com/starter-series/npm-package-starter) · [React Native](https://github.com/starter-series/react-native-starter) · [VS Code Extension](https://github.com/starter-series/vscode-extension-starter) · [MCP Server](https://github.com/starter-series/mcp-server-starter) · [Python MCP Server](https://github.com/starter-series/python-mcp-server-starter) · [Cloudflare Pages](https://github.com/starter-series/cloudflare-pages-starter)

---

## 빠른 시작

**[create-starter](https://github.com/starter-series/create-starter) 사용** (권장):

```bash
npx @starter-series/create my-electron-app --template electron-app
cd my-electron-app && npm install
npm run build
npm start
```

**또는 직접 clone:**

```bash
git clone https://github.com/starter-series/electron-app-starter my-electron-app
cd my-electron-app && npm install
npm run build
npm start
```

변경 전후에는 headless 검증 루프를 실행하세요:

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
npm pack --dry-run --json
```

현재 플랫폼용 빌드:

```bash
npm run dist
```

## 포함된 구성

```
├── src/
│   ├── main.js                 # 메인 프로세스 (BrowserWindow, IPC, 자동 업데이트)
│   ├── preload.js              # 프리로드 스크립트 (contextBridge + IPC 화이트리스트)
│   ├── system-info.js          # system-info 핸들러 본체 (순수 함수)
│   ├── shared/
│   │   └── ipc-contract.js     # 표준 IPC 채널 + payload 타입
│   └── renderer/
│       ├── index.html          # 렌더러 HTML
│       ├── renderer.js         # 렌더러 로직 (window.api 사용)
│       └── styles.css          # 최소 스타일
├── assets/
│   └── icon.png                # 앱 아이콘 플레이스홀더 (교체 필요)
├── tests/
│   ├── app.test.js                    # 구조 테스트
│   ├── ipc-contract.test.js           # 채널 계약 + preload 화이트리스트
│   └── system-info-handler.test.js    # 순수 함수 핸들러 (DI 모킹)
├── docs/
│   ├── CODE_SIGNING.md         # macOS + Windows 코드 서명 설정
│   └── AUTO_UPDATE.md          # electron-updater 설정 가이드
├── scripts/
│   └── bump-version.js         # Semver 버전 범퍼
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # 린트, 테스트
│   │   ├── cd.yml              # 크로스 플랫폼 빌드 + GitHub Release
│   │   └── setup.yml           # 첫 사용 시 자동 설정 체크리스트
│   └── PULL_REQUEST_TEMPLATE.md
├── eslint.config.js            # ESLint v10 flat config
└── package.json
```

## 한눈에 보기

### 현재 구현된 것 (Currently implemented)

- 크로스 플랫폼 데스크톱 빌드 — macOS (`dmg`, `zip`), Windows (NSIS 인스톨러), Linux (AppImage, `deb`)
- CI 파이프라인 — `npm audit`, ESLint v10 flat config, 레포별 baseline 커버리지 게이트가 적용된 Jest, headless `electron-builder --dir`
- CD 파이프라인 — Actions 탭에서 수동 트리거하는 macOS / Windows / Linux 매트릭스 빌드 + 모든 바이너리가 첨부된 GitHub Release
- 자동 업데이트 — GitHub Releases 기반 `electron-updater`, 렌더러에 오류 노출 포함
- 선택적 코드 서명 — GitHub Secrets로 macOS 공증 + Windows 서명
- 렌더러 하드닝 — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, 엄격한 CSP, `window.open` + cross-origin 네비게이션 차단
- IPC 계약 — 화이트리스트가 강제되는 preload 브리지. [`src/shared/ipc-contract.js`](src/shared/ipc-contract.js)가 표준 계약이며, sandboxed preload는 로컬 파일을 require할 수 없기 때문에 동일 채널 literal을 테스트로 drift 방지합니다.
- 공급망 가드 — 설치 시 `--ignore-scripts`, sha256으로 핀된 `gitleaks`, push/PR 및 주간 CodeQL
- 패키지 경계 — npm `files` allowlist로 생성된 `coverage/`, `dist/`, 설치 산출물이 `npm pack`에 들어가지 않도록 제한
- 템플릿 UX — 버전 업 스크립트(`npm run version:patch/minor/major`), 첫 사용 시 자동 생성되는 설정 체크리스트 이슈
- 테스트 구성 — 순수 함수 모듈(`system-info`, `navigation-policy`, `shared/ipc-contract`)에 대한 행위 단위 테스트가 라인 커버리지 95 %+, 그리고 `main.js` / `preload.js`에 대한 구조/계약 drift 가드. Electron 런타임 모듈은 CI의 `electron-builder --dir`로 검증 — 라인 커버리지 대상이 아님.

### 계획된 것 (Planned)

- 외부에 공언된 항목 없음. TypeScript 전환은 별도 스캐폴드 없이 추가 경로로만 문서화되어 있습니다 ([TypeScript는?](#typescript는) 참고).

### 설계 의도 (Design intent)

- **플러그인 툴체인 대신 vanilla JavaScript.** LLM이 프레임워크를 먼저 배우지 않고도 소스를 읽고 고칠 수 있도록. 플러그인 시스템이 필요하면 Forge / electron-vite를 쓰면 됩니다. 이 템플릿의 답은 "첫날부터 CI/CD와 서명이 켜져 있어야 한다"입니다.
- **`electron-builder` 설정은 `package.json` 한 곳.** 기여자에게 가리킬 파일이 하나뿐 — maker/publisher라는 별도 표면이 동기화될 일이 없습니다.
- **공유 모듈에 있는 IPC 채널.** 메인 프로세스 핸들러 테이블은 `src/shared/ipc-contract.js`에서 등록됩니다. sandboxed preload는 같은 채널 literal을 mirror하며, 테스트가 drift를 잡습니다. preload는 raw `ipcRenderer`를 절대 노출하지 않습니다.
- **기본값 `sandbox: true`.** 대다수 Electron 스타터가 빼놓는 옵션이지만, 렌더러 위협 모델에서 결정적인 부분이라 항상 켜둡니다.
- **레포별 baseline 커버리지 게이트.** 80 % 같은 고정값이 아니라 현재 상태가 바닥선 — 표면적이 작은 레포에서도 게이트가 정직하게 유지됩니다.

### 비목표 (Non-goals)

- 렌더러에서 React / Vue / Svelte + HMR — [electron-vite](https://electron-vite.org/)를 쓰세요.
- Forge 플러그인 생태계(maker, publisher, plugin) — [Electron Forge](https://www.electronforge.io/)를 쓰세요.
- 복잡한 빌드 요구사항이 있는 네이티브 모듈을 미리 배선해두는 것.
- "다 들어있음" 식 프레임워크 경험. AI가 편집할 때 숨겨진 플러그인 동작을 추론하지 않아도 되도록 얇게 유지합니다.

### 비공개 (Redacted)

- 없음. 공개 템플릿 — 외부 인물, 계정, 내부 사례를 어디에도 언급하지 않습니다.

## CI/CD

### CI (모든 PR + main push 시)

| 단계 | 역할 |
|------|------|
| 보안 감사 | `npm audit`로 의존성 취약점 확인 |
| 린트 | `src/`, `tests/`, scripts, lint config를 검사하는 ESLint v10 flat config |
| 테스트 | Jest baseline 커버리지 게이트 |
| 빌드 검증 | `npm run build` (`electron-builder --dir --publish never`) |

### 보안 & 유지보수

| 워크플로우 | 역할 |
|-----------|------|
| CodeQL (`codeql.yml`) | 보안 취약점 정적 분석 (push/PR + 주간) |
| Maintenance (`maintenance.yml`) | 주간 CI 헬스 체크 — 실패 시 이슈 자동 생성 |
| Stale (`stale.yml`) | 비활성 이슈/PR 30일 후 라벨링, 7일 후 자동 종료 |

### CD (Actions 탭에서 수동 실행)

| 단계 | 역할 |
|------|------|
| CI 게이트 | 전체 CI 먼저 실행, 통과 시에만 빌드 진행 |
| 버전 가드 | 해당 버전의 git 태그가 이미 있으면 실패 |
| Matrix 빌드 | macOS, Windows, Linux에서 병렬 빌드 |
| 아티팩트 업로드 | 모든 플랫폼 빌드를 GitHub Actions 아티팩트로 저장 |
| GitHub Release | 모든 플랫폼 바이너리가 첨부된 태그 릴리즈 자동 생성 |

**릴리즈 방법:**

1. 버전 업: `npm run version:patch` (또는 `version:minor` / `version:major`)
2. 커밋하고 `main`에 push
3. **Actions** 탭 > **Build & Release** > **Run workflow**
4. 완료되면 모든 플랫폼 빌드가 포함된 GitHub Release가 자동 생성
5. 자동 업데이트가 활성화된 기존 사용자는 새 버전을 자동으로 받음

### GitHub Secrets (코드 서명 - 선택 사항)

코드 서명은 **선택 사항**입니다. 없어도 빌드됩니다 (앱이 서명되지 않을 뿐). 설정 방법은 [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md)를 참고하세요.

#### macOS

| Secret | 설명 |
|--------|------|
| `CSC_LINK` | Base64 인코딩된 `.p12` Developer ID 인증서 |
| `CSC_KEY_PASSWORD` | 인증서 비밀번호 |
| `APPLE_ID` | Apple ID 이메일 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 공증용 앱 전용 비밀번호 |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

#### Windows

| Secret | 설명 |
|--------|------|
| `CSC_LINK` | Base64 인코딩된 `.pfx` 코드 서명 인증서 |
| `CSC_KEY_PASSWORD` | 인증서 비밀번호 |

## 개발

```bash
# 앱 실행
npm start

# 로깅 활성화 모드 실행
npm run dev

# 버전 업 (package.json 자동 업데이트)
npm run version:patch   # 1.0.0 → 1.0.1
npm run version:minor   # 1.0.0 → 1.1.0
npm run version:major   # 1.0.0 → 2.0.0

# 현재 플랫폼용 빌드
npm run build
npm run dist

# 특정 플랫폼 빌드
npm run dist:mac
npm run dist:win
npm run dist:linux

# 린트 & 테스트
npm run lint
npm test
```

## IPC 브리지 예제

실전 Electron 앱에서 꼭 필요한 두 가지 IPC 패턴을 바로 쓸 수 있는 형태로 포함했습니다. 모든 채널 이름은 [`src/shared/ipc-contract.js`](src/shared/ipc-contract.js)에 모여 있습니다. 메인 프로세스는 이 계약에서 invoke handler를 등록하고, sandboxed preload는 같은 literal을 mirror하며 `tests/ipc-contract.test.js`가 drift를 잡습니다.

**1. 요청 / 응답** — `ipcRenderer.invoke` ↔ `ipcMain.handle`

```js
// src/preload.js — window.api에 화이트리스트 강제 적용
contextBridge.exposeInMainWorld('api', {
  getSystemInfo() {
    assertAllowed(invokeAllowed, 'system-info');
    return ipcRenderer.invoke('system-info');
  },
  // ...
});
```

```js
// src/main.js — Electron 없이도 테스트 가능한 순수 핸들러
ipcMain.handle('system-info', () =>
  buildSystemInfo({ os, electronApp: app, process }),
);
```

**2. 이벤트 구독** — `webContents.send` → `ipcRenderer.on`

```js
// src/preload.js — unsubscribe 함수 반환
onPowerEvent(callback) {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on('power-event', listener);
  return () => ipcRenderer.removeListener('power-event', listener);
}
```

```js
// src/main.js — 네이티브 powerMonitor 이벤트 팬아웃
powerMonitor.on('suspend', () => broadcast('suspend'));
powerMonitor.on('resume',  () => broadcast('resume'));
```

**렌더러 사용** ([`src/renderer/renderer.js`](src/renderer/renderer.js)):

```js
window.api.getSystemInfo().then(renderInfoBlock);

const off = window.api.onPowerEvent(renderLogLine);
window.addEventListener('beforeunload', off); // 반드시 unsubscribe
```

**보안 설계** — preload는 `ipcRenderer` 자체를 노출하지 않고, 화이트리스트에 없는 채널은 거부합니다. BrowserWindow는 `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: true`**, 엄격한 CSP(`default-src 'self'`)로 실행됩니다. 위협 모델은 [Electron Context Isolation 공식 문서](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 참고.

## 비교 — 이 템플릿 vs Forge / electron-vite

빠른 참조용 표입니다. "왜"는 [설계 의도](#설계-의도-design-intent) / [비목표](#비목표-non-goals) 섹션에 있고, 이 표는 차이만 나란히 보여줍니다.

|  | 이 템플릿 | Forge / electron-vite |
|---|---|---|
| 철학 | CI/CD를 갖춘 가벼운 스타터 | 플러그인 기반 풀 툴체인 |
| 빌드 시스템 | `electron-builder` (`package.json` 설정) | Forge maker/publisher 또는 Vite |
| CI/CD | matrix 빌드 + 자동 업데이트 포함 | 미포함 |
| 코드 서명 | GitHub Secrets 설정 가이드 포함 | 수동 설정 |
| 자동 업데이트 | GitHub Releases와 바로 작동 | 수동 설정 필요 |
| 의존성 | runtime 1개, dev 6개 | 50개+ |
| AI/바이브코딩 | LLM이 깔끔한 vanilla JS 생성 | LLM이 플러그인 시스템을 이해해야 함 |

### TypeScript는?

이 템플릿은 vanilla JavaScript를 사용합니다. TypeScript가 필요하면:

1. `devDependencies`에 `typescript` 추가
2. `tsconfig.json` 추가
3. `.js` 파일을 `.ts`로 변경
4. ESLint 설정을 TypeScript용으로 업데이트

## 기여

PR 환영합니다 — 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요 (설계 의도, 린트/테스트/CI 게이트, "Non-goals" 경계 정리). 그다음 [PR 템플릿](.github/PULL_REQUEST_TEMPLATE.md)을 사용해 주세요.

## 라이선스

[MIT](LICENSE)
