import { createServer, type Server } from "node:http";
import cookieSession from "cookie-session";
import type { Request } from "express";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSessionRevocations,
  isAdmin,
  publicOrigin,
  type SessionUser,
  safeReturnTarget,
  sessionCookieHeader,
  sessionFromCookieHeader,
} from "./index.ts";

// A request as the edge (Caddy in dev, the image's nginx in prod) presents it.
function req(headers: Record<string, string>, protocol = "https"): Request {
  return {
    protocol,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

const here = req({ host: "labs.frediver.se" });

describe("publicOrigin", () => {
  it("reads the Host the client actually used", () => {
    expect(publicOrigin(here)).toBe("https://labs.frediver.se");
  });

  it("prefers X-Forwarded-Host, taking the client-facing first hop", () => {
    const r = req({
      host: "127.0.0.1:8789",
      "x-forwarded-host": "labs.frediver.se, internal.lan",
    });
    expect(publicOrigin(r)).toBe("https://labs.frediver.se");
  });

  it("follows the forwarded scheme, so dev http stays http", () => {
    expect(publicOrigin(req({ host: "localhost:8789" }, "http"))).toBe(
      "http://localhost:8789",
    );
  });
});

describe("safeReturnTarget", () => {
  it("keeps a relative path — the case labs needs (SPAs at /<project>/)", () => {
    expect(safeReturnTarget("/acu/", here)).toBe("/acu/");
    expect(safeReturnTarget("/acu/?tab=quiz#p1", here)).toBe(
      "/acu/?tab=quiz#p1",
    );
  });

  it("reduces an absolute same-origin URL to its path", () => {
    expect(safeReturnTarget("https://labs.frediver.se/acu/", here)).toBe(
      "/acu/",
    );
  });

  it("defaults to / when nothing was asked for", () => {
    expect(safeReturnTarget("", here)).toBe("/");
  });

  // The open-redirect cases: login must never bounce the browser off-origin.
  it("rejects another origin", () => {
    expect(safeReturnTarget("https://evil.example/steal", here)).toBe("/");
  });

  it("rejects a protocol-relative URL (absolute to the browser, path-shaped here)", () => {
    expect(safeReturnTarget("//evil.example/steal", here)).toBe("/");
  });

  it("rejects a non-http scheme", () => {
    expect(safeReturnTarget("javascript:alert(1)", here)).toBe("/");
  });

  it("rejects garbage rather than throwing", () => {
    expect(safeReturnTarget("http://[", here)).toBe("/");
  });

  // Each of these is a path to a string test and another host to a browser.
  it.each([
    "/\\evil.example",
    "\\\\evil.example",
    "\\/evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/.//evil.example",
    "data:text/html,hi",
  ])("rejects %j", (target) => {
    expect(safeReturnTarget(target, here)).toBe("/");
  });

  it("keeps a same-origin path that merely contains a backslash later on", () => {
    expect(safeReturnTarget("/a\\b", here)).toBe("/a/b");
  });

  // Multi-origin: a login mounted on one app's origin bouncing back to a sibling's.
  it("rejects a sibling origin when it isn't listed as trusted", () => {
    expect(safeReturnTarget("https://k7.st0.app/pages/1", here)).toBe("/");
  });

  it("accepts a trusted origin, returned absolute so the redirect leaves this origin", () => {
    expect(
      safeReturnTarget("https://k7.st0.app/pages/1", here, [
        "https://k7.st0.app",
      ]),
    ).toBe("https://k7.st0.app/pages/1");
  });

  it("still rejects an untrusted origin even when a trusted list is given", () => {
    expect(
      safeReturnTarget("https://evil.example/steal", here, [
        "https://k7.st0.app",
      ]),
    ).toBe("/");
  });
});

describe("isAdmin", () => {
  const user = (groups?: string[]): SessionUser => ({ sub: "u1", groups });

  it("matches case-insensitively (the Go stack used strings.EqualFold)", () => {
    expect(isAdmin(user(["Blindtest-Admins"]), ["blindtest-admins"])).toBe(
      true,
    );
    expect(isAdmin(user(["blindtest-admins"]), ["Blindtest-Admins"])).toBe(
      true,
    );
  });

  it("is false without a matching group", () => {
    expect(isAdmin(user(["users"]), ["admins"])).toBe(false);
  });

  it("is false with no groups, no user, or no privileged group configured", () => {
    expect(isAdmin(user(), ["admins"])).toBe(false);
    expect(isAdmin(user([]), ["admins"])).toBe(false);
    expect(isAdmin(null, ["admins"])).toBe(false);
    // Notably: the dev-auth stub carries groups: [], so it is never admin.
    expect(isAdmin(user(["admins"]), [])).toBe(false);
  });
});

// A WebSocket upgrade is a raw http event, so it never runs the express
// middleware that populates req.session — the decoder has to reproduce
// cookie-session's format itself. Verify it against a cookie that a real
// cookie-session issued, rather than trusting our reading of the format.
describe("sessionFromCookieHeader", () => {
  const SECRET = "test-secret-0123456789";
  const NAME = "bt_session";
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(cookieSession({ name: NAME, keys: [SECRET], maxAge: 60_000 }));
    app.get("/login", (req, res) => {
      const now = Date.now();
      req.session = {
        user: { sub: "u1", name: "Ada", groups: ["admins"] },
        iat: now,
        exp: now + 60_000,
      };
      res.json({ ok: true });
    });
    app.get("/expired", (req, res) => {
      const now = Date.now();
      req.session = {
        user: { sub: "u1" },
        iat: now,
        exp: now + 60_000,
        _expire: now - 1000,
      };
      res.json({ ok: true });
    });
    // What every session looked like before the stamps: signed, and refused.
    app.get("/unstamped", (req, res) => {
      req.session = { user: { sub: "u1" } };
      res.json({ ok: true });
    });
    // Reads the session back through the real middleware, so a cookie we mint
    // is checked against cookie-session's own verification, not just ours.
    app.get("/whoami", (req, res) => {
      res.json(req.session?.user ?? null);
    });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(() => {
    server.close();
  });

  /** Turn the Set-Cookie list into the Cookie header a browser would send back. */
  const cookieHeader = async (path: string) => {
    const res = await fetch(base + path);
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  };

  it("decodes a session that cookie-session really issued", async () => {
    const header = await cookieHeader("/login");
    expect(header).toContain(`${NAME}=`);
    expect(header).toContain(`${NAME}.sig=`);
    expect(
      sessionFromCookieHeader(header, { cookieName: NAME, secret: SECRET }),
    ).toEqual({ sub: "u1", name: "Ada", groups: ["admins"] });
  });

  it("rejects a tampered payload — the signature no longer matches", async () => {
    const header = await cookieHeader("/login");
    const forged = Buffer.from(
      JSON.stringify({ user: { sub: "attacker", groups: ["admins"] } }),
    ).toString("base64");
    const tampered = header.replace(
      new RegExp(`${NAME}=[^;]+`),
      `${NAME}=${forged}`,
    );
    expect(
      sessionFromCookieHeader(tampered, { cookieName: NAME, secret: SECRET }),
    ).toBeNull();
  });

  it("rejects a real cookie under a different secret", async () => {
    const header = await cookieHeader("/login");
    expect(
      sessionFromCookieHeader(header, {
        cookieName: NAME,
        secret: "some-other-secret",
      }),
    ).toBeNull();
  });

  it("refuses a signed session with no iat/exp stamps", async () => {
    const header = await cookieHeader("/unstamped");
    expect(
      sessionFromCookieHeader(header, { cookieName: NAME, secret: SECRET }),
    ).toBeNull();
  });

  it("refuses a session issued before its subject's revocation epoch", () => {
    const o = { cookieName: NAME, secret: SECRET };
    const revocations = createSessionRevocations();
    const header = sessionCookieHeader(
      { sub: "u1" },
      { ...o, iat: Date.now() - 1000 },
    );
    expect(sessionFromCookieHeader(header, { ...o, revocations })).toEqual({
      sub: "u1",
    });
    revocations.revoke("u1");
    expect(sessionFromCookieHeader(header, { ...o, revocations })).toBeNull();
  });

  it("honours cookie-session's own expiry stamp", async () => {
    const header = await cookieHeader("/expired");
    expect(
      sessionFromCookieHeader(header, { cookieName: NAME, secret: SECRET }),
    ).toBeNull();
  });

  it("returns null with no cookie / no session", () => {
    const o = { cookieName: NAME, secret: SECRET };
    expect(sessionFromCookieHeader(undefined, o)).toBeNull();
    expect(sessionFromCookieHeader("", o)).toBeNull();
    expect(sessionFromCookieHeader("other=1", o)).toBeNull();
  });

  // The encoder must agree with cookie-session, not merely with our decoder —
  // otherwise a cookie we mint wouldn't be accepted by the real middleware.
  it("round-trips a cookie minted by sessionCookieHeader", () => {
    const o = { cookieName: NAME, secret: SECRET };
    const user: SessionUser = { kind: "guest", name: "Ada" };
    expect(sessionFromCookieHeader(sessionCookieHeader(user, o), o)).toEqual(
      user,
    );
  });

  it("mints a cookie that cookie-session itself accepts", async () => {
    const minted = sessionCookieHeader(
      { sub: "u9", name: "Minted" },
      { cookieName: NAME, secret: SECRET },
    );
    const res = await fetch(`${base}/whoami`, { headers: { Cookie: minted } });
    expect(await res.json()).toEqual({ sub: "u9", name: "Minted" });
  });

  it("honours maxAgeMs when minting", () => {
    const o = { cookieName: NAME, secret: SECRET };
    const expired = sessionCookieHeader({ sub: "u1" }, { ...o, maxAgeMs: -1 });
    expect(sessionFromCookieHeader(expired, o)).toBeNull();
  });
});
