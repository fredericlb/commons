// apiToken.ts — personal access tokens for clients with no cookie jar: an HMAC-signed `{jti,sub,iat,exp}`.
// What a reader gets wrong: the signature is not the whole check. With a store, a token is valid only while
// its id is listed there, which is what makes one revocable; without one, it is valid until it expires.
// A token with no id (the format before ids) is refused. See docs/apiTokens.md.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sharedJsonFile } from "./jsonFile.ts";

/** The default lifetime of a token. */
export const API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** What a store keeps about a token: never the token itself. */
export interface ApiTokenRecord {
  id: string;
  sub: string;
  label: string;
  created: number;
  expires: number;
  lastUsed?: number;
}

/** Where the issued tokens are listed; `get` runs on every request, so it must be cheap. */
export interface ApiTokenStore {
  get(id: string): ApiTokenRecord | undefined;
  add(record: ApiTokenRecord): void;
  remove(id: string): boolean;
  list(sub: string): ApiTokenRecord[];
  touch(id: string, at: number): void;
}

export interface IssueOptions {
  /** Shown to the owner in the token list. */
  label?: string;
  ttlMs?: number;
  /** Held in this process's memory only and dead with it: a token handed to a child or a mount in code. */
  ephemeral?: boolean;
}

export interface ApiTokens {
  /** Mint a token for a user id. */
  issue(sub: string, opts?: IssueOptions): string;
  /** The token's user id (sub), or null when forged, expired, revoked or of the old format. */
  verify(token: string): string | null;
  /** The owner's listed tokens; empty without a store. */
  list(sub: string): ApiTokenRecord[];
  /** Revoke one of the owner's tokens; false when it is not theirs or not listed. */
  revoke(sub: string, id: string): boolean;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

interface Payload {
  v: 2;
  jti: string;
  sub: string;
  iat: number;
  exp: number;
}

/** Tokens kept in memory only: a test's store, or a process that may forget them on restart. */
export function memoryTokenStore(): ApiTokenStore {
  const records = new Map<string, ApiTokenRecord>();
  return {
    get: (id) => records.get(id),
    add: (r) => void records.set(r.id, r),
    remove: (id) => records.delete(id),
    list: (sub) => [...records.values()].filter((r) => r.sub === sub),
    touch: (id, at) => {
      const r = records.get(id);
      if (r) r.lastUsed = at;
    },
  };
}

/** Tokens listed in a JSON file other processes may share: re-read when it changes, merged on every write. */
export function fileTokenStore(file: string, flushMs = 60_000): ApiTokenStore {
  const shared = sharedJsonFile(file, (raw) => {
    const list = Array.isArray(raw) ? (raw as ApiTokenRecord[]) : [];
    return new Map(
      list.filter((r) => r && typeof r.id === "string").map((r) => [r.id, r]),
    );
  });
  // Last uses not written yet: id → time, laid over whatever the file holds.
  const used = new Map<string, number>();
  let timer: NodeJS.Timeout | null = null;
  const view = (): Map<string, ApiTokenRecord> => {
    const all = shared.read();
    for (const [id, at] of used) {
      const r = all.get(id);
      if (r && (r.lastUsed ?? 0) < at) r.lastUsed = at;
    }
    return all;
  };
  // Read the file afresh, apply one change and the pending last uses, write it back.
  const change = (apply: (all: Map<string, ApiTokenRecord>) => void): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    const all = view();
    apply(all);
    const now = Date.now();
    shared.write([...all.values()].filter((r) => r.expires > now));
    used.clear();
  };
  return {
    get: (id) => view().get(id),
    add: (r) => change((all) => void all.set(r.id, r)),
    remove: (id) => {
      if (!view().has(id)) return false;
      change((all) => void all.delete(id));
      return true;
    },
    list: (sub) => [...view().values()].filter((r) => r.sub === sub),
    touch: (id, at) => {
      if (!view().has(id)) return;
      used.set(id, at);
      timer ??= setTimeout(() => change(() => {}), flushMs);
      timer.unref?.();
    },
  };
}

/** Bind the token scheme to one service's secret, and to a store when tokens must be revocable. */
export function createApiTokens(
  secret: string,
  {
    ttlMs = API_TOKEN_TTL_MS,
    store,
  }: { ttlMs?: number; store?: ApiTokenStore } = {},
): ApiTokens {
  const sign = (payload: string): string =>
    b64url(createHmac("sha256", secret).update(payload).digest());
  // Ephemeral tokens: id → sub, for as long as this process lives.
  const ephemeral = new Map<string, string>();

  const issue = (sub: string, opts: IssueOptions = {}): string => {
    const now = Date.now();
    const jti = b64url(randomBytes(16));
    const exp = opts.ephemeral ? 0 : now + (opts.ttlMs ?? ttlMs);
    const body: Payload = { v: 2, jti, sub, iat: now, exp };
    if (opts.ephemeral) ephemeral.set(jti, sub);
    else
      store?.add({
        id: jti,
        sub,
        label: opts.label ?? "",
        created: now,
        expires: exp,
      });
    const payload = b64url(Buffer.from(JSON.stringify(body)));
    return `${payload}.${sign(payload)}`;
  };

  const verify = (token: string): string | null => {
    const [payload, sig, extra] = String(token).split(".");
    if (!payload || !sig || extra !== undefined) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    let body: Partial<Payload>;
    try {
      body = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      return null;
    }
    const { v, jti, sub, exp } = body;
    if (v !== 2 || typeof jti !== "string" || typeof sub !== "string")
      return null;
    if (typeof exp !== "number") return null;
    if (exp === 0) return ephemeral.get(jti) === sub ? sub : null;
    const now = Date.now();
    if (exp <= now) return null;
    if (!store) return sub;
    const record = store.get(jti);
    if (!record || record.sub !== sub || record.expires <= now) return null;
    store.touch(jti, now);
    return sub;
  };

  const list = (sub: string): ApiTokenRecord[] =>
    (store?.list(sub) ?? [])
      .filter((r) => r.expires > Date.now())
      .map((r) => ({ ...r }));

  const revoke = (sub: string, id: string): boolean => {
    const record = store?.get(id);
    if (!record || record.sub !== sub) return false;
    return store?.remove(id) ?? false;
  };

  return { issue, verify, list, revoke };
}
