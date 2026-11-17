// Global Express augmentation: the auth middleware attaches the logged-in user
// to the request, plus the accessor that reads it. Everything that depends on
// `req.user` lives HERE and not in ./route, so that module stays importable by
// a stack that declares its own richer user shape (see the note in route.ts).

import type { Request } from "express";

/** The minimum an authenticated request carries — the OIDC session's claims. */
export interface AuthUser {
  sub: string;
  name: string;
  email: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** The authenticated user's subject id (requireAuth guarantees it's set). */
export const sub = (req: Request): string => req.user!.sub;
