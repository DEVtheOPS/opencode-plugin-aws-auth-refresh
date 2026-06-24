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
