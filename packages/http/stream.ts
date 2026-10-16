// Serving files over HTTP with Range support, so browsers can seek in media
// instead of downloading the whole thing first. A seek ABORTS the previous range,
// so the file is closed on every abort and a read error never escapes as an event.
// Every answer carries a validator (ETag, Last-Modified), so a replay costs a 304,
// not the file again. Why the tag is weak and how If-Range reads it: docs/stream.md.

import fs from "node:fs";
import { pipeline } from "node:stream";
import type { Request, Response } from "express";

/** What a caller that sets no Cache-Control gets: keep it, but ask before every use. */
export const DEFAULT_CACHE_CONTROL = "private, no-cache";

/** The validator for a file at this size and modification time — weak, since it reads no bytes. */
export function fileEtag(stat: { size: number; mtimeMs: number }): string {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

/** Does an If-None-Match list name this tag? Weak comparison, as that header asks for. */
export function etagListed(header: string, etag: string): boolean {
  if (header.trim() === "*") return true;
  const bare = etag.replace(/^W\//, "");
  return header.split(",").some((t) => t.trim().replace(/^W\//, "") === bare);
}

/** HTTP dates have one-second precision, so a file's time is floored before it is compared. */
const toHttpSecond = (ms: number): number => Math.floor(ms / 1000) * 1000;

/** Is the client's conditional GET satisfied by what it already holds? */
export function notModified(
  req: Request,
  etag: string,
  mtimeMs?: number,
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const inm = req.headers["if-none-match"];
  if (inm) return etagListed(inm, etag);
  if (mtimeMs === undefined) return false;
  const ims = Date.parse(String(req.headers["if-modified-since"] ?? ""));
  return Number.isFinite(ims) && toHttpSecond(mtimeMs) <= ims;
}

/** Does an If-Range still describe this file? A stale one turns the Range into a full answer. */
function rangeStillValid(req: Request, etag: string, mtimeMs: number): boolean {
  const raw = req.headers["if-range"];
  const ifRange = Array.isArray(raw) ? raw[0] : raw;
  if (!ifRange) return true;
  if (ifRange.includes('"')) return ifRange.trim() === etag;
  const at = Date.parse(ifRange);
  return Number.isFinite(at) && toHttpSecond(mtimeMs) === at;
}

// Stream a file with HTTP Range support so the browser can seek in audio.
export function streamFile(
  req: Request,
  res: Response,
  filePath: string,
  mime: string,
): void {
  const stat = fs.statSync(filePath);
  const etag = fileEtag(stat);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", stat.mtime.toUTCString());
  // A caller that knows better (an immutable asset, a no-store secret) sets its own first.
  if (!res.getHeader("Cache-Control"))
    res.setHeader("Cache-Control", DEFAULT_CACHE_CONTROL);
  if (notModified(req, etag, stat.mtimeMs)) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", mime);

  let start = 0;
  let end = stat.size - 1;
  const range = rangeStillValid(req, etag, stat.mtimeMs)
    ? req.headers.range
    : undefined;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m && !m[1] && m[2]) {
      // A SUFFIX range, `bytes=-500`: the last 500 bytes, not the first.
      start = Math.max(0, stat.size - parseInt(m[2], 10));
    } else {
      start = m?.[1] ? parseInt(m[1], 10) : 0;
      // Clamped: a client asking past the end gets what there is, never a Content-Length the body cannot fill.
      end = m?.[2]
        ? Math.min(parseInt(m[2], 10), stat.size - 1)
        : stat.size - 1;
    }
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start > end ||
      start >= stat.size
    ) {
      res.status(416).setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  }
  res.setHeader("Content-Length", end - start + 1);
  // pipeline, not pipe: it closes the file when the client aborts, and hands a read error to this callback instead of throwing it at the process.
  pipeline(fs.createReadStream(filePath, { start, end }), res, (err) => {
    if (!err) return;
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
}
