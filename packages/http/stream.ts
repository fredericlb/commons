// Serving files over HTTP with Range support, so browsers can seek in media
// instead of downloading the whole thing first. A seek ABORTS the previous range,
// so the file is closed on every abort and a read error never escapes as an event.

import fs from "node:fs";
import { pipeline } from "node:stream";
import type { Request, Response } from "express";

// Stream a file with HTTP Range support so the browser can seek in audio.
export function streamFile(
  req: Request,
  res: Response,
  filePath: string,
  mime: string,
): void {
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);

  let start = 0;
  let end = stat.size - 1;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m && !m[1] && m[2]) {
      // A SUFFIX range, `bytes=-500`: the last 500 bytes, not the first.
      start = Math.max(0, stat.size - parseInt(m[2], 10));
    } else {
      start = m && m[1] ? parseInt(m[1], 10) : 0;
      // Clamped: a client asking past the end gets what there is, never a Content-Length the body cannot fill.
      end = m && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
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
