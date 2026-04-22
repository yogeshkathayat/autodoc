import { readFile } from 'fs/promises';
import { z } from 'zod';
import { Minimatch } from 'minimatch';

// Mapping schema
const MappingSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  doc: z.string().refine(d => d.startsWith('docs/'), 'doc must be under docs/'),
  watches: z.array(z.string()).min(1),
  purpose: z.string(),
  strategy: z.enum(['surgical', 'rewrite']).default('surgical'),
});

// Full manifest schema
const ManifestSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal('1.0'),
  project: z.string(),
  framework: z.enum(['nestjs', 'laravel', 'nextjs', 'generic']),
  adapter: z.string(),
  description: z.string().optional(),
  mappings: z.array(MappingSchema),
  ignore: z.array(z.string()).default([]),
});

// Infer TypeScript types from Zod schemas
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestMapping = z.infer<typeof MappingSchema>;

export interface ValidationResult {
  valid: boolean;
  manifest?: Manifest;
  errors?: string[];
  warnings?: string[];
}

export interface AffectedDoc {
  id: string;
  docPath: string;
  watches: string[];
  purpose: string;
  strategy: 'surgical' | 'rewrite';
  triggeringFiles: string[];
}

/**
 * Validates a manifest object against the schema and performs additional validation checks.
 *
 * @param data - Unknown data to validate as a Manifest
 * @returns Validation result with manifest, errors, and warnings
 */
export function validateManifest(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // First, validate against Zod schema
  const parseResult = ManifestSchema.safeParse(data);

  if (!parseResult.success) {
    parseResult.error.errors.forEach(err => {
      const path = err.path.join('.');
      errors.push(`${path}: ${err.message}`);
    });
    return { valid: false, errors, warnings };
  }

  const manifest = parseResult.data;

  // Check for duplicate IDs
  const idSet = new Set<string>();
  manifest.mappings.forEach((mapping, index) => {
    if (idSet.has(mapping.id)) {
      errors.push(`Duplicate mapping id "${mapping.id}" found`);
    }
    idSet.add(mapping.id);
  });

  // Check for unknown adapter (only 'claude-code' supported in v1)
  if (manifest.adapter !== 'claude-code') {
    errors.push(`Unknown adapter "${manifest.adapter}". Only "claude-code" is supported in version 1.0`);
  }

  // Check for overly broad watches
  manifest.mappings.forEach((mapping) => {
    mapping.watches.forEach((pattern) => {
      if (pattern === '**/*' || pattern === '*') {
        warnings.push(`Mapping "${mapping.id}" has overly broad watch pattern "${pattern}"`);
      }
    });
  });

  // Check for multiple mappings watching the same files
  const watchPatternMap = new Map<string, string[]>();
  manifest.mappings.forEach((mapping) => {
    mapping.watches.forEach((pattern) => {
      if (!watchPatternMap.has(pattern)) {
        watchPatternMap.set(pattern, []);
      }
      watchPatternMap.get(pattern)!.push(mapping.id);
    });
  });

  watchPatternMap.forEach((mappingIds, pattern) => {
    if (mappingIds.length > 1) {
      warnings.push(`Multiple mappings [${mappingIds.join(', ')}] watch the same pattern "${pattern}"`);
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return { valid: true, manifest, warnings };
}

/**
 * Loads and validates a manifest from a JSON file.
 *
 * @param manifestPath - Absolute path to the manifest JSON file
 * @returns Validated manifest object
 * @throws Error if the file cannot be read or validation fails
 */
export async function loadManifest(manifestPath: string): Promise<Manifest> {
  try {
    const content = await readFile(manifestPath, 'utf-8');
    const data = JSON.parse(content);

    const result = validateManifest(data);

    if (!result.valid || !result.manifest) {
      const errorMessage = result.errors?.join('\n') || 'Unknown validation error';
      throw new Error(`Manifest validation failed:\n${errorMessage}`);
    }

    return result.manifest;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in manifest file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Resolves which docs are affected by a set of changed files.
 *
 * @param manifest - The validated manifest
 * @param changedFiles - Array of file paths that have changed (relative to repo root)
 * @returns Array of affected docs with their triggering files
 */
export function resolveAffectedDocs(
  manifest: Manifest,
  changedFiles: string[]
): AffectedDoc[] {
  const affectedDocs: AffectedDoc[] = [];

  // Create minimatch instances for ignore patterns
  const ignoreMatchers = manifest.ignore.map(pattern => new Minimatch(pattern));

  // Filter out ignored files
  const relevantFiles = changedFiles.filter(file => {
    return !ignoreMatchers.some(matcher => matcher.match(file));
  });

  // For each mapping, check if any changed files match its watch patterns
  manifest.mappings.forEach(mapping => {
    const watchMatchers = mapping.watches.map(pattern => new Minimatch(pattern));

    const triggeringFiles = relevantFiles.filter(file => {
      return watchMatchers.some(matcher => matcher.match(file));
    });

    if (triggeringFiles.length > 0) {
      affectedDocs.push({
        id: mapping.id,
        docPath: mapping.doc,
        watches: mapping.watches,
        purpose: mapping.purpose,
        strategy: mapping.strategy,
        triggeringFiles,
      });
    }
  });

  return affectedDocs;
}
