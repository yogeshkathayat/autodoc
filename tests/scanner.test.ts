import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanModules, generateModuleMappings } from '../src/scanner.js';
import type { ScanResult, ScannedModule } from '../src/scanner.js';
import type { Framework } from '../src/detect.js';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('scanModules', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'autodoc-scanner-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('NestJS scanning', () => {
    it('discovers module with controllers, services, and entities', async () => {
      // Create NestJS module structure
      const modulePath = join(tempDir, 'src', 'modules', 'users');
      await mkdir(modulePath, { recursive: true });

      await writeFile(join(modulePath, 'users.controller.ts'), '// controller');
      await writeFile(join(modulePath, 'users.service.ts'), '// service');
      await writeFile(join(modulePath, 'users.entity.ts'), '// entity');
      await writeFile(join(modulePath, 'users.module.ts'), '// module');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.framework).toBe('nestjs');
      expect(result.modules).toHaveLength(1);

      const usersModule = result.modules[0];
      expect(usersModule.name).toBe('users');
      expect(usersModule.path).toBe('src/modules/users');
      expect(usersModule.hasControllers).toBe(true);
      expect(usersModule.hasServices).toBe(true);
      expect(usersModule.hasEntities).toBe(true);
      expect(usersModule.hasSubmodules).toBe(false);
      expect(usersModule.submodules).toEqual([]);
      expect(usersModule.files).toContain('src/modules/users/users.controller.ts');
      expect(usersModule.files).toContain('src/modules/users/users.service.ts');
      expect(usersModule.files).toContain('src/modules/users/users.entity.ts');
      expect(usersModule.files).toContain('src/modules/users/users.module.ts');
    });

    it('discovers module with only services (no controllers)', async () => {
      const modulePath = join(tempDir, 'src', 'modules', 'auth');
      await mkdir(modulePath, { recursive: true });

      await writeFile(join(modulePath, 'auth.service.ts'), '// service');
      await writeFile(join(modulePath, 'auth.module.ts'), '// module');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.modules).toHaveLength(1);

      const authModule = result.modules[0];
      expect(authModule.name).toBe('auth');
      expect(authModule.hasControllers).toBe(false);
      expect(authModule.hasServices).toBe(true);
      expect(authModule.hasEntities).toBe(false);
    });

    it('detects submodules within a module', async () => {
      const modulePath = join(tempDir, 'src', 'modules', 'billing');
      const submodulePath = join(modulePath, 'invoices');
      await mkdir(submodulePath, { recursive: true });

      await writeFile(join(modulePath, 'billing.service.ts'), '// service');
      await writeFile(join(submodulePath, 'invoices.module.ts'), '// submodule');
      await writeFile(join(submodulePath, 'invoices.controller.ts'), '// controller');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.modules).toHaveLength(1);

      const billingModule = result.modules[0];
      expect(billingModule.name).toBe('billing');
      expect(billingModule.hasSubmodules).toBe(true);
      expect(billingModule.submodules).toContain('invoices');
    });

    it('returns empty array when src/modules/ is empty', async () => {
      const modulesPath = join(tempDir, 'src', 'modules');
      await mkdir(modulesPath, { recursive: true });

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.modules).toEqual([]);
      expect(result.framework).toBe('nestjs');
    });

    it('uses fallback scan when no src/modules/ but src/users/users.module.ts exists', async () => {
      const usersPath = join(tempDir, 'src', 'users');
      await mkdir(usersPath, { recursive: true });

      await writeFile(join(usersPath, 'users.module.ts'), '// module');
      await writeFile(join(usersPath, 'users.controller.ts'), '// controller');
      await writeFile(join(usersPath, 'users.service.ts'), '// service');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.modules).toHaveLength(1);

      const usersModule = result.modules[0];
      expect(usersModule.name).toBe('users');
      expect(usersModule.path).toBe('src/users');
      expect(usersModule.hasControllers).toBe(true);
      expect(usersModule.hasServices).toBe(true);
    });

    it('excludes test files from file lists', async () => {
      const modulePath = join(tempDir, 'src', 'modules', 'users');
      await mkdir(modulePath, { recursive: true });

      await writeFile(join(modulePath, 'users.controller.ts'), '// controller');
      await writeFile(join(modulePath, 'users.service.ts'), '// service');
      await writeFile(join(modulePath, 'users.controller.spec.ts'), '// test');
      await writeFile(join(modulePath, 'users.service.test.ts'), '// test');

      const result = await scanModules(tempDir, 'nestjs');

      const usersModule = result.modules[0];
      expect(usersModule.files).toContain('src/modules/users/users.controller.ts');
      expect(usersModule.files).toContain('src/modules/users/users.service.ts');
      expect(usersModule.files).not.toContain('src/modules/users/users.controller.spec.ts');
      expect(usersModule.files).not.toContain('src/modules/users/users.service.test.ts');
    });

    it('detects entities with .model. extension', async () => {
      const modulePath = join(tempDir, 'src', 'modules', 'products');
      await mkdir(modulePath, { recursive: true });

      await writeFile(join(modulePath, 'products.model.ts'), '// model');
      await writeFile(join(modulePath, 'products.service.ts'), '// service');

      const result = await scanModules(tempDir, 'nestjs');

      const productsModule = result.modules[0];
      expect(productsModule.hasEntities).toBe(true);
    });

    it('skips common and shared directories in fallback scan', async () => {
      const srcPath = join(tempDir, 'src');
      await mkdir(srcPath, { recursive: true });

      const commonPath = join(srcPath, 'common');
      await mkdir(commonPath, { recursive: true });
      await writeFile(join(commonPath, 'common.module.ts'), '// module');

      const sharedPath = join(srcPath, 'shared');
      await mkdir(sharedPath, { recursive: true });
      await writeFile(join(sharedPath, 'shared.module.ts'), '// module');

      const usersPath = join(srcPath, 'users');
      await mkdir(usersPath, { recursive: true });
      await writeFile(join(usersPath, 'users.module.ts'), '// module');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('users');
    });

    it('discovers multiple modules', async () => {
      const modulesPath = join(tempDir, 'src', 'modules');
      await mkdir(modulesPath, { recursive: true });

      const usersPath = join(modulesPath, 'users');
      await mkdir(usersPath, { recursive: true });
      await writeFile(join(usersPath, 'users.controller.ts'), '// controller');

      const authPath = join(modulesPath, 'auth');
      await mkdir(authPath, { recursive: true });
      await writeFile(join(authPath, 'auth.service.ts'), '// service');

      const productsPath = join(modulesPath, 'products');
      await mkdir(productsPath, { recursive: true });
      await writeFile(join(productsPath, 'products.entity.ts'), '// entity');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.modules).toHaveLength(3);
      expect(result.modules.map(m => m.name).sort()).toEqual(['auth', 'products', 'users']);
    });
  });

  describe('Next.js scanning', () => {
    it('discovers module in app/dashboard/', async () => {
      const dashboardPath = join(tempDir, 'app', 'dashboard');
      await mkdir(dashboardPath, { recursive: true });

      await writeFile(join(dashboardPath, 'page.tsx'), '// page');
      await writeFile(join(dashboardPath, 'layout.tsx'), '// layout');

      const result = await scanModules(tempDir, 'nextjs');

      expect(result.framework).toBe('nextjs');
      expect(result.modules).toHaveLength(1);

      const dashboardModule = result.modules[0];
      expect(dashboardModule.name).toBe('dashboard');
      expect(dashboardModule.path).toBe('app/dashboard');
      expect(dashboardModule.files).toContain('app/dashboard/page.tsx');
      expect(dashboardModule.files).toContain('app/dashboard/layout.tsx');
    });

    it('discovers API routes with api- prefix', async () => {
      const apiUsersPath = join(tempDir, 'app', 'api', 'users');
      await mkdir(apiUsersPath, { recursive: true });

      await writeFile(join(apiUsersPath, 'route.ts'), '// route handler');

      const result = await scanModules(tempDir, 'nextjs');

      expect(result.modules).toHaveLength(1);

      const apiModule = result.modules[0];
      expect(apiModule.name).toBe('api-users');
      expect(apiModule.path).toBe('app/api/users');
      expect(apiModule.hasControllers).toBe(true);
      expect(apiModule.hasServices).toBe(false);
      expect(apiModule.hasEntities).toBe(false);
    });

    it('skips special directories like _components', async () => {
      const appPath = join(tempDir, 'app');
      await mkdir(appPath, { recursive: true });

      const componentsPath = join(appPath, '_components');
      await mkdir(componentsPath, { recursive: true });
      await writeFile(join(componentsPath, 'Button.tsx'), '// component');

      const dashboardPath = join(appPath, 'dashboard');
      await mkdir(dashboardPath, { recursive: true });
      await writeFile(join(dashboardPath, 'page.tsx'), '// page');

      const result = await scanModules(tempDir, 'nextjs');

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('dashboard');
    });

    it('detects services in Next.js modules', async () => {
      const dashboardPath = join(tempDir, 'app', 'dashboard');
      await mkdir(dashboardPath, { recursive: true });

      await writeFile(join(dashboardPath, 'page.tsx'), '// page');
      await writeFile(join(dashboardPath, 'dashboard.service.ts'), '// service');

      const result = await scanModules(tempDir, 'nextjs');

      const dashboardModule = result.modules[0];
      expect(dashboardModule.hasServices).toBe(true);
    });

    it('detects entities/models in Next.js modules', async () => {
      const dashboardPath = join(tempDir, 'app', 'dashboard');
      await mkdir(dashboardPath, { recursive: true });

      await writeFile(join(dashboardPath, 'page.tsx'), '// page');
      await writeFile(join(dashboardPath, 'types.ts'), '// types');

      const result = await scanModules(tempDir, 'nextjs');

      const dashboardModule = result.modules[0];
      expect(dashboardModule.hasEntities).toBe(true);
    });

    it('returns empty array when app/ directory does not exist', async () => {
      const result = await scanModules(tempDir, 'nextjs');

      expect(result.modules).toEqual([]);
    });

    it('discovers both page routes and API routes', async () => {
      const appPath = join(tempDir, 'app');
      await mkdir(appPath, { recursive: true });

      const dashboardPath = join(appPath, 'dashboard');
      await mkdir(dashboardPath, { recursive: true });
      await writeFile(join(dashboardPath, 'page.tsx'), '// page');

      const apiUsersPath = join(appPath, 'api', 'users');
      await mkdir(apiUsersPath, { recursive: true });
      await writeFile(join(apiUsersPath, 'route.ts'), '// route');

      const result = await scanModules(tempDir, 'nextjs');

      expect(result.modules).toHaveLength(2);
      expect(result.modules.map(m => m.name).sort()).toEqual(['api-users', 'dashboard']);
    });
  });

  describe('Generic scanning', () => {
    it('discovers modules in src/ directory', async () => {
      const srcPath = join(tempDir, 'src');
      await mkdir(srcPath, { recursive: true });

      const authPath = join(srcPath, 'auth');
      await mkdir(authPath, { recursive: true });
      await writeFile(join(authPath, 'index.ts'), '// auth');

      const usersPath = join(srcPath, 'users');
      await mkdir(usersPath, { recursive: true });
      await writeFile(join(usersPath, 'index.ts'), '// users');

      const result = await scanModules(tempDir, 'generic');

      expect(result.framework).toBe('generic');
      expect(result.modules).toHaveLength(2);
      expect(result.modules.map(m => m.name).sort()).toEqual(['auth', 'users']);
    });

    it('skips common shared and utils directories', async () => {
      const srcPath = join(tempDir, 'src');
      await mkdir(srcPath, { recursive: true });

      const commonPath = join(srcPath, 'common');
      await mkdir(commonPath, { recursive: true });
      await writeFile(join(commonPath, 'index.ts'), '// common');

      const sharedPath = join(srcPath, 'shared');
      await mkdir(sharedPath, { recursive: true });
      await writeFile(join(sharedPath, 'index.ts'), '// shared');

      const utilsPath = join(srcPath, 'utils');
      await mkdir(utilsPath, { recursive: true });
      await writeFile(join(utilsPath, 'index.ts'), '// utils');

      const authPath = join(srcPath, 'auth');
      await mkdir(authPath, { recursive: true });
      await writeFile(join(authPath, 'index.ts'), '// auth');

      const result = await scanModules(tempDir, 'generic');

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('auth');
    });

    it('falls back to lib/ directory when src/ does not exist', async () => {
      const libPath = join(tempDir, 'lib');
      await mkdir(libPath, { recursive: true });

      const authPath = join(libPath, 'auth');
      await mkdir(authPath, { recursive: true });
      await writeFile(join(authPath, 'index.ts'), '// auth');

      const result = await scanModules(tempDir, 'generic');

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('auth');
      expect(result.modules[0].path).toBe('lib/auth');
    });

    it('returns empty array when neither src/ nor lib/ exists', async () => {
      const result = await scanModules(tempDir, 'generic');

      expect(result.modules).toEqual([]);
    });

    it('sets all type flags to false for generic modules', async () => {
      const srcPath = join(tempDir, 'src');
      await mkdir(srcPath, { recursive: true });

      const authPath = join(srcPath, 'auth');
      await mkdir(authPath, { recursive: true });
      await writeFile(join(authPath, 'index.ts'), '// auth');

      const result = await scanModules(tempDir, 'generic');

      const authModule = result.modules[0];
      expect(authModule.hasControllers).toBe(false);
      expect(authModule.hasServices).toBe(false);
      expect(authModule.hasEntities).toBe(false);
      expect(authModule.hasSubmodules).toBe(false);
    });
  });

  describe('common paths detection', () => {
    it('detects src/common as common path', async () => {
      const commonPath = join(tempDir, 'src', 'common');
      await mkdir(commonPath, { recursive: true });
      await writeFile(join(commonPath, 'utils.ts'), '// utils');

      const result = await scanModules(tempDir, 'nestjs');

      expect(result.commonPaths).toContain('src/common');
    });

    it('detects multiple common paths', async () => {
      const srcCommon = join(tempDir, 'src', 'common');
      await mkdir(srcCommon, { recursive: true });

      const srcShared = join(tempDir, 'src', 'shared');
      await mkdir(srcShared, { recursive: true });

      const srcUtils = join(tempDir, 'src', 'utils');
      await mkdir(srcUtils, { recursive: true });

      const result = await scanModules(tempDir, 'generic');

      expect(result.commonPaths).toContain('src/common');
      expect(result.commonPaths).toContain('src/shared');
      expect(result.commonPaths).toContain('src/utils');
    });

    it('returns empty array when no common paths exist', async () => {
      const srcPath = join(tempDir, 'src');
      await mkdir(srcPath, { recursive: true });

      const result = await scanModules(tempDir, 'generic');

      expect(result.commonPaths).toEqual([]);
    });
  });
});

