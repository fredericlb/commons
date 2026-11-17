import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// route.ts is imported through packages that a browser also builds (lanes
// ships it via a workspace its frontend consumes). It must therefore stay free
// of runtime imports — a real `import` of express would drag a node server
// library into a bundle. The header comment asked for this; this asserts it.
const SRC = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

// The assertions below are about code, not prose — the header comment discusses
// the very things they forbid.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("@frediverse/http/route stays bundle-safe", () => {
  it("has no runtime imports", () => {
    const imports = CODE.match(/^import .*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0); // guard against a silent rename
    for (const line of imports) {
      expect(line, `${line} must be type-only`).toMatch(/^import type /);
    }
  });

  it("has no side-effect or dynamic imports", () => {
    expect(CODE).not.toMatch(/^import ["']/m);
    expect(CODE).not.toMatch(/\brequire\s*\(/);
    expect(CODE).not.toMatch(/\bimport\s*\(/);
  });

  it("does not reach for req.user — that lives in ./express", () => {
    // Keeps ./route importable by a backend that declares its own richer user
    // shape (z0, lanes) without a declaration-merging clash.
    expect(CODE).not.toContain("req.user");
  });
});
