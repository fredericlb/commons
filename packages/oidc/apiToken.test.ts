import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApiTokens,
  fileTokenStore,
  memoryTokenStore,
} from "./apiToken.ts";

// A pass-through spy, so a test can count how often the store really reads its file.
vi.mock("node:fs", async (actual) => {
  const fs = await actual<typeof import("node:fs")>();
  return { ...fs, readFileSync: vi.fn(fs.readFileSync) };
});

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const signed = (secret: string, body: unknown) => {
  const payload = b64(JSON.stringify(body));
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

describe("createApiTokens", () => {
  const { issue, verify } = createApiTokens("s3cret");

  it("round-trips the subject", () => {
    expect(verify(issue("user-1"))).toBe("user-1");
  });

  it("rejects a token signed with another secret", () => {
    const other = createApiTokens("different");
    expect(verify(other.issue("user-1"))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [, sig] = issue("user-1").split(".");
    const forged = b64(
      JSON.stringify({ v: 2, jti: "x", sub: "admin", iat: 0, exp: 9e15 }),
    );
    expect(verify(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "nodot", ".", "a.", ".b", "a.b.c"]) {
      expect(verify(bad)).toBeNull();
    }
  });

  it("rejects a token past its ttl", () => {
    const shortLived = createApiTokens("s3cret", { ttlMs: -1 });
    expect(shortLived.verify(shortLived.issue("user-1"))).toBeNull();
  });

  it("refuses a validly signed token of the old {sub,iat} format", () => {
    const old = signed("s3cret", { sub: "user-1", iat: Date.now() });
    expect(verify(old)).toBeNull();
  });

  it("keeps working when destructured off the factory", () => {
    expect(typeof issue).toBe("function");
    expect(verify(issue("user-2"))).toBe("user-2");
  });
});

describe("with a store", () => {
  it("lists, revokes, and refuses a revoked token", () => {
    const t = createApiTokens("k", { store: memoryTokenStore() });
    const token = t.issue("ada", { label: "laptop" });
    expect(t.verify(token)).toBe("ada");
    const [listed] = t.list("ada");
    expect(listed.label).toBe("laptop");
    expect(listed.lastUsed).toBeTypeOf("number");
    expect(t.list("bob")).toEqual([]);
    expect(t.revoke("bob", listed.id)).toBe(false);
    expect(t.revoke("ada", listed.id)).toBe(true);
    expect(t.verify(token)).toBeNull();
  });

  it("refuses a signed token the store never listed", () => {
    const t = createApiTokens("k", { store: memoryTokenStore() });
    const stray = createApiTokens("k").issue("ada");
    expect(t.verify(stray)).toBeNull();
  });

  it("persists across a restart in a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "api-tokens-"));
    try {
      const file = join(dir, "tokens.json");
      const token = createApiTokens("k", { store: fileTokenStore(file) }).issue(
        "ada",
      );
      const again = createApiTokens("k", { store: fileTokenStore(file) });
      expect(again.verify(token)).toBe("ada");
      again.revoke("ada", again.list("ada")[0].id);
      expect(
        createApiTokens("k", { store: fileTokenStore(file) }).verify(token),
      ).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps an ephemeral token out of the store and dead with the process", () => {
    const store = memoryTokenStore();
    const t = createApiTokens("k", { store });
    const token = t.issue("service:x", { ephemeral: true });
    expect(t.verify(token)).toBe("service:x");
    expect(t.list("service:x")).toEqual([]);
    expect(createApiTokens("k", { store }).verify(token)).toBeNull();
  });
});

describe("two processes sharing one file", () => {
  let dir: string;
  let file: string;
  // Two stores on one file stand for two processes: neither shares memory with the other.
  const pair = () => {
    const a = fileTokenStore(file);
    const b = fileTokenStore(file);
    return {
      a,
      b,
      ta: createApiTokens("k", { store: a }),
      tb: createApiTokens("k", { store: b }),
    };
  };
  const reads = () =>
    vi.mocked(readFileSync).mock.calls.filter(([f]) => f === file).length;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "api-tokens-shared-"));
    file = join(dir, "tokens.json");
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it("verifies in one a token the other mints after both started", () => {
    const { ta, tb } = pair();
    expect(tb.list("ada")).toEqual([]);
    const token = ta.issue("ada", { label: "laptop" });
    expect(tb.verify(token)).toBe("ada");
    expect(tb.list("ada").map((r) => r.label)).toEqual(["laptop"]);
  });

  it("refuses in one a token the other revoked", () => {
    const { ta, tb } = pair();
    const token = ta.issue("ada");
    expect(ta.verify(token)).toBe("ada");
    expect(tb.revoke("ada", tb.list("ada")[0].id)).toBe(true);
    expect(ta.verify(token)).toBeNull();
    expect(ta.list("ada")).toEqual([]);
  });

  it("keeps the other's tokens when each mints one", () => {
    const { ta, tb } = pair();
    const one = ta.issue("ada");
    const two = tb.issue("ada");
    const three = ta.issue("ada");
    const fresh = createApiTokens("k", { store: fileTokenStore(file) });
    for (const t of [one, two, three]) expect(fresh.verify(t)).toBe("ada");
  });

  it("flushes last uses without resurrecting a revoked token or dropping a new one", () => {
    vi.useFakeTimers();
    const { ta, tb } = pair();
    const revoked = ta.issue("ada");
    const kept = ta.issue("ada");
    expect(ta.verify(revoked)).toBe("ada");
    expect(ta.verify(kept)).toBe("ada");
    const [gone, stays] = tb.list("ada");
    expect(tb.revoke("ada", gone.id)).toBe(true);
    const added = tb.issue("bob");
    vi.advanceTimersByTime(60_000);
    const fresh = createApiTokens("k", { store: fileTokenStore(file) });
    expect(fresh.verify(revoked)).toBeNull();
    expect(fresh.verify(added)).toBe("bob");
    expect(fileTokenStore(file).get(stays.id)?.lastUsed).toBeTypeOf("number");
    expect(fresh.verify(kept)).toBe("ada");
    expect(ta.verify(revoked)).toBeNull();
  });

  it("writes a last use only onto a record still in the file", () => {
    vi.useFakeTimers();
    const { ta, b } = pair();
    const token = ta.issue("ada");
    const id = b.list("ada")[0].id;
    expect(ta.verify(token)).toBe("ada");
    vi.advanceTimersByTime(60_000);
    expect(fileTokenStore(file).get(id)?.lastUsed).toBeTypeOf("number");
  });

  it("stats the file on every check and reads it only when it changed", () => {
    const { ta, tb } = pair();
    const token = ta.issue("ada");
    expect(tb.verify(token)).toBe("ada");
    const before = reads();
    for (let i = 0; i < 50; i++) expect(tb.verify(token)).toBe("ada");
    expect(reads()).toBe(before);
    ta.issue("bob");
    const changed = reads();
    expect(tb.verify(token)).toBe("ada");
    expect(tb.verify(token)).toBe("ada");
    expect(reads()).toBe(changed + 1);
  });
});
