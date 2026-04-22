import path from 'path';
import { fileExists } from './fs-safe.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export async function detectPackageManager(repoRoot: string): Promise<PackageManager> {
  const lockfiles: Array<[string, PackageManager]> = [
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];

  for (const [lockfile, pm] of lockfiles) {
    const lockPath = path.join(repoRoot, lockfile);
    if (await fileExists(lockPath)) {
      return pm;
    }
  }

  return 'npm';
}

export function getExecCommand(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npx --no-install';
    case 'pnpm':
      return 'pnpm exec';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bunx';
  }
}

export function getInstallCommand(pm: PackageManager, pkg: string): string {
  switch (pm) {
    case 'npm':
      return `npm install ${pkg}`;
    case 'pnpm':
      return `pnpm add ${pkg}`;
    case 'yarn':
      return `yarn add ${pkg}`;
    case 'bun':
      return `bun add ${pkg}`;
  }
}
