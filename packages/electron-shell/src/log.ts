// log.ts — one merged log for the app and every child, prefixed by who said it.
// Lines are buffered in one write stream, never written synchronously: `closeLog` is what gets the last ones to disk. See docs/shell.md.

import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";

let stream: WriteStream | null = null;
let echo = true;

export interface LogOptions {
  /** Also print every line to stdout; a packaged app has nobody reading it. */
  echo?: boolean;
}

/** Truncate and adopt `path`; one launch is one log. */
export function openLog(path: string, options: LogOptions = {}): void {
  mkdirSync(dirname(path), { recursive: true });
  echo = options.echo ?? true;
  const s = createWriteStream(path, { flags: "w" });
  s.on("error", (e) => {
    // A disk that refuses the log must not take the app down: the lines go to stdout alone.
    if (stream === s) stream = null;
    echo = true;
    console.error(`log: ${e.message}`);
  });
  stream = s;
}

export function line(who: string, text: string): void {
  const out = `${new Date().toISOString()} ${who.padEnd(10)} ${text}`;
  if (echo || !stream) console.log(out);
  stream?.write(`${out}\n`);
}

/** Flush what is buffered and close the file; a line after it goes to stdout alone. */
export function closeLog(): Promise<void> {
  const s = stream;
  stream = null;
  echo = true;
  if (!s || s.closed) return Promise.resolve();
  return new Promise((res) => {
    s.once("close", () => res());
    s.end();
  });
}

/** A line-splitting sink for a child's stdout or stderr. */
export function relay(who: string): (chunk: Buffer) => void {
  return (chunk) => {
    for (const l of chunk.toString("utf8").split(/\r?\n/))
      if (l.trim()) line(who, l);
  };
}
