# Implementation Plan: Modernize OpenCode Plugin Packaging and API

## Overview
Modernize `opencode-plugin-aws-auth-refresh` to the accepted ADR-001 design: publish compiled `dist/` output as a server plugin, compile against `@opencode-ai/plugin` `^1.14.20`, remove stale local API shims and unsupported retry behavior, and replace raw custom SSO command strings with a structured command/argument interface. The implementation preserves the credential-refresh behavior that remains valid under the official OpenCode hook contract: centralized AWS auth pattern detection, only `bash` and `task` monitoring, `AWS_PROFILE` then `default` fallback, `refreshInProgress` single-refresh coalescing, and diagnostics through `client.app.log`.

## Regression Recovery Mode / Batch Milestone Gate
ADR-001 records repeated contradictions between local shims, package metadata, hook runtime shape, retry assumptions, and tests. Before runtime implementation begins, the engineer must complete the packaging/API reset gate and validate the repository no longer compiles against stale types.

Gate requirements before Batch 3:
- `src/types.d.ts` must be deleted and no `/// <reference types="./types.d.ts" />` may remain.
- `@opencode-ai/plugin` must resolve to `^1.14.20` in `package.json` and `bun.lock`.
- `package.json` must expose `dist/index.js`, `dist/index.d.ts`, `oc-plugin: ["server"]`, `build`, `prepack`, and `test`.
- `tsconfig.build.json` must exist and emit declarations only into `dist/`.
- If any stale retry/type-shim behavior remains necessary, stop and route to lead as `[BLOCKER]` because the ADR explicitly rejects invented APIs.

Completion label semantics for runtime-affecting tasks:
- `VERIFIED`: implementation completed and the task-specific verification command plus all listed Do Not Regress checks passed with evidence.
- `PARTIAL`: implementation completed but one or more checks are blocked or failing; include exact failure output and next action.
- `UNVERIFIED`: implementation was not run or evidence is missing; do not merge.

Breaking/reset changes requiring lead awareness:
- `autoRetry` is removed because official plugin types provide no `input.retry` API.
- raw string `ssoLoginCommand` is removed; custom refresh uses structured `{ command, args }` only.
- npm consumers load compiled `dist/` output, not TypeScript source.

## Dependency Map
```text
Batch 1: package.json, tsconfig.json, tsconfig.build.json, src/types.d.ts, bun.lock
  └─ Milestone Gate: no stale shim, official package baseline, dist packaging metadata
      ├─ Batch 2: src/index.ts
      │   └─ Batch 3: tests/index.test.ts
      ├─ Batch 2: tests/package.test.ts
      └─ Batch 4: README.md, CONTRIBUTING.md
          └─ Batch 5: full integration verification
```

## Parallel Batch 1: Packaging and Type Baseline Reset

### Task 1.1: Package Metadata
**File:** `package.json`  
**Test:** `tests/package.test.ts`  
**Depends:** none

Replace package metadata with the ADR-approved dist publishing model.

```json
{
  "name": "@devtheops/opencode-plugin-aws-auth-refresh",
  "version": "0.1.0",
  "description": "OpenCode plugin that refreshes AWS credentials when auth errors are detected",
  "keywords": [
    "opencode",
    "aws",
    "sso",
    "auth",
    "plugin"
  ],
  "license": "MPL-2.0",
  "author": "DEVtheOPS",
  "homepage": "https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh#readme",
  "bugs": {
    "url": "https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh/issues"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/DEVtheOPS/opencode-plugin-aws-auth-refresh.git"
  },
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist/"
  ],
  "oc-plugin": [
    "server"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir=./dist --target=node && tsc -p tsconfig.build.json",
    "prepack": "bun run build",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.14.20"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.9.3"
  }
}
```

Active Constraints / Do Not Regress:
- Use `@opencode-ai/plugin` `^1.14.20` exactly.
- Do not add `@opencode-ai/sdk` unless source imports SDK types directly.
- Publish only `dist/`, not `src/`.
- Add `oc-plugin: ["server"]`.

