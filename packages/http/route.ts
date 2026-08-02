// Async error wrapping and zod body validation — the two helpers that decide
// how EVERY error reaches a client, which is why they must exist once.
//
// Reachable on its own as @frediverse/http/route, and deliberately austere so
// it stays that way. Two properties to preserve if you edit this file:
//
//   1. Both imports below are `import type`, so this module has NO runtime
//      imports and contributes nothing to a bundle. A real `import` of express
//      here would pull a node server library toward the browser — lanes
//      ships this through a package its frontend also builds.
//   2. Nothing here touches `req.user`. That accessor (`sub`) lives in
//      ./express with the global augmentation it needs, so a backend declaring
//      its own richer user shape can import ./route without a type clash.

import type { Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

/** Wrap an async route so thrown errors become a 500 JSON response. */
export const wrap =
  (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: (err as Error).message });
    }
  };

/** Validate (and coerce) req.body against a zod schema; 400 on failure. */
export const validate =
  (schema: ZodType): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: message });
    }
    req.body = result.data;
    next();
  };
