import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  detectPackageManager,
  getExecCommand,
  getInstallCommand,
  type PackageManager,
} from '../src/pm.js';

describe('detectPackageManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'autodoc-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('detects npm from package-lock.json', async () => {
    await writeFile(join(tempDir, 'package-lock.json'), '{}');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('npm');
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    await writeFile(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', async () => {
    await writeFile(join(tempDir, 'yarn.lock'), '# yarn lockfile v1');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('yarn');
  });

  it('detects bun from bun.lockb', async () => {
    await writeFile(join(tempDir, 'bun.lockb'), 'binary content');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('bun');
  });

  it('defaults to npm when no lockfile exists', async () => {
    const result = await detectPackageManager(tempDir);

    expect(result).toBe('npm');
  });

  it('detects bun when multiple lockfiles exist (bun wins)', async () => {
    await writeFile(join(tempDir, 'bun.lockb'), 'binary content');
    await writeFile(join(tempDir, 'package-lock.json'), '{}');
    await writeFile(join(tempDir, 'yarn.lock'), '# yarn lockfile v1');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('bun');
  });

  it('detects pnpm when pnpm and npm lockfiles exist (pnpm wins)', async () => {
    await writeFile(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');
    await writeFile(join(tempDir, 'package-lock.json'), '{}');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('pnpm');
  });

  it('detects yarn when yarn and npm lockfiles exist (yarn wins)', async () => {
    await writeFile(join(tempDir, 'yarn.lock'), '# yarn lockfile v1');
    await writeFile(join(tempDir, 'package-lock.json'), '{}');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('yarn');
  });

  it('detects pnpm when pnpm, yarn, and npm lockfiles exist (pnpm wins)', async () => {
    await writeFile(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');
    await writeFile(join(tempDir, 'yarn.lock'), '# yarn lockfile v1');
    await writeFile(join(tempDir, 'package-lock.json'), '{}');

    const result = await detectPackageManager(tempDir);

    expect(result).toBe('pnpm');
  });
});

describe('getExecCommand', () => {
  it('returns correct exec command for npm', () => {
    expect(getExecCommand('npm')).toBe('npx --no-install');
  });

  it('returns correct exec command for pnpm', () => {
    expect(getExecCommand('pnpm')).toBe('pnpm exec');
  });

  it('returns correct exec command for yarn', () => {
    expect(getExecCommand('yarn')).toBe('yarn');
  });

  it('returns correct exec command for bun', () => {
    expect(getExecCommand('bun')).toBe('bunx');
  });
});

describe('getInstallCommand', () => {
  it('returns correct install command for npm', () => {
    expect(getInstallCommand('npm', 'lodash')).toBe('npm install lodash');
  });

  it('returns correct install command for pnpm', () => {
    expect(getInstallCommand('pnpm', 'lodash')).toBe('pnpm add lodash');
  });

  it('returns correct install command for yarn', () => {
    expect(getInstallCommand('yarn', 'lodash')).toBe('yarn add lodash');
  });

  it('returns correct install command for bun', () => {
    expect(getInstallCommand('bun', 'lodash')).toBe('bun add lodash');
  });

  it('returns correct install command with scoped package', () => {
    expect(getInstallCommand('npm', '@types/node')).toBe('npm install @types/node');
    expect(getInstallCommand('pnpm', '@types/node')).toBe('pnpm add @types/node');
    expect(getInstallCommand('yarn', '@types/node')).toBe('yarn add @types/node');
    expect(getInstallCommand('bun', '@types/node')).toBe('bun add @types/node');
  });

  it('returns correct install command with version specifier', () => {
    expect(getInstallCommand('npm', 'lodash@4.17.21')).toBe('npm install lodash@4.17.21');
    expect(getInstallCommand('pnpm', 'lodash@4.17.21')).toBe('pnpm add lodash@4.17.21');
    expect(getInstallCommand('yarn', 'lodash@4.17.21')).toBe('yarn add lodash@4.17.21');
    expect(getInstallCommand('bun', 'lodash@4.17.21')).toBe('bun add lodash@4.17.21');
  });
});
