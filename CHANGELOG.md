# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added
- Initial implementation of `autodocai`
- Framework detection for NestJS, Next.js, Laravel with generic fallback
- Claude Code adapter for AI-driven documentation generation and updates
- CLI commands: `init`, `update`, `check`, `upgrade`, `doctor`
- Manifest-based documentation mapping system (`.autodoc/manifest.json`)
- Mapping strategies: `surgical` (targeted edits) and `rewrite` (full regeneration)
- Git post-merge hook for automatic documentation updates after pulls/merges
- GitHub Actions workflow template for CI drift detection
- Interactive project setup with framework detection and customization
- Glob pattern matching for file watch paths
- Manifest validation with detailed error messages
- OpenAI and Gemini adapter stubs for future v1.1 release
- Package manager detection (npm, yarn, pnpm, bun)
- Comprehensive error handling and logging

### Known Limitations
- Only Claude Code adapter is functional in v1.0
- Bootstrap command requires manual AI-driven initial documentation
- No diff visualization for documentation changes
