import { beforeEach, describe, expect, mock, test } from "bun:test"
import { AwsAuthRefreshPlugin, hasAwsAuthError, isAwsProviderAuthError } from "../src/index.ts"

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

function createContext() {
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
  }
}

function providerAuthErrorEvent(message = "AWS credential provider failed", providerID = "amazon-bedrock") {
  return {
    event: {
      type: "session.error" as const,
      properties: {
        sessionID: "session-1",
        error: {
          name: "ProviderAuthError",
          data: { providerID, message },
        },
      },
    },
  }
}

function unknownErrorEvent(message: string) {
  return {
    event: {
      type: "session.error" as const,
      properties: {
        sessionID: "session-1",
        error: {
          name: "UnknownError",
          data: { message },
        },
      },
    },
  }
}

function otherEvent(type: string) {
  return {
    event: {
      type,
      properties: {},
    },
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
    expect(hasAwsAuthError("The SSO session associated with this profile has expired")).toBe(true)
    expect(hasAwsAuthError("AWS credential provider failed")).toBe(true)
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

describe("isAwsProviderAuthError", () => {
  test("matches ProviderAuthError from AWS providers with auth patterns", () => {
    expect(isAwsProviderAuthError({ name: "ProviderAuthError", data: { providerID: "amazon-bedrock", message: "The SSO session associated with this profile has expired" } })).toBe(true)
    expect(isAwsProviderAuthError({ name: "ProviderAuthError", data: { providerID: "bedrock", message: "AWS credential provider failed" } })).toBe(true)
  })

  test("ignores AWS ProviderAuthError without auth patterns", () => {
    expect(isAwsProviderAuthError({ name: "ProviderAuthError", data: { providerID: "amazon-bedrock", message: "access denied to model" } })).toBe(false)
  })

  test("ignores ProviderAuthError from non-AWS providers", () => {
    expect(isAwsProviderAuthError({ name: "ProviderAuthError", data: { providerID: "anthropic", message: "ExpiredToken" } })).toBe(false)
  })

  test("falls back to string matching for UnknownError", () => {
    expect(isAwsProviderAuthError({ name: "UnknownError", data: { message: "The SSO session associated with this profile has expired" } })).toBe(true)
    expect(isAwsProviderAuthError({ name: "UnknownError", data: { message: "rate limit exceeded" } })).toBe(false)
  })

  test("ignores other error types and non-objects", () => {
    expect(isAwsProviderAuthError({ name: "APIError", data: { message: "ExpiredToken" } })).toBe(false)
    expect(isAwsProviderAuthError(undefined)).toBe(false)
    expect(isAwsProviderAuthError("ExpiredToken")).toBe(false)
  })
})

describe("AwsAuthRefreshPlugin", () => {
  beforeEach(() => {
    if (originalAwsProfile === undefined) delete process.env.AWS_PROFILE
    else process.env.AWS_PROFILE = originalAwsProfile
  })

  test("exports plugin function and default export", async () => {
    const exports = await import("../src/index.ts")
    expect(typeof exports.AwsAuthRefreshPlugin).toBe("function")
    expect(exports.default).toBe(exports.AwsAuthRefreshPlugin)
  })

  test("returns only the session error event hook", async () => {
    const { ctx } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    expect(typeof hooks).toBe("object")
    expect(typeof hooks.event).toBe("function")
    expect("tool.execute.after" in hooks).toBe(false)
    expect("tool.execute.before" in hooks).toBe(false)
  })

  test("uses official error shape and default profile", async () => {
    process.env.AWS_PROFILE = "env-profile"
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks.event?.(providerAuthErrorEvent() as never)

    expect(shell.calls).toHaveLength(1)
    expect(shell.calls[0]?.values).toEqual(["aws", ["sso", "login", "--profile", "env-profile"]])
  })

  test("uses configured profile before AWS_PROFILE", async () => {
    process.env.AWS_PROFILE = "env-profile"
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, { profile: "config-profile" })

    await hooks.event?.(providerAuthErrorEvent() as never)

    expect(shell.calls[0]?.values).toEqual(["aws", ["sso", "login", "--profile", "config-profile"]])
  })

  test("falls back to default profile", async () => {
    delete process.env.AWS_PROFILE
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks.event?.(providerAuthErrorEvent() as never)

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

    await hooks.event?.(providerAuthErrorEvent() as never)

    expect(shell.calls[0]?.values).toEqual(["aws-vault", ["exec", "dev", "--", "aws", "sso", "login"]])
  })

  test("does not support autoRetry or call retry functions", async () => {
    const retry = mock(async () => {})
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, { autoRetry: true })

    await hooks.event?.({ ...providerAuthErrorEvent(), retry } as never)

    expect(shell.calls).toHaveLength(1)
    expect(retry).not.toHaveBeenCalled()
  })

  test("coalesces concurrent refresh requests", async () => {
    const { ctx, shell } = createContext()
    shell.blockNext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    const first = hooks.event?.(providerAuthErrorEvent() as never)
    const second = hooks.event?.(providerAuthErrorEvent() as never)

    await Promise.resolve()
    await Promise.resolve()
    expect(shell.calls).toHaveLength(1)
    shell.release()
    await Promise.all([first, second])
    expect(shell.calls).toHaveLength(1)
  })

  test("ignores non session.error events", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks.event?.(otherEvent("session.idle") as never)

    expect(shell.calls).toHaveLength(0)
  })

  test("ignores provider auth errors from non-AWS providers", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks.event?.(providerAuthErrorEvent("auth failed", "anthropic") as never)

    expect(shell.calls).toHaveLength(0)
  })

  test("ignores unknown errors without AWS auth patterns", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks.event?.(unknownErrorEvent("rate limit exceeded") as never)

    expect(shell.calls).toHaveLength(0)
  })

  test("refreshes on AWS auth patterns in unknown errors", async () => {
    const { ctx, shell } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, {})

    await hooks.event?.(unknownErrorEvent("The SSO session associated with this profile has expired") as never)

    expect(shell.calls).toHaveLength(1)
  })

  test("limits refresh attempts with maxRetries", async () => {
    const { ctx, shell, log } = createContext()
    const hooks = await AwsAuthRefreshPlugin(ctx as never, { maxRetries: 1 })

    await hooks.event?.(providerAuthErrorEvent() as never)
    await hooks.event?.(providerAuthErrorEvent() as never)

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

    await expect(hooks.event?.(providerAuthErrorEvent() as never)).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "aws-auth-refresh",
        level: "error",
        message: "Failed to refresh AWS credentials: Error: login failed",
      },
    })
  })
})
