# Local Development & Testing

## Prerequisites

- Node.js >= 18
- Git
- [Claude Code CLI](https://claude.ai/download) (optional, needed only for AI-driven updates)

## Setup

```bash
git clone https://github.com/yogesh/autodoc.git
cd autodoc
npm install
npm run build
```

## Running the CLI Locally

### Direct execution (no link needed)

```bash
node dist/cli.js --help
node dist/cli.js doctor
```

### Using `npm link` (global CLI)

```bash
# From the autodoc project root:
npm link

# Now `autodoc` is available globally:
autodoc --version
autodoc --help
```

To unlink later:

```bash
npm unlink -g autodocai
```

## Testing on a Throwaway Repo

### NestJS example

```bash
mkdir /tmp/test-nestjs && cd /tmp/test-nestjs
git init
npm init -y
npm install @nestjs/core

# Preview what init would do:
autodoc init --dry-run

# Actually scaffold:
autodoc init --yes

# Inspect the output:
cat docs/_manifest.json
ls -la .husky/post-merge
ls -la .claude/commands/
ls -la .github/workflows/
```

### Next.js example

```bash
mkdir /tmp/test-nextjs && cd /tmp/test-nextjs
git init
npm init -y
npm install next

autodoc init --yes
```

### Laravel example

```bash
mkdir /tmp/test-laravel && cd /tmp/test-laravel
git init
echo '{"require":{"laravel/framework":"^11.0"}}' > composer.json

autodoc init --yes
```

### Generic (no framework)

```bash
mkdir /tmp/test-generic && cd /tmp/test-generic
git init
npm init -y

autodoc init --yes
# Expect: "Generic template used" message
```

## Testing the Update Flow

```bash
cd /tmp/test-nestjs

# Create a controller
mkdir -p src
cat > src/app.controller.ts << 'EOF'
import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  findAll() { return []; }
}
EOF

git add -A && git commit -m "add controller"

# Modify it
cat >> src/app.controller.ts << 'EOF'

  @Get(':id')
  findOne(id: string) { return { id }; }
EOF

git add -A && git commit -m "add findOne"

# Run update manually (requires Claude CLI):
autodoc update --since HEAD~1

# Check what was staged:
git diff --cached docs/
```

## Testing Drift Detection

```bash
cd /tmp/test-nestjs

# Simulate a PR that changed code but not docs:
autodoc check --src src/app.controller.ts
# Should exit 1 (drift detected)

# Simulate a PR that changed both:
autodoc check --src src/app.controller.ts --docs docs/api-reference.md
# Should exit 0 (no drift)
```

## Running the Doctor

```bash
cd /tmp/test-nestjs
autodoc doctor
```

Expected output:

```
  Manifest       docs/_manifest.json found and valid
  Adapter        Claude CLI found (or: not found - install at ...)
  Git Hook       .husky/post-merge installed
  Last Sync      <commit-sha> (or: no sync recorded)
  CI Workflow     .github/workflows/docs-drift.yml present
  Package Mgr    npm detected
```

## Running Tests

```bash
# All tests
npm test

# Specific test file
npx vitest run tests/detect.test.ts

# Watch mode (re-runs on changes)
npx vitest

# With coverage
npx vitest run --coverage
```

## Build

```bash
# One-time build
npm run build

# Watch mode (rebuild on changes)
npm run dev
```

## Development Workflow

1. Make changes in `src/`
2. Run `npm run build` (or `npm run dev` for watch mode)
3. Test with `node dist/cli.js <command>` or via `npm link`
4. Run `npm test` to verify nothing broke
5. Run `npx tsc --noEmit` for type checking

## Cleanup

```bash
# Remove global link
npm unlink -g autodocai

# Remove test repos
rm -rf /tmp/test-nestjs /tmp/test-nextjs /tmp/test-laravel /tmp/test-generic
```
