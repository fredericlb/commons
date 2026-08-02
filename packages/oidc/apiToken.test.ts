import { describe, expect, it } from "vitest";
import { createApiTokens } from "./apiToken.ts";

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
    const forged = Buffer.from(
      JSON.stringify({ sub: "admin", iat: Date.now() }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verify(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "nodot", ".", "a.", ".b"]) {
      expect(verify(bad)).toBeNull();
    }
  });

  it("rejects a token past its ttl", () => {
    const shortLived = createApiTokens("s3cret", { ttlMs: -1 });
    expect(shortLived.verify(shortLived.issue("user-1"))).toBeNull();
  });

  it("keeps working when destructured off the factory", () => {
    expect(typeof issue).toBe("function");
    expect(verify(issue("user-2"))).toBe("user-2");
  });
});
