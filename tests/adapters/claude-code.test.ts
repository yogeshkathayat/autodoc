import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';
import type { UpdateInput, BootstrapInput } from '../../src/adapters/types.js';
import { execFile } from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('preflight', () => {
    it('returns ok: true when claude CLI is found', async () => {
      const mockExecFile = vi.mocked(execFile);

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        if (cmd === 'which' && args[0] === 'claude') {
          callback(null, { stdout: '/usr/local/bin/claude\n', stderr: '' });
        }
        return {} as any;
      });

      const result = await adapter.preflight();

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Claude CLI found');
    });

    it('returns ok: false with install URL when claude CLI is not found', async () => {
      const mockExecFile = vi.mocked(execFile);

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(new Error('Command not found'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await adapter.preflight();

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Claude CLI not found. Please install Claude Code.');
      expect(result.installUrl).toBe('https://claude.ai/download');
    });
  });

  describe('runUpdate', () => {
    it('executes claude CLI with correct arguments', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts', 'src/auth.service.ts'],
        affectedDocs: [
          {
            id: 'api-docs',
            docPath: 'docs/api.md',
            watches: ['src/**/*.controller.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
            triggeringFiles: ['src/users.controller.ts'],
          },
        ],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, { stdout: 'Updated: docs/api.md\n', stderr: '' });
        return {} as any;
      });

      const result = await adapter.runUpdate(input);

      expect(mockExecFile).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '-p',
          expect.stringContaining('Use the /update-docs slash command'),
          '--allowedTools',
          'Read,Edit,Write,Glob,Grep,Bash(git diff:*),Bash(git log:*)',
        ]),
        expect.objectContaining({
          cwd: '/test/repo',
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
        }),
        expect.any(Function)
      );

      expect(result.updatedDocs).toContain('docs/api.md');
    });

    it('parses updated docs from output', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts'],
        affectedDocs: [
          {
            id: 'api-docs',
            docPath: 'docs/api.md',
            watches: ['src/**/*.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
            triggeringFiles: ['src/users.controller.ts'],
          },
        ],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Updated: docs/api.md\nModified: docs/guide.md\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runUpdate(input);

      expect(result.updatedDocs).toEqual(['docs/api.md', 'docs/guide.md']);
      expect(result.skippedDocs).toEqual([]);
      expect(result.reviewSuggested).toEqual([]);
    });

    it('parses skipped docs from output', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts'],
        affectedDocs: [
          {
            id: 'api-docs',
            docPath: 'docs/api.md',
            watches: ['src/**/*.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
            triggeringFiles: ['src/users.controller.ts'],
          },
        ],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Updated: docs/api.md\nSkipped: docs/old.md - outdated\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runUpdate(input);

      expect(result.updatedDocs).toEqual(['docs/api.md']);
      expect(result.skippedDocs).toEqual([{ path: 'docs/old.md', reason: 'outdated' }]);
    });

    it('parses review suggested docs from output', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts'],
        affectedDocs: [
          {
            id: 'api-docs',
            docPath: 'docs/api.md',
            watches: ['src/**/*.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
            triggeringFiles: ['src/users.controller.ts'],
          },
        ],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Updated: docs/api.md\nReview: docs/architecture.md\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runUpdate(input);

      expect(result.updatedDocs).toEqual(['docs/api.md']);
      expect(result.reviewSuggested).toEqual(['docs/architecture.md']);
    });

    it('throws error when CLI execution times out', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts'],
        affectedDocs: [],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const error: any = new Error('Timeout');
        error.killed = true;
        callback(error, { stdout: '', stderr: '' });
        return {} as any;
      });

      await expect(adapter.runUpdate(input)).rejects.toThrow(
        'Claude CLI execution timed out after 5 minutes'
      );
    });

    it('throws error when CLI execution fails', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts'],
        affectedDocs: [],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(new Error('CLI execution failed'), { stdout: '', stderr: '' });
        return {} as any;
      });

      await expect(adapter.runUpdate(input)).rejects.toThrow('Claude CLI execution failed');
    });

    it('generates correct summary', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: UpdateInput = {
        repoRoot: '/test/repo',
        changedFiles: ['src/users.controller.ts'],
        affectedDocs: [],
        manifestPath: '/test/repo/docs-manifest.json',
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Updated: docs/api.md\nUpdated: docs/guide.md\nSkipped: docs/old.md\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runUpdate(input);

      expect(result.summary).toBe('Updated 2 document(s), skipped 1');
    });
  });

  describe('runBootstrap', () => {
    it('executes claude CLI with correct arguments', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: BootstrapInput = {
        repoRoot: '/test/repo',
        manifestPath: '/test/repo/docs-manifest.json',
        mappings: [
          {
            id: 'api-docs',
            doc: 'docs/api.md',
            watches: ['src/**/*.controller.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
          },
        ],
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, { stdout: 'Created: docs/api.md\n', stderr: '' });
        return {} as any;
      });

      const result = await adapter.runBootstrap(input);

      expect(mockExecFile).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '-p',
          expect.stringContaining('Use the /bootstrap-docs slash command'),
          '--allowedTools',
          'Read,Edit,Write,Glob,Grep,Bash(git diff:*),Bash(git log:*)',
        ]),
        expect.objectContaining({
          cwd: '/test/repo',
          timeout: 600000,
          maxBuffer: 20 * 1024 * 1024,
        }),
        expect.any(Function)
      );

      expect(result.createdDocs).toContain('docs/api.md');
    });

    it('parses created docs from output', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: BootstrapInput = {
        repoRoot: '/test/repo',
        manifestPath: '/test/repo/docs-manifest.json',
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

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Created: docs/api.md\nWritten: docs/guide.md\nGenerated: docs/arch.md\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runBootstrap(input);

      expect(result.createdDocs).toEqual(['docs/api.md', 'docs/guide.md', 'docs/arch.md']);
      expect(result.skippedMappings).toEqual([]);
    });

    it('parses skipped mappings from output', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: BootstrapInput = {
        repoRoot: '/test/repo',
        manifestPath: '/test/repo/docs-manifest.json',
        mappings: [
          {
            id: 'api-docs',
            doc: 'docs/api.md',
            watches: ['src/**/*.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
          },
          {
            id: 'legacy',
            doc: 'docs/legacy.md',
            watches: ['legacy/**/*.ts'],
            purpose: 'Legacy documentation',
            strategy: 'rewrite',
          },
        ],
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Created: docs/api.md\nSkipped: legacy - no legacy code found\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runBootstrap(input);

      expect(result.createdDocs).toEqual(['docs/api.md']);
      expect(result.skippedMappings).toEqual([
        { id: 'legacy', reason: 'no legacy code found' },
      ]);
    });

    it('throws error when CLI execution times out', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: BootstrapInput = {
        repoRoot: '/test/repo',
        manifestPath: '/test/repo/docs-manifest.json',
        mappings: [],
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const error: any = new Error('Timeout');
        error.killed = true;
        callback(error, { stdout: '', stderr: '' });
        return {} as any;
      });

      await expect(adapter.runBootstrap(input)).rejects.toThrow(
        'Claude CLI execution timed out after 10 minutes'
      );
    });

    it('generates correct summary', async () => {
      const mockExecFile = vi.mocked(execFile);

      const input: BootstrapInput = {
        repoRoot: '/test/repo',
        manifestPath: '/test/repo/docs-manifest.json',
        mappings: [
          {
            id: 'api-docs',
            doc: 'docs/api.md',
            watches: ['src/**/*.ts'],
            purpose: 'API documentation',
            strategy: 'surgical',
          },
          {
            id: 'guide',
            doc: 'docs/guide.md',
            watches: ['src/**/*.ts'],
            purpose: 'Guide',
            strategy: 'surgical',
          },
          {
            id: 'legacy',
            doc: 'docs/legacy.md',
            watches: ['legacy/**/*.ts'],
            purpose: 'Legacy',
            strategy: 'surgical',
          },
        ],
      };

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, {
          stdout: 'Created: docs/api.md\nCreated: docs/guide.md\nSkipped: legacy - reason\n',
          stderr: '',
        });
        return {} as any;
      });

      const result = await adapter.runBootstrap(input);

      expect(result.summary).toBe('Created 2 document(s), skipped 1 mapping(s)');
    });
  });

  describe('adapter name', () => {
    it('has correct adapter name', () => {
      expect(adapter.name).toBe('claude-code');
    });
  });
});
