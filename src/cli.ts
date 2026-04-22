#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { setVerbose } from './logger.js';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { checkCommand } from './commands/check.js';
import { upgradeCommand } from './commands/upgrade.js';
import { doctorCommand } from './commands/doctor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Read package.json to get version
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

  const program = new Command();

  program
    .name('autodoc')
    .description('One-command, AI-driven documentation automation for any git repo')
    .version(packageJson.version)
    .option('-v, --verbose', 'Enable verbose debug logging')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.verbose) {
        setVerbose(true);
      }
    });

  // Register commands
  initCommand(program);
  updateCommand(program);
  checkCommand(program);
  upgradeCommand(program);
  doctorCommand(program);

  program.parse();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
