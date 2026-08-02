import type { Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { apiTokenAuth } from "./apiAuth.ts";

const { issueApiToken, bearerOrSession } = apiTokenAuth("s3cret");

// Minimal express doubles: enough to observe which branch ran.
function call(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  } as unknown as Response & { status: ReturnType<typeof vi.fn> };
  const next = vi.fn();
  const requireAuth = vi.fn() as unknown as RequestHandler;
  bearerOrSession(requireAuth)(req, res, next);
  return { req, res, next, requireAuth };
}

describe("bearerOrSession", () => {
  it("falls through to the session gate when there is no bearer", () => {
    const { requireAuth, next } = call();
    expect(requireAuth).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it("ignores a non-bearer Authorization scheme", () => {
    const { requireAuth } = call("Basic dXNlcjpwYXNz");
    expect(requireAuth).toHaveBeenCalledOnce();
  });

  it("authenticates a valid token and populates req.user", () => {
    const { req, next, requireAuth } = call(
      `Bearer ${issueApiToken("user-1")}`,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(requireAuth).not.toHaveBeenCalled();
    expect(req.user).toEqual({ sub: "user-1", name: "user-1", email: null });
  });

  it("rejects an invalid bearer instead of downgrading to the cookie", () => {
    const { res, next, requireAuth } = call("Bearer nonsense");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    // The important part: a bad token must not silently fall back to the session.
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it("rejects a token minted with another service's secret", () => {
    const other = apiTokenAuth("different");
    const { res, next } = call(`Bearer ${other.issueApiToken("user-1")}`);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("is case-insensitive on the scheme", () => {
    const { req, next } = call(`bearer ${issueApiToken("user-2")}`);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.sub).toBe("user-2");
  });
});
