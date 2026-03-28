import { describe, test, expect, mock, beforeEach } from "bun:test"
import { hasAwsAuthError } from "../src/index.ts"

describe("hasAwsAuthError", () => {
  describe("string input", () => {
    test("returns true for ExpiredToken", () => {
      expect(hasAwsAuthError("Error: ExpiredToken")).toBe(true)
    })

    test("returns true for TokenRefreshRequired", () => {
      expect(hasAwsAuthError("TokenRefreshRequired: token has expired")).toBe(true)
    })

    test("returns true for expired security token message", () => {
      expect(hasAwsAuthError("The security token included in the request is expired")).toBe(true)
    })

    test("returns true for credentials expired", () => {
      expect(hasAwsAuthError("Your credentials expired")).toBe(true)
    })

    test("returns true for Unable to locate credentials", () => {
      expect(hasAwsAuthError("Unable to locate credentials")).toBe(true)
    })

    test("returns true for Missing credentials", () => {
      expect(hasAwsAuthError("Missing credentials in config")).toBe(true)
    })

    test("returns true for credentials could not be found", () => {
      expect(hasAwsAuthError("credentials could not be found")).toBe(true)
    })

    test("returns true for Error retrieving credentials", () => {
      expect(hasAwsAuthError("Error retrieving credentials from container")).toBe(true)
    })

    test("returns true for EC2MetadataServiceError", () => {
      expect(hasAwsAuthError("EC2MetadataServiceError: timeout")).toBe(true)
    })

    test("returns true for RequestId pattern", () => {
      expect(hasAwsAuthError("RequestId: 1234-5678-90ab-cdef")).toBe(true)
    })

    test("returns false for non-auth errors", () => {
      expect(hasAwsAuthError("Connection refused")).toBe(false)
    })

    test("returns false for empty string", () => {
      expect(hasAwsAuthError("")).toBe(false)
    })

    test("is case-insensitive", () => {
      expect(hasAwsAuthError("EXPIREDtoken")).toBe(true)
      expect(hasAwsAuthError("UNABLE TO LOCATE CREDENTIALS")).toBe(true)
    })
  })

  describe("object input", () => {
    test("returns true when error property contains auth error", () => {
      expect(hasAwsAuthError({ error: "ExpiredToken: token expired" })).toBe(true)
    })

    test("returns true when message property contains auth error", () => {
      expect(hasAwsAuthError({ message: "Unable to locate credentials" })).toBe(true)
    })

    test("returns true when nested object contains auth error", () => {
      expect(hasAwsAuthError({ result: { error: { message: "credentials expired" } } })).toBe(true)
    })

    test("returns false for object without auth errors", () => {
      expect(hasAwsAuthError({ message: "Success" })).toBe(false)
    })

    test("returns false for empty object", () => {
      expect(hasAwsAuthError({})).toBe(false)
    })
  })

  describe("array input", () => {
    test("returns true when array contains auth error", () => {
      expect(hasAwsAuthError(["success", "ExpiredToken", "other"])).toBe(true)
    })

    test("returns false when array has no auth errors", () => {
      expect(hasAwsAuthError(["success", "complete", "done"])).toBe(false)
    })
  })
})

describe("AwsAuthRefreshPlugin", () => {
  const mockLog = mock(async () => {})
  const mockShellResults: Array<{ stdout: string; stderr: string; exitCode: number }> = []
  
  const createMockShell = () => {
    const mockFn = mock(() => {
      const result = mockShellResults.shift() || { stdout: "", stderr: "", exitCode: 0 }
      const promise = Promise.resolve(result)
      ;(promise as any).quiet = () => promise
      ;(promise as any).text = () => Promise.resolve(result.stdout)
      ;(promise as any).json = <T>() => Promise.resolve<T>(JSON.parse(result.stdout) as T)
      return promise
    })
    return mockFn as any
  }

  const createMockContext = (config: { profile?: string; autoRetry?: boolean; maxRetries?: number; ssoLoginCommand?: string } = {}) => {
    const $ = createMockShell()
    return {
      ctx: {
        project: { id: "test-project", name: "Test Project", path: "/test" },
        directory: "/test",
        client: {
          app: {
            log: mockLog,
          },
        },
        $,
        config,
      },
      $,
    }
  }

  beforeEach(() => {
    mockLog.mockClear()
    mockShellResults.length = 0
  })

  test("exports plugin function", async () => {
    const { AwsAuthRefreshPlugin } = await import("../src/index.ts")
    expect(typeof AwsAuthRefreshPlugin).toBe("function")
  })

  test("plugin returns hooks object", async () => {
    const { AwsAuthRefreshPlugin } = await import("../src/index.ts")
    const { ctx } = createMockContext()
    
    const hooks = await AwsAuthRefreshPlugin(ctx)
    
    expect(typeof hooks).toBe("object")
    expect(typeof hooks["tool.execute.before"]).toBe("function")
    expect(typeof hooks["tool.execute.after"]).toBe("function")
  })

  test("default export is the plugin", async () => {
    const exports = await import("../src/index.ts")
    expect(exports.default).toBe(exports.AwsAuthRefreshPlugin)
  })
})