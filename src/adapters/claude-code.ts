import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Minimatch } from 'minimatch';
import type {
  AIAdapter,
  UpdateInput,
  UpdateResult,
  BootstrapInput,
  BootstrapResult,
} from './types.js';

const execFileAsync = promisify(execFile);

const MAX_FILE_SIZE = 100 * 1024; // 100KB per file
const MAX_TOTAL_SIZE = 800 * 1024; // 800KB total source content in prompt

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
    // Pre-read triggering source files
    const sourceContents = await this.readSourceFiles(
      input.repoRoot,
      input.affectedDocs.flatMap(d => d.triggeringFiles)
    );

    const prompt = this.buildUpdatePrompt(input, sourceContents);

    try {
      const { stdout, stderr } = await execFileAsync(
        'claude',
        [
          '-p', prompt,
          '--allowedTools',
          'Write,Edit,Glob,Grep',
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
    // Pre-read all source files matching watch patterns
    const filePaths = await this.resolveWatchFiles(input.repoRoot, input.mappings);
    const sourceContents = await this.readSourceFiles(input.repoRoot, filePaths);

    const prompt = this.buildBootstrapPrompt(input, sourceContents);

    try {
      const { stdout, stderr } = await execFileAsync(
        'claude',
        [
          '-p', prompt,
          '--allowedTools',
          'Write,Edit',
        ],
        {
          cwd: input.repoRoot,
          timeout: 300000, // 5 minutes (down from 10 — no reading needed)
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      return this.parseBootstrapOutput(stdout, stderr, input.mappings);
    } catch (error) {
      if (error instanceof Error && 'killed' in error && error.killed) {
        throw new Error('Claude CLI execution timed out after 5 minutes');
      }
      throw new Error(
        `Claude CLI execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Resolve watch patterns to actual file paths.
   */
  private async resolveWatchFiles(
    repoRoot: string,
    mappings: BootstrapInput['mappings']
  ): Promise<string[]> {
    const allFiles = new Set<string>();

    for (const mapping of mappings) {
      for (const pattern of mapping.watches) {
        const matcher = new Minimatch(pattern);
        const files = await this.walkDir(repoRoot, repoRoot, matcher);
        files.forEach(f => allFiles.add(f));
      }
    }

    return [...allFiles];
  }

  /**
   * Walk directory and return files matching a pattern.
   */
  private async walkDir(
    baseDir: string,
    currentDir: string,
    matcher: Minimatch
  ): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        const relPath = relative(baseDir, fullPath);

        // Skip common non-source dirs
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', 'build', '.git', 'vendor', 'coverage', '.next'].includes(entry.name)) continue;
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;
          const subFiles = await this.walkDir(baseDir, fullPath, matcher);
          results.push(...subFiles);
        } else if (entry.isFile()) {
          if (relPath.includes('.test.') || relPath.includes('.spec.')) continue;
          if (matcher.match(relPath)) {
            results.push(relPath);
          }
        }
      }
    } catch {
      // Skip unreadable dirs
    }
    return results;
  }

  /**
   * Read source files and return their contents, respecting size limits.
   */
  private async readSourceFiles(
    repoRoot: string,
    filePaths: string[]
  ): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    let totalSize = 0;

    for (const filePath of filePaths) {
      if (totalSize >= MAX_TOTAL_SIZE) {
        break;
      }

      try {
        const fullPath = join(repoRoot, filePath);
        const fileStat = await stat(fullPath);

        if (fileStat.size > MAX_FILE_SIZE) continue;
        if (fileStat.size === 0) continue;

        const content = await readFile(fullPath, 'utf-8');
        totalSize += content.length;

        if (totalSize <= MAX_TOTAL_SIZE) {
          contents.set(filePath, content);
        }
      } catch {
        // Skip unreadable files
      }
    }

    return contents;
  }

  /**
   * Format source file contents for the prompt.
   */
  private formatSourceContents(contents: Map<string, string>): string {
    if (contents.size === 0) return '';

    const parts: string[] = [
      `\n\n--- SOURCE FILES (${contents.size} files pre-loaded) ---\n`,
    ];

    for (const [filePath, content] of contents) {
      parts.push(`\n### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`);
    }

    return parts.join('');
  }

  private buildUpdatePrompt(input: UpdateInput, sourceContents: Map<string, string>): string {
    const affectedDocsInfo = input.affectedDocs
      .map((doc) => {
        return `- ${doc.id}: ${doc.docPath}
  Purpose: ${doc.purpose}
  Strategy: ${doc.strategy}
  Triggering files: ${doc.triggeringFiles.join(', ')}`;
      })
      .join('\n\n');

    const sourceSection = this.formatSourceContents(sourceContents);

    return `Update documentation based on code changes.

Affected documentation (${input.affectedDocs.length}):
${affectedDocsInfo}

For "surgical" strategy: update only the sections affected by the changed code.
For "rewrite" strategy: regenerate the entire document.

Write each updated doc to its path using the Write tool. Preserve any <!-- manual --> sections.
${sourceSection}
After writing, output a line for each file: "Updated: <path>" or "Created: <path>"`;
  }

  private buildBootstrapPrompt(input: BootstrapInput, sourceContents: Map<string, string>): string {
    const mappingsInfo = input.mappings
      .map((mapping) => {
        return `- ${mapping.id}: ${mapping.doc}
  Purpose: ${mapping.purpose}`;
      })
      .join('\n');

    const sourceSection = this.formatSourceContents(sourceContents);

    return `Generate documentation from the source code below.

Target: ${input.mappings.map(m => m.doc).join(', ')}

Mappings:
${mappingsInfo}

Write each document using the Write tool. Include:
- Overview and purpose
- Architecture with Mermaid diagrams where helpful
- API endpoints (if controllers/handlers exist)
- Business logic and key methods (if services exist)
- Data model with types and relationships (if models/entities exist)
- Data flow and inter-module dependencies
${sourceSection}
After writing, output "Created: <path>" for each file.`;
  }

  private parseUpdateOutput(
    stdout: string,
    stderr: string,
    affectedDocs: UpdateInput['affectedDocs']
  ): UpdateResult {
    const updatedDocs: string[] = [];
    const skippedDocs: { path: string; reason: string }[] = [];
    const reviewSuggested: string[] = [];

    const editedPattern = /(?:Updated|Edited|Modified|Created|Written|Wrote):\s*(.+\.md)/gi;
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

    if (updatedDocs.length === 0) {
      for (const doc of affectedDocs) {
        if (output.includes(doc.docPath)) {
          updatedDocs.push(doc.docPath);
        }
      }
    }

    return {
      updatedDocs,
      skippedDocs,
      reviewSuggested,
      summary: this.generateUpdateSummary(updatedDocs, skippedDocs, reviewSuggested),
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
      const mapping = mappings.find(m => m.id === identifier || m.doc === identifier);
      if (mapping) {
        skippedMappings.push({ id: mapping.id, reason });
      }
    }

    if (createdDocs.length === 0) {
      for (const mapping of mappings) {
        if (output.includes(mapping.doc)) {
          createdDocs.push(mapping.doc);
        }
      }
    }

    return {
      createdDocs,
      skippedMappings,
      summary: this.generateBootstrapSummary(createdDocs, skippedMappings),
    };
  }

  private generateUpdateSummary(
    updatedDocs: string[],
    skippedDocs: { path: string; reason: string }[],
    reviewSuggested: string[]
  ): string {
    const parts: string[] = [];
    if (updatedDocs.length > 0) parts.push(`Updated ${updatedDocs.length} document(s)`);
    if (skippedDocs.length > 0) parts.push(`skipped ${skippedDocs.length}`);
    if (reviewSuggested.length > 0) parts.push(`${reviewSuggested.length} need review`);
    return parts.length === 0 ? 'No documentation updates performed' : parts.join(', ');
  }

  private generateBootstrapSummary(
    createdDocs: string[],
    skippedMappings: { id: string; reason: string }[]
  ): string {
    const parts: string[] = [];
    if (createdDocs.length > 0) parts.push(`Created ${createdDocs.length} document(s)`);
    if (skippedMappings.length > 0) parts.push(`skipped ${skippedMappings.length} mapping(s)`);
    return parts.length === 0 ? 'No documentation created' : parts.join(', ');
  }
}
