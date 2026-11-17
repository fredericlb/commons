import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { publicOrigin, redirectUriFor } from "./origin.ts";

// `protocol` stands in for express's req.protocol, which honours
// X-Forwarded-Proto because the app sets `trust proxy`.
function req(
  headers: Record<string, string>,
  protocol: "http" | "https" = "https",
): Request {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    protocol,
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

describe("publicOrigin", () => {
  it("uses the Host header when there's no forwarding", () => {
    expect(publicOrigin(req({ host: "z0.org" }))).toBe(
      "https://z0.org",
    );
  });

  it("prefers X-Forwarded-Host over Host", () => {
    expect(
      publicOrigin(
        req({ host: "127.0.0.1:8080", "x-forwarded-host": "z0.org" }),
      ),
    ).toBe("https://z0.org");
  });

  it("takes the first hop of a chained X-Forwarded-Host", () => {
    expect(
      publicOrigin(
        req({ host: "internal", "x-forwarded-host": "z0.org, edge" }),
      ),
    ).toBe("https://z0.org");
  });

  it("follows the forwarded scheme, so plain-http dev stays http", () => {
    expect(publicOrigin(req({ host: "z0.test" }, "http"))).toBe(
      "http://z0.test",
    );
  });

  it("keeps a non-default port", () => {
    expect(publicOrigin(req({ host: "z0.test:8080" }, "http"))).toBe(
      "http://z0.test:8080",
    );
  });
});

describe("redirectUriFor", () => {
  it("is absolute and lands on this origin's /auth/callback", () => {
    // /auth keeps its prefix through the proxy (only /api is stripped), so the
    // callback is <origin>/auth/callback — NOT /api/auth/callback.
    expect(redirectUriFor(req({ host: "z0.org" }))).toBe(
      "https://z0.org/auth/callback",
    );
  });

  it("agrees between the login and callback legs of one deployment", () => {
    // The token exchange fails unless both legs send an identical redirect_uri.
    const login = redirectUriFor(req({ host: "z0.org" }));
    const callback = redirectUriFor(req({ host: "z0.org" }));
    expect(login).toBe(callback);
  });
});
