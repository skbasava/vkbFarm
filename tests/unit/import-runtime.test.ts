import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("import runtime metadata", () => {
  it("enforces the Node version required by the direct Miniflare adapter", async () => {
    const packageJson = JSON.parse(await fs.readFile(path.resolve("package.json"), "utf8")) as { engines?: { node?: string } };
    expect(packageJson.engines?.node).toBe(">=22.12.0");
  });
});
