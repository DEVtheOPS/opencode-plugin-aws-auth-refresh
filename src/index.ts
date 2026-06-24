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
