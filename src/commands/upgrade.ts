import type { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, copyFile } from 'fs/promises';
import { info, warn, error, success, debug, log } from '../logger.js';
import { getRepoRoot } from '../git.js';
import { fileExists } from '../fs-safe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface UpgradeOptions {
  yes?: boolean;
}

export function upgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Upgrade template files to the latest version')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options: UpgradeOptions) => {
      try {
        await runUpgrade(options);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}

async function runUpgrade(options: UpgradeOptions): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);
  debug(`Repository root: ${repoRoot}`);

  // 1. Verify init was run (docs/_manifest.json exists)
  const manifestPath = path.join(repoRoot, 'docs', '_manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      'Manifest not found at docs/_manifest.json. Run "autodoc init" first.'
    );
  }

  info('Checking for template updates...');

  const templatesDir = path.join(__dirname, '../src/templates');

  // Template files to check (excluding manifest)
  const templateFiles = [
    {
      src: path.join(templatesDir, '_common', '.claude', 'commands', 'update-docs.md'),
      dest: path.join(repoRoot, '.claude', 'commands', 'update-docs.md'),
      name: '.claude/commands/update-docs.md',
    },
    {
      src: path.join(templatesDir, '_common', '.github', 'workflows', 'docs-drift.yml'),
      dest: path.join(repoRoot, '.github', 'workflows', 'docs-drift.yml'),
      name: '.github/workflows/docs-drift.yml',
    },
    {
      src: path.join(templatesDir, '_common', '.husky', 'post-merge'),
      dest: path.join(repoRoot, '.husky', 'post-merge'),
      name: '.husky/post-merge',
    },
  ];

  // 2. Compare current template files with installed versions
  const filesToUpdate: Array<{
    src: string;
    dest: string;
    name: string;
    hasLocalChanges: boolean;
  }> = [];

  for (const template of templateFiles) {
    if (!(await fileExists(template.dest))) {
      info(`Missing: ${template.name}`);
      filesToUpdate.push({
        ...template,
        hasLocalChanges: false,
      });
      continue;
    }

    const templateContent = await readFile(template.src, 'utf-8');
    const installedContent = await readFile(template.dest, 'utf-8');

    if (templateContent !== installedContent) {
      debug(`Detected changes in ${template.name}`);
      filesToUpdate.push({
        ...template,
        hasLocalChanges: true,
      });
    }
  }

  // 3. For manifest: preserve user edits (don't overwrite)
  info('Manifest file (docs/_manifest.json) will be preserved');

  if (filesToUpdate.length === 0) {
    success('All template files are up to date!');
    return;
  }

  // Show what will be updated
  log('');
  info(`${filesToUpdate.length} file(s) need updating:`);
  filesToUpdate.forEach((file) => {
    if (file.hasLocalChanges) {
      log(`  - ${file.name} (has local changes, will be backed up)`);
    } else {
      log(`  - ${file.name} (missing)`);
    }
  });

  // Ask for confirmation
  if (!options.yes) {
    log('');
    const proceed = await confirm({
      message: 'Proceed with upgrade?',
      default: true,
    });

    if (!proceed) {
      log('Upgrade cancelled.');
      return;
    }
  }

  // 4. For other files: overwrite with warning if local edits detected
  // 5. Write .orig backup for any files that had local changes
  log('');
  for (const file of filesToUpdate) {
    if (file.hasLocalChanges) {
      // Create backup
      const backupPath = `${file.dest}.orig`;
      await copyFile(file.dest, backupPath);
      warn(`Backed up local version to ${path.relative(repoRoot, backupPath)}`);
    }

    // Copy new version
    await copyFile(file.src, file.dest);
    success(`Updated ${file.name}`);
  }

  log('');
  success('Upgrade complete!');

  const hasBackups = filesToUpdate.some((f) => f.hasLocalChanges);
  if (hasBackups) {
    log('');
    info('Note: Backup files (.orig) were created for files with local changes.');
    log('Review the changes and remove the .orig files when satisfied.');
  }
}