Required verification evidence:
- `bun install`
- `bun test tests/package.test.ts`
- `bun run build`

Do Not Regress checks:
- `main`, `module`, `types`, and `exports` all point to `dist`.
- scripts include `build`, `prepack`, `test`, and `typecheck`.

Expected completion label: `VERIFIED` only if package metadata test and build pass.

### Task 1.2: Runtime TypeScript Config
**File:** `tsconfig.json`  
**Test:** `tests/index.test.ts`  
**Depends:** none

Modernize the TypeScript baseline to match the accepted OTel reference structure while keeping source execution and tests compatible with Bun.

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "declaration": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  },
  "exclude": ["dist"]
}
```

Active Constraints / Do Not Regress:
- Preserve strict type checking.
- Use `moduleResolution: "bundler"`, `module: "Preserve"`, and `allowImportingTsExtensions`.
- Do not rely on stale local type shims.

Required verification evidence:
- `bun run typecheck`
- `bun test tests/index.test.ts`

Do Not Regress checks:
- Official `@opencode-ai/plugin` types are the only plugin API source.
- Tests can still import `../src/index.ts` under Bun.

Expected completion label: `VERIFIED` only if typecheck and source tests pass.

### Task 1.3: Declaration Build Config
**File:** `tsconfig.build.json`  
**Test:** `tests/package.test.ts`  
**Depends:** none

Add declaration-only build configuration for package publishing.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["dist", "tests"]
}
```

Active Constraints / Do Not Regress:
- Emit declarations into `dist/` only.
- Do not include tests in published declarations.

Required verification evidence:
- `bun run build`
- verify `dist/index.d.ts` exists after build.

Do Not Regress checks:
- `tsconfig.build.json` extends the main config.
- `rootDir` remains `./src`.

Expected completion label: `VERIFIED` only if build emits declarations.

### Task 1.4: Remove Stale Plugin Type Shim
**File:** `src/types.d.ts`  
**Test:** `tests/index.test.ts`  
**Depends:** none

Delete this file entirely.

```text
DELETE src/types.d.ts
```

Active Constraints / Do Not Regress:
- No local declaration merge for `@opencode-ai/plugin` may remain.
- No stale `retry` type may remain anywhere.

Required verification evidence:
- `bun run typecheck`
- `grep`/editor search evidence that `types.d.ts` and `input.retry` are absent.

Do Not Regress checks:
- `src/index.ts` must not contain `/// <reference types="./types.d.ts" />`.

Expected completion label: `VERIFIED` only if official plugin types compile without this shim.

### Task 1.5: Dependency Lockfile Refresh
**File:** `bun.lock`  
**Test:** `tests/package.test.ts`  
**Depends:** Task 1.1

Regenerate the lockfile from the updated package metadata.

```bash
bun install
```

Active Constraints / Do Not Regress:
- Lock `@opencode-ai/plugin` to a `1.14.x` compatible resolution from `^1.14.20`.
- Keep Bun as the only package manager workflow.

Required verification evidence:
- `bun install`
- `bun test tests/package.test.ts`

Do Not Regress checks:
- `bun.lock` no longer resolves `@opencode-ai/plugin` `1.3.3`.
- Do not introduce npm/yarn/pnpm lockfiles.

Expected completion label: `VERIFIED` only if lockfile matches package baseline.

## Batch 1 Milestone Gate
Run before Batch 2:

```bash
bun install && bun run typecheck
```

Required evidence:
- `src/types.d.ts` deleted.
- `@opencode-ai/plugin` `^1.14.20` in `package.json`.
- `bun.lock` refreshed.
- If `typecheck` fails because the source still uses old API shapes, proceed to Task 2.1 immediately; do not reintroduce the shim.

## Parallel Batch 2: Runtime Implementation and Package Metadata Test

### Task 2.1: Official Hook Runtime Implementation
**File:** `src/index.ts`  
**Test:** `tests/index.test.ts`  
**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5

