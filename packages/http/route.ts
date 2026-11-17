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

/** An error whose message is meant for the client: `wrap` answers it with its 4xx status. */
export class HttpError extends Error {
  readonly status: number;
  readonly expose = true;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** The 4xx of an error that says its message may be shown (`expose`, as http-errors does), or undefined. */
function exposedStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const { status, statusCode, expose } = err as Record<string, unknown>;
  const code = typeof status === "number" ? status : statusCode;
  return expose === true &&
    typeof code === "number" &&
    code >= 400 &&
    code < 500
    ? code
    : undefined;
}

/** Wrap an async route: an exposed 4xx keeps its message, anything else is logged and answers a generic 500. */
export const wrap =
  (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = exposedStatus(err);
      // The route's pattern, not the URL: a public route carries its credential in the path.
      if (!status)
        console.error(
          `${req.method} ${req.baseUrl}${req.route?.path ?? ""} failed:`,
          err,
        );
      // A handler that failed AFTER answering cannot be answered again, and trying throws out of this catch as an unhandled rejection.
      if (res.headersSent) res.destroy();
      else if (status)
        res.status(status).json({ error: (err as Error).message });
      else res.status(500).json({ error: "internal error" });
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
