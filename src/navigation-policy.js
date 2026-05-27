// Navigation allowlist for hardenWindow. Extracted from main.js so unit
// tests can exercise the real predicate — earlier the test file
// re-implemented the policy locally and silently passed even if main.js
// drifted. See tests/navigation-policy.test.js for the behavioural
// coverage.

'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');

/**
 * Decide whether `targetUrl` is allowed to navigate the renderer in-window.
 *
 * - `file:` URLs are restricted to `allowedRendererDir` (the on-disk
 *   bundle directory). This is the load-bearing tightening — Electron's
 *   `loadFile` puts the bundle on a `file:` URL, and without this guard
 *   a renderer XSS could navigate to `file:///etc/passwd` (or any local
 *   file) and the BrowserWindow would happily display it.
 * - All other origins must match `allowedOrigins` exactly. Anything not
 *   on the allowlist (including unknown custom schemes, `data:`, and
 *   `javascript:`) is denied.
 *
 * @param {string} targetUrl
 * @param {string} allowedRendererDir  Absolute, normalized path.
 * @param {Set<string>} allowedOrigins
 * @returns {boolean}
 */
function isAllowedNavigation(targetUrl, allowedRendererDir, allowedOrigins) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  if (parsed.protocol === 'file:') {
    let requested;
    try {
      // fileURLToPath handles Windows drive letters and percent-decoding.
      requested = fileURLToPath(parsed);
    } catch {
      return false;
    }
    const normalized = path.normalize(requested);
    // Exact match OR a path that starts with `<dir><sep>` — the trailing
    // separator prevents `/bundleEVIL/...` from matching `/bundle`.
    return (
      normalized === allowedRendererDir
      || normalized.startsWith(allowedRendererDir + path.sep)
    );
  }

  return allowedOrigins.has(parsed.origin);
}

module.exports = { isAllowedNavigation };
