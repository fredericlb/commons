// Route-level ownership: the guard that keeps one user's rows invisible to
// another. Pairs with whatever the app's store uses to resolve a row's owner.

import type { RequestParamHandler } from "express";
import { sub } from "./express.ts";

/**
 * An Express `param` guard: resolves the id to its owner and 404s — not 403,
 * which would reveal that someone else's record exists — unless it belongs to
 * the current user.
 */
export function ownerGuard(
  getOwner: (id: string) => Promise<unknown>,
): RequestParamHandler {
  return (req, res, next, id) => {
    getOwner(id)
      .then((owner) => {
        if (owner !== sub(req))
          return res.status(404).json({ error: "not found" });
        next();
      })
      .catch(next);
  };
}
