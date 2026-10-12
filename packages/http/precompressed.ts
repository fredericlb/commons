// precompressed.ts — express.static for a Vite build, sending the .br or .gz the build wrote
// beside a file when the browser takes it. Nothing is compressed at request time: no sibling,
// or a client that accepts neither, falls through to express.static. See
// dev/vite-config/docs/compression.md.

import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

type StaticOptions = Parameters<typeof express.static>[1];

/** Best first: brotli is a fifth smaller than gzip on a JS bundle. */
const ENCODINGS = [
  { name: "br", ext: ".br" },
  { name: "gzip", ext: ".gz" },
] as const;

/** Whether `Accept-Encoding` takes `name` — a `q=0` refuses it. */
function accepts(header: string, name: string): boolean {
  return header.split(",").some((part) => {
    const [token, ...params] = part.trim().split(";");
    if (token.trim().toLowerCase() !== name) return false;
    const q = params.find((p) => p.trim().startsWith("q="));
    return !q || Number(q.trim().slice(2)) > 0;
  });
}

/** A drop-in for `express.static(root, options)`; `setHeaders` sees the ORIGINAL path, not the sibling's. */
export function precompressedStatic(
  root: string,
  options: StaticOptions = {},
): RequestHandler {
  const fallback = express.static(root, options);
  const base = normalize(root + sep);
  const serve = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD")
      return fallback(req, res, next);
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return fallback(req, res, next);
    }
    const file = normalize(join(root, rel));
    // A directory, or a path that climbs out of root, is express.static's to answer or refuse.
    if (rel.endsWith("/") || rel.includes("/.") || !file.startsWith(base))
      return fallback(req, res, next);
    res.vary("Accept-Encoding");
    const header = req.headers["accept-encoding"] ?? "";
    for (const { name, ext } of ENCODINGS) {
      if (!accepts(String(header), name)) continue;
      const sibling = await stat(file + ext).catch(() => null);
      if (!sibling?.isFile()) continue;
      res.type(extname(file));
      res.setHeader("Content-Encoding", name);
      options.setHeaders?.(res, file, sibling);
      // Ranges would count encoded bytes, which no client asking for a bundle wants.
      const { cacheControl, etag, immutable, lastModified, maxAge } = options;
      const sent = { cacheControl, etag, immutable, lastModified, maxAge };
      return res.sendFile(
        file + ext,
        { ...sent, acceptRanges: false },
        (err) => {
          if (err && !res.headersSent) next(err);
        },
      );
    }
    fallback(req, res, next);
  };
  // Express 4 does not await a handler, so a throw past the first await is handed on here.
  return (req, res, next) => void serve(req, res, next).catch(next);
}
