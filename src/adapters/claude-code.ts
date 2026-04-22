import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AIAdapter,
  UpdateInput,
  UpdateResult,
  BootstrapInput,
  BootstrapResult,
} from './types.js';

const execFileAsync = promisify(execFile);

export class ClaudeCodeAdapter implements AIAdapter {
  readonly name = 'claude-code';

  async preflight(): Promise<{ ok: boolean; message?: string; installUrl?: string }> {
    try {
      const { stdout } = await execFileAsync('which', ['claude'], {
        timeout: 5000,
      });

      if (stdout.trim()) {
        return {
          ok: true,
          message: 'Claude CLI found',
        };
      }

      return {
        ok: false,
        message: 'Claude CLI not found. Please install Claude Code.',
        installUrl: 'https://claude.ai/download',
      };
    } catch {
      return {
        ok: false,
        message: 'Claude CLI not found. Please install Claude Code.',
        installUrl: 'https://claude.ai/download',
      };
    }
  }

  async runUpdate(input: UpdateInput): Promise<UpdateResult> {
    const prompt = this.buildUpdatePrompt(input);

    try {
      const { stdout, stderr } = await execFileAsync(
        'claude',
        [
          '-p', prompt,
          '--allowedTools',
          'Read,Edit,Write,Glob,Grep,Bash(git diff:*),Bash(git log:*)',
        ],
        {
          cwd: input.repoRoot,
          timeout: 300000, // 5 minutes
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }
      );

      return this.parseUpdateOutput(stdout, stderr, input.affectedDocs);
    } catch (error) {
      if (error instanceof Error && 'killed' in error && error.killed) {
        throw new Error('Claude CLI execution timed out after 5 minutes');
      }
      throw new Error(
        `Claude CLI execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async runBootstrap(input: BootstrapInput): Promise<BootstrapResult> {
    const prompt = this.buildBootstrapPrompt(input);

    try {
      const { stdout, stderr } = await execFileAsync(
        'claude',
        [
          '-p', prompt,
          '--allowedTools',
          'Read,Edit,Write,Glob,Grep,Bash(git diff:*),Bash(git log:*)',
        ],
        {
          cwd: input.repoRoot,
          timeout: 600000, // 10 minutes
          maxBuffer: 20 * 1024 * 1024, // 20MB
        }
      );

      return this.parseBootstrapOutput(stdout, stderr, input.mappings);
    } catch (error) {
      if (error instanceof Error && 'killed' in error && error.killed) {
        throw new Error('Claude CLI execution timed out after 10 minutes');
      }
      throw new Error(
        `Claude CLI execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildUpdatePrompt(input: UpdateInput): string {
    const affectedDocsInfo = input.affectedDocs
      .map((doc) => {
        return `- ${doc.id}: ${doc.docPath}
  Purpose: ${doc.purpose}
  Strategy: ${doc.strategy}
  Watches: ${doc.watches.join(', ')}
  Triggering files: ${doc.triggeringFiles.join(', ')}`;
      })
      .join('\n\n');

    return `Use the /update-docs slash command to update documentation.

Changed files (${input.changedFiles.length}):
${input.changedFiles.map((f) => `- ${f}`).join('\n')}

Affected documentation (${input.affectedDocs.length}):
${affectedDocsInfo}

Manifest path: ${input.manifestPath}
Repository root: ${input.repoRoot}

Please update all affected documentation files according to their strategies:
- "surgical": Make targeted updates to specific sections
- "rewrite": Regenerate the entire document

Report which files were updated, skipped, or need review.`;
  }

  private buildBootstrapPrompt(input: BootstrapInput): string {
    const mappingsInfo = input.mappings
      .map((mapping) => {
        return `- ${mapping.id}: ${mapping.doc}
  Purpose: ${mapping.purpose}
  Strategy: ${mapping.strategy}
  Watches: ${mapping.watches.join(', ')}`;
      })
      .join('\n\n');

    return `Use the /bootstrap-docs slash command to generate initial documentation.

Documentation mappings (${input.mappings.length}):
${mappingsInfo}

Manifest path: ${input.manifestPath}
Repository root: ${input.repoRoot}

Please generate all documentation files from scratch based on the current codebase.
Each document should follow its defined purpose and strategy.

Report which files were created and any that were skipped.`;
  }

  private parseUpdateOutput(
    stdout: string,
    stderr: string,
    affectedDocs: UpdateInput['affectedDocs']
  ): UpdateResult {
    const updatedDocs: string[] = [];
    const skippedDocs: { path: string; reason: string }[] = [];
    const reviewSuggested: string[] = [];

    // Parse stdout for file operations
    const editedPattern = /(?:Updated|Edited|Modified):\s*(.+\.md)/gi;
    const writtenPattern = /(?:Created|Written|Wrote):\s*(.+\.md)/gi;
    const skippedPattern = /Skipped:\s*(.+\.md)(?:\s*-\s*(.+))?/gi;
    const reviewPattern = /(?:Review|Check):\s*(.+\.md)/gi;

    const output = stdout + stderr;

    let match;

    while ((match = editedPattern.exec(output)) !== null) {
      const docPath = match[1].trim();
      if (!updatedDocs.includes(docPath)) {
        updatedDocs.push(docPath);
      }
    }

    while ((match = writtenPattern.exec(output)) !== null) {
      const docPath = match[1].trim();
      if (!updatedDocs.includes(docPath)) {
        updatedDocs.push(docPath);
      }
    }

    while ((match = skippedPattern.exec(output)) !== null) {
      const docPath = match[1].trim();
      const reason = match[2]?.trim() || 'No reason provided';
      skippedDocs.push({ path: docPath, reason });
    }

    while ((match = reviewPattern.exec(output)) !== null) {
      const docPath = match[1].trim();
      if (!reviewSuggested.includes(docPath)) {
        reviewSuggested.push(docPath);
      }
    }

    // If no explicit updates found, check if any affected docs exist in output
    if (updatedDocs.length === 0) {
      for (const doc of affectedDocs) {
        if (output.includes(doc.docPath)) {
          updatedDocs.push(doc.docPath);
        }
      }
    }

    const summary = this.generateUpdateSummary(updatedDocs, skippedDocs, reviewSuggested);

    return {
      updatedDocs,
      skippedDocs,
      reviewSuggested,
      summary,
    };
  }

  private parseBootstrapOutput(
    stdout: string,
    stderr: string,
    mappings: BootstrapInput['mappings']
  ): BootstrapResult {
    const createdDocs: string[] = [];
    const skippedMappings: { id: string; reason: string }[] = [];

    const output = stdout + stderr;

    // Parse for created/written files
    const createdPattern = /(?:Created|Written|Wrote|Generated):\s*(.+\.md)/gi;
    const skippedPattern = /Skipped:\s*(.+?)(?:\s*-\s*(.+))?$/gim;

    let match;

    while ((match = createdPattern.exec(output)) !== null) {
      const docPath = match[1].trim();
      if (!createdDocs.includes(docPath)) {
        createdDocs.push(docPath);
      }
    }

    while ((match = skippedPattern.exec(output)) !== null) {
      const identifier = match[1].trim();
      const reason = match[2]?.trim() || 'No reason provided';

      // Try to match to a mapping ID
      const mapping = mappings.find(
        (m) => m.id === identifier || m.doc === identifier
      );

      if (mapping) {
        skippedMappings.push({ id: mapping.id, reason });
      }
    }

    // If no explicit creations found, check if any mapping docs exist in output
    if (createdDocs.length === 0) {
      for (const mapping of mappings) {
        if (output.includes(mapping.doc)) {
          createdDocs.push(mapping.doc);
        }
      }
    }

    const summary = this.generateBootstrapSummary(createdDocs, skippedMappings);

    return {
      createdDocs,
      skippedMappings,
      summary,
    };
  }

  private generateUpdateSummary(
    updatedDocs: string[],
    skippedDocs: { path: string; reason: string }[],
    reviewSuggested: string[]
  ): string {
    const parts: string[] = [];

    if (updatedDocs.length > 0) {
      parts.push(`Updated ${updatedDocs.length} document(s)`);
    }

    if (skippedDocs.length > 0) {
      parts.push(`skipped ${skippedDocs.length}`);
    }

    if (reviewSuggested.length > 0) {
      parts.push(`${reviewSuggested.length} need review`);
    }

    if (parts.length === 0) {
      return 'No documentation updates performed';
    }

    return parts.join(', ');
  }

  private generateBootstrapSummary(
    createdDocs: string[],
    skippedMappings: { id: string; reason: string }[]
  ): string {
    const parts: string[] = [];

    if (createdDocs.length > 0) {
      parts.push(`Created ${createdDocs.length} document(s)`);
    }

    if (skippedMappings.length > 0) {
      parts.push(`skipped ${skippedMappings.length} mapping(s)`);
    }

    if (parts.length === 0) {
      return 'No documentation created';
    }

    return parts.join(', ');
  }
}
