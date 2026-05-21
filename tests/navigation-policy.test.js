// Behavioural tests for the *real* isAllowedNavigation predicate that
// ships in production (src/navigation-policy.js). The previous test file
// re-implemented the policy locally — meaning a drift in main.js would
// pass tests silently. This file removes that gap.

'use strict';

const path = require('node:path');
const { isAllowedNavigation } = require('../src/navigation-policy.js');

const RENDERER_DIR = path.resolve('/var/app/renderer');
const NO_ORIGINS = new Set();

describe('isAllowedNavigation: file:// is restricted to the bundle dir', () => {
  test('allows the bundle index.html', () => {
    expect(
      isAllowedNavigation('file:///var/app/renderer/index.html', RENDERER_DIR, NO_ORIGINS),
    ).toBe(true);
  });

  test('allows nested files inside the bundle dir', () => {
    expect(
      isAllowedNavigation('file:///var/app/renderer/sub/page.html', RENDERER_DIR, NO_ORIGINS),
    ).toBe(true);
  });

  test('denies file:// outside the bundle dir', () => {
    expect(isAllowedNavigation('file:///etc/passwd', RENDERER_DIR, NO_ORIGINS)).toBe(false);
    expect(
      isAllowedNavigation('file:///Users/victim/.ssh/id_rsa', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });

  test('denies path-traversal that resolves outside the bundle dir', () => {
    expect(
      isAllowedNavigation('file:///var/app/renderer/../../../etc/passwd', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });

  test('denies a sibling dir whose name starts with the bundle dir name', () => {
    // Guards against the `/renderer-evil/...` prefix-injection trick.
    expect(
      isAllowedNavigation('file:///var/app/renderer-evil/index.html', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });

  test('denies the empty path', () => {
    expect(isAllowedNavigation('file://', RENDERER_DIR, NO_ORIGINS)).toBe(false);
  });

  test('denies file:// with a non-empty host (fileURLToPath throws ERR_INVALID_FILE_URL_HOST)', () => {
    // Hits the defensive catch around fileURLToPath. Documented Node
    // behaviour: any host other than `localhost` on a file: URL throws.
    expect(
      isAllowedNavigation('file://attacker.example/etc/passwd', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });
});

describe('isAllowedNavigation: non-file origins are explicit-allowlist only', () => {
  const origins = new Set(['https://app.example.com']);

  test('allows an exact allowlisted origin', () => {
    expect(
      isAllowedNavigation('https://app.example.com/page', RENDERER_DIR, origins),
    ).toBe(true);
  });

  test('denies a different host on the same TLD+1', () => {
    expect(
      isAllowedNavigation('https://attacker.example.com/', RENDERER_DIR, origins),
    ).toBe(false);
  });

  test('denies http when only https is allowlisted', () => {
    expect(
      isAllowedNavigation('http://app.example.com/', RENDERER_DIR, origins),
    ).toBe(false);
  });

  test('denies a different port on the same host', () => {
    expect(
      isAllowedNavigation('https://app.example.com:8443/', RENDERER_DIR, origins),
    ).toBe(false);
  });
});

describe('isAllowedNavigation: dangerous schemes are denied', () => {
  test('denies javascript:', () => {
    expect(
      isAllowedNavigation('javascript:alert(1)', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });

  test('denies data:', () => {
    expect(
      isAllowedNavigation('data:text/html,<script>1</script>', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });

  test('denies custom schemes that are not on the origin allowlist', () => {
    expect(
      isAllowedNavigation('myapp://oauth-callback', RENDERER_DIR, NO_ORIGINS),
    ).toBe(false);
  });
});

describe('isAllowedNavigation: malformed input', () => {
  test('denies an empty string', () => {
    expect(isAllowedNavigation('', RENDERER_DIR, NO_ORIGINS)).toBe(false);
  });

  test('denies a non-URL string', () => {
    expect(isAllowedNavigation('not-a-url', RENDERER_DIR, NO_ORIGINS)).toBe(false);
  });
});
