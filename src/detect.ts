import { readFile } from 'fs/promises';
import { join } from 'path';

export type Framework = 'nestjs' | 'nextjs' | 'laravel' | 'generic';

export interface FrameworkDetectionResult {
  framework: Framework;
  confidence: 'high' | 'low';
}

/**
 * Detects the framework used in a repository by analyzing configuration files.
 *
 * Detection runs in order and stops at the first match:
 * 1. NestJS - package.json has @nestjs/core in dependencies or devDependencies
 * 2. Next.js - package.json has next in dependencies or devDependencies
 * 3. Laravel - composer.json has laravel/framework in require
 * 4. Generic - fallback when none match
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Framework detection result with confidence level
 */
export async function detectFramework(repoRoot: string): Promise<FrameworkDetectionResult> {
  // Try to detect NestJS or Next.js from package.json
  const packageJsonPath = join(repoRoot, 'package.json');
  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for NestJS
    if (allDeps['@nestjs/core']) {
      return { framework: 'nestjs', confidence: 'high' };
    }

    // Check for Next.js
    if (allDeps['next']) {
      return { framework: 'nextjs', confidence: 'high' };
    }
  } catch (error) {
    // package.json doesn't exist or is invalid, continue to next detection
  }

  // Try to detect Laravel from composer.json
  const composerJsonPath = join(repoRoot, 'composer.json');
  try {
    const composerJsonContent = await readFile(composerJsonPath, 'utf-8');
    const composerJson = JSON.parse(composerJsonContent);

    if (composerJson.require?.['laravel/framework']) {
      return { framework: 'laravel', confidence: 'high' };
    }
  } catch (error) {
    // composer.json doesn't exist or is invalid, continue to fallback
  }

  // Fallback to generic
  return { framework: 'generic', confidence: 'low' };
}
