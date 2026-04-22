import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { detectFramework, type Framework, type FrameworkDetectionResult } from '../src/detect.js';

describe('detectFramework', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'autodoc-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('detects NestJS from package.json with @nestjs/core in dependencies', async () => {
    const packageJson = {
      name: 'test-app',
      dependencies: {
        '@nestjs/core': '^10.0.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'nestjs',
      confidence: 'high',
    });
  });

  it('detects NestJS from package.json with @nestjs/core in devDependencies', async () => {
    const packageJson = {
      name: 'test-app',
      devDependencies: {
        '@nestjs/core': '^10.0.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'nestjs',
      confidence: 'high',
    });
  });

  it('detects Next.js from package.json with next in dependencies', async () => {
    const packageJson = {
      name: 'test-app',
      dependencies: {
        next: '^14.0.0',
        react: '^18.0.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'nextjs',
      confidence: 'high',
    });
  });

  it('detects Next.js from package.json with next in devDependencies', async () => {
    const packageJson = {
      name: 'test-app',
      devDependencies: {
        next: '^14.0.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'nextjs',
      confidence: 'high',
    });
  });

  it('detects NestJS when both NestJS and Next.js are present (NestJS wins)', async () => {
    const packageJson = {
      name: 'test-app',
      dependencies: {
        '@nestjs/core': '^10.0.0',
        next: '^14.0.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'nestjs',
      confidence: 'high',
    });
  });

  it('detects Laravel from composer.json with laravel/framework in require', async () => {
    const composerJson = {
      name: 'test/app',
      require: {
        'laravel/framework': '^10.0',
        php: '^8.1',
      },
    };

    await writeFile(join(tempDir, 'composer.json'), JSON.stringify(composerJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'laravel',
      confidence: 'high',
    });
  });

  it('detects generic with low confidence when no package.json or composer.json exists', async () => {
    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'generic',
      confidence: 'low',
    });
  });

  it('detects generic with low confidence when package.json has no matching frameworks', async () => {
    const packageJson = {
      name: 'test-app',
      dependencies: {
        express: '^4.18.0',
        lodash: '^4.17.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'generic',
      confidence: 'low',
    });
  });

  it('falls back to generic when package.json contains invalid JSON', async () => {
    await writeFile(join(tempDir, 'package.json'), '{ invalid json }');

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'generic',
      confidence: 'low',
    });
  });

  it('falls back to generic when composer.json contains invalid JSON', async () => {
    await writeFile(join(tempDir, 'composer.json'), '{ invalid json }');

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'generic',
      confidence: 'low',
    });
  });

  it('detects generic when package.json has no dependencies or devDependencies', async () => {
    const packageJson = {
      name: 'test-app',
      version: '1.0.0',
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'generic',
      confidence: 'low',
    });
  });

  it('detects Laravel when composer.json exists even if package.json also exists', async () => {
    const packageJson = {
      name: 'test-app',
      dependencies: {
        express: '^4.18.0',
      },
    };

    const composerJson = {
      name: 'test/app',
      require: {
        'laravel/framework': '^10.0',
      },
    };

    await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    await writeFile(join(tempDir, 'composer.json'), JSON.stringify(composerJson, null, 2));

    const result = await detectFramework(tempDir);

    expect(result).toEqual({
      framework: 'laravel',
      confidence: 'high',
    });
  });
});
