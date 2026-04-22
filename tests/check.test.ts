import { describe, it, expect } from 'vitest';
import { resolveAffectedDocs, type Manifest } from '../src/manifest.js';

describe('check/drift detection logic', () => {
  it('detects no drift when source files changed and matching docs changed', () => {
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

    const sourceChanges = ['src/controllers/users.controller.ts'];
    const docChanges = ['docs/api.md'];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBeGreaterThan(0);
    expect(affectedDocs[0].docPath).toBe('docs/api.md');

    const driftDetected = !docChanges.includes(affectedDocs[0].docPath);
    expect(driftDetected).toBe(false);
  });

  it('detects drift when source files changed but matching docs NOT changed', () => {
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

    const sourceChanges = ['src/controllers/users.controller.ts'];
    const docChanges: string[] = [];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBeGreaterThan(0);

    const driftDetected = affectedDocs.some((doc) => !docChanges.includes(doc.docPath));
    expect(driftDetected).toBe(true);
  });

  it('detects no drift when no source changes occurred', () => {
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

    const sourceChanges: string[] = [];
    const docChanges: string[] = [];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(0);
  });

  it('does not flag drift for files in ignore list', () => {
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

    const sourceChanges = [
      'src/controllers/users.controller.test.ts',
      'src/services/users.service.spec.ts',
    ];
    const docChanges: string[] = [];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(0);
  });

  it('detects drift for multiple affected docs', () => {
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

    const sourceChanges = ['src/controllers/users.controller.ts'];
    const docChanges = ['docs/api.md'];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(2);

    const driftDocs = affectedDocs.filter((doc) => !docChanges.includes(doc.docPath));
    expect(driftDocs.length).toBe(1);
    expect(driftDocs[0].docPath).toBe('docs/architecture.md');
  });

  it('detects no drift when all affected docs are updated', () => {
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

    const sourceChanges = ['src/controllers/users.controller.ts'];
    const docChanges = ['docs/api.md', 'docs/architecture.md'];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(2);

    const driftDetected = affectedDocs.some((doc) => !docChanges.includes(doc.docPath));
    expect(driftDetected).toBe(false);
  });

  it('detects drift when only some affected docs are updated', () => {
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
          id: 'guide',
          doc: 'docs/guide.md',
          watches: ['src/controllers/**/*.ts'],
          purpose: 'User guide',
          strategy: 'rewrite',
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

    const sourceChanges = ['src/controllers/users.controller.ts'];
    const docChanges = ['docs/api.md'];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(3);

    const driftDocs = affectedDocs.filter((doc) => !docChanges.includes(doc.docPath));
    expect(driftDocs.length).toBe(2);
    expect(driftDocs.map((d) => d.docPath)).toEqual(['docs/guide.md', 'docs/architecture.md']);
  });

  it('handles complex ignore patterns correctly', () => {
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
      ignore: ['**/*.test.ts', '**/*.spec.ts', '**/migrations/**', 'dist/**'],
    };

    const sourceChanges = [
      'src/controllers/users.controller.ts',
      'src/users.test.ts',
      'src/database/migrations/001_init.ts',
      'dist/main.js',
    ];
    const docChanges: string[] = [];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(1);
    expect(affectedDocs[0].triggeringFiles).toEqual(['src/controllers/users.controller.ts']);

    const driftDetected = !docChanges.includes(affectedDocs[0].docPath);
    expect(driftDetected).toBe(true);
  });

  it('passes check when unrelated files change', () => {
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

    const sourceChanges = ['README.md', 'package.json', '.gitignore'];
    const docChanges: string[] = [];

    const affectedDocs = resolveAffectedDocs(manifest, sourceChanges);

    expect(affectedDocs.length).toBe(0);
  });
});
