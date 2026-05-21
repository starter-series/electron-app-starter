// Source-level wiring guard for hardenWindow in src/main.js. The
// behavioural assertions for the navigation policy live in
// tests/navigation-policy.test.js — that file imports the *real*
// isAllowedNavigation, so it is the source of truth for policy
// behaviour. This file only catches an accidental rename / unwiring
// of the Electron event hookups.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main.js'),
  'utf8',
);

describe('hardenWindow: source-level wiring (regression guard)', () => {
  test('main.js wires setWindowOpenHandler', () => {
    expect(main).toMatch(/setWindowOpenHandler\(/);
  });
  test('main.js wires will-navigate', () => {
    expect(main).toMatch(/'will-navigate'/);
  });
  test('main.js routes to shell.openExternal', () => {
    expect(main).toMatch(/shell\.openExternal/);
  });
  test('main.js delegates to navigation-policy.isAllowedNavigation', () => {
    // Catches the regression where hardenWindow grows its own ad-hoc
    // policy again — that drift is precisely what the audit caught.
    expect(main).toMatch(/require\(['"]\.\/navigation-policy\.js['"]\)/);
    expect(main).toMatch(/isAllowedNavigation/);
  });
});
