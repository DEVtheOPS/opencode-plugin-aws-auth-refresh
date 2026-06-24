# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1](https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh/compare/v0.1.0...v0.1.1) (2026-06-24)


### Bug Fixes

* detect AWS provider auth errors via session.error hook ([f266cdd](https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh/commit/f266cdd8e341a9acbe8c53957bb9c7690f220067))
* various issues ([6f5e4fe](https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh/commit/6f5e4feb056f6956b3e1142631c8a1877cda14c8))

## [1.0.0] - 2026-05-21

### Added
- Added npm-ready compiled `dist/` packaging with `main`, `module`, `types`, `exports`, `files`, and `oc-plugin: ["server"]` metadata.
- Added `build`, `prepack`, and `test` package scripts plus declaration output through `tsconfig.build.json`.
- Added package metadata tests covering the server plugin export contract.

### Fixed
- Fixed OpenCode hook compatibility by using the official `tool.execute.after(input, output)` server plugin shape and reading AWS auth failures from `output.output`.
- Fixed stale type drift by removing the local `src/types.d.ts` shim and compiling against `@opencode-ai/plugin` `^1.14.20`.
- Fixed refresh execution coverage with tests for default profiles, configured profiles, structured custom SSO commands, concurrent refresh coalescing, non-AWS output no-ops, non-`bash`/`task` no-ops, and failure logging.

### Changed
- Changed published package entrypoints from TypeScript source to compiled `dist/index.js` with `dist/index.d.ts` declarations.
- Changed custom SSO configuration to require structured `{ command, args }` values instead of raw shell command strings. Migrate `ssoLoginCommand: "aws sso login ..."` to `ssoLoginCommand: { "command": "aws", "args": ["sso", "login", "--profile", "name"] }`.
- Changed diagnostics wording to clarify that refresh status is logged through `client.app.log` and is not a clickable or session-visible UI notification.
- Changed release validation expectations to include `bun run build && bun run typecheck && bun test`.

### Removed
- Removed unsupported `autoRetry` behavior because the current OpenCode server plugin hook types do not expose an `input.retry` API. After credentials refresh, rerun the failed AWS command manually if needed.
- Removed stale `tool.execute.before` retry-state behavior and local plugin hook type assumptions.
