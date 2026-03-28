# Contributing

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- An opencode installation for manual testing

## Getting started

```bash
git clone https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh
cd opencode-plugin-aws-auth-refresh
bun install
```

## Development workflow

Point your local opencode config at the repo so changes are picked up immediately without a build step. In `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/path/to/opencode-plugin-aws-auth-refresh/src/index.ts"]
}
```

opencode loads TypeScript natively via Bun, so there is no build step required during development.

## Commands

| Command | Description |
|---------|-------------|
| `bun run typecheck` | Type-check all sources without emitting |

## Project structure

```text
src/
├── index.ts    — Plugin entrypoint, hooks into tool execution
└── types.d.ts  — Plugin type definitions
```

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). All commits must be structured as:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature (triggers a minor version bump) |
| `fix` | A bug fix (triggers a patch version bump) |
| `perf` | A performance improvement |
| `refactor` | Code change that is neither a fix nor a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only changes |
| `ci` | CI/CD configuration changes |
| `chore` | Maintenance tasks (dependency updates, etc.) |
| `build` | Changes to the build system |

### Breaking changes

Append `!` after the type or add a `BREAKING CHANGE:` footer:

```text
feat!: drop support for custom SSO commands

BREAKING CHANGE: ssoLoginCommand config option has been removed
```

### Examples

```text
feat: add support for custom SSO login command
fix: handle concurrent refresh requests correctly
docs: update README with configuration examples
chore(deps): bump @opencode-ai/plugin to 1.2.23
```

## Submitting changes

1. Fork the repo and create a branch from `main`: `git checkout -b feat/my-feature`
2. Make your changes and ensure `bun run typecheck` passes
3. Commit using Conventional Commits format
4. Open a pull request — the title should also follow Conventional Commits format

## Releasing

Releases are handled via GitHub Actions. See [the release workflow](.github/workflows/release.yml). To cut a release, push a version tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The version bump should follow [SemVer](https://semver.org) based on the commits since the last release:

- `fix` commits → patch (`1.0.x`)
- `feat` commits → minor (`1.x.0`)
- `BREAKING CHANGE` commits → major (`x.0.0`)