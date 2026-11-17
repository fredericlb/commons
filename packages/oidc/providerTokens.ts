// providerTokens.ts — the provider's access token kept for a session (opt-in), and the calls that ask the provider
// about a bearer token someone else presents: its UserInfo, and its introspection when this client may introspect.
// What a reader gets wrong: the token is NOT in the session cookie. That cookie is signed, not encrypted, so it
// carries only an opaque key; the token lives in this process's memory and dies with it. See docs/session.md.

import { randomBytes } from "node:crypto";
import type { Request } from "express";
import type { Client, TokenSet } from "openid-client";
import type { SessionUser } from "./session.ts";

/** The session field that names a kept token: an opaque key into this process's memory, never the token. */
export const KEPT_FIELD = "kt";
/** How many sessions' tokens one process keeps at most: the oldest goes first past it. */
const MAX_KEPT = 10_000;
/** A token this close to its expiry counts as expired: the caller still has to use it. */
const EXPIRY_MARGIN_MS = 30_000;

interface Kept {
  sub: string;
  accessToken: string;
  /** Epoch ms, or null when the provider gave no `expires_in`. */
  expiresAt: number | null;
  refreshToken?: string;
  /** The session's own end: the record is dropped then whatever the token says. */
  until: number;
}

type SessionBag = Record<string, unknown>;

/** What setupAuth needs to keep, read and refresh a session's provider token. */
export interface ProviderTokensDeps {
  getClient: () => Promise<Client>;
  sessionUser: (req: Request) => SessionUser | null;
  /** Keep the refresh token too, when the provider hands one. */
  keepRefresh: boolean;
  /** Whether this client has a secret: introspection takes client authentication. */
  hasSecret: boolean;
  now?: () => number;
}

const expiresAtOf = (t: TokenSet): number | null =>
  typeof t.expires_at === "number" ? t.expires_at * 1000 : null;

export function providerTokens(deps: ProviderTokensDeps) {
  const now = deps.now ?? Date.now;
  const byKey = new Map<string, Kept>();
  const refreshing = new Map<string, Promise<string | null>>();

  const sweep = (): void => {
    const t = now();
    for (const [k, r] of byKey) if (r.until <= t) byKey.delete(k);
    // A Map iterates in insertion order, so the first keys are the oldest.
    for (const k of byKey.keys()) {
      if (byKey.size < MAX_KEPT) break;
      byKey.delete(k);
    }
  };
  const fresh = (r: Kept): boolean =>
    r.expiresAt === null || r.expiresAt - EXPIRY_MARGIN_MS > now();

  const refresh = (key: string, r: Kept): Promise<string | null> => {
    const running = refreshing.get(key);
    if (running) return running;
    const run = deps
      .getClient()
      .then((client) => client.refresh(r.refreshToken as string))
      .then(
        (t) => {
          if (!t.access_token) throw new Error("no access token");
          byKey.set(key, {
            ...r,
            accessToken: t.access_token,
            expiresAt: expiresAtOf(t),
            refreshToken: t.refresh_token ?? r.refreshToken,
          });
          return t.access_token;
        },
        () => {
          byKey.delete(key);
          return null;
        },
      )
      .finally(() => refreshing.delete(key));
    refreshing.set(key, run);
    return run;
  };

  return {
    /** Keep `tokenSet`'s access token for the session just started on `session`; its key goes into the session. */
    keep(session: SessionBag, sub: string, tokenSet: TokenSet): void {
      const old = session[KEPT_FIELD];
      if (typeof old === "string") byKey.delete(old);
      delete session[KEPT_FIELD];
      if (!tokenSet.access_token) return;
      sweep();
      const key = randomBytes(16).toString("base64url");
      byKey.set(key, {
        sub,
        accessToken: tokenSet.access_token,
        expiresAt: expiresAtOf(tokenSet),
        ...(deps.keepRefresh && tokenSet.refresh_token
          ? { refreshToken: tokenSet.refresh_token }
          : {}),
        until: typeof session.exp === "number" ? session.exp : now(),
      });
      session[KEPT_FIELD] = key;
    },

    /** The request's valid session's provider access token, refreshed when it can be; null otherwise. */
    async accessToken(req: Request): Promise<string | null> {
      const user = deps.sessionUser(req);
      const key = (req.session as SessionBag | null | undefined)?.[KEPT_FIELD];
      if (!user || typeof key !== "string") return null;
      const r = byKey.get(key);
      // Bound to the subject it was kept for: a session that changed hands holds a key to nothing.
      if (!r || r.sub !== user.sub || r.until <= now()) return null;
      if (fresh(r)) return r.accessToken;
      if (r.refreshToken) return refresh(key, r);
      byKey.delete(key);
      return null;
    },

    /** Forget the session's kept token: a logout. */
    drop(session: SessionBag | null | undefined): void {
      const key = session?.[KEPT_FIELD];
      if (typeof key === "string") byKey.delete(key);
    },

    /** The provider's UserInfo for a bearer token, or null when the provider refuses it or cannot be reached. */
    async userinfoFor(
      accessToken: string,
    ): Promise<Record<string, unknown> | null> {
      try {
        const client = await deps.getClient();
        return (await client.userinfo(accessToken)) as Record<string, unknown>;
      } catch {
        return null;
      }
    },

    /** The provider's introspection of a token (RFC 7662, `active` included), or null when this client cannot introspect. */
    async introspect(token: string): Promise<Record<string, unknown> | null> {
      if (!deps.hasSecret) return null;
      try {
        const client = await deps.getClient();
        if (!client.issuer.metadata.introspection_endpoint) return null;
        return (await client.introspect(token, "access_token")) as Record<
          string,
          unknown
        >;
      } catch {
        return null;
      }
    },
  };
}

export type ProviderTokens = ReturnType<typeof providerTokens>;