Replace the implementation with official `tool.execute.after` handling, structured refresh command config, and single-refresh coalescing.

```typescript
import type { Plugin, PluginOptions } from "@opencode-ai/plugin"

export interface StructuredSsoLoginCommand {
  command: string
  args?: string[]
}

export interface AwsAuthRefreshConfig {
  profile?: string
  maxRetries?: number
  ssoLoginCommand?: StructuredSsoLoginCommand
}

export const AWS_AUTH_ERROR_PATTERNS = [
  "ExpiredToken",
  "TokenRefreshRequired",
  "The security token included in the request is expired",
  "credentials expired",
  "Unable to locate credentials",
  "Missing credentials",
  "credentials could not be found",
  "Error retrieving credentials",
  "EC2MetadataServiceError",
  "RequestId:",
]

const monitoredTools = new Set(["bash", "task"])

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output
  if (output === undefined) return ""
  try {
    return JSON.stringify(output) ?? ""
  } catch {
    return String(output)
  }
}

export function hasAwsAuthError(output: unknown): boolean {
  const outputStr = stringifyOutput(output).toLowerCase()
  return AWS_AUTH_ERROR_PATTERNS.some((pattern) => outputStr.includes(pattern.toLowerCase()))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const args = value.filter((item): item is string => typeof item === "string")
  return args.length === value.length ? args : undefined
}

function parseConfig(options: PluginOptions | undefined): AwsAuthRefreshConfig {
  if (!isRecord(options)) return {}
  const commandValue = options.ssoLoginCommand
  const ssoLoginCommand = isRecord(commandValue) && typeof commandValue.command === "string"
    ? { command: commandValue.command, args: toStringArray(commandValue.args) ?? [] }
    : undefined

  return {
    profile: typeof options.profile === "string" ? options.profile : undefined,
    maxRetries: typeof options.maxRetries === "number" ? options.maxRetries : undefined,
    ssoLoginCommand,
  }
}

export const AwsAuthRefreshPlugin: Plugin = async (ctx, options) => {
  const { client, $ } = ctx
  const config = parseConfig(options)
  const profile = config.profile ?? process.env.AWS_PROFILE ?? "default"
  const maxRetries = config.maxRetries ?? 1
  const refreshCommand = config.ssoLoginCommand ?? {
    command: "aws",
    args: ["sso", "login", "--profile", profile],
  }

  let refreshInProgress = false
  let refreshPromise: Promise<void> | null = null
  let refreshAttempts = 0

  async function log(level: "info" | "warn" | "error", message: string): Promise<void> {
    await client.app.log({
      body: {
        service: "aws-auth-refresh",
        level,
        message,
      },
    })
  }

  async function refreshAwsCredentials(): Promise<void> {
    if (refreshInProgress && refreshPromise) {
      await refreshPromise
      return
    }

    if (refreshAttempts >= maxRetries) {
      await log("warn", `Max refresh attempts (${maxRetries}) reached for AWS auth refresh`)
      return
    }

    refreshAttempts += 1
    refreshInProgress = true
    refreshPromise = (async () => {
      try {
        const args = refreshCommand.args ?? []
        await log("info", `AWS credentials expired, running: ${refreshCommand.command} ${args.join(" ")}`.trim())
        await $`${refreshCommand.command} ${args}`.quiet()
        await log("info", "AWS credentials refreshed successfully")
      } catch (error) {
        await log("error", `Failed to refresh AWS credentials: ${error}`)
        throw error
      } finally {
        refreshInProgress = false
        refreshPromise = null
      }
    })()

    await refreshPromise
  }

  return {
    "tool.execute.after": async (input, output) => {
      if (!monitoredTools.has(input.tool)) return
      if (!hasAwsAuthError(output.output)) return

      try {
        await refreshAwsCredentials()
      } catch (error) {
        await log("error", `Failed to handle AWS auth error: ${error}`)
      }
    },
  }
}

export default AwsAuthRefreshPlugin
```

