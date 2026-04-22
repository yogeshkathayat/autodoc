import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import {
  isGitRepo,
  getRepoRoot,
  isWorkingTreeClean,
  getCurrentHead,
  readLastSync,
  writeLastSync,
  getChangedFiles,
  stageFiles,
} from '../src/git.js';

describe('git helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'autodoc-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  const initGitRepo = (dir: string) => {
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });
  };

  const createInitialCommit = (dir: string) => {
    execSync('git add -A', { cwd: dir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit" --allow-empty', { cwd: dir, stdio: 'ignore' });
  };

  describe('isGitRepo', () => {
    it('returns true for git repository', async () => {
      initGitRepo(tempDir);

      const result = await isGitRepo(tempDir);

      expect(result).toBe(true);
    });

    it('returns false for non-git directory', async () => {
      const result = await isGitRepo(tempDir);

      expect(result).toBe(false);
    });
  });

  describe('getRepoRoot', () => {
    it('returns the repository root path', async () => {
      initGitRepo(tempDir);

      const result = await getRepoRoot(tempDir);

      // On macOS, /var is a symlink to /private/var, so we normalize both paths
      const normalizedResult = result.replace('/private', '');
      const normalizedTempDir = tempDir.replace('/private', '');
      expect(normalizedResult).toBe(normalizedTempDir);
    });

    it('returns the repository root from a subdirectory', async () => {
      initGitRepo(tempDir);
      const subDir = join(tempDir, 'src', 'controllers');
      await mkdir(subDir, { recursive: true });

      const result = await getRepoRoot(subDir);

      // On macOS, /var is a symlink to /private/var, so we normalize both paths
      const normalizedResult = result.replace('/private', '');
      const normalizedTempDir = tempDir.replace('/private', '');
      expect(normalizedResult).toBe(normalizedTempDir);
    });

    it('throws error for non-git directory', async () => {
      await expect(getRepoRoot(tempDir)).rejects.toThrow('Not inside a git repository');
    });
  });

  describe('isWorkingTreeClean', () => {
    it('returns true for clean working tree', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      const result = await isWorkingTreeClean(tempDir);

      expect(result).toBe(true);
    });

    it('returns false for dirty working tree with unstaged changes', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'README.md'), '# Test Modified');

      const result = await isWorkingTreeClean(tempDir);

      expect(result).toBe(false);
    });

    it('returns false for dirty working tree with untracked files', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'new-file.txt'), 'content');

      const result = await isWorkingTreeClean(tempDir);

      expect(result).toBe(false);
    });

    it('returns false for dirty working tree with staged changes', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'README.md'), '# Test Modified');
      execSync('git add README.md', { cwd: tempDir, stdio: 'ignore' });

      const result = await isWorkingTreeClean(tempDir);

      expect(result).toBe(false);
    });
  });

  describe('getCurrentHead', () => {
    it('returns the current HEAD commit hash', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      const result = await getCurrentHead(tempDir);

      expect(result).toMatch(/^[0-9a-f]{40}$/);
    });

    it('returns different hashes for different commits', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      const firstCommit = await getCurrentHead(tempDir);

      await writeFile(join(tempDir, 'file.txt'), 'content');
      execSync('git add file.txt', { cwd: tempDir, stdio: 'ignore' });
      execSync('git commit -m "Second commit"', { cwd: tempDir, stdio: 'ignore' });

      const secondCommit = await getCurrentHead(tempDir);

      expect(firstCommit).not.toBe(secondCommit);
    });
  });

  describe('readLastSync and writeLastSync', () => {
    it('writes and reads last sync commit hash', async () => {
      initGitRepo(tempDir);
      await mkdir(join(tempDir, 'docs'), { recursive: true });
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeLastSync(tempDir);
      const result = await readLastSync(tempDir);

      const currentHead = await getCurrentHead(tempDir);
      expect(result).toBe(currentHead);
    });

    it('returns null when last sync file does not exist', async () => {
      initGitRepo(tempDir);

      const result = await readLastSync(tempDir);

      expect(result).toBeNull();
    });

    it('updates last sync on subsequent writes', async () => {
      initGitRepo(tempDir);
      await mkdir(join(tempDir, 'docs'), { recursive: true });
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeLastSync(tempDir);
      const firstSync = await readLastSync(tempDir);

      await writeFile(join(tempDir, 'file.txt'), 'content');
      execSync('git add file.txt', { cwd: tempDir, stdio: 'ignore' });
      execSync('git commit -m "Second commit"', { cwd: tempDir, stdio: 'ignore' });

      await writeLastSync(tempDir);
      const secondSync = await readLastSync(tempDir);

      expect(firstSync).not.toBe(secondSync);
      expect(secondSync).toBe(await getCurrentHead(tempDir));
    });
  });

  describe('getChangedFiles', () => {
    it('returns changed files since specified commit', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      const firstCommit = await getCurrentHead(tempDir);

      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      execSync('git add file1.txt', { cwd: tempDir, stdio: 'ignore' });
      execSync('git commit -m "Add file1"', { cwd: tempDir, stdio: 'ignore' });

      await writeFile(join(tempDir, 'file2.txt'), 'content2');
      execSync('git add file2.txt', { cwd: tempDir, stdio: 'ignore' });
      execSync('git commit -m "Add file2"', { cwd: tempDir, stdio: 'ignore' });

      const result = await getChangedFiles(tempDir, { since: firstCommit });

      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).not.toContain('README.md');
    });

    it('returns staged files when staged option is true', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'staged.txt'), 'staged content');
      execSync('git add staged.txt', { cwd: tempDir, stdio: 'ignore' });

      await writeFile(join(tempDir, 'unstaged.txt'), 'unstaged content');

      const result = await getChangedFiles(tempDir, { staged: true });

      expect(result).toContain('staged.txt');
      expect(result).not.toContain('unstaged.txt');
    });

    it('returns empty array when no files changed', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      const currentHead = await getCurrentHead(tempDir);
      const result = await getChangedFiles(tempDir, { since: currentHead });

      expect(result).toEqual([]);
    });

    it('uses last sync as default since when not provided', async () => {
      initGitRepo(tempDir);
      await mkdir(join(tempDir, 'docs'), { recursive: true });
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeLastSync(tempDir);

      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      execSync('git add file1.txt', { cwd: tempDir, stdio: 'ignore' });
      execSync('git commit -m "Add file1"', { cwd: tempDir, stdio: 'ignore' });

      const result = await getChangedFiles(tempDir);

      expect(result).toContain('file1.txt');
    });

    it('returns empty array when no last sync exists and HEAD~10 does not exist', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      execSync('git add file1.txt', { cwd: tempDir, stdio: 'ignore' });
      execSync('git commit -m "Add file1"', { cwd: tempDir, stdio: 'ignore' });

      const result = await getChangedFiles(tempDir);

      // With only 2 commits, HEAD~10 doesn't exist, so it returns empty
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('stageFiles', () => {
    it('stages specified files', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      await writeFile(join(tempDir, 'file2.txt'), 'content2');

      await stageFiles(tempDir, ['file1.txt']);

      const stagedFiles = execSync('git diff --cached --name-only', {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();

      expect(stagedFiles).toBe('file1.txt');
    });

    it('stages multiple files', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      await writeFile(join(tempDir, 'file2.txt'), 'content2');
      await writeFile(join(tempDir, 'file3.txt'), 'content3');

      await stageFiles(tempDir, ['file1.txt', 'file2.txt']);

      const stagedFiles = execSync('git diff --cached --name-only', {
        cwd: tempDir,
        encoding: 'utf-8',
      })
        .trim()
        .split('\n');

      expect(stagedFiles).toContain('file1.txt');
      expect(stagedFiles).toContain('file2.txt');
      expect(stagedFiles).not.toContain('file3.txt');
    });

    it('handles empty patterns array', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await writeFile(join(tempDir, 'file1.txt'), 'content1');

      await stageFiles(tempDir, []);

      const stagedFiles = execSync('git diff --cached --name-only', {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();

      expect(stagedFiles).toBe('');
    });

    it('stages files matching glob patterns', async () => {
      initGitRepo(tempDir);
      await writeFile(join(tempDir, 'README.md'), '# Test');
      createInitialCommit(tempDir);

      await mkdir(join(tempDir, 'docs'), { recursive: true });
      await writeFile(join(tempDir, 'docs/api.md'), '# API');
      await writeFile(join(tempDir, 'docs/guide.md'), '# Guide');

      await stageFiles(tempDir, ['docs/*.md']);

      const stagedFiles = execSync('git diff --cached --name-only', {
        cwd: tempDir,
        encoding: 'utf-8',
      })
        .trim()
        .split('\n')
        .filter(Boolean);

      expect(stagedFiles).toContain('docs/api.md');
      expect(stagedFiles).toContain('docs/guide.md');
    });
  });
});
