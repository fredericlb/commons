// The kept provider token and the bearer-token helpers, against a fake identity provider on loopback.

import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AuthHandle, setupAuth } from "./index.ts";

const NAME = "pt.sid";
const CLIENT = "test-client";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };

// What the fake provider answers, changed by each test.
const provider = {
  expiresIn: 3600,
  refresh: true,
  issued: 0,
  refreshed: 0,
  // Access token → the profile its UserInfo answers, and the client it was issued to.
  tokens: new Map<string, { sub: string; email: string; client: string }>(),
  introspectable: true,
};

let idp: Server;
let issuer: string;
let app: Server;
let base: string;
let auth: AuthHandle;

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(sub: string, nonce: string | undefined): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", kid: "k1", typ: "JWT" })}.${b64({ iss: issuer, aud: CLIENT, sub, iat: now, exp: now + 300, ...(nonce ? { nonce } : {}) })}`;
  return `${body}.${sign("sha256", Buffer.from(body), privateKey).toString("base64url")}`;
}

function mint(sub: string, nonce: string | undefined) {
  provider.issued++;
  const access = `at-${randomUUID()}`;
  provider.tokens.set(access, {
    sub,
    email: `${sub}@example.org`,
    client: CLIENT,
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: provider.expiresIn,
    id_token: idToken(sub, nonce),
    ...(provider.refresh ? { refresh_token: `rt-${sub}` } : {}),
  };
}

// The nonce of the authorization request, keyed by its code.
const codes = new Map<string, string>();

beforeAll(async () => {
  const p = express();
  p.use(express.urlencoded({ extended: false }));
  p.get("/.well-known/openid-configuration", (_req, res) =>
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      ...(provider.introspectable
        ? { introspection_endpoint: `${issuer}/introspect` }
        : {}),
      id_token_signing_alg_values_supported: ["RS256"],
    }),
  );
  p.get("/jwks", (_req, res) => res.json({ keys: [jwk] }));
  p.post("/token", (req, res) => {
    if (req.body.grant_type === "refresh_token") {
      provider.refreshed++;
      return res.json(mint(String(req.body.refresh_token).slice(3), undefined));
    }
    res.json(mint("alice", codes.get(String(req.body.code))));
  });
  p.get("/userinfo", (req, res) => {
    const t = provider.tokens.get(
      String(req.get("authorization")).replace(/^Bearer /, ""),
    );
    if (!t) return res.status(401).json({ error: "invalid_token" });
    res.json({ sub: t.sub, email: t.email, azp: t.client });
  });
  p.post("/introspect", (req, res) => {
    const t = provider.tokens.get(String(req.body.token));
    res.json(
      t ? { active: true, sub: t.sub, client_id: t.client } : { active: false },
    );
  });
  idp = createServer(p);
  await new Promise<void>((r) => idp.listen(0, "127.0.0.1", () => r()));
  issuer = `http://127.0.0.1:${(idp.address() as { port: number }).port}`;

  process.env.SESSION_SECRET = "provider-tokens-test";
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_CLIENT_ID = CLIENT;
  process.env.OIDC_CLIENT_SECRET = "s3cret";
  const a = express();
  auth = await setupAuth(a, {
    cookieName: NAME,
    service: "oidc-provider-tokens-test",
    cookieDomain: "",
    trustedOrigins: [],
    keepAccessToken: true,
    keepRefreshToken: true,
  });
  a.get("/token", async (req, res) => {
    res.json({ token: await auth.accessToken(req) });
  });
  app = createServer(a);
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
});

afterAll(() => {
  app.close();
  idp.close();
});

// The cookies a response sets, as a Cookie header.
const jar = (res: Response, prior = ""): string => {
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  const all = new Map(
    prior
      .split("; ")
      .filter(Boolean)
      .map((c) => [c.split("=")[0], c] as const),
  );
  for (const c of set) all.set(c.split("=")[0], c);
  return [...all.values()].join("; ");
};

/** A whole sign-in through the fake provider: the Cookie header of the session it leaves. */
async function signIn(): Promise<string> {
  const login = await fetch(`${base}/auth/login`, { redirect: "manual" });
  const to = new URL(String(login.headers.get("location")));
  const code = randomUUID();
  codes.set(code, String(to.searchParams.get("nonce")));
  const cookie = jar(login);
  const back = await fetch(
    `${base}/auth/callback?code=${code}&state=${to.searchParams.get("state")}`,
    { redirect: "manual", headers: { cookie } },
  );
  expect(back.status).toBe(302);
  return jar(back, cookie);
}

const tokenOf = async (cookie: string) =>
  (
    (await (await fetch(`${base}/token`, { headers: { cookie } })).json()) as {
      token: string | null;
    }
  ).token;

describe("keepAccessToken", () => {
  it("keeps the provider's access token for the session, out of the cookie", async () => {
    provider.expiresIn = 3600;
    const cookie = await signIn();
    const token = await tokenOf(cookie);
    expect(token).toMatch(/^at-/);
    const value = cookie.split("; ").find((c) => c.startsWith(`${NAME}=`));
    const body = Buffer.from(String(value).split("=")[1], "base64").toString();
    expect(body).not.toContain(String(token));
  });

  it("answers null without a session", async () => {
    expect(await tokenOf("")).toBeNull();
  });

  it("refreshes an expired token with the kept refresh token", async () => {
    provider.expiresIn = 1;
    const cookie = await signIn();
    const before = provider.refreshed;
    const token = await tokenOf(cookie);
    expect(provider.refreshed).toBe(before + 1);
    expect(token).toMatch(/^at-/);
  });

  it("drops an expired token that has no refresh token", async () => {
    provider.expiresIn = 1;
    provider.refresh = false;
    const cookie = await signIn();
    expect(await tokenOf(cookie)).toBeNull();
    provider.refresh = true;
  });

  it("forgets the token at logout", async () => {
    provider.expiresIn = 3600;
    const cookie = await signIn();
    expect(await tokenOf(cookie)).toMatch(/^at-/);
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { cookie, "sec-fetch-site": "same-origin" },
    });
    // The old cookie, replayed: its key names nothing any more.
    expect(await tokenOf(cookie)).toBeNull();
  });
});

describe("userinfoFor and introspect", () => {
  it("asks the provider about a bearer token", async () => {
    const { access_token } = mint("bob", undefined);
    expect(await auth.userinfoFor(access_token)).toMatchObject({
      sub: "bob",
      email: "bob@example.org",
    });
    expect(await auth.introspect(access_token)).toMatchObject({
      active: true,
      client_id: CLIENT,
    });
  });

  it("answers null for a token the provider refuses", async () => {
    expect(await auth.userinfoFor("at-forged")).toBeNull();
    expect(await auth.introspect("at-forged")).toMatchObject({ active: false });
  });

  it("names the configured issuer", () => {
    expect(auth.issuer).toBe(issuer);
  });
});
