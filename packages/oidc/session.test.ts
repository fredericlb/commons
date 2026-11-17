import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionRevocations } from "./session.ts";

// A pass-through spy, so a test can count how often the revocations really read their file.
vi.mock("node:fs", async (actual) => {
  const fs = await actual<typeof import("node:fs")>();
  return { ...fs, readFileSync: vi.fn(fs.readFileSync) };
});

describe("session revocations shared by two processes", () => {
  let dir: string;
  let file: string;
  const reads = () =>
    vi.mocked(readFileSync).mock.calls.filter(([f]) => f === file).length;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "revocations-"));
    file = join(dir, "revocations.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("sees in one an epoch the other set after both started", () => {
    const a = createSessionRevocations({ file });
    const b = createSessionRevocations({ file });
    expect(a.notBefore("ada")).toBeUndefined();
    b.revoke("ada", 1000);
    expect(a.notBefore("ada")).toBe(1000);
  });

  it("merges both sides' epochs, keeping the later one per subject", () => {
    const a = createSessionRevocations({ file });
    const b = createSessionRevocations({ file });
    a.revoke("ada", 2000);
    b.revoke("bob", 500);
    b.revoke("ada", 1500);
    a.revoke("cy", 700);
    const fresh = createSessionRevocations({ file });
    expect(fresh.notBefore("ada")).toBe(2000);
    expect(fresh.notBefore("bob")).toBe(500);
    expect(fresh.notBefore("cy")).toBe(700);
    expect(b.notBefore("cy")).toBe(700);
  });

  it("reads the file only when it changed", () => {
    const a = createSessionRevocations({ file });
    const b = createSessionRevocations({ file });
    a.revoke("ada", 1000);
    expect(b.notBefore("ada")).toBe(1000);
    const before = reads();
    for (let i = 0; i < 50; i++) expect(b.notBefore("ada")).toBe(1000);
    expect(reads()).toBe(before);
  });

  it("stays in memory without a file", () => {
    const a = createSessionRevocations();
    a.revoke("ada", 1000);
    a.revoke("ada", 10);
    expect(a.notBefore("ada")).toBe(1000);
    expect(createSessionRevocations().notBefore("ada")).toBeUndefined();
  });
});
