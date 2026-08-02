/* Long-lived personal access tokens for non-interactive clients (a CLI, a
   mobile app syncing in the background — anywhere there's no cookie jar).
   A token is a self-contained HMAC-signed `{sub,iat}`: no server-side storage,
   and so no per-token revocation — rotate the secret to invalidate all of them.
   The secret should be distinct from the session secret so cookies survive.
*/

import { createHmac, timingSafeEqual } from "node:crypto";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface ApiTokens {
  /** Mint a token for a user id. */
  issue(sub: string): string;
  /** Verify a token and return its user id (sub), or null if invalid/expired. */
  verify(token: string): string | null;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Bind the token scheme to one service's secret. Returned as plain closures so
 * callers can destructure them (`const { issue } = createApiTokens(...)`).
 */
export function createApiTokens(
  secret: string,
  { ttlMs = YEAR_MS }: { ttlMs?: number } = {},
): ApiTokens {
  const sign = (payload: string): string =>
    b64url(createHmac("sha256", secret).update(payload).digest());

  const issue = (sub: string): string => {
    const payload = b64url(
      Buffer.from(JSON.stringify({ sub, iat: Date.now() })),
    );
    return `${payload}.${sign(payload)}`;
  };

  const verify = (token: string): string | null => {
    const [payload, sig] = String(token).split(".");
    if (!payload || !sig) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const { sub, iat } = JSON.parse(
        Buffer.from(
          payload.replace(/-/g, "+").replace(/_/g, "/"),
          "base64",
        ).toString(),
      );
      if (!sub || typeof iat !== "number" || iat + ttlMs < Date.now())
        return null;
      return String(sub);
    } catch {
      return null;
    }
  };

  return { issue, verify };
}
