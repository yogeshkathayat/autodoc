import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { safeReadFile, safeWriteFile } from './fs-safe.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
  } catch (err: any) {
    throw new Error(`Git command failed: ${err.message}`);
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--git-dir'], dir);
    return true;
  } catch {
    return false;
  }
}

export async function getRepoRoot(dir?: string): Promise<string> {
  const cwd = dir ?? process.cwd();
  try {
    return await git(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    throw new Error('Not inside a git repository');
  }
}

export async function isWorkingTreeClean(repoRoot: string): Promise<boolean> {
  try {
    const status = await git(['status', '--porcelain'], repoRoot);
    return status.length === 0;
  } catch {
    return false;
  }
}

export async function getCurrentHead(repoRoot: string): Promise<string> {
  return await git(['rev-parse', 'HEAD'], repoRoot);
}

export async function readLastSync(repoRoot: string): Promise<string | null> {
  const lastSyncPath = path.join(repoRoot, 'docs', '.last-sync');
  const content = await safeReadFile(lastSyncPath);
  return content?.trim() ?? null;
}

export async function writeLastSync(repoRoot: string): Promise<void> {
  const currentHead = await getCurrentHead(repoRoot);
  const lastSyncPath = path.join(repoRoot, 'docs', '.last-sync');
  await safeWriteFile(lastSyncPath, currentHead + '\n', { overwrite: true });
}

export async function getChangedFiles(
  repoRoot: string,
  options?: { since?: string; staged?: boolean }
): Promise<string[]> {
  let args: string[];

  if (options?.staged) {
    args = ['diff', '--cached', '--name-only'];
  } else {
    let since = options?.since;

    if (!since) {
      const lastSync = await readLastSync(repoRoot);
      since = lastSync ?? 'HEAD~10';
    }

    args = ['diff', `${since}..HEAD`, '--name-only'];
  }

  try {
    const output = await git(args, repoRoot);
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function stageFiles(repoRoot: string, patterns: string[]): Promise<void> {
  if (patterns.length === 0) {
    return;
  }
  await git(['add', '--', ...patterns], repoRoot);
}