Active Constraints / Do Not Regress:
- Keep `AWS_AUTH_ERROR_PATTERNS` centralized in `src/index.ts`.
- Keep `refreshInProgress` plus shared promise single-refresh behavior.
- Monitor only `bash` and `task`.
- Use official `tool.execute.after(input, output)` and inspect `output.output` only.
- Preserve profile fallback: config `profile`, then `AWS_PROFILE`, then `default`.
- Preserve `maxRetries` as refresh-attempt limiting.
- Do not use `input.retry`, `tool.execute.before`, raw shell strings, invented session UI, or local shims.

Required verification evidence:
- `bun run typecheck`
- `bun test tests/index.test.ts`

Do Not Regress checks:
- Actual hook test passes with `{ tool, sessionID, callID, args }` and `{ title, output, metadata }`.
- Concurrent AWS auth detections invoke one refresh command.
- non-`bash`/`task` tools no-op.
- non-AWS output no-ops.
- Failed refresh logs an error and does not throw out of the hook.

Expected completion label: `VERIFIED` only if typecheck and runtime tests pass.

### Task 2.2: Package Metadata Tests
**File:** `tests/package.test.ts`  
**Test:** `tests/package.test.ts`  
**Depends:** Task 1.1, Task 1.3

Add package contract tests for the ADR-approved npm/plugin metadata.

```typescript
import { describe, expect, test } from "bun:test"
import packageJson from "../package.json" with { type: "json" }

describe("package metadata", () => {
  test("publishes compiled server plugin output", () => {
    expect(packageJson.main).toBe("dist/index.js")
    expect(packageJson.module).toBe("dist/index.js")
    expect(packageJson.types).toBe("dist/index.d.ts")
    expect(packageJson.files).toEqual(["dist/"])
    expect(packageJson["oc-plugin"]).toEqual(["server"])
  })

  test("exports default runtime and declaration files", () => {
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    })
    expect(packageJson.exports["./server"]).toEqual({
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    })
  })

  test("uses current opencode plugin baseline and build scripts", () => {
    expect(packageJson.dependencies["@opencode-ai/plugin"]).toBe("^1.14.20")
    expect(packageJson.scripts.build).toBe("bun build src/index.ts --outdir=./dist --target=node && tsc -p tsconfig.build.json")
    expect(packageJson.scripts.prepack).toBe("bun run build")
    expect(packageJson.scripts.test).toBe("bun test")
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit")
  })
})
```

Active Constraints / Do Not Regress:
- Lock metadata tests to accepted ADR values.
- Do not test implementation behavior in this file.

Required verification evidence:
- `bun test tests/package.test.ts`

Do Not Regress checks:
- Test fails if package falls back to `src/index.ts` publishing.
- Test fails if `oc-plugin` is removed.

Expected completion label: `VERIFIED` only if metadata tests pass.

## Parallel Batch 3: Runtime Test Coverage

### Task 3.1: Hook and Refresh Behavior Tests
**File:** `tests/index.test.ts`  
**Test:** `tests/index.test.ts`  
**Depends:** Task 2.1

Replace the existing tests with coverage for official hook shape, structured command execution, removed retry behavior, and regression cases.

