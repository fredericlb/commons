import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createApiTokens,
  fileTokenStore,
  memoryTokenStore,
} from "./apiToken.ts";

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
