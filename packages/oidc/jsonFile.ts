// jsonFile.ts — the one way the file-backed stores of this package read and write their state.
// A write goes through a temporary file and a rename, so a crash never leaves half a JSON behind.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
