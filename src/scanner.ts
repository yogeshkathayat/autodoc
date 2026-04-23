import { promises as fs } from 'fs';
import { join, relative, basename } from 'path';
import { fileExists } from './fs-safe.js';
import type { Framework } from './detect.js';
import type { ManifestMapping } from './manifest.js';

export interface ScannedModule {
  name: string;
  path: string;
  files: string[];
  hasControllers: boolean;
  hasServices: boolean;
  hasEntities: boolean;
  hasSubmodules: boolean;
  submodules: string[];
}

export interface ScanResult {
  modules: ScannedModule[];
  commonPaths: string[];
  framework: string;
}

interface ScanOptions {
  excludePatterns?: string[];
  includeTests?: boolean;
}

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'vendor',
  'storage',
  'bootstrap/cache',
];

const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', '__mocks__'];

/**
 * Checks if a file path should be excluded based on patterns.
 */
function shouldExclude(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => filePath.includes(pattern));
}

/**
 * Checks if a file is a test file.
 */
function isTestFile(filePath: string): boolean {
  return TEST_PATTERNS.some(pattern => filePath.includes(pattern));
}

/**
 * Recursively scans a directory and returns all file paths.
 */
async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {}
): Promise<string[]> {
  const excludePatterns = [
    ...DEFAULT_EXCLUDE_PATTERNS,
    ...(options.excludePatterns || []),
  ];
  const includeTests = options.includeTests ?? false;

  const files: string[] = [];

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relativePath = relative(dirPath, fullPath);

        if (shouldExclude(relativePath, excludePatterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          if (!includeTests && isTestFile(relativePath)) {
            continue;
          }
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Scans for NestJS modules.
 */
async function scanNestJSModules(repoRoot: string): Promise<ScannedModule[]> {
  const modules: ScannedModule[] = [];
  const srcPath = join(repoRoot, 'src');

  if (!(await fileExists(srcPath))) {
    return modules;
  }

  // Primary: scan src/modules/ directory
  const modulesPath = join(srcPath, 'modules');
  if (await fileExists(modulesPath)) {
    const moduleEntries = await fs.readdir(modulesPath, { withFileTypes: true });

    for (const entry of moduleEntries) {
      if (!entry.isDirectory()) continue;

      const modulePath = join(modulesPath, entry.name);
      const relPath = relative(repoRoot, modulePath);
      const files = await scanDirectory(modulePath);

      // Analyze module structure
      const tsFiles = files.filter(f => f.endsWith('.ts'));
      const hasControllers = tsFiles.some(f => f.includes('.controller.'));
      const hasServices = tsFiles.some(f => f.includes('.service.'));
      const hasEntities = tsFiles.some(
        f => f.includes('.entity.') || f.includes('.model.')
      );

      // Detect submodules (subdirectories with .module.ts files)
      const submodules: string[] = [];
      const entries = await fs.readdir(modulePath, { withFileTypes: true });
      for (const subEntry of entries) {
        if (!subEntry.isDirectory()) continue;
        const subModulePath = join(modulePath, subEntry.name);
        const hasModuleFile = await fileExists(
          join(subModulePath, `${subEntry.name}.module.ts`)
        );
        if (hasModuleFile) {
          submodules.push(subEntry.name);
        }
      }

      modules.push({
        name: entry.name,
        path: relPath,
        files: files.map(f => relative(repoRoot, f)),
        hasControllers,
        hasServices,
        hasEntities,
        hasSubmodules: submodules.length > 0,
        submodules,
      });
    }

    return modules;
  }

  // Fallback: scan src/*/ directories that contain .module.ts files
  const srcEntries = await fs.readdir(srcPath, { withFileTypes: true });

  for (const entry of srcEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'common' || entry.name === 'shared') continue;

    const modulePath = join(srcPath, entry.name);
    const moduleFile = join(modulePath, `${entry.name}.module.ts`);

    if (await fileExists(moduleFile)) {
      const relPath = relative(repoRoot, modulePath);
      const files = await scanDirectory(modulePath);

      const tsFiles = files.filter(f => f.endsWith('.ts'));
      const hasControllers = tsFiles.some(f => f.includes('.controller.'));
      const hasServices = tsFiles.some(f => f.includes('.service.'));
      const hasEntities = tsFiles.some(
        f => f.includes('.entity.') || f.includes('.model.')
      );

      modules.push({
        name: entry.name,
        path: relPath,
        files: files.map(f => relative(repoRoot, f)),
        hasControllers,
        hasServices,
        hasEntities,
        hasSubmodules: false,
        submodules: [],
      });
    }
  }

  return modules;
}

/**
 * Scans for Next.js route-based modules.
 */
async function scanNextJSModules(repoRoot: string): Promise<ScannedModule[]> {
  const modules: ScannedModule[] = [];
  const appPath = join(repoRoot, 'app');

  if (!(await fileExists(appPath))) {
    return modules;
  }

  const entries = await fs.readdir(appPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Skip special Next.js directories
    if (entry.name.startsWith('_') || entry.name === 'api') continue;

    const modulePath = join(appPath, entry.name);
    const relPath = relative(repoRoot, modulePath);
    const files = await scanDirectory(modulePath);

    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    const hasControllers = false; // Next.js uses route handlers
    const hasServices = tsFiles.some(
      f => f.includes('.service.') || f.includes('service.')
    );
    const hasEntities = tsFiles.some(
      f => f.includes('.model.') || f.includes('types.')
    );

    modules.push({
      name: entry.name,
      path: relPath,
      files: files.map(f => relative(repoRoot, f)),
      hasControllers,
      hasServices,
      hasEntities,
      hasSubmodules: false,
      submodules: [],
    });
  }

  // Also scan app/api/ subdirectories as API feature modules
  const apiPath = join(appPath, 'api');
  if (await fileExists(apiPath)) {
    const apiEntries = await fs.readdir(apiPath, { withFileTypes: true });

    for (const entry of apiEntries) {
      if (!entry.isDirectory()) continue;

      const modulePath = join(apiPath, entry.name);
      const relPath = relative(repoRoot, modulePath);
      const files = await scanDirectory(modulePath);

      modules.push({
        name: `api-${entry.name}`,
        path: relPath,
        files: files.map(f => relative(repoRoot, f)),
        hasControllers: true, // API routes act as controllers
        hasServices: false,
        hasEntities: false,
        hasSubmodules: false,
        submodules: [],
      });
    }
  }

  return modules;
}

/**
 * Scans for Laravel modules based on controller namespaces.
 */
async function scanLaravelModules(repoRoot: string): Promise<ScannedModule[]> {
  const modules: ScannedModule[] = [];
  const controllersPath = join(repoRoot, 'app', 'Http', 'Controllers');

  if (!(await fileExists(controllersPath))) {
    return modules;
  }

  const entries = await fs.readdir(controllersPath, { withFileTypes: true });

  // Check if controllers are in subdirectories (e.g. API/, Admin/)
  const subDirs = entries.filter(e => e.isDirectory());
  const rootControllers = entries.filter(e => e.isFile() && e.name.endsWith('.php') && e.name !== 'Controller.php');

  // Scan for models and services at app level
  const modelsPath = join(repoRoot, 'app', 'Models');
  const servicesPath = join(repoRoot, 'app', 'Services');
  const hasModels = await fileExists(modelsPath);
  const hasServices = await fileExists(servicesPath);

  if (subDirs.length > 0) {
    // Group by controller subdirectory
    for (const entry of subDirs) {
      const modulePath = join(controllersPath, entry.name);
      const controllerFiles = await scanDirectory(modulePath);
      const allFiles = [...controllerFiles];

      // Include models and services in each module's context
      if (hasModels) {
        const modelFiles = await scanDirectory(modelsPath);
        allFiles.push(...modelFiles);
      }
      if (hasServices) {
        const serviceFiles = await scanDirectory(servicesPath);
        allFiles.push(...serviceFiles);
      }

      modules.push({
        name: entry.name.toLowerCase(),
        path: relative(repoRoot, modulePath),
        files: allFiles.map(f => relative(repoRoot, f)),
        hasControllers: true,
        hasServices,
        hasEntities: hasModels,
        hasSubmodules: false,
        submodules: [],
      });
    }
  }

  // If controllers are flat (no subdirectories), create modules by grouping:
  // routes, models, services as separate feature docs
  if (subDirs.length === 0 || rootControllers.length > 0) {
    const allAppFiles = await scanDirectory(join(repoRoot, 'app'));
    const routeFiles = await fileExists(join(repoRoot, 'routes'))
      ? await scanDirectory(join(repoRoot, 'routes'))
      : [];

    modules.push({
      name: 'application',
      path: 'app',
      files: [...allAppFiles, ...routeFiles].map(f => relative(repoRoot, f)),
      hasControllers: true,
      hasServices,
      hasEntities: hasModels,
      hasSubmodules: false,
      submodules: [],
    });
  }

  // Add routes as a separate module if route files exist
  const routesPath = join(repoRoot, 'routes');
  if (await fileExists(routesPath)) {
    const routeFiles = await scanDirectory(routesPath);
    if (routeFiles.length > 0) {
      modules.push({
        name: 'routes',
        path: 'routes',
        files: routeFiles.map(f => relative(repoRoot, f)),
        hasControllers: false,
        hasServices: false,
        hasEntities: false,
        hasSubmodules: false,
        submodules: [],
      });
    }
  }

  return modules;
}

/**
 * Scans for generic modules based on top-level directories.
 */
async function scanGenericModules(repoRoot: string): Promise<ScannedModule[]> {
  const modules: ScannedModule[] = [];

  // Try src/ first, then lib/
  let basePath = join(repoRoot, 'src');
  let foundSrcOrLib = await fileExists(basePath);
  if (!foundSrcOrLib) {
    basePath = join(repoRoot, 'lib');
    foundSrcOrLib = await fileExists(basePath);
  }

  if (foundSrcOrLib) {
    const entries = await fs.readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const modulePath = join(basePath, entry.name);
      const relPath = relative(repoRoot, modulePath);
      const files = await scanDirectory(modulePath);

      modules.push({
        name: entry.name,
        path: relPath,
        files: files.map(f => relative(repoRoot, f)),
        hasControllers: files.some(f => f.includes('controller')),
        hasServices: files.some(f => f.includes('service')),
        hasEntities: files.some(f => f.includes('model') || f.includes('entity')),
        hasSubmodules: false,
        submodules: [],
      });
    }

    return modules;
  }

  // Fallback: scan root-level feature directories (Go, Python, etc.)
  // Look for known feature-dir patterns at the repo root
  const FEATURE_DIRS = [
    'controllers', 'services', 'models', 'repositories',
    'handlers', 'middleware', 'routes', 'dto', 'entities',
    'pkg', 'internal', 'cmd', 'jobs', 'workers', 'events',
    'api', 'core', 'domain', 'adapters', 'ports',
  ];

  const rootEntries = await fs.readdir(repoRoot, { withFileTypes: true });
  const foundFeatureDirs = rootEntries.filter(
    e => e.isDirectory() && FEATURE_DIRS.includes(e.name)
  );

  if (foundFeatureDirs.length > 0) {
    // Group root-level dirs into logical modules
    for (const entry of foundFeatureDirs) {
      const modulePath = join(repoRoot, entry.name);
      const files = await scanDirectory(modulePath);
      if (files.length === 0) continue;

      modules.push({
        name: entry.name,
        path: entry.name,
        files: files.map(f => relative(repoRoot, f)),
        hasControllers: entry.name === 'controllers' || entry.name === 'handlers',
        hasServices: entry.name === 'services',
        hasEntities: entry.name === 'models' || entry.name === 'entities',
        hasSubmodules: false,
        submodules: [],
      });
    }
  }

  return modules;
}

const SKIP_DIRS = new Set([
  'common', 'shared', 'utils', 'helpers', 'types',
  'config', 'constants', 'assets', 'public', 'static',
]);

/**
 * Detects common/shared directories in the repository.
 */
async function detectCommonPaths(
  repoRoot: string,
  framework: Framework
): Promise<string[]> {
  const commonPaths: string[] = [];

  const potentialPaths = [
    'src/common',
    'src/shared',
    'src/utils',
    'src/lib',
    'app/common',
    'app/shared',
    'lib/common',
    'lib/shared',
  ];

  for (const path of potentialPaths) {
    const fullPath = join(repoRoot, path);
    if (await fileExists(fullPath)) {
      commonPaths.push(path);
    }
  }

  return commonPaths;
}

/**
 * Scans a repository to discover feature modules and common paths.
 *
 * @param repoRoot - Absolute path to the repository root
 * @param framework - The detected framework
 * @returns Scan result containing modules, common paths, and framework
 */
export async function scanModules(
  repoRoot: string,
  framework: Framework
): Promise<ScanResult> {
  let modules: ScannedModule[] = [];

  switch (framework) {
    case 'nestjs':
      modules = await scanNestJSModules(repoRoot);
      break;
    case 'nextjs':
      modules = await scanNextJSModules(repoRoot);
      break;
    case 'laravel':
      modules = await scanLaravelModules(repoRoot);
      break;
    case 'generic':
      modules = await scanGenericModules(repoRoot);
      break;
  }

  const commonPaths = await detectCommonPaths(repoRoot, framework);

  return {
    modules,
    commonPaths,
    framework,
  };
}

/**
 * Generates manifest mappings from scan results.
 *
 * @param scanResult - The result from scanModules
 * @param projectName - The name of the project
 * @returns Array of manifest mappings
 */
export function generateModuleMappings(
  scanResult: ScanResult,
  projectName: string
): ManifestMapping[] {
  const mappings: ManifestMapping[] = [];

  // Generate a mapping for each module.
  // Modules with submodules get split into separate docs to avoid timeouts.
  for (const module of scanResult.modules) {
    if (module.hasSubmodules && module.submodules.length > 1) {
      // Split into per-submodule docs
      for (const sub of module.submodules) {
        const subPath = `${module.path}/${sub}`;
        const subModule: ScannedModule = {
          name: `${module.name}-${sub}`,
          path: subPath,
          files: module.files.filter(f => f.startsWith(subPath + '/')),
          hasControllers: module.files.some(f => f.startsWith(subPath + '/') && f.includes('.controller.')),
          hasServices: module.files.some(f => f.startsWith(subPath + '/') && f.includes('.service.')),
          hasEntities: module.files.some(f => f.startsWith(subPath + '/') && f.includes('.entity.')),
          hasSubmodules: false,
          submodules: [],
        };
        const ext = scanResult.framework === 'laravel' ? 'php' : 'ts';
        mappings.push({
          id: subModule.name,
          doc: `docs/${subModule.name}.md`,
          watches: [`${subPath}/**/*.${ext}`],
          purpose: buildModulePurpose(subModule, scanResult.framework),
          strategy: 'rewrite',
        });
      }

      // Also add a parent overview doc watching only root-level files
      const ext = scanResult.framework === 'laravel' ? 'php' : 'ts';
      const rootFiles = module.files.filter(f => {
        const rel = f.slice(module.path.length + 1);
        return !rel.includes('/') || module.submodules.every(s => !rel.startsWith(s + '/'));
      });
      if (rootFiles.length > 0) {
        mappings.push({
          id: module.name,
          doc: `docs/${module.name}.md`,
          watches: [`${module.path}/*.${ext}`],
          purpose: `Overview of the ${module.name} module: architecture, how submodules (${module.submodules.join(', ')}) connect, shared types, and inter-module dependencies. Include Mermaid dependency diagram.`,
          strategy: 'rewrite',
        });
      }
    } else {
      const purpose = buildModulePurpose(module, scanResult.framework);
      const watches = buildModuleWatches(module, scanResult.framework);

      mappings.push({
        id: module.name,
        doc: `docs/${module.name}.md`,
        watches,
        purpose,
        strategy: 'rewrite',
      });
    }
  }

  // Add architecture overview mapping
  const overviewWatches = buildOverviewWatches(scanResult.framework);
  mappings.push({
    id: 'architecture-overview',
    doc: 'docs/architecture-overview.md',
    watches: overviewWatches,
    purpose:
      'High-level system architecture: module dependency graph, global middleware/guards/interceptors, configuration, deployment topology. Include Mermaid diagrams showing the overall system structure and how modules interact.',
    strategy: 'rewrite',
  });

  return mappings;
}

/**
 * Builds a dynamic purpose string for a module based on its characteristics.
 */
function buildModulePurpose(module: ScannedModule, framework: string): string {
  const parts: string[] = [
    `Complete feature documentation for the ${module.name} module.`,
    'Include:',
  ];

  const sections: string[] = ['architecture overview'];

  if (module.hasControllers) {
    sections.push('API endpoints (controllers)');
  }

  if (module.hasServices) {
    sections.push('business logic (services)');
  }

  if (module.hasEntities) {
    sections.push('data model (entities/DTOs)');
  }

  sections.push('inter-module dependencies', 'data flow diagrams');

  parts.push(sections.join(', ') + '.');

  if (module.hasSubmodules) {
    parts.push(`Document submodules: ${module.submodules.join(', ')}.`);
  }

  return parts.join(' ');
}

/**
 * Builds watch patterns for a module based on its path and framework.
 */
function buildModuleWatches(module: ScannedModule, framework: string): string[] {
  const extMap: Record<string, string> = {
    nestjs: 'ts',
    nextjs: '{ts,tsx}',
    laravel: 'php',
    generic: '*',
  };
  const ext = extMap[framework] || '*';
  return [`${module.path}/**/*.${ext}`];
}

/**
 * Builds watch patterns for the architecture overview.
 */
function buildOverviewWatches(framework: string): string[] {
  switch (framework) {
    case 'nestjs':
      return ['src/**/*.module.ts', 'src/main.ts', 'src/app.module.ts'];
    case 'nextjs':
      return ['app/layout.tsx', 'app/page.tsx', 'next.config.js', 'middleware.ts'];
    case 'laravel':
      return [
        'app/Providers/**/*.php',
        'routes/**/*.php',
        'config/**/*.php',
        'bootstrap/app.php',
      ];
    case 'generic':
    default:
      return ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.ts'];
  }
}
