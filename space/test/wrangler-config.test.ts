import { describe, expect, it } from "vitest"
import { parseWranglerConfig } from "../src/space/wrangler-config"

describe("parseWranglerConfig jsonc support", () => {
  it("parses wrangler.jsonc with a /** … */ block-comment header", () => {
    const content = `/**
 * Wrangler config for the Cloudflare Durable Object template
 * STRICTLY DO NOT MODIFY THIS FILE
 */
 {
   "$schema": "node_modules/wrangler/config-schema.json",
   "name": "booqable-app",
   "main": "worker/index.ts",
   // a trailing line comment
   "compatibility_date": "2025-04-24"
 }`
    const cfg = parseWranglerConfig({ "wrangler.jsonc": content })
    expect(cfg.main).toBe("worker/index.ts")
    expect(cfg.compatibilityDate).toBe("2025-04-24")
  })

  it("still parses plain wrangler.json", () => {
    const cfg = parseWranglerConfig({ "wrangler.json": '{ "main": "index.js" }' })
    expect(cfg.main).toBe("index.js")
  })
})
