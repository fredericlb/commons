// setupAuth against a real express app in dev mode: what requireAuth and /auth/logout refuse.

import { createServer, type Server } from "node:http";
import express from "express";
import Keygrip from "keygrip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSessionRevocations,
  GROUPS_MAX_AGE_MS,
  type SessionUser,
  sessionCookieHeader,
  setupAuth,
} from "./index.ts";

const SECRET = "setup-auth-test-secret";
const NAME = "t.sid";
const revocations = createSessionRevocations();
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = SECRET;
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_CLIENT_ID;
  const app = express();
  const { requireAuth } = await setupAuth(app, {
    cookieName: NAME,
    service: "oidc-test",
    cookieDomain: "",
    trustedOrigins: [],
    revocations,
  });
  app.get("/private", requireAuth, (req, res) => res.json(req.user));
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(() => {
  server.close();
});

const cookie = (
  user: SessionUser,
  extra: { iat?: number; maxAgeMs?: number } = {},
) => sessionCookieHeader(user, { cookieName: NAME, secret: SECRET, ...extra });

const status = async (headers: Record<string, string>) =>
  (await fetch(`${base}/private`, { headers })).status;

describe("requireAuth", () => {
  it("lets a freshly stamped session through", async () => {
    expect(await status({ Cookie: cookie({ sub: "a" }) })).toBe(200);
  });

  it("refuses a session past its exp", async () => {
    const old = cookie(
      { sub: "a" },
      { iat: Date.now() - 10_000, maxAgeMs: 5_000 },
    );
    expect(await status({ Cookie: old })).toBe(401);
  });

  it("refuses a signed session with no stamps (the format before them)", async () => {
    const value = Buffer.from(JSON.stringify({ user: { sub: "a" } })).toString(
      "base64",
    );
    const header = `${NAME}=${value}; ${NAME}.sig=${new Keygrip([SECRET]).sign(`${NAME}=${value}`)}`;
    expect(await status({ Cookie: header })).toBe(401);
  });

  it("refuses a session with groups once they are older than the groups age", async () => {
    const iat = Date.now() - GROUPS_MAX_AGE_MS - 1000;
    expect(
      await status({
        Cookie: cookie({ sub: "g", groups: ["admins"] }, { iat }),
      }),
    ).toBe(401);
    expect(
      await status({ Cookie: cookie({ sub: "g", groups: [] }, { iat }) }),
    ).toBe(200);
  });

  it("refuses a session issued before its subject was revoked", async () => {
    const c = cookie({ sub: "r" }, { iat: Date.now() - 1000 });
    expect(await status({ Cookie: c })).toBe(200);
    revocations.revoke("r");
    expect(await status({ Cookie: c })).toBe(401);
  });
});

describe("/auth/logout", () => {
  it("refuses a cross-site POST", async () => {
    const res = await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie({ sub: "x" }), Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("signs out a same-origin POST, everywhere when asked", async () => {
    const c = cookie({ sub: "e" }, { iat: Date.now() - 1000 });
    const res = await fetch(`${base}/auth/logout?everywhere=1`, {
      method: "POST",
      headers: { Cookie: c, Origin: base },
    });
    expect(res.status).toBe(200);
    expect(await status({ Cookie: c })).toBe(401);
  });
});
