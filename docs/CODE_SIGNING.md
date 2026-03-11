# Code Signing Setup

Code signing is **optional**. Your app builds and runs without it. Unsigned apps will show OS warnings ("unidentified developer" on macOS, SmartScreen on Windows).

## macOS

### What you need

- Apple Developer Program membership ($99/year)
- Developer ID Application certificate
- App-specific password for notarization

### Step 1: Export your certificate

1. Open **Keychain Access** on your Mac
2. Find your "Developer ID Application" certificate
3. Right-click > Export > save as `.p12` file with a password

### Step 2: Base64 encode the certificate

```bash
base64 -i certificate.p12 | pbcopy
```

### Step 3: Add GitHub Secrets

| Secret | Value |
|--------|-------|
| `CSC_LINK` | Base64-encoded `.p12` certificate |
| `CSC_KEY_PASSWORD` | Password you set when exporting the `.p12` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password ([create here](https://appleid.apple.com/account/manage)) |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID |

### How it works

- `electron-builder` detects the `CSC_LINK` env var and signs the app automatically
- It also notarizes the app with Apple using the `APPLE_*` env vars
- Notarization is required for macOS Catalina (10.15) and later

---

## Windows

### Option A: EV Code Signing Certificate (recommended for distribution)

EV certificates eliminate SmartScreen warnings immediately.

1. Purchase an EV code signing certificate from a provider (DigiCert, Sectigo, etc.)
2. Export the certificate as `.p12` / `.pfx`
3. Base64 encode: `base64 -i certificate.pfx | pbcopy`

### Option B: Self-signed certificate (for testing)

```powershell
New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=My App" -CertStoreLocation Cert:\CurrentUser\My
```

This won't eliminate SmartScreen warnings but is useful for testing the signing flow.

### Add GitHub Secrets

| Secret | Value |
|--------|-------|
| `CSC_LINK` | Base64-encoded `.pfx` / `.p12` certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

### How it works

- `electron-builder` detects `CSC_LINK` on Windows and signs the `.exe` and NSIS installer
- EV certificates provide immediate SmartScreen trust
- Standard certificates build trust over time based on download count

---

## Verifying

### macOS

```bash
codesign --verify --deep --strict dist/mac-arm64/My\ App.app
spctl --assess --type execute dist/mac-arm64/My\ App.app
```

### Windows

Right-click the `.exe` > Properties > Digital Signatures tab.

## Without code signing

If you skip code signing entirely:

- **macOS:** Users must right-click > Open > Open to bypass Gatekeeper
- **Windows:** SmartScreen shows "Windows protected your PC" warning, users click "More info" > "Run anyway"
- **Linux:** No signing required

The CD workflow handles this gracefully — if signing secrets aren't set, `electron-builder` builds without signing.