```typescript
import { beforeEach, describe, expect, mock, test } from "bun:test"
import { AwsAuthRefreshPlugin, hasAwsAuthError } from "../src/index.ts"

type ShellCall = {
  strings: string[]
  values: unknown[]
}

const originalAwsProfile = process.env.AWS_PROFILE

function createShell() {
  const calls: ShellCall[] = []
  let release: (() => void) | undefined
  let rejectNext: unknown

  const shell = mock((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ strings: [...strings], values })
    const promise = rejectNext
      ? Promise.reject(rejectNext)
      : release
        ? new Promise<void>((resolve) => {
            const previousRelease = release
            release = () => {
              previousRelease?.()
              resolve()
            }
          })
        : Promise.resolve()

    return Object.assign(promise, {
      quiet: () => promise,
    })
  })

  return {
    shell,
    calls,
    blockNext() {
      release = () => {}
    },
    release() {
      release?.()
      release = undefined
    },
    rejectNext(error: unknown) {
      rejectNext = error
    },
  }
}

function createContext(options?: Record<string, unknown>) {
  const log = mock(async () => {})
  const shell = createShell()

  return {
    ctx: {
      client: {
        app: {
          log,
        },
      },
      $: shell.shell,
    },
    log,
    shell,
    options,
  }
}

function toolInput(tool = "bash") {
  return {
    tool,
    sessionID: "session-1",
    callID: "call-1",
    args: {},
  }
}

function toolOutput(output: string) {
  return {
    title: "AWS command",
    output,
    metadata: {},
  }
}

describe("hasAwsAuthError", () => {
  test("returns true for centralized AWS auth patterns", () => {
    expect(hasAwsAuthError("Error: ExpiredToken")).toBe(true)
    expect(hasAwsAuthError("TokenRefreshRequired: token has expired")).toBe(true)
    expect(hasAwsAuthError("The security token included in the request is expired")).toBe(true)
    expect(hasAwsAuthError("Your credentials expired")).toBe(true)
    expect(hasAwsAuthError("Unable to locate credentials")).toBe(true)
    expect(hasAwsAuthError("Missing credentials in config")).toBe(true)
    expect(hasAwsAuthError("credentials could not be found")).toBe(true)
    expect(hasAwsAuthError("Error retrieving credentials from container")).toBe(true)
    expect(hasAwsAuthError("EC2MetadataServiceError: timeout")).toBe(true)
    expect(hasAwsAuthError("RequestId: 1234-5678-90ab-cdef")).toBe(true)
  })

  test("returns false for non-auth and empty output", () => {
    expect(hasAwsAuthError("Connection refused")).toBe(false)
    expect(hasAwsAuthError("")).toBe(false)
    expect(hasAwsAuthError(undefined)).toBe(false)
  })

  test("is case-insensitive and supports object output", () => {
    expect(hasAwsAuthError("UNABLE TO LOCATE CREDENTIALS")).toBe(true)
    expect(hasAwsAuthError({ error: "ExpiredToken: token expired" })).toBe(true)
    expect(hasAwsAuthError({ message: "Success" })).toBe(false)
  })
})

describe("AwsAuthRefreshPlugin", () => {
  beforeEach(() => {
    process.env.AWS_PROFILE = originalAwsProfile
  })

  test("exports plugin function and default export", async () => {
    const exports = await import("../src/index.ts")
    expect(typeof exports.AwsAuthRefreshPlugin).toBe("function")
    expect(exports.default).toBe(exports.AwsAuthRefreshPlugin)
  })

  test("returns only official after hook", async () => {
    const { ctx } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    expect(typeof hooks).toBe("object")
    expect(typeof hooks["tool.execute.after"]).toBe("function")
    expect("tool.execute.before" in hooks).toBe(false)
  })

  test("uses official output.output shape and default profile", async () => {
    process.env.AWS_PROFILE = "env-profile"
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))

    expect(shell.calls).toHaveLength(1)
    expect(shell.calls[0]?.values).toEqual(["aws", ["sso", "login", "--profile", "env-profile"]])
  })

  test("uses configured profile before AWS_PROFILE", async () => {
    process.env.AWS_PROFILE = "env-profile"
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, { profile: "config-profile" })

    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))

    expect(shell.calls[0]?.values).toEqual(["aws", ["sso", "login", "--profile", "config-profile"]])
  })

  test("falls back to default profile", async () => {
    delete process.env.AWS_PROFILE
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))

    expect(shell.calls[0]?.values).toEqual(["aws", ["sso", "login", "--profile", "default"]])
  })

  test("uses structured custom SSO command and args", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {
      ssoLoginCommand: {
        command: "aws-vault",
        args: ["exec", "dev", "--", "aws", "sso", "login"],
      },
    })

    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))

    expect(shell.calls[0]?.values).toEqual(["aws-vault", ["exec", "dev", "--", "aws", "sso", "login"]])
  })

  test("does not support autoRetry or call retry functions", async () => {
    const retry = mock(async () => {})
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, { autoRetry: true })

    await hooks["tool.execute.after"]?.({ ...toolInput(), retry } as never, toolOutput("ExpiredToken"))

    expect(shell.calls).toHaveLength(1)
    expect(retry).not.toHaveBeenCalled()
  })

  test("coalesces concurrent refresh requests", async () => {
    const { ctx, shell } = createContext()
    shell.blockNext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    const first = hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))
    const second = hooks["tool.execute.after"]?.(toolInput(), toolOutput("Unable to locate credentials"))

    await Promise.resolve()
    expect(shell.calls).toHaveLength(1)
    shell.release()
    await Promise.all([first, second])
    expect(shell.calls).toHaveLength(1)
  })

  test("ignores non-monitored tools", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks["tool.execute.after"]?.(toolInput("webfetch"), toolOutput("ExpiredToken"))

    expect(shell.calls).toHaveLength(0)
  })

  test("ignores non-AWS output", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("command completed successfully"))

    expect(shell.calls).toHaveLength(0)
  })

  test("limits refresh attempts with maxRetries", async () => {
    const { ctx, shell, log } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, { maxRetries: 1 })

    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))
    await hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))

    expect(shell.calls).toHaveLength(1)
    expect(log).toHaveBeenCalledWith({
      body: {
        service: "aws-auth-refresh",
        level: "warn",
        message: "Max refresh attempts (1) reached for AWS auth refresh",
      },
    })
  })

  test("logs refresh failures without throwing from hook", async () => {
    const { ctx, shell, log } = createContext()
    shell.rejectNext(new Error("login failed"))
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await expect(hooks["tool.execute.after"]?.(toolInput(), toolOutput("ExpiredToken"))).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "aws-auth-refresh",
        level: "error",
        message: "Failed to refresh AWS credentials: Error: login failed",
      },
    })
  })
})
```

