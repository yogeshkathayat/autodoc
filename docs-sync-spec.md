# Engineering Spec: `@<your-handle>/docs-gen`

**Status**: Ready for implementation
**License**: MIT
**Distribution**: Public npm registry, source on GitHub (personal account)
**Target audience**: Claude Code / Kiro agents building this package
**Estimated scope**: 5–7 days of focused agent work + human review

> Replace `<your-handle>` with your actual npm/GitHub handle before publishing. The agent should prompt for this value early during implementation and thread it through all examples.

---

## 1. Purpose

Build an open-source npm package that brings one-command, AI-driven documentation automation to any git repo. Running `npx @<your-handle>/docs-gen init` produces a working docs pipeline with **zero manual configuration** for common frameworks (NestJS, Laravel, Next.js) plus a generic fallback.

The package replaces manual scaffolding (git hooks, AI prompts, manifests, CI workflows) with a single installer that:

1. Detects the repo's framework.
2. Generates a tailored manifest mapping source paths → doc files.
3. Installs the git hook, AI prompt, and CI workflow.
4. Runs an initial bootstrap to seed `docs/`.
5. Commits the result.

After install, docs stay in sync via a local `post-merge` hook that invokes an AI agent (Claude Code in v1), with a GitHub Actions drift check as a safety net. All AI-generated changes are **staged for human review** — never auto-committed.

---

## 2. Background

### Problem

Engineering docs rot. Engineers don't update docs because (a) they forget, (b) it's tedious, (c) no system catches drift. LLMs can bridge the gap, but wiring them into a repo is fiddly enough that most people don't bother.

### Why a package

A reusable package removes setup friction. One command replaces an hour of scaffolding and stays consistent across repos.

### Why OSS

Benefits a wider audience, creates a cleaner design (no internal shortcuts), and builds a reputation-worthy artifact. Low marginal cost once built.

### Non-goals (explicit)

- **Not auto-committing docs.** Staged for review, always.
- **Not replacing hand-crafted docs.** ADRs, onboarding guides, runbooks stay untouched beyond well-defined structured sections.
- **Not real-time.** Runs on `git pull` or explicit invocation.
- **Not a docs site generator.** Output is markdown. Rendering (Docusaurus, MkDocs) is the user's choice.
- **Not CI-only.** Local-first with CI safety net. CI-only mode is a future consideration.

---

## 3. User stories

1. **First-time user (external engineer)** runs `npx @<your-handle>/docs-gen init`, reads a short preview, confirms, has a working pipeline in under 2 minutes.
2. **User after `git pull`** gets docs auto-updated and staged. Reviews via `git diff --cached docs/`, commits or discards.
3. **PR reviewer** sees the CI drift check fail with a specific comment listing which docs drifted and which files triggered the check.
4. **User upgrading** runs `npx @<your-handle>/docs-gen upgrade` and gets latest hook/workflow/prompt without losing local manifest edits.
5. **User without the AI adapter installed** can still `init` (scaffolding succeeds), but `update` exits with a clear install link. The git hook is non-blocking.
6. **User with a non-standard framework** gets a generic manifest and a clear message to edit it.
7. **Future contributor** can add a new framework by dropping files into `src/templates/<n>/` and a detection rule into `detect.ts`.

---

## 4. CLI surface

```bash
docs-gen init [--framework <n>] [--adapter <n>] [--dry-run] [--yes]
docs-gen upgrade [--yes]
docs-gen update [--since <ref>] [--staged] [--bootstrap]
docs-gen check [--src <files>] [--docs <files>]
docs-gen doctor
```

### `init`

Detects framework, scaffolds files, installs hook, runs bootstrap.

**Flags:**

- `--framework <nestjs|laravel|nextjs|generic>` — override auto-detection
- `--adapter <claude-code>` — which AI adapter to configure (v1 only supports `claude-code`; flag present for forward compatibility)
- `--dry-run` — show what would change, change nothing
- `--yes` — skip confirmations

**Behavior:**

1. Verify inside a git repo.
2. Verify working tree is clean; refuse if dirty (unless `--yes`).
3. Detect framework (§5).
4. Preview: "Detected: NestJS. Will create: docs/, .claude/commands/, .github/workflows/docs-drift.yml, .husky/post-merge. Proceed?" → confirm.
5. Write files. Never overwrite without explicit confirmation.
6. Install husky, respecting package manager (npm/pnpm/yarn/bun).
7. Run bootstrap.
8. Print next steps.

