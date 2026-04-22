import type { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile, chmod, copyFile, writeFile } from 'fs/promises';
import { info, warn, error, success, debug, log } from '../logger.js';
import { isGitRepo, getRepoRoot, isWorkingTreeClean } from '../git.js';
import { detectFramework, type Framework } from '../detect.js';
import { ensureDir, fileExists } from '../fs-safe.js';
import { getAdapter } from '../adapters/index.js';
import { scanModules, generateModuleMappings } from '../scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitOptions {
  framework?: Framework;
  adapter?: string;
  dryRun?: boolean;
  yes?: boolean;
}

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize autodoc in your repository')
    .option('-f, --framework <framework>', 'Framework to use (nestjs, nextjs, laravel, generic)')
    .option('-a, --adapter <adapter>', 'AI adapter to use', 'claude-code')
    .option('--dry-run', 'Preview changes without writing files')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options: InitOptions) => {
      try {
        await runInit(options);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}

async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  // 1. Verify inside a git repo
  if (!(await isGitRepo(cwd))) {
    throw new Error('Not a git repository. Please run this command from inside a git repo.');
  }

  const repoRoot = await getRepoRoot(cwd);
  debug(`Repository root: ${repoRoot}`);

  // 2. Check working tree is clean (skip if --yes)
  if (!options.yes) {
    const isClean = await isWorkingTreeClean(repoRoot);
    if (!isClean) {
      warn('Working tree has uncommitted changes.');
      const proceed = await confirm({
        message: 'Continue anyway?',
        default: false,
      });
      if (!proceed) {
        log('Initialization cancelled.');
        return;
      }
    }
  }

  // 3. Detect framework (or use --framework override)
  let framework: Framework;
  if (options.framework) {
    if (!['nestjs', 'nextjs', 'laravel', 'generic'].includes(options.framework)) {
      throw new Error(
        `Invalid framework: ${options.framework}. Must be one of: nestjs, nextjs, laravel, generic`
      );
    }
    framework = options.framework;
    info(`Using specified framework: ${framework}`);
  } else {
    const detection = await detectFramework(repoRoot);
    framework = detection.framework;
    info(`Detected framework: ${framework} (confidence: ${detection.confidence})`);
  }

  const adapter = options.adapter || 'claude-code';
  debug(`Using adapter: ${adapter}`);

  // 4. If not --yes, show preview and confirm
  if (!options.yes && !options.dryRun) {
    log('');
    info('The following files will be created:');
    log('  docs/_manifest.json');
    log('  .claude/commands/update-docs.md');
    log('  .github/workflows/docs-drift.yml');
    log('  .git/hooks/post-merge (fast check, no AI calls)');
    log('');

    const proceed = await confirm({
      message: 'Proceed with initialization?',
      default: true,
    });

    if (!proceed) {
      log('Initialization cancelled.');
      return;
    }
  }

  // 5. Scan modules and generate manifest
  const projectName = path.basename(repoRoot);
  const templatesDir = path.join(__dirname, '../src/templates');

  debug(`Templates directory: ${templatesDir}`);
  debug(`Project name: ${projectName}`);

  const manifestDestPath = path.join(repoRoot, 'docs', '_manifest.json');

  if (await fileExists(manifestDestPath)) {
    throw new Error('docs/_manifest.json already exists. Use "autodoc upgrade" to update.');
  }

  // Scan repository for feature modules
  info('Scanning repository for feature modules...');
  const scanResult = await scanModules(repoRoot, framework);

  if (scanResult.modules.length > 0) {
    info(`Discovered ${scanResult.modules.length} feature module(s):`);
    scanResult.modules.forEach((mod) => {
      const parts = [mod.name];
      const traits: string[] = [];
      if (mod.hasControllers) traits.push('controllers');
      if (mod.hasServices) traits.push('services');
      if (mod.hasEntities) traits.push('entities');
      if (mod.hasSubmodules) traits.push(`submodules: ${mod.submodules.join(', ')}`);
      if (traits.length > 0) parts.push(`(${traits.join(', ')})`);
      log(`  - ${parts.join(' ')}`);
    });
  } else {
    warn('No feature modules discovered. Using static template as fallback.');
  }

  // Generate dynamic manifest with per-module mappings
  const dynamicMappings = scanResult.modules.length > 0
    ? generateModuleMappings(scanResult, projectName)
    : undefined;

  if (options.dryRun) {
    info('[DRY RUN] Would create:');
    log(`  ${manifestDestPath}`);
    if (dynamicMappings) {
      dynamicMappings.forEach((m) => log(`    mapping: ${m.id} → ${m.doc}`));
    }
  } else {
    await ensureDir(path.dirname(manifestDestPath));

    let manifestContent: string;
    if (dynamicMappings) {
      // Build manifest from scanned modules
      const manifest = {
        $schema: 'https://unpkg.com/autodocai/schema/manifest.schema.json',
        version: '1.0',
        project: projectName,
        framework,
        adapter,
        description: `Auto-generated feature-based documentation manifest for ${projectName}`,
        mappings: dynamicMappings,
        ignore: getIgnorePatterns(framework),
      };
      manifestContent = JSON.stringify(manifest, null, 2) + '\n';
    } else {
      // Fallback to static template
      const manifestTemplatePath = path.join(templatesDir, framework, 'manifest.json');
      manifestContent = await readFile(manifestTemplatePath, 'utf-8');
      manifestContent = manifestContent.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    }

    await writeFile(manifestDestPath, manifestContent, 'utf-8');
    success(`Created ${path.relative(repoRoot, manifestDestPath)}`);
  }

  // Copy common templates
  const commonTemplates = [
    {
      src: path.join(templatesDir, '_common', '.claude', 'commands', 'update-docs.md'),
      dest: path.join(repoRoot, '.claude', 'commands', 'update-docs.md'),
    },
    {
      src: path.join(templatesDir, '_common', '.github', 'workflows', 'docs-drift.yml'),
      dest: path.join(repoRoot, '.github', 'workflows', 'docs-drift.yml'),
    },
    {
      src: path.join(templatesDir, '_common', '.husky', 'post-merge'),
      dest: path.join(repoRoot, '.git', 'hooks', 'post-merge'),
    },
  ];

  for (const template of commonTemplates) {
    if (options.dryRun) {
      log(`  ${template.dest}`);
    } else {
      await ensureDir(path.dirname(template.dest));
      await copyFile(template.src, template.dest);
      success(`Created ${path.relative(repoRoot, template.dest)}`);
    }
  }

  // 6. Make git hook executable
  const hookPath = path.join(repoRoot, '.git', 'hooks', 'post-merge');
  if (!options.dryRun && (await fileExists(hookPath))) {
    await chmod(hookPath, 0o755);
    debug('Made .git/hooks/post-merge executable');
  }

  // 7. Run adapter preflight and bootstrap
  if (!options.dryRun) {
    try {
      const adapterInstance = getAdapter(adapter);
      debug(`Running preflight check for adapter: ${adapter}`);

      const preflightResult = await adapterInstance.preflight();
      if (!preflightResult.ok) {
        warn(preflightResult.message || 'Adapter preflight check failed');
        if (preflightResult.installUrl) {
          info(`Install at: ${preflightResult.installUrl}`);
        }
        warn('Skipping bootstrap. You can run "autodoc update --bootstrap" later.');
      } else {
        success('Adapter preflight check passed');
        info('Running bootstrap to create initial documentation...');
        log('');

        const { loadManifest } = await import('../manifest.js');
        const manifest = await loadManifest(manifestDestPath);

        // Bootstrap one mapping at a time to avoid timeouts on large repos
        const allCreated: string[] = [];
        const allSkipped: { id: string; reason: string }[] = [];

        for (let i = 0; i < manifest.mappings.length; i++) {
          const mapping = manifest.mappings[i];
          info(`[${i + 1}/${manifest.mappings.length}] Generating ${mapping.doc}...`);

          try {
            const result = await adapterInstance.runBootstrap({
              repoRoot,
              manifestPath: manifestDestPath,
              mappings: [mapping],
            });

            allCreated.push(...result.createdDocs);
            allSkipped.push(...result.skippedMappings);
            success(`  Created ${mapping.doc}`);
          } catch (err: any) {
            warn(`  Failed to generate ${mapping.doc}: ${err.message}`);
            allSkipped.push({ id: mapping.id, reason: err.message });
          }
        }

        log('');
        success('Bootstrap complete!');

        if (allCreated.length > 0) {
          info(`Created ${allCreated.length} documentation file(s):`);
          allCreated.forEach((doc) => log(`  - ${doc}`));
        }

        if (allSkipped.length > 0) {
          warn(`Skipped ${allSkipped.length} mapping(s):`);
          allSkipped.forEach((s) => log(`  - ${s.id}: ${s.reason}`));
        }
      }
    } catch (err: any) {
      warn(`Error during bootstrap: ${err.message}`);
      warn('You can run "autodoc update --bootstrap" later to create initial docs.');
    }
  }

  // 8. Print next steps
  log('');
  success('Initialization complete!');
  log('');
  info('Next steps:');
  log('  1. Review and customize docs/_manifest.json');
  log('  2. Run "autodoc update --bootstrap" to generate initial docs (if not done)');
  log('  3. Commit the new files to your repository');
  log('  4. Documentation will auto-update on every merge');
  log('');
}

function getIgnorePatterns(framework: Framework): string[] {
  switch (framework) {
    case 'nestjs':
      return ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**', 'dist/**'];
    case 'nextjs':
      return ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/node_modules/**', '.next/**'];
    case 'laravel':
      return ['**/tests/**', '**/vendor/**', 'storage/**'];
    case 'generic':
      return ['**/*.test.*', '**/*.spec.*', '**/node_modules/**', 'dist/**', 'build/**'];
  }
}
