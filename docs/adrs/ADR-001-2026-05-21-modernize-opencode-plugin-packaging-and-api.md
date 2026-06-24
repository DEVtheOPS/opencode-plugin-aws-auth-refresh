# ADR-001: Modernize OpenCode Plugin Packaging and API Usage

## Status
Accepted

## Context
The AWS auth refresh plugin must be updated to current OpenCode plugin requirements using `/Users/digitalfiz/Development/github/devtheops/opencode-plugin-otel` as the local reference implementation. Prior discovery found that this plugin is not loaded by the current project OpenCode config, relies on a stale local `src/types.d.ts` shim, assumes an unsupported `input.retry()` hook API, invokes custom shell command strings in a likely escaped form, and has tests that do not exercise refresh behavior.

Evidence inspected:
- `opencode-plugin-aws-auth-refresh/package.json`: publishes `src/index.ts`, depends on `@opencode-ai/plugin` `^1.2.23`, has only `typecheck` script.
- `opencode-plugin-aws-auth-refresh/tsconfig.json`: no declaration-build config and no stricter modern flags used by the reference.
- `opencode-plugin-aws-auth-refresh/src/index.ts`: references `src/types.d.ts`, monitors `bash` and `task`, checks `input.retry`, and runs `$`${loginCmd}``.
- `opencode-plugin-aws-auth-refresh/src/types.d.ts`: local module shim exposes stale hook shapes, including unsupported `retry`.
- `opencode-plugin-aws-auth-refresh/tests/index.test.ts`: covers pattern matching and hook presence, not actual refresh execution.
- `opencode-plugin-otel/package.json`: uses `@opencode-ai/plugin` `^1.14.20`, `@opencode-ai/sdk` `^1.14.20` where SDK event types are imported directly, publishes built `dist/`, exposes `types`, uses `prepack`, and declares `oc-plugin: ["server"]`.
- `opencode-plugin-otel/tsconfig.json` and `tsconfig.build.json`: modern Bun/TypeScript config plus declaration emit for published package types.
- `opencode-plugin-otel/src/index.ts`: imports `Plugin` from `@opencode-ai/plugin`, uses the official hook style, uses `config` and `event` hooks, and does not rely on local plugin type shims.
- Local inspection of `@opencode-ai/plugin@1.14.20/dist/index.d.ts`: `tool.execute.after` input is `{ tool, sessionID, callID, args }`, output is `{ title, output, metadata }`; no `retry` API is present. `Plugin` is not generic and receives `PluginOptions`.

Forces:
- Prefer current OpenCode contracts over backwards compatibility with stale local types.
- Preserve centralized `AWS_AUTH_ERROR_PATTERNS` in `src/index.ts`, the single `refreshInProgress` guard, and monitoring of only `bash` and `task` unless separately justified.
- Do not invent plugin APIs or claim session-visible UI behavior without local or documented API evidence.
- Make packaging suitable for npm consumers rather than relying on TypeScript source loading.

## Options Considered
| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A. Minimal dependency bump only | Smallest change; low migration cost | Leaves stale shim, source publishing, unsupported retry assumption, weak tests, and package metadata behind current OpenCode plugin expectations | ✗ |
| B. Match the OTel package model and official server plugin API | Aligns with known working reference; publishes compiled JS and declarations; removes stale type shim; makes unsupported retry impossible to compile; enables package validation | Requires build pipeline, dist publishing, package metadata changes, and breaking behavior for `autoRetry` | ✓ |
| C. Add TUI plugin for visible notifications and retry controls | Could provide user-facing refresh status | Adds optional peer/TUI surface area not needed for a server-side credential refresh hook; no current requirement; increases complexity and cross-surface risk | ✗ |
| D. Keep raw `ssoLoginCommand` string support | Preserves existing config | Retains shell-injection and quoting ambiguity; conflicts with long-term safe architecture | ✗ |

## Decision
Adopt Option B: modernize the plugin as an OpenCode server plugin packaged from `dist/`, compiled and typed against the official `@opencode-ai/plugin` package, and remove behavior that depends on unsupported OpenCode APIs.

Expected package and config changes:
- Upgrade `@opencode-ai/plugin` to `^1.14.20`.
- Add `oc-plugin: ["server"]`.
- Publish built output: `main`, `module`, and `exports["."].default` should point to `dist/index.js`; `types` and `exports["."].types` should point to `dist/index.d.ts`; `files` should contain `dist/`.
- Add `build: "bun build src/index.ts --outdir=./dist --target=node && tsc -p tsconfig.build.json"`.
- Add `prepack: "bun run build"`.
- Add `test: "bun test"` while keeping `typecheck: "tsc --noEmit"`.
- Add `tsconfig.build.json` for declaration-only emit to `dist/` with `rootDir: ./src`.
- Modernize `tsconfig.json` toward the OTel baseline: `target/lib ESNext`, `module Preserve`, `moduleResolution bundler`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `moduleDetection force`, `strict`, `skipLibCheck`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, and `noImplicitOverride`.
- Keep `typescript` and `@types/bun` as development dependencies unless a runtime import requires them. Do not add `@opencode-ai/sdk` unless source code imports SDK types directly, unlike OTel.