### `upgrade`

Re-fetches latest scaffolded files from the installed package version. Preserves `docs/_manifest.json` and existing `docs/*.md`. Three-way merge on known files; writes `.orig` on conflict.

### `update`

Runs the sync. Used by the hook and callable manually. `--bootstrap` generates all mapped docs from scratch.

### `check`

CI drift detection. Reads changed file lists from flags or stdin.

### `doctor`

Diagnoses setup: adapter available? Hook installed? Manifest valid? Last sync point? CI workflow present?

---

## 5. Framework detection

Detection runs in order, stopping at first match:

| Framework | Detection signal                            | Default watches                                                                                                              |
| --------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| NestJS    | `package.json` has `"@nestjs/core"` in deps | `src/**/*.controller.ts`, `src/**/*.service.ts`, `src/**/*.module.ts`, `src/**/*.dto.ts`, `src/**/*.entity.ts`               |
| Next.js   | `package.json` has `"next"` in deps         | `app/**/*.{ts,tsx}`, `pages/**/*.{ts,tsx}`, `app/api/**/*`, `lib/**/*.ts`                                                    |
| Laravel   | `composer.json` has `"laravel/framework"`   | `app/Http/Controllers/**/*.php`, `app/Models/**/*.php`, `app/Services/**/*.php`, `routes/*.php`, `database/migrations/*.php` |
| Generic   | none match                                  | `src/**/*`, `lib/**/*`, `app/**/*`                                                                                           |

Templates live in `src/templates/<framework>/` with `manifest.json` (seed mappings) and optional `docs/` stubs.

**Templates must be framework-neutral.** No organization-specific names, no references to internal systems. Examples should use vendor-neutral terms ("event bus", "message queue") not specific products.

### Unknown frameworks

Install generic template. Prominent message: "Generic template used. Edit `docs/_manifest.json` before running `docs-gen update`."

### Edge cases

- **Monorepo with multiple frameworks**: v1 detects the root framework only; use generic if none. Document as known limit.
- **Hybrid projects**: detect root-level framework; user can override with `--framework`.

---

## 6. Package layout

```
@<your-handle>/docs-gen/
├── package.json
├── README.md
├── LICENSE                    # MIT
├── CHANGELOG.md
├── SECURITY.md
├── bin/
│   └── docs-gen.js           # CLI entrypoint
├── src/
│   ├── commands/
│   │   ├── init.ts
│   │   ├── upgrade.ts
│   │   ├── update.ts
│   │   ├── check.ts
│   │   └── doctor.ts
│   ├── adapters/
│   │   ├── types.ts           # AIAdapter interface
│   │   ├── claude-code.ts     # v1 implementation
│   │   ├── openai.stub.ts     # stub for v1.1
│   │   ├── gemini.stub.ts     # stub for v1.1
│   │   └── index.ts           # factory/registry
│   ├── detect.ts              # framework detection
│   ├── manifest.ts            # schema + validation
│   ├── git.ts                 # git helpers
│   ├── husky.ts               # hook install
│   ├── pm.ts                  # package manager detection
│   ├── fs-safe.ts             # safe writes (never clobber)
│   ├── logger.ts              # picocolors + levels
│   └── templates/
│       ├── _common/
│       │   ├── .claude/commands/update-docs.md
│       │   ├── .github/workflows/docs-drift.yml
│       │   └── .husky/post-merge
│       ├── nestjs/manifest.json
│       ├── laravel/manifest.json
│       ├── nextjs/manifest.json
│       └── generic/manifest.json
├── schema/
│   └── manifest.schema.json   # published for editor autocomplete
├── tests/
│   ├── detect.test.ts
│   ├── manifest.test.ts
│   ├── adapters/claude-code.test.ts
│   └── fixtures/
│       ├── nestjs-repo/
│       ├── laravel-repo/
│       ├── nextjs-repo/
│       └── generic-repo/
└── .github/
    └── workflows/
        ├── test.yml           # CI for the package itself
        └── release.yml        # publish on tag
```

