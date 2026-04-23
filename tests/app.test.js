const fs = require('fs');
const path = require('path');

describe('Project structure', () => {
  const root = path.resolve(__dirname, '..');

  test('package.json exists and has required fields', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.name).toBeDefined();
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.main).toBe('src/main.js');
  });

  test('main process entry exists', () => {
    expect(fs.existsSync(path.join(root, 'src', 'main.js'))).toBe(true);
  });

  test('preload script exists', () => {
    expect(fs.existsSync(path.join(root, 'src', 'preload.js'))).toBe(true);
  });

  test('renderer files exist', () => {
    expect(fs.existsSync(path.join(root, 'src', 'renderer', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src', 'renderer', 'renderer.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src', 'renderer', 'styles.css'))).toBe(true);
  });

  test('electron-builder config has required fields', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.build).toBeDefined();
    expect(pkg.build.appId).toBeDefined();
    expect(pkg.build.mac).toBeDefined();
    expect(pkg.build.win).toBeDefined();
    expect(pkg.build.linux).toBeDefined();
    expect(pkg.build.publish).toEqual({ provider: 'github' });
  });

  test('preload uses contextBridge', () => {
    const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
    expect(preload).toContain('contextBridge');
    expect(preload).toContain('exposeInMainWorld');
  });

  test('main process has contextIsolation, nodeIntegration:false, sandbox:true', () => {
    const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
  });

  test('index.html has Content-Security-Policy', () => {
    const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'self'");
  });

  test('shared IPC contract module exists', () => {
    expect(fs.existsSync(path.join(root, 'src', 'shared', 'ipc-contract.js'))).toBe(true);
  });

  test('system-info helper module exists', () => {
    expect(fs.existsSync(path.join(root, 'src', 'system-info.js'))).toBe(true);
  });
});

describe('Version bumper', () => {
  const bumperPath = path.resolve(__dirname, '..', 'scripts', 'bump-version.js');

  test('bump script exists', () => {
    expect(fs.existsSync(bumperPath)).toBe(true);
  });
});