Plugin API decisions:
- Delete the local `src/types.d.ts` shim and remove the triple-slash reference; rely on installed `@opencode-ai/plugin` definitions.
- Type the plugin with the current non-generic `Plugin` contract. Parse/narrow `PluginOptions` internally for `profile`, `maxRetries`, and any future options.
- Use the official `tool.execute.after(input, output)` shape and detect auth failures from `output.output` for `bash` and `task` only.
- Remove `tool.execute.before` retry-state mutation unless a documented need remains; retry tracking cannot live on the hook output object after execution.
- Remove or disable `autoRetry` because `input.retry` is not present in `@opencode-ai/plugin@1.14.20`. A future retry design must use a documented OpenCode API or an explicit user command, not a fabricated hook method.
- Continue using `client.app.log` for plugin diagnostics only. Do not present this as session-visible user messaging.
- Replace raw shell-string execution with structured Bun shell invocation. The default refresh should execute `aws sso login --profile <profile>` with interpolated arguments as data, not as a precomposed shell command string.
- Do not keep arbitrary raw `ssoLoginCommand` execution as the long-term architecture. If custom behavior is still required, replace it with a safer structured interface such as command plus argument array, or a constrained AWS SSO option set.

### Architecture Overview
```text
OpenCode server plugin loader
        |
        v
dist/index.js  <---- dist/index.d.ts
        |
        v
tool.execute.after hook
        |
        +-- ignore non-bash/task tools
        |
        +-- inspect output.output for AWS auth patterns
        |
        +-- refreshInProgress guard coalesces concurrent refreshes
        |
        +-- run aws sso login with structured Bun shell args
        |
        +-- write diagnostic logs through client.app.log
```

### Data Flow
1. OpenCode loads the npm package as a server plugin via `oc-plugin: ["server"]` and the `exports` map.
2. A `bash` or `task` tool completes and OpenCode calls `tool.execute.after` with `{ tool, sessionID, callID, args }` and `{ title, output, metadata }`.
3. The plugin checks `output.output` against `AWS_AUTH_ERROR_PATTERNS`.
4. If an AWS auth error is detected and no refresh is active, the plugin starts one refresh; concurrent detections await the same promise.
5. The plugin runs AWS SSO login for the configured profile using structured shell arguments.
6. The plugin logs success or failure. It does not automatically retry the failed tool until OpenCode exposes a supported retry contract.

### Key Interfaces
```ts
type SupportedConfig = {
  profile?: string
  maxRetries?: number
}
```

```ts
"tool.execute.after"?: (
  input: { tool: string; sessionID: string; callID: string; args: unknown },
  output: { title: string; output: string; metadata: unknown },
) => Promise<void>
```

`autoRetry` and raw `ssoLoginCommand` should be treated as deprecated/breaking-removal candidates because the former has no current OpenCode API backing and the latter is not a safe command boundary.

## Consequences

### Benefits
- Aligns package metadata and build output with the working OTel reference.
- Prevents local shim drift from hiding OpenCode API incompatibilities.
- Produces npm-friendly JavaScript and declaration files.
- Removes unsupported retry behavior from the design.
- Reduces command execution ambiguity and security risk.

### Tradeoffs
- Breaking change: `autoRetry` can no longer be honored without a documented OpenCode retry API.
- Breaking change: raw `ssoLoginCommand` should not continue as arbitrary shell execution.
- Development workflow gains a build step for packaging, although Bun can still run tests directly from source.
- Users may need to rerun failed AWS commands after refresh until a supported retry mechanism exists.

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenCode package metadata requirements change again | Medium | Medium | Keep package metadata close to the OTel reference and validate against installed `@opencode-ai/plugin` types during upgrades |
| Removing `autoRetry` surprises existing users | Medium | Medium | Document migration clearly and note that previous behavior was not backed by the official API |
| Removing raw `ssoLoginCommand` blocks advanced SSO workflows | Medium | Medium | Offer structured command/args or explicit AWS SSO option configuration after user approval |
| `client.app.log` is not visible where users expect | Medium | Low | Document logs as diagnostics only; defer UI/toast work until a TUI plugin is intentionally designed |
| Build output diverges from source or declarations | Low | Medium | Require `bun run build`, `bun run typecheck`, and `bun test` in release validation |

## Implementation Notes
- Implementation must not modify behavior under stale `src/types.d.ts`; remove it first or ensure it is not referenced.
- Keep `AWS_AUTH_ERROR_PATTERNS` centralized in `src/index.ts`.
- Keep `refreshInProgress` and shared refresh promise semantics to prevent concurrent refresh attempts.
- Continue monitoring only `bash` and `task` tools.
- Add tests for the real `output.output` hook shape, successful refresh command invocation, refresh failure logging, no concurrent refresh, non-AWS output no-op, and non-bash/task no-op.
- Add package validation tests or checks for `oc-plugin`, `exports`, `types`, `files`, and `prepack`/`build` scripts.
- Run `bun run typecheck` and `bun test` after implementation. For release packaging, also run `bun run build`.

## Questions for User
- [APPROVED 2026-05-21]: Remove `autoRetry`, since current OpenCode plugin types provide no `input.retry` API.
- [APPROVED 2026-05-21]: Replace custom SSO behavior with a structured command/argument interface.
- [APPROVED 2026-05-21]: Keep notification behavior to `client.app.log` for this pass.
- [APPROVED 2026-05-21]: Keep `.opencode/` ignored in `.gitignore`.
- [OPEN]: Decide whether this plugin should be loaded globally, project-locally, or both in OpenCode configuration; it is currently absent from this repo's active `.opencode/opencode.jsonc`.