**What gets installed into target repos:**

```
<target-repo>/
├── docs/
│   ├── _manifest.json
│   └── .last-sync             # gitignored
├── .claude/commands/update-docs.md
├── .github/workflows/docs-drift.yml
└── .husky/post-merge
```

**Critical design shift from the prototype**: helper scripts do NOT get copied into target repos. Logic lives in the npm package. The hook calls `npx @<your-handle>/docs-gen update`; CI calls `npx @<your-handle>/docs-gen check`. This makes `upgrade` actually useful.

---

## 7. Manifest

Single source of truth for what-maps-to-what.

```json
{
  "$schema": "https://unpkg.com/@<your-handle>/docs-gen/schema/manifest.schema.json",
  "version": "1.0",
  "project": "<repo-name>",
  "framework": "nestjs | laravel | nextjs | generic",
  "adapter": "claude-code",
  "description": "...",
  "mappings": [
    {
      "id": "api-reference",
      "doc": "docs/api-reference.md",
      "watches": ["src/**/*.controller.ts"],
      "purpose": "REST endpoints, request/response shapes, auth requirements.",
      "strategy": "surgical"
    }
  ],
  "ignore": ["**/*.spec.ts", "**/*.test.ts", "**/node_modules/**"]
}
```

**Field semantics:**

- `id` — kebab-case, unique, used in logs/CI
- `doc` — relative to repo root, must be under `docs/`
- `watches` — globs; any match triggers the mapping
- `purpose` — guidance passed to the AI adapter
- `strategy` — `surgical` (default, edit affected sections) or `rewrite` (regenerate whole doc)

**Validation** (`manifest.ts`):

- Duplicate `id` → error
- `doc` outside `docs/` → error
- Overly broad `watches` (e.g., `**/*`) → warning
- Multiple mappings watching same files → warning (ambiguity)
- Unknown `adapter` → error with list of supported adapters

Publish `manifest.schema.json` at a stable URL so editors autocomplete.

---

## 8. AI adapter interface

The adapter abstraction is what makes v1.1+ support OpenAI/Gemini without a refactor. Keep v1 focused: **implement only `claude-code`; design the interface properly; ship stub files for others**.

### Interface

```ts
// src/adapters/types.ts
export interface AIAdapter {
  readonly name: string;

  /** Verify the adapter can run in the current environment. */
  preflight(): Promise<{ ok: boolean; message?: string; installUrl?: string }>;

  /** Run the doc update pass. */
  runUpdate(input: UpdateInput): Promise<UpdateResult>;

  /** Run the initial bootstrap (generate all docs from scratch). */
  runBootstrap(input: BootstrapInput): Promise<BootstrapResult>;
}

export interface UpdateInput {
  repoRoot: string;
  changedFiles: string[];
  affectedDocs: AffectedDoc[];
  manifestPath: string;
}

export interface AffectedDoc {
  id: string;
  docPath: string;
  watches: string[];
  purpose: string;
  strategy: "surgical" | "rewrite";
  triggeringFiles: string[];
}

export interface UpdateResult {
  updatedDocs: string[];
  skippedDocs: { path: string; reason: string }[];
  reviewSuggested: string[];
  summary: string;
}

export interface BootstrapInput {
  repoRoot: string;
  manifestPath: string;
  mappings: ManifestMapping[];
}

export interface BootstrapResult {
  createdDocs: string[];
  skippedMappings: { id: string; reason: string }[];
  summary: string;
}
```

### `claude-code` adapter (v1)

- Invokes the `claude` CLI with `--print --permission-mode acceptEdits`.
- Passes a constrained tool allowlist: `Read, Edit, Write, Glob, Grep, Bash(git diff:*), Bash(git log:*)`.
- Uses the slash command at `.claude/commands/update-docs.md` as the prompt.
- Passes `changedFiles` as the slash command argument.
- Captures stdout for the summary; parses for updated file paths.

**Why the slash command lives in the target repo, not inside the package**: users can customize the prompt per repo. The default is installed by `init`; `upgrade` refreshes it but warns on local edits.

### Stub adapters (v1 sketches, not implemented)

