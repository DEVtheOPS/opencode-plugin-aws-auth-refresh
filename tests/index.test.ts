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
    if (originalAwsProfile === undefined) delete process.env.AWS_PROFILE
    else process.env.AWS_PROFILE = originalAwsProfile
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
