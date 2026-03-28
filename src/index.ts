// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/// <reference types="./types.d.ts" />
import type { Plugin } from "@opencode-ai/plugin"

export interface AwsAuthRefreshConfig {
  profile?: string
  autoRetry?: boolean
  maxRetries?: number
  ssoLoginCommand?: string
}

const AWS_AUTH_ERROR_PATTERNS = [
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

export function hasAwsAuthError(output: unknown): boolean {
  const outputStr = typeof output === "string" 
    ? output.toLowerCase() 
    : JSON.stringify(output).toLowerCase()
  
  return AWS_AUTH_ERROR_PATTERNS.some(pattern => 
    outputStr.includes(pattern.toLowerCase())
  )
}

export const AwsAuthRefreshPlugin: Plugin<AwsAuthRefreshConfig> = async (ctx, config = {}) => {
  const { client, $ } = ctx
  const {
    profile = process.env.AWS_PROFILE || "default",
    autoRetry = true,
    maxRetries = 1,
    ssoLoginCommand,
  } = config

  let refreshInProgress = false
  let refreshPromise: Promise<void> | null = null

  async function refreshAwsCredentials(): Promise<boolean> {
    if (refreshInProgress && refreshPromise) {
      await refreshPromise
      return true
    }

    refreshInProgress = true
    refreshPromise = (async () => {
      try {
        const loginCmd = ssoLoginCommand || `aws sso login --profile ${profile}`
        await client.app.log({
          body: {
            service: "aws-auth-refresh",
            level: "info",
            message: `AWS credentials expired, running: ${loginCmd}`,
          },
        })

        await $`${loginCmd}`.quiet()
        
        await client.app.log({
          body: {
            service: "aws-auth-refresh",
            level: "info",
            message: "AWS credentials refreshed successfully",
          },
        })
      } catch (error) {
        await client.app.log({
          body: {
            service: "aws-auth-refresh",
            level: "error",
            message: `Failed to refresh AWS credentials: ${error}`,
          },
        })
        throw error
      } finally {
        refreshInProgress = false
        refreshPromise = null
      }
    })()

    await refreshPromise
    return true
  }

  return {
    "tool.execute.before": async (input, output) => {
      const toolName = input.tool
      
      if (!["bash", "task"].includes(toolName)) {
        return
      }

      output._aws_retries = output._aws_retries || 0
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool
      
      if (!["bash", "task"].includes(toolName)) {
        return
      }

      if (!hasAwsAuthError(output)) {
        return
      }

      const retries = output._aws_retries || 0
      
      if (retries >= maxRetries) {
        await client.app.log({
          body: {
            service: "aws-auth-refresh",
            level: "warn",
            message: `Max retries (${maxRetries}) reached for AWS auth refresh`,
          },
        })
        return
      }

      try {
        const refreshed = await refreshAwsCredentials()
        
        if (refreshed && autoRetry && input.retry) {
          output._aws_retries = retries + 1
          await client.app.log({
            body: {
              service: "aws-auth-refresh",
              level: "info",
              message: "Retrying tool after credential refresh",
            },
          })
          await input.retry()
        }
      } catch (error) {
        await client.app.log({
          body: {
            service: "aws-auth-refresh",
            level: "error",
            message: `Failed to handle AWS auth error: ${error}`,
          },
        })
      }
    },
  }
}

export default AwsAuthRefreshPlugin