Write **interface-only stub files** for `openai.ts` and `gemini.ts` that throw "not implemented in v1" from every method. These make the architecture visible and force the interface to stay clean. Document in `docs/adapters.md` that v1.1 will implement them.

---

## 9. The `update` flow

```
docs-gen update
  │
  ├─ load + validate manifest
  ├─ instantiate adapter (from manifest.adapter or --adapter)
  ├─ adapter.preflight() → if fails, print install link + exit
  ├─ compute changed files:
  │     --staged       → git diff --cached
  │     --since <ref>  → git diff <ref>..HEAD
  │     default        → git diff <docs/.last-sync>..HEAD (fallback HEAD~10)
  ├─ apply ignore patterns
  ├─ resolve changed files → affected docs via manifest
  ├─ if no affected docs → exit 0 "No updates needed"
  ├─ adapter.runUpdate(input)
  ├─ stage docs/ changes (git add docs/)
  ├─ print summary + review instructions
  └─ write current HEAD to docs/.last-sync
```

**Key constraints:**

- Non-clean working tree outside `docs/` → proceed; stage only `docs/`.
- Adapter missing → hook context: exit 0 (non-blocking). Manual context: exit 1.
- Adapter errors: log clearly; roll back staged `docs/` changes on error.

---

## 10. The `check` flow

CI-side guard.

1. Load manifest.
2. Filter source files through `ignore`.
3. For each mapping, check if any changed source matches `watches`.
4. Build expected-docs set.
5. Diff against actual-changed-docs.
6. Exit 0 if difference is empty (or no mappings triggered).
7. Exit 1 with per-doc breakdown listing triggering files.

**Escape hatches:**

- PR label `docs: skip`
- Commit message `[docs-skip]`

**Forked PRs** (important for OSS): GitHub Actions runs with read-only token on forks. The check must work. Design: run the check itself with `pull_request` (read-only; can report status), and if commenting is desired, use a separate workflow with `pull_request_target` that only reads metadata, not fork code. Agent should propose a concrete design and flag for review (see §18).

---

## 11. The git hook

Installed at `.husky/post-merge`:

```bash
#!/usr/bin/env bash
set -e

if ! command -v npx >/dev/null 2>&1; then exit 0; fi

if [[ "$(git config --bool hooks.skip-docs-gen 2>/dev/null)" == "true" ]]; then
  exit 0
fi

CHANGED=$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD 2>/dev/null || true)
if [[ -z "$CHANGED" ]]; then exit 0; fi

npx --no-install @<your-handle>/docs-gen update 2>&1 || {
  echo "docs-gen: skipped (run 'docs-gen doctor' to diagnose)"
  exit 0
}
```

**Package manager adaptation**: `init` detects the target's package manager:

- npm → `npx --no-install`
- pnpm → `pnpm exec`
- yarn → `yarn docs-gen`
- bun → `bunx`

**Version pinning**: Hook pins to a caret range (`^1.0.0`) by default. Users can override to exact pin.

---

## 12. Error handling matrix

| Scenario                           | Behavior                                                          |
| ---------------------------------- | ----------------------------------------------------------------- |
| Not a git repo                     | `init` fails with clear message + docs link                       |
| Dirty working tree                 | `init` refuses unless `--yes`; suggests `git stash`               |
| `docs/` exists with content        | Preserve; generate only missing files; warn                       |
| `_manifest.json` exists            | Do not overwrite; suggest `upgrade`                               |
| Adapter CLI missing                | Hook: silent. Manual: install URL.                                |
| Adapter auth failure               | Clear message with provider-specific fix                          |
| Adapter rate limit                 | Exponential backoff up to 3 retries, then fail with clear message |
| Manifest watches match zero files  | `init` warns; proceeds                                            |
| Bootstrap produces no docs         | Warn; skip `.last-sync`; user retries                             |
| `upgrade` finds local edits        | Three-way merge; `.orig` + prompt                                 |
| Windows (non-WSL)                  | v1: warn "WSL or macOS/Linux recommended"; best-effort            |
| Git worktrees                      | Detect; warn about hook semantics                                 |
| Monorepo                           | v1: root-only install; document limit                             |
| No `package.json` (Python/Go repo) | See §18 — open question                                           |

---

## 13. Testing

**Unit tests** (vitest):