Active Constraints / Do Not Regress:
- Tests must exercise the real hook output shape: `output.output`.
- Tests must prove `autoRetry` is not honored and no `input.retry` call occurs.
- Tests must prove structured custom command args are passed as data values.
- Tests must prove `refreshInProgress` concurrency behavior.

Required verification evidence:
- `bun test tests/index.test.ts`
- `bun run typecheck`

Do Not Regress checks:
- non-`bash`/`task` no-op.
- non-AWS output no-op.
- package does not expose before-hook retry state.

Expected completion label: `VERIFIED` only if tests and typecheck pass.

## Parallel Batch 4: Documentation Migration Notes

### Task 4.1: README Migration and Configuration Documentation
**File:** `README.md`  
**Test:** `tests/package.test.ts`  
**Depends:** Task 1.1, Task 2.1

Update README configuration examples and behavior notes.

Required content changes:
- Replace tuple example removing `autoRetry`.
- Replace raw `ssoLoginCommand` string with structured command/args:

```json
{
  "plugin": [
    [
      "@devtheops/opencode-plugin-aws-auth-refresh",
      {
        "profile": "my-aws-profile",
        "maxRetries": 1,
        "ssoLoginCommand": {
          "command": "aws",
          "args": ["sso", "login", "--profile", "my-aws-profile", "--no-browser"]
        }
      }
    ]
  ]
}
```

- Change options table to only list `profile`, `maxRetries`, and structured `ssoLoginCommand`.
- State that `autoRetry` was removed because current OpenCode server plugin hooks expose no supported retry API.
- State users may need to rerun the failed command after credentials refresh.
- State diagnostics are logged with `client.app.log`; do not claim clickable/session-visible UI.
- Update How It Works to describe official `tool.execute.after` and `output.output`.
- Keep `.opencode/` ignored guidance if local install docs mention project config.

Active Constraints / Do Not Regress:
- Do not document raw shell-string command support.
- Do not document unsupported retry behavior.
- Do not invent TUI/clickable notifications.

