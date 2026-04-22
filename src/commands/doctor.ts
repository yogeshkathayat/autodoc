import type { Command } from 'commander';
import path from 'path';
import pc from 'picocolors';
import { info, error, log } from '../logger.js';
import { getRepoRoot, readLastSync } from '../git.js';
import { loadManifest, validateManifest } from '../manifest.js';
import { getAdapter } from '../adapters/index.js';
import { fileExists, safeReadFile } from '../fs-safe.js';
import { detectPackageManager } from '../pm.js';

interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export function doctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run diagnostic checks on autodoc setup')
    .action(async () => {
      try {
        await runDoctor();
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}

async function runDoctor(): Promise<void> {
  info('Running diagnostic checks...');
  log('');

  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);

  const checks: DiagnosticCheck[] = [];

  // 1. Check if manifest exists and is valid
  const manifestPath = path.join(repoRoot, 'docs', '_manifest.json');
  const manifestExists = await fileExists(manifestPath);

  if (!manifestExists) {
    checks.push({
      name: 'Manifest file',
      status: 'fail',
      message: 'docs/_manifest.json not found. Run "autodoc init" first.',
    });
  } else {
    try {
      const manifestContent = await safeReadFile(manifestPath);
      if (!manifestContent) {
        checks.push({
          name: 'Manifest file',
          status: 'fail',
          message: 'docs/_manifest.json is empty',
        });
      } else {
        const data = JSON.parse(manifestContent);
        const validation = validateManifest(data);

        if (validation.valid) {
          checks.push({
            name: 'Manifest file',
            status: 'pass',
            message: `Valid manifest for project "${validation.manifest?.project}"`,
          });

          if (validation.warnings && validation.warnings.length > 0) {
            checks.push({
              name: 'Manifest warnings',
              status: 'warn',
              message: validation.warnings.join('; '),
            });
          }
        } else {
          checks.push({
            name: 'Manifest validation',
            status: 'fail',
            message: validation.errors?.join('; ') || 'Unknown validation error',
          });
        }
      }
    } catch (err: any) {
      checks.push({
        name: 'Manifest file',
        status: 'fail',
        message: `Failed to load manifest: ${err.message}`,
      });
    }
  }

  // 2. Check if adapter CLI is available (preflight)
  if (manifestExists) {
    try {
      const manifest = await loadManifest(manifestPath);
      const adapter = getAdapter(manifest.adapter);

      const preflightResult = await adapter.preflight();
      if (preflightResult.ok) {
        checks.push({
          name: 'Adapter availability',
          status: 'pass',
          message: `${manifest.adapter} is available`,
        });
      } else {
        checks.push({
          name: 'Adapter availability',
          status: 'fail',
          message:
            preflightResult.message ||
            `${manifest.adapter} is not available. Install: ${preflightResult.installUrl}`,
        });
      }
    } catch (err: any) {
      checks.push({
        name: 'Adapter availability',
        status: 'fail',
        message: `Error checking adapter: ${err.message}`,
      });
    }
  }

  // 3. Check if git hook is installed
  const gitHookPath = path.join(repoRoot, '.git', 'hooks', 'post-merge');
  const huskyHookPath = path.join(repoRoot, '.husky', 'post-merge');
  const hookExists = (await fileExists(gitHookPath)) || (await fileExists(huskyHookPath));

  if (hookExists) {
    checks.push({
      name: 'Git hook',
      status: 'pass',
      message: 'post-merge hook is installed',
    });
  } else {
    checks.push({
      name: 'Git hook',
      status: 'warn',
      message: 'post-merge hook not found. Run "autodoc init" to install.',
    });
  }

  // 4. Check last sync point
  const lastSync = await readLastSync(repoRoot);
  if (lastSync) {
    checks.push({
      name: 'Last sync',
      status: 'pass',
      message: `Last synced at commit ${lastSync.substring(0, 7)}`,
    });
  } else {
    checks.push({
      name: 'Last sync',
      status: 'warn',
      message: 'No .last-sync found. Run "autodoc update" to establish baseline.',
    });
  }

  // 5. Check if CI workflow is present
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'docs-drift.yml');
  const workflowExists = await fileExists(workflowPath);

  if (workflowExists) {
    checks.push({
      name: 'CI workflow',
      status: 'pass',
      message: '.github/workflows/docs-drift.yml is present',
    });
  } else {
    checks.push({
      name: 'CI workflow',
      status: 'warn',
      message: '.github/workflows/docs-drift.yml not found. CI drift detection will not work.',
    });
  }

  // 6. Check package manager detection
  try {
    const pm = await detectPackageManager(repoRoot);
    checks.push({
      name: 'Package manager',
      status: 'pass',
      message: `Detected: ${pm}`,
    });
  } catch (err: any) {
    checks.push({
      name: 'Package manager',
      status: 'warn',
      message: `Could not detect package manager: ${err.message}`,
    });
  }

  // Print results
  let hasFailures = false;

  for (const check of checks) {
    const icon =
      check.status === 'pass'
        ? pc.green('✓')
        : check.status === 'fail'
        ? pc.red('✖')
        : pc.yellow('⚠');

    const statusColor =
      check.status === 'pass'
        ? pc.green
        : check.status === 'fail'
        ? pc.red
        : pc.yellow;

    log(`${icon} ${pc.bold(check.name)}: ${statusColor(check.message)}`);

    if (check.status === 'fail') {
      hasFailures = true;
    }
  }

  log('');

  if (hasFailures) {
    error('Some checks failed. Please address the issues above.');
    process.exit(1);
  } else {
    const hasWarnings = checks.some((c) => c.status === 'warn');
    if (hasWarnings) {
      info('All critical checks passed, but there are warnings.');
    } else {
      info('All checks passed!');
    }
  }
}
