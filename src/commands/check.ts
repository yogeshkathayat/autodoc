import type { Command } from 'commander';
import path from 'path';
import { readFile } from 'fs/promises';
import { info, warn, error, success, debug, log } from '../logger.js';
import { getRepoRoot } from '../git.js';
import { loadManifest, resolveAffectedDocs } from '../manifest.js';
import { fileExists } from '../fs-safe.js';

interface CheckOptions {
  src?: string;
  docs?: string;
}

export function checkCommand(program: Command): void {
  program
    .command('check')
    .description('Check for documentation drift in CI')
    .option('--src <files>', 'Comma-separated list of changed source files')
    .option('--docs <files>', 'Comma-separated list of changed documentation files')
    .action(async (options: CheckOptions) => {
      try {
        await runCheck(options);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}

async function runCheck(options: CheckOptions): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);
  debug(`Repository root: ${repoRoot}`);

  // 1. Load manifest
  const manifestPath = path.join(repoRoot, 'docs', '_manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      'Manifest not found at docs/_manifest.json. Run "autodoc init" first.'
    );
  }

  const manifest = await loadManifest(manifestPath);
  debug(`Loaded manifest for project: ${manifest.project}`);

  // 2. Get changed source files from --src flag or stdin
  let changedSrcFiles: string[] = [];
  if (options.src) {
    changedSrcFiles = options.src.split(',').map((f) => f.trim()).filter(Boolean);
  } else if (!process.stdin.isTTY) {
    // Read from stdin
    const stdinContent = await new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
    changedSrcFiles = stdinContent
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
  }

  debug(`Changed source files: ${changedSrcFiles.length}`);
  changedSrcFiles.forEach((f) => debug(`  - ${f}`));

  // 3. Get changed doc files from --docs flag
  let changedDocFiles: string[] = [];
  if (options.docs) {
    changedDocFiles = options.docs.split(',').map((f) => f.trim()).filter(Boolean);
  }

  debug(`Changed doc files: ${changedDocFiles.length}`);
  changedDocFiles.forEach((f) => debug(`  - ${f}`));

  // 4. Filter source files through manifest ignore patterns
  // 5. Resolve which docs should have been updated
  const affectedDocs = resolveAffectedDocs(manifest, changedSrcFiles);

  if (affectedDocs.length === 0) {
    success('No documentation updates required for these changes.');
    process.exit(0);
  }

  // 6. Compare expected vs actual doc changes
  const expectedDocPaths = new Set(affectedDocs.map((doc) => doc.docPath));
  const actualDocPaths = new Set(changedDocFiles);

  debug(`Expected doc updates: ${expectedDocPaths.size}`);
  expectedDocPaths.forEach((path) => debug(`  - ${path}`));

  debug(`Actual doc updates: ${actualDocPaths.size}`);
  actualDocPaths.forEach((path) => debug(`  - ${path}`));

  // Check for drift
  const missingDocs = affectedDocs.filter((doc) => !actualDocPaths.has(doc.docPath));
  const unexpectedDocs = changedDocFiles.filter(
    (doc) => doc.startsWith('docs/') && !expectedDocPaths.has(doc)
  );

  const hasDrift = missingDocs.length > 0 || unexpectedDocs.length > 0;

  // 7. Exit 0 if no drift, exit 1 with per-doc breakdown if drift detected
  if (!hasDrift) {
    success('No documentation drift detected.');
    info('All expected documentation has been updated.');
    process.exit(0);
  }

  // Drift detected
  error('Documentation drift detected!');
  log('');

  if (missingDocs.length > 0) {
    warn(`${missingDocs.length} documentation file(s) should have been updated but were not:`);
    missingDocs.forEach((doc) => {
      log(`  - ${doc.docPath}`);
      log(`    Triggered by: ${doc.triggeringFiles.join(', ')}`);
      log(`    Purpose: ${doc.purpose}`);
    });
    log('');
  }

  if (unexpectedDocs.length > 0) {
    warn(`${unexpectedDocs.length} documentation file(s) were updated unexpectedly:`);
    unexpectedDocs.forEach((doc) => {
      log(`  - ${doc}`);
    });
    log('');
  }

  info('To fix this drift:');
  log('  1. Run "autodoc update" locally');
  log('  2. Review and commit the documentation changes');
  log('  3. Push the changes to re-run CI');
  log('');

  process.exit(1);
}