Required verification evidence:
- `bun test tests/package.test.ts`
- Manual README review against ADR migration notes.

Do Not Regress checks:
- README contains no `autoRetry` configuration example except migration/removal note.
- README contains no raw `"ssoLoginCommand": "..."` example.

Expected completion label: `VERIFIED` only if docs match implemented API.

### Task 4.2: Contributing Build Commands
**File:** `CONTRIBUTING.md`  
**Test:** `tests/package.test.ts`  
**Depends:** Task 1.1, Task 1.3

Update development workflow commands to include build and test scripts.

Required content changes:
- Add `bun run build` to commands table.
- Keep `bun run typecheck` and `bun test`.
- Replace “There is no build step” style language with “TypeScript source is used during tests; packages publish compiled `dist/` output.”
- Note release validation requires `bun run build && bun run typecheck && bun test`.

Active Constraints / Do Not Regress:
- Keep Bun-only commands.
- Do not introduce Node/npm/npx workflows.

Required verification evidence:
- Manual docs review.
- `bun run build && bun run typecheck && bun test`

Do Not Regress checks:
- Contributor docs match package scripts.

Expected completion label: `VERIFIED` only if docs match scripts and verification passes.

## Batch 5: Integration Verification

### Task 5.1: Full Repository Verification
**File:** `docs/thoughts/plans/2026-05-21-modernize-opencode-plugin-packaging-and-api.md`  
**Test:** `tests/index.test.ts`, `tests/package.test.ts`  
**Depends:** Task 3.1, Task 4.1, Task 4.2

Run final checks and record evidence in the implementation handoff notes or PR description.

```bash
bun run build && bun run typecheck && bun test
```

Active Constraints / Do Not Regress:
- Do not commit generated `dist/` unless release policy explicitly requires it; `dist/` is currently ignored.
- Do not commit `.opencode/`.
- Do not add lint verification unless a lint script is intentionally introduced.

Required verification evidence:
- Output from `bun run build`.
- Output from `bun run typecheck`.
- Output from `bun test`.

Do Not Regress checks:
- No `src/types.d.ts`.
- No `input.retry`.
- No raw string `ssoLoginCommand` execution.
- Only `bash` and `task` monitored.
- `AWS_AUTH_ERROR_PATTERNS` remains in `src/index.ts`.

Expected completion label: `VERIFIED` only if all checks pass.

## Migration Notes
- User config using `autoRetry` must remove it; automatic retry is not supported by official `@opencode-ai/plugin@^1.14.20` hook types.
- User config using raw `ssoLoginCommand: "aws sso login ..."` must migrate to `ssoLoginCommand: { "command": "aws", "args": ["sso", "login", "--profile", "name"] }`.
- Users should expect refresh diagnostics through `client.app.log`; session-visible notifications are intentionally deferred.
- Users may need to rerun the failed AWS command manually after credentials refresh.
- npm package consumers should load the package normally; package exports now point to compiled `dist/` server plugin output.

## Acceptance Criteria
- `package.json` matches ADR-001 dist package model and `oc-plugin: ["server"]`.
- `@opencode-ai/plugin` is upgraded to `^1.14.20` in package and lockfile.
- `tsconfig.json` and `tsconfig.build.json` match the modern build/typecheck model.
- `src/types.d.ts` is deleted and source compiles against official plugin types.
- `src/index.ts` uses only official `tool.execute.after(input, output)` and reads `output.output`.
- `autoRetry`, `input.retry`, and `tool.execute.before` retry state are removed.
- custom SSO command configuration is structured command plus args, not a raw shell string.
- Existing required behavior is preserved: centralized AWS patterns, single refresh guard, bash/task only, profile fallback, max refresh attempt limiting, and `client.app.log` diagnostics.
- Tests cover hook output shape, structured command defaults/custom args, no `autoRetry`, concurrency, non-bash/task no-op, non-AWS no-op, failure logging, and package metadata.
- Final verification passes:

```bash
bun run build && bun run typecheck && bun test
```