- `detect.ts` — fixtures per framework + ambiguous cases
- `manifest.ts` — schema validation, duplicate ids, invalid paths, glob warnings
- `git.ts` — mocked git
- `check` — matrix of src/docs change combinations
- `pm.ts` — package manager detection across lockfile shapes
- Adapter factory — unknown adapter → clear error

**Integration tests** — run `docs-gen init` end-to-end on fixtures with stubbed adapter:

- NestJS → bootstrap produces non-empty docs (canned adapter output)
- Laravel → same
- Next.js → same
- Generic → warning emitted, minimal manifest
- Idempotency: `init` twice doesn't corrupt
- `upgrade` v1 → v2 preserves manifest edits

**Adapter tests** stub the `claude` CLI — assert correct args, permission flags, allowlist. No real API calls in CI.

**CI matrix**: Node 18/20/22 × Ubuntu/macOS. Windows as informational (non-blocking).

---

## 14. Distribution & versioning

- **Registry**: public npm as `@<your-handle>/docs-gen`.
- **Source**: public GitHub repo `<your-handle>/docs-gen`.
- **License**: MIT (LICENSE file at root).
- **Semver**:
  - Major: breaking manifest schema, breaking CLI args, adapter interface changes
  - Minor: new frameworks, new adapters, new flags
  - Patch: fixes
- **Release**: GitHub Actions on tag push → `npm publish --provenance` with `NPM_TOKEN` → GitHub Release with generated changelog
- **Pre-release**: publish `1.0.0-rc.1` to `next` tag for testing before promoting to `latest`
- **README on npm**: synced from repo README

---

## 15. Security

