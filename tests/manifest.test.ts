import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validateManifest,
  loadManifest,
  resolveAffectedDocs,
  type Manifest,
  type ValidationResult,
} from '../src/manifest.js';

describe('validateManifest', () => {
  it('validates a correct manifest', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      description: 'Test manifest',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: ['*.test.ts', 'dist/**'],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.manifest).toEqual(manifest);
    expect(result.errors).toBeUndefined();
  });

  it('returns error for missing required field (version)', () => {
    const manifest = {
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('version'))).toBe(true);
  });

  it('returns error for missing required field (project)', () => {
    const manifest = {
      version: '1.0',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('project'))).toBe(true);
  });

  it('returns error for invalid version', () => {
    const manifest = {
      version: '2.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('version'))).toBe(true);
  });

  it('returns error for invalid framework', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'express',
      adapter: 'claude-code',
      mappings: [],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('framework'))).toBe(true);
  });

  it('returns error for duplicate mapping IDs', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
        {
          id: 'api-docs',
          doc: 'docs/api-reference.md',
          watches: ['src/**/*.ts'],
          purpose: 'API reference',
          strategy: 'rewrite',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Duplicate mapping id'))).toBe(true);
  });

  it('returns error for doc path not under docs/', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('doc must be under docs/'))).toBe(true);
  });

  it('returns error for non-kebab-case id', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'API_Docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('returns error for unknown adapter', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'unknown-adapter',
      mappings: [],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Unknown adapter'))).toBe(true);
  });

  it('returns warning for overly broad watch pattern **/*', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['**/*'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.some((w) => w.includes('overly broad watch pattern'))).toBe(true);
  });

  it('returns warning for overly broad watch pattern *', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['*'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.some((w) => w.includes('overly broad watch pattern'))).toBe(true);
  });

  it('returns warning for multiple mappings watching the same pattern', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
        {
          id: 'api-reference',
          doc: 'docs/api-reference.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'API reference',
          strategy: 'rewrite',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(
      result.warnings?.some((w) => w.includes('Multiple mappings') && w.includes('same pattern'))
    ).toBe(true);
  });

  it('returns error for empty watches array', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: [],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('defaults strategy to surgical if not provided', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
        },
      ],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.manifest?.mappings[0].strategy).toBe('surgical');
  });

  it('defaults ignore to empty array if not provided', () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [],
    };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.manifest?.ignore).toEqual([]);
  });
});

describe('loadManifest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'autodoc-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('loads and validates a valid manifest file', async () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
    };

    const manifestPath = join(tempDir, 'docs-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await loadManifest(manifestPath);

    expect(result).toEqual({
      ...manifest,
      ignore: [],
    });
  });

  it('throws error for invalid JSON', async () => {
    const manifestPath = join(tempDir, 'docs-manifest.json');
    await writeFile(manifestPath, '{ invalid json }');

    await expect(loadManifest(manifestPath)).rejects.toThrow('Invalid JSON');
  });

  it('throws error for invalid manifest', async () => {
    const manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'invalid',
      adapter: 'claude-code',
      mappings: [],
    };

    const manifestPath = join(tempDir, 'docs-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(loadManifest(manifestPath)).rejects.toThrow('Manifest validation failed');
  });

  it('throws error for non-existent file', async () => {
    const manifestPath = join(tempDir, 'non-existent.json');

    await expect(loadManifest(manifestPath)).rejects.toThrow();
  });
});

describe('resolveAffectedDocs', () => {
  it('returns affected doc when changed file matches watch pattern', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: [],
    };

    const changedFiles = ['src/controllers/users.controller.ts', 'src/services/users.service.ts'];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'api-docs',
      docPath: 'docs/api.md',
      watches: ['src/controllers/**/*.ts'],
      purpose: 'API documentation',
      strategy: 'surgical',
      triggeringFiles: ['src/controllers/users.controller.ts'],
    });
  });

  it('returns empty array when no changed files match watch patterns', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: [],
    };

    const changedFiles = ['src/services/users.service.ts', 'README.md'];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(0);
  });

  it('excludes changed files that match ignore patterns', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: ['**/*.test.ts', '**/*.spec.ts'],
    };

    const changedFiles = [
      'src/controllers/users.controller.ts',
      'src/controllers/users.controller.test.ts',
      'src/services/users.service.spec.ts',
    ];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(1);
    expect(result[0].triggeringFiles).toEqual(['src/controllers/users.controller.ts']);
  });

  it('returns multiple affected docs when multiple mappings match', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
        {
          id: 'architecture',
          doc: 'docs/architecture.md',
          watches: ['src/**/*.ts'],
          purpose: 'Architecture documentation',
          strategy: 'rewrite',
        },
      ],
      ignore: [],
    };

    const changedFiles = ['src/controllers/users.controller.ts'];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['api-docs', 'architecture']);
  });

  it('returns empty array when all changed files are ignored', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: ['**/*.test.ts'],
    };

    const changedFiles = ['src/users.test.ts', 'src/auth.test.ts'];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(0);
  });

  it('handles glob patterns correctly', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.controller.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: [],
    };

    const changedFiles = [
      'src/users/users.controller.ts',
      'src/auth/auth.controller.ts',
      'src/users/users.service.ts',
    ];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(1);
    expect(result[0].triggeringFiles).toEqual([
      'src/users/users.controller.ts',
      'src/auth/auth.controller.ts',
    ]);
  });

  it('returns empty array when no changed files provided', () => {
    const manifest: Manifest = {
      version: '1.0',
      project: 'test-project',
      framework: 'nestjs',
      adapter: 'claude-code',
      mappings: [
        {
          id: 'api-docs',
          doc: 'docs/api.md',
          watches: ['src/**/*.ts'],
          purpose: 'API documentation',
          strategy: 'surgical',
        },
      ],
      ignore: [],
    };

    const changedFiles: string[] = [];

    const result = resolveAffectedDocs(manifest, changedFiles);

    expect(result).toHaveLength(0);
  });
});
