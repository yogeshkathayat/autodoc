# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in `autodocai`, please report it responsibly.

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Report vulnerabilities through [GitHub Security Advisories](https://github.com/yogesh/autodoc/security/advisories/new)
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- Acknowledgment of your report within 48 hours
- Regular updates on our progress
- Credit in the security advisory (if desired)

## Security Considerations

### Supply Chain Security

This package is designed to be run via `npx` in development environments. When using:

```bash
npx --no-install autodocai init
```

The `--no-install` flag ensures you're using an existing installation and not fetching a potentially compromised version.

### Published Package Integrity

Starting with v1.0.0, all npm releases include:
- **Provenance**: Cryptographically verifiable build attestations linking the package to its source repository
- **Package signatures**: Verification that the published package matches the tagged release

Verify provenance:
```bash
npm view autodocai --json | jq .dist.integrity
```

### What This Tool Can Access

`autodocai` operates entirely locally and:

**CAN access:**
- Files in your git repository (read-only for detection, write for docs)
- `.git` directory to check repository status
- Git hooks directory (`.git/hooks`, `.husky`) to install automation
- Package manager configuration files (read-only)

**CANNOT access:**
- Files outside your repository
- Network resources (except when AI adapter makes API calls)
- Environment variables (except standard git/shell vars)
- System-level configuration

### Data Handling

**File paths logged:**
- Changed file paths are logged to console during `update` and `check`
- File paths are included in AI adapter prompts for documentation updates
- File paths appear in git hook output

**File contents:**
- File contents are NOT logged to console
- File contents ARE sent to the AI provider API (Claude API in v1.0) when generating documentation
- Your repository contents never leave your machine except when explicitly sent to the configured AI provider

**What goes to the AI provider:**
- Manifest configuration (`.autodoc/manifest.json`)
- Paths of changed files
- Content of changed files (when affected docs are being updated)
- Content of documentation files being updated
- Git diff context (if available)

### AI Provider API Security

When using the Claude Code adapter:
- API calls go directly from Claude Code to Anthropic's API
- This package does not intercept or log API requests/responses
- Authentication is handled by Claude Code
- Review your AI provider's security and privacy policies

### Git Hooks

The post-merge hook installed by this tool:
- Runs automatically after `git pull` or `git merge`
- Executes `autodoc update --auto` with access to your repository
- Can be disabled by removing the hook file or uninstalling with `autodoc upgrade --remove-hooks`

### GitHub Actions

The CI workflow template:
- Runs `autodoc check` in pull requests
- Has read-only access to your repository (no write permissions)
- Does not require secrets or credentials
- Can be customized or removed from `.github/workflows/`

## Best Practices

1. **Review generated documentation** before committing, especially on first use
2. **Pin to specific versions** in CI (`npx autodocai@0.1.0`) to avoid supply chain attacks
3. **Use package manager lock files** (package-lock.json, yarn.lock, pnpm-lock.yaml)
4. **Audit dependencies** regularly with `npm audit` or equivalent
5. **Review git hooks** before installing in team repositories
6. **Configure `.gitignore`** to exclude sensitive files from documentation automation
7. **Use `--dry-run` flags** when available to preview changes

## Disclosure Policy

When a vulnerability is reported:
1. We will confirm the issue and determine its severity
2. We will develop and test a fix
3. We will release a patched version
4. We will publish a security advisory with credit to the reporter
5. We will notify users via GitHub releases and npm

## Contact

For security concerns, please use GitHub Security Advisories or contact the maintainers directly.
