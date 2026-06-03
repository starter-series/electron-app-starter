// Source-level regression guard for the renderer crash-recovery cap in
// src/main.js. main.js cannot be imported under jest (it require()s the
// `electron` runtime at module top), so — like harden-window.test.js —
// this asserts on the source text. The audit caught an unbounded
// render-process-gone -> createWindow() relaunch that crash-loops forever
// when the renderer dies on load; these tests fail if that cap is removed
// or the handler goes back to relaunching unconditionally.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main.js'),
  'utf8',
);

describe('renderer relaunch loop: bounded crash-recovery (regression guard)', () => {
  test('main.js declares a finite renderer relaunch limit', () => {
    expect(main).toMatch(/RENDERER_RELAUNCH_LIMIT\s*=\s*\d+/);
  });

  test('main.js tracks consecutive relaunch attempts', () => {
    expect(main).toMatch(/rendererRelaunchCount/);
  });

  test('main.js compares the attempt count against the limit', () => {
    // The guard must actually gate on the limit, not just declare it.
    expect(main).toMatch(/rendererRelaunchCount\s*>\s*RENDERER_RELAUNCH_LIMIT/);
  });

  test('main.js stops relaunching (exit/quit) when the cap is exceeded', () => {
    expect(main).toMatch(/app\.exit\(|app\.quit\(/);
  });

  test('render-process-gone handler no longer relaunches unconditionally', () => {
    // Isolate the handler body and assert createWindow() inside it is
    // guarded by the relaunch counter rather than called outright.
    const handlerMatch = main.match(
      /app\.on\(\s*'render-process-gone'[\s\S]*?\n\}\);/,
    );
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch[0];
    expect(handler).toMatch(/createWindow\(\)/);
    expect(handler).toMatch(/rendererRelaunchCount/);
  });
});