describe('generateModuleMappings', () => {
  it('generates mappings with all purposes when module has controllers, services, and entities', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'users',
          path: 'src/modules/users',
          files: ['src/modules/users/users.controller.ts', 'src/modules/users/users.service.ts'],
          hasControllers: true,
          hasServices: true,
          hasEntities: true,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    expect(mappings).toHaveLength(2); // module + architecture-overview

    const usersMapping = mappings.find(m => m.id === 'users');
    expect(usersMapping).toBeDefined();
    expect(usersMapping?.doc).toBe('docs/users.md');
    expect(usersMapping?.strategy).toBe('rewrite');
    expect(usersMapping?.purpose).toContain('users module');
    expect(usersMapping?.purpose).toContain('API endpoints (controllers)');
    expect(usersMapping?.purpose).toContain('business logic (services)');
    expect(usersMapping?.purpose).toContain('data model (entities/DTOs)');
  });

  it('generates mappings with only services when module has only services', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'auth',
          path: 'src/modules/auth',
          files: ['src/modules/auth/auth.service.ts'],
          hasControllers: false,
          hasServices: true,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const authMapping = mappings.find(m => m.id === 'auth');
    expect(authMapping?.purpose).toContain('business logic (services)');
    expect(authMapping?.purpose).not.toContain('API endpoints (controllers)');
    expect(authMapping?.purpose).not.toContain('data model (entities/DTOs)');
  });

  it('splits modules with submodules into separate docs', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'billing',
          path: 'src/modules/billing',
          files: [
            'src/modules/billing/billing.module.ts',
            'src/modules/billing/invoices/invoices.service.ts',
            'src/modules/billing/payments/payments.controller.ts',
          ],
          hasControllers: false,
          hasServices: true,
          hasEntities: false,
          hasSubmodules: true,
          submodules: ['invoices', 'payments'],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    // Should have per-submodule docs + parent overview + architecture
    const billingInvoices = mappings.find(m => m.id === 'billing-invoices');
    expect(billingInvoices).toBeDefined();
    expect(billingInvoices?.doc).toBe('docs/billing-invoices.md');

    const billingPayments = mappings.find(m => m.id === 'billing-payments');
    expect(billingPayments).toBeDefined();

    const billingOverview = mappings.find(m => m.id === 'billing');
    expect(billingOverview).toBeDefined();
    expect(billingOverview?.purpose).toContain('invoices, payments');
  });

  it('always includes architecture-overview mapping', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'users',
          path: 'src/modules/users',
          files: [],
          hasControllers: true,
          hasServices: false,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const overviewMapping = mappings.find(m => m.id === 'architecture-overview');
    expect(overviewMapping).toBeDefined();
    expect(overviewMapping?.doc).toBe('docs/architecture-overview.md');
    expect(overviewMapping?.strategy).toBe('rewrite');
    expect(overviewMapping?.purpose).toContain('High-level system architecture');
    expect(overviewMapping?.purpose).toContain('module dependency graph');
    expect(overviewMapping?.purpose).toContain('Mermaid diagrams');
  });

  it('generates correct doc paths for all modules', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'users',
          path: 'src/modules/users',
          files: [],
          hasControllers: true,
          hasServices: false,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
        {
          name: 'auth',
          path: 'src/modules/auth',
          files: [],
          hasControllers: false,
          hasServices: true,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const usersMapping = mappings.find(m => m.id === 'users');
    expect(usersMapping?.doc).toBe('docs/users.md');

    const authMapping = mappings.find(m => m.id === 'auth');
    expect(authMapping?.doc).toBe('docs/auth.md');
  });

  it('always uses rewrite strategy', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'users',
          path: 'src/modules/users',
          files: [],
          hasControllers: true,
          hasServices: true,
          hasEntities: true,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    mappings.forEach(mapping => {
      expect(mapping.strategy).toBe('rewrite');
    });
  });

  it('generates correct watch patterns for NestJS modules', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'users',
          path: 'src/modules/users',
          files: [],
          hasControllers: true,
          hasServices: false,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const usersMapping = mappings.find(m => m.id === 'users');
    expect(usersMapping?.watches).toEqual(['src/modules/users/**/*.ts']);
  });

  it('generates correct watch patterns for Laravel modules', () => {
    const scanResult: ScanResult = {
      framework: 'laravel',
      modules: [
        {
          name: 'users',
          path: 'app/Http/Controllers/Users',
          files: [],
          hasControllers: true,
          hasServices: false,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const usersMapping = mappings.find(m => m.id === 'users');
    expect(usersMapping?.watches).toEqual(['app/Http/Controllers/Users/**/*.php']);
  });

  it('generates NestJS-specific overview watches', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const overviewMapping = mappings.find(m => m.id === 'architecture-overview');
    expect(overviewMapping?.watches).toEqual([
      'src/**/*.module.ts',
      'src/main.ts',
      'src/app.module.ts',
    ]);
  });

  it('generates Next.js-specific overview watches', () => {
    const scanResult: ScanResult = {
      framework: 'nextjs',
      modules: [],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const overviewMapping = mappings.find(m => m.id === 'architecture-overview');
    expect(overviewMapping?.watches).toEqual([
      'app/layout.tsx',
      'app/page.tsx',
      'next.config.js',
      'middleware.ts',
    ]);
  });

  it('generates Laravel-specific overview watches', () => {
    const scanResult: ScanResult = {
      framework: 'laravel',
      modules: [],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const overviewMapping = mappings.find(m => m.id === 'architecture-overview');
    expect(overviewMapping?.watches).toEqual([
      'app/Providers/**/*.php',
      'routes/**/*.php',
      'config/**/*.php',
      'bootstrap/app.php',
    ]);
  });

  it('generates generic overview watches for unknown frameworks', () => {
    const scanResult: ScanResult = {
      framework: 'generic',
      modules: [],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    const overviewMapping = mappings.find(m => m.id === 'architecture-overview');
    expect(overviewMapping?.watches).toEqual([
      'src/index.ts',
      'src/main.ts',
      'src/app.ts',
      'index.ts',
    ]);
  });

  it('generates mappings for multiple modules', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [
        {
          name: 'users',
          path: 'src/modules/users',
          files: [],
          hasControllers: true,
          hasServices: true,
          hasEntities: true,
          hasSubmodules: false,
          submodules: [],
        },
        {
          name: 'auth',
          path: 'src/modules/auth',
          files: [],
          hasControllers: false,
          hasServices: true,
          hasEntities: false,
          hasSubmodules: false,
          submodules: [],
        },
        {
          name: 'products',
          path: 'src/modules/products',
          files: [],
          hasControllers: true,
          hasServices: false,
          hasEntities: true,
          hasSubmodules: false,
          submodules: [],
        },
      ],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    // 3 modules + 1 overview = 4 total
    expect(mappings).toHaveLength(4);

    const moduleIds = mappings.map(m => m.id).filter(id => id !== 'architecture-overview');
    expect(moduleIds.sort()).toEqual(['auth', 'products', 'users']);
  });

  it('handles empty scan result', () => {
    const scanResult: ScanResult = {
      framework: 'nestjs',
      modules: [],
      commonPaths: [],
    };

    const mappings = generateModuleMappings(scanResult, 'test-project');

    // Should only have architecture-overview
    expect(mappings).toHaveLength(1);
    expect(mappings[0].id).toBe('architecture-overview');
  });
});
