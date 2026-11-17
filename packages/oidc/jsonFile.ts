// jsonFile.ts — the one way the file-backed stores of this package read and write their state.
// A write goes through a temporary file and a rename, so a crash never leaves half a JSON behind.
// What a reader gets wrong: `sharedJsonFile` holds no lock, so two processes writing in the same
// instant can still lose one update; see docs/apiTokens.md for why that window is accepted.

import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/** The parsed file, or `fallback` when it is missing or unreadable. */
export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Replace the file with `value`, creating its folder; mode 0600, since it is credentials' metadata. */
export function writeJsonFile(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

/** A JSON file other processes may write too: `read` costs one stat, and parses only when the file changed. */
export interface SharedJsonFile<T> {
  /** The file's current content, as parsed; the same object while the file is unchanged. */
  read(): T;
  /** Replace the file; the next `read` parses it again. */
  write(value: unknown): void;
}

// What identifies one version of the file: a rename gives a new inode even within the same millisecond.
const signature = (file: string): string => {
  try {
    const st = statSync(file);
    return `${st.ino}:${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
};

/** Watch `file` by its stat; `parse` gets the raw JSON, or undefined when it is missing or unreadable. */
export function sharedJsonFile<T>(
  file: string,
  parse: (raw: unknown) => T,
): SharedJsonFile<T> {
  let seen: string | null = null;
  let value: T | undefined;
  return {
    read: () => {
      const now = signature(file);
      if (now !== seen || value === undefined) {
        value = parse(readJsonFile<unknown>(file, undefined));
        seen = now;
      }
      return value;
    },
    write: (next) => {
      writeJsonFile(file, next);
      seen = null;
    },
  };
}
