# AGENTS.md

Instructions for AI agents working in this repository.

## Build & typecheck

Always run after making changes:

```bash
bun run typecheck
```

There is no build step. TypeScript source files are published directly and loaded natively by Bun.

## Project layout

```text
src/
├── index.ts    — Plugin entrypoint, hooks into tool execution
└── types.d.ts  — Plugin type definitions
```

## Key conventions

- **Bun over Node** — use `bun`, `bun test`, `bun run`. Never use `node`, `npx`.
- **No comments** unless explicitly requested.
- **AWS auth error patterns** — all AWS auth error detection happens in `AWS_AUTH_ERROR_PATTERNS` in `src/index.ts`. Add new patterns there.
- **Single credential refresh** — use the `refreshInProgress` flag to prevent concurrent refresh attempts.
- **Tool hooks** — only `bash` and `task` tools are monitored for AWS auth errors.

## Commit message format

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>[optional scope]: <description>
```

Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `ci`, `chore`, `build`.

Use `!` or a `BREAKING CHANGE:` footer for breaking changes.

Examples:

```text
feat: add support for custom SSO login command
fix: handle concurrent refresh requests correctly
chore(deps): bump @opencode-ai/plugin to 1.2.23
```