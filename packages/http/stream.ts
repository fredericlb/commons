// Serving files over HTTP with Range support, so browsers can seek in media
// instead of downloading the whole thing first.

import fs from "node:fs";
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

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
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
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(filePath).pipe(res);
  }
}