**Supply chain** (highest priority since this runs on strangers' repos):

- Hook uses `npx --no-install` to avoid silent latest-fetching; install must be explicit
- README explains version pinning clearly
- Publish with provenance (`npm publish --provenance`) — ties the package to the GitHub Actions build
- Enable npm 2FA for publishing
- Keep dependency tree small — each dep is an attack surface; document each in SECURITY.md
- Pin GitHub Action versions by SHA, not tag

**Adapter permissions:**

- Slash command allowlist: only `Read, Edit, Write, Glob, Grep` plus narrow `Bash(git diff:*)` / `Bash(git log:*)`. No `Bash(*)`. No network tools.
- README documents what the tool can and can't do

**User data:**

- Never log file contents — only paths and counts
- Adapter inputs go to an LLM API — document this and link each provider's data policy
- Add `--no-telemetry` flag even without telemetry in v1 (gives users confidence)

**CI:**

- `docs-drift.yml` uses `pull_request` (read-only on forks). Commenting workflow, if any, uses minimal-permission `pull_request_target` carefully (see §18).

**SECURITY.md**: vulnerability disclosure policy with a contact email or GitHub Security Advisory link.

---

## 16. Documentation (user-facing)

Ship with:

- **README.md** — quickstart, architecture diagram (mermaid), FAQ, troubleshooting
- **docs/manifest.md** — full manifest reference
- **docs/adapters.md** — how adapters work, how to write one (placeholder for v1.1)
- **docs/ci.md** — how the drift check works, legitimate bypasses
- **docs/faq.md** — common issues
- **CHANGELOG.md** — semver-aligned
- **LICENSE** — MIT
- **SECURITY.md** — disclosure policy

**Tone**: pragmatic, no marketing fluff. Examples over abstractions. Assume an experienced engineer.

---

## 17. Rollout plan (OSS-flavored)

**Week 1 — v0.1 (private dogfood):**

- NestJS only, Claude Code adapter only
- `init`, `update`, `check` working
- Test on one of your own repos
- No announcement

**Week 2 — v0.2 (private dogfood):**

- Add Laravel + Next.js + generic templates
- Add `upgrade`, `doctor`
- Harden errors from dogfood

**Week 3 — v1.0.0-rc.1 (public, low-key):**

- Publish to npm `next` tag
- GitHub public with README
- Share with 5 trusted engineers for feedback
- Iterate

**Week 4 — v1.0.0 (public launch):**

- Promote to `latest`
- Announce: Show HN, r/programming, r/node, dev.to
- X/BlueSky post
- Claude Code community channels (Discord if any)

**Success signals at 4 weeks post-launch:**

- Weekly downloads trending up
- > 10 GitHub stars
- ≥1 external issue or PR
- No critical bugs

**Red flags to address before launch:**

- Any scenario where the tool corrupts a user's repo
- Silent API cost blowups (unclear token budget for bootstrap)
- Claude Code CLI behavior changes breaking the adapter

---

## 18. Open questions for the agent to surface

Stop and ask rather than silently choosing:

1. **Scoped package requires npm account setup.** Confirm your npm handle matches your GitHub handle; resolve before publish.
2. **Bootstrap cost.** First-run on a large repo could burn significant API tokens. Should bootstrap chunk by mapping (N smaller calls) or one big call? Propose with a rough token estimate.
3. **`pull_request` vs `pull_request_target` in the drift workflow.** Security-sensitive. Propose a design and flag for review.
4. **Windows support level.** v1 best-effort-with-warning, or full support? Doubles test burden if full.
5. **What to do if the user has no `package.json` at all** (pure Python or Go repo). Install husky anyway, suggest a manual hook, or refuse? Propose.
6. **Telemetry in future versions.** `--no-telemetry` is a placeholder. Recommend: ship v1 clean, add opt-in later.
7. **Adapter interface — async vs streaming.** Adapter could stream progress back. Worth it for UX in v1 or defer?

---

## 19. Deliverables checklist

- [ ] `@<your-handle>/docs-gen` published to public npm at v1.0.0 with `--provenance`
- [ ] Public GitHub repo, MIT-licensed, README + CHANGELOG + SECURITY.md
- [ ] `npx @<your-handle>/docs-gen init` works end-to-end on fresh NestJS, Laravel, Next.js repos
- [ ] Generic fallback works on a bare repo
- [ ] `doctor` reports accurate status
- [ ] `upgrade` preserves local manifest edits
- [ ] CI drift check passes on code+docs PRs; fails correctly on code-only PRs
- [ ] Fork-PR case handled gracefully
- [ ] All unit + integration tests green on Node 18/20/22, Ubuntu + macOS
- [ ] Claude Code adapter implemented; OpenAI/Gemini stubs present and documented as v1.1
- [ ] Adapter interface documented well enough that someone could write a new adapter from docs alone
- [ ] npm 2FA enabled; publish workflow uses `NPM_TOKEN` from GitHub secrets
- [ ] Launch posts drafted (HN, Reddit, X) — **human sends them, not the agent**

---

## Appendix A: Reference prototype

A working single-repo prototype exists in earlier conversation: `carrier-hub-docs-automation/`. It contains:

- `docs/_manifest.json` — seed for the NestJS template (**scrub any organization-specific examples before using as a template**)
- `.claude/commands/update-docs.md` — basis for `templates/_common/`
- `scripts/update-docs.sh` → port logic into `src/commands/update.ts`
- `scripts/check-docs-drift.js` → port logic into `src/commands/check.ts`
- `scripts/bootstrap-docs.sh` → port logic into `update --bootstrap`
- `.husky/post-merge` → basis for `templates/_common/`, update to call `npx @<your-handle>/docs-gen update`
- `.github/workflows/docs-drift.yml` → basis, update to call `docs-gen check`

**The agent must not copy any organization-specific references or internal naming into the OSS package.** Scrub everything. Use neutral examples.

## Appendix B: Non-prescriptive guidance

Preferences, not requirements — override with better if warranted:

- TypeScript, compiled to CJS + ESM dual output
- `commander` for CLI parsing
- `picocolors` for output; no heavyweight logger
- `@inquirer/prompts` for interactive prompts
- `minimatch` for globs
- `zod` for manifest validation (TS types + runtime validation cheaply)
- `vitest` for tests
- `tsup` for builds
- Keep dependency count under 10 for the published package

## Appendix C: What to build in v1.1 (explicitly out of scope for v1)

For design foresight:

- OpenAI adapter (requires custom agentic loop — read/propose/apply)
- Gemini adapter (similar)
- Monorepo support (multiple manifests, per-package detection)
- Web UI for reviewing staged doc changes
- Token usage reporting per run
- Pluggable templates (users publish their own as `docs-gen-template-*` packages)
- Plain-API Claude adapter (without requiring Claude Code CLI)
