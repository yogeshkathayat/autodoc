import type { Command } from 'commander';
import path from 'path';
import { info, warn, error, success, debug, log } from '../logger.js';
import { getRepoRoot, getChangedFiles, stageFiles, writeLastSync } from '../git.js';
import { loadManifest, resolveAffectedDocs } from '../manifest.js';
import { getAdapter } from '../adapters/index.js';
import { fileExists } from '../fs-safe.js';

interface UpdateOptions {
  since?: string;
  staged?: boolean;
  bootstrap?: boolean;
}

export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update documentation based on code changes')
    .option('--since <ref>', 'Compare changes since this git reference')
    .option('--staged', 'Only consider staged changes')
    .option('--bootstrap', 'Generate all docs from scratch')
    .action(async (options: UpdateOptions) => {
      try {
        await runUpdate(options);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}

async function runUpdate(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);
  debug(`Repository root: ${repoRoot}`);

  // 1. Load + validate manifest
  const manifestPath = path.join(repoRoot, 'docs', '_manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      'Manifest not found at docs/_manifest.json. Run "autodoc init" first.'
    );
  }

  const manifest = await loadManifest(manifestPath);
  debug(`Loaded manifest for project: ${manifest.project}`);

  // 2. Instantiate adapter from manifest
  const adapter = getAdapter(manifest.adapter);
  debug(`Using adapter: ${manifest.adapter}`);

  // 3. Run adapter preflight
  const preflightResult = await adapter.preflight();
  if (!preflightResult.ok) {
    error(preflightResult.message || 'Adapter preflight check failed');
    if (preflightResult.installUrl) {
      info(`Install at: ${preflightResult.installUrl}`);
    }
    throw new Error('Adapter not available. Please install it and try again.');
  }

  // 8. If --bootstrap flag, run adapter.runBootstrap() one mapping at a time
  if (options.bootstrap) {
    info('Running bootstrap to generate all documentation from scratch...');
    log('');

    const allCreated: string[] = [];
    const allSkipped: { id: string; reason: string }[] = [];

    for (let i = 0; i < manifest.mappings.length; i++) {
      const mapping = manifest.mappings[i];
      info(`[${i + 1}/${manifest.mappings.length}] Generating ${mapping.doc}...`);

      try {
        const result = await adapter.runBootstrap({
          repoRoot,
          manifestPath,
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

    // 10. Stage docs/ changes
    info('Staging documentation changes...');
    await stageFiles(repoRoot, ['docs/']);
    success('Documentation changes staged');

    // 12. Write current HEAD to docs/.last-sync
    await writeLastSync(repoRoot);
    debug('Updated .last-sync');

    return;
  }

  // 4. Compute changed files based on flags
  info('Computing changed files...');
  const changedFiles = await getChangedFiles(repoRoot, {
    since: options.since,
    staged: options.staged,
  });

  if (changedFiles.length === 0) {
    info('No changed files detected.');
    return;
  }

  debug(`Found ${changedFiles.length} changed file(s)`);
  changedFiles.forEach((file) => debug(`  - ${file}`));

  // 5. Apply ignore patterns (done inside resolveAffectedDocs)
  // 6. Resolve changed files → affected docs via manifest
  const affectedDocs = resolveAffectedDocs(manifest, changedFiles);

  // 7. If no affected docs → exit 0 "No updates needed"
  if (affectedDocs.length === 0) {
    success('No documentation updates needed.');
    log('Changed files do not affect any documented areas.');
    return;
  }

  info(`${affectedDocs.length} documentation file(s) need updating:`);
  affectedDocs.forEach((doc) => {
    log(`  - ${doc.docPath} (${doc.triggeringFiles.length} changed file(s))`);
  });

  // 9. Run adapter.runUpdate()
  log('');
  info('Updating documentation...');
  const updateResult = await adapter.runUpdate({
    repoRoot,
    changedFiles,
    affectedDocs,
    manifestPath,
  });

  // 11. Print summary
  log('');
  success('Documentation update complete!');
  log(updateResult.summary);

  if (updateResult.updatedDocs.length > 0) {
    info(`Updated ${updateResult.updatedDocs.length} document(s):`);
    updateResult.updatedDocs.forEach((doc) => {
      log(`  - ${doc}`);
    });
  }

  if (updateResult.skippedDocs.length > 0) {
    warn(`Skipped ${updateResult.skippedDocs.length} document(s):`);
    updateResult.skippedDocs.forEach((skipped) => {
      log(`  - ${skipped.path}: ${skipped.reason}`);
    });
  }

  if (updateResult.reviewSuggested.length > 0) {
    warn(`Review recommended for ${updateResult.reviewSuggested.length} document(s):`);
    updateResult.reviewSuggested.forEach((doc) => {
      log(`  - ${doc}`);
    });
  }

  // 10. Stage docs/ changes
  info('Staging documentation changes...');
  await stageFiles(repoRoot, ['docs/']);
  success('Documentation changes staged');

  // 12. Write current HEAD to docs/.last-sync
  await writeLastSync(repoRoot);
  debug('Updated .last-sync');
}
