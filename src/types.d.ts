declare module "@opencode-ai/plugin" {
  export interface Plugin<TConfig = unknown> {
    (ctx: PluginContext, config?: TConfig): Promise<PluginHooks>
  }

  export interface PluginContext {
    project: {
      id: string
      name: string
      path: string
    }
    directory: string
    worktree?: string
    client: {
      app: {
        log: (params: { body: { service?: string; level: string; message: string; extra?: Record<string, unknown> } }) => Promise<void>
      }
    }
    $: ShellAPI
  }

  export interface ShellAPI {
    (strings: TemplateStringsArray, ...values: unknown[]): ShellPromise
  }

  export interface ShellPromise extends Promise<ShellResult> {
    quiet(): ShellPromise
    text(): Promise<string>
    json<T = unknown>(): Promise<T>
  }

  export interface ShellResult {
    stdout: string
    stderr: string
    exitCode: number
  }

  export interface PluginHooks {
    "tool.execute.before"?: (input: ToolInput, output: ToolOutput) => Promise<void>
    "tool.execute.after"?: (input: ToolInput, output: ToolOutput) => Promise<void>
    "shell.env"?: (input: ShellEnvInput, output: ShellEnvOutput) => Promise<void>
    "session.error"?: (input: SessionErrorInput, output: unknown) => Promise<void>
    "event"?: (params: { event: Event }) => Promise<void>
  }

  export interface ToolInput {
    tool: string
    retry?: () => Promise<unknown>
    [key: string]: unknown
  }

  export interface ToolOutput {
    args?: Record<string, unknown>
    result?: unknown
    error?: unknown
    _aws_retries?: number
    [key: string]: unknown
  }

  export interface ShellEnvInput {
    cwd: string
    env: Record<string, string>
  }

  export interface ShellEnvOutput {
    env: Record<string, string>
  }

  export interface SessionErrorInput {
    error: Error
    session: { id: string }
  }

  export type Event = 
    | { type: "session.idle"; [key: string]: unknown }
    | { type: "session.error"; [key: string]: unknown }
    | { type: string; [key: string]: unknown }

  export const tool: {
    schema: {
      string: () => import("zod").ZodString
      number: () => import("zod").ZodNumber
      boolean: () => import("zod").ZodBoolean
      object: <T extends Record<string, import("zod").ZodTypeAny>>(shape: T) => import("zod").ZodObject<T>
      array: <T extends import("zod").ZodTypeAny>(element: T) => import("zod").ZodArray<T>
    }
    <T extends Record<string, import("zod").ZodTypeAny>>(params: {
      description: string
      args: T
      execute: (args: import("zod").infer<T>, context: PluginContext) => Promise<string>
    }): ToolDefinition
  }

  export interface ToolDefinition {
    description: string
    args: unknown
    execute: (args: unknown, context: PluginContext) => Promise<unknown>
  }

  export default Plugin
}