<div align="center">

# Electron App Starter

**크로스 플랫폼 빌드 + GitHub Actions CI/CD + 코드 서명 + 자동 업데이트.**

데스크톱 앱을 만들고, push로 릴리즈하세요.

[![CI](https://github.com/heznpc/electron-app-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/electron-app-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F.svg)](https://www.electronjs.org/)

[English](README.md) | **한국어**

</div>

---

## 빠른 시작

```bash
# 1. GitHub에서 "Use this template" 클릭 (또는 clone)
git clone https://github.com/heznpc/electron-app-starter.git my-app
cd my-app

# 2. 의존성 설치
npm install

# 3. 앱 실행
npm start

# 4. 현재 플랫폼용 빌드
npm run dist
```

## 포함된 구성

```
├── src/
│   ├── main.js                 # 메인 프로세스 (BrowserWindow, IPC, 자동 업데이트)
│   ├── preload.js              # 프리로드 스크립트 (contextBridge)
│   └── renderer/
│       ├── index.html          # 렌더러 HTML
│       ├── renderer.js         # 렌더러 로직
│       └── styles.css          # 최소 스타일
├── assets/
│   └── icon.png                # 앱 아이콘 플레이스홀더 (교체 필요)
├── tests/
│   └── app.test.js             # 구조 테스트
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
├── eslint.config.js            # ESLint v9 flat config
└── package.json
```

## 주요 기능

- **크로스 플랫폼** — macOS (dmg, zip), Windows (NSIS 인스톨러), Linux (AppImage, deb)
- **CI 파이프라인** — 보안 감사, ESLint, Jest (모든 push 및 PR)
- **CD 파이프라인** — 원클릭 크로스 플랫폼 빌드 + GitHub Release (matrix 전략)
- **자동 업데이트** — `electron-updater`가 GitHub Releases를 확인하고 자동으로 다운로드 및 설치
- **코드 서명** — 선택적 macOS 공증 + Windows 서명 (GitHub Secrets)
- **보안** — `contextIsolation: true`, `nodeIntegration: false`, Content Security Policy
- **버전 관리** — `npm run version:patch/minor/major`
- **템플릿 셋업** — 첫 사용 시 설정 체크리스트 이슈 자동 생성

## CI/CD

### CI (모든 PR + main push 시)

| 단계 | 역할 |
|------|------|
| 보안 감사 | `npm audit`로 의존성 취약점 확인 |
| 린트 | ESLint v9 flat config |
| 테스트 | Jest (기본적으로 테스트 없이도 통과) |

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
npm run dist

# 특정 플랫폼 빌드
npm run dist:mac
npm run dist:win
npm run dist:linux

# 린트 & 테스트
npm run lint
npm test
```

## Electron Forge / Electron Vite 대신 이걸 쓰는 이유

[Electron Forge](https://www.electronforge.io/)와 [electron-vite](https://electron-vite.org/)는 Electron의 빌드 복잡성을 관리하는 **툴체인**입니다. 이 템플릿은 다른 접근입니다:

|  | 이 템플릿 | Forge / electron-vite |
|---|---|---|
| 철학 | CI/CD를 갖춘 가벼운 스타터 | 플러그인 기반 풀 툴체인 |
| 빌드 시스템 | electron-builder (package.json 설정) | Forge maker/publisher 또는 Vite |
| CI/CD | matrix 빌드 + 자동 업데이트 포함 | 미포함 |
| 코드 서명 | GitHub Secrets 설정 가이드 포함 | 수동 설정 |
| 자동 업데이트 | GitHub Releases와 바로 작동 | 수동 설정 필요 |
| 의존성 | runtime 2개, dev 6개 | 50개+ |
| AI/바이브코딩 | LLM이 깔끔한 vanilla JS 생성 | LLM이 플러그인 시스템을 이해해야 함 |

**이 템플릿을 선택하세요:**
- 첫날부터 프로덕션 CI/CD와 자동 업데이트가 필요할 때
- GitHub Actions로 크로스 플랫폼 빌드 + 코드 서명이 필요할 때
- AI 도구로 앱 코드를 생성할 때
- 유틸리티 규모의 앱을 만들 때

**Forge/electron-vite를 선택하세요:**
- 렌더러에서 React/Vue/Svelte + HMR이 필요할 때
- Forge 플러그인 생태계가 필요할 때
- 복잡한 네이티브 모듈 요구사항이 있을 때

### TypeScript는?

이 템플릿은 vanilla JavaScript를 사용합니다. TypeScript가 필요하면:

1. `devDependencies`에 `typescript` 추가
2. `tsconfig.json` 추가
3. `.js` 파일을 `.ts`로 변경
4. ESLint 설정을 TypeScript용으로 업데이트

## 기여

PR 환영합니다. [PR 템플릿](.github/PULL_REQUEST_TEMPLATE.md)을 사용해 주세요.

## 라이선스

[MIT](LICENSE)
