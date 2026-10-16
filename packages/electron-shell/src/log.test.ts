// log.test.ts — the buffered log: every line reaches the file once it is closed, in order, and a reopen truncates.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeLog, line, openLog, relay } from "./log.ts";

const dirs: string[] = [];
const tmpLog = () => {
  const d = mkdtempSync(join(tmpdir(), "electron-shell-log-"));
  dirs.push(d);
  return join(d, "sub", "app.log");
};

afterEach(async () => {
  await closeLog();
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const body = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/^\S+ /, ""));

describe("log", () => {
  it("writes every line, prefixed and in order, by the time it is closed", async () => {
    const path = tmpLog();
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    openLog(path, { echo: false });
    for (let i = 0; i < 2000; i++) line("app", `line ${i}`);
    relay("child")(Buffer.from("one\r\n\ntwo\n"));
    await closeLog();
    const lines = body(path);
    expect(lines).toHaveLength(2002);
    expect(lines[0]).toBe(`${"app".padEnd(10)} line 0`);
    expect(lines[1999]).toBe(`${"app".padEnd(10)} line 1999`);
    expect(lines.slice(2000)).toEqual([
      `${"child".padEnd(10)} one`,
      `${"child".padEnd(10)} two`,
    ]);
    expect(out).not.toHaveBeenCalled();
  });

  it("truncates on open, and echoes to stdout by default and after close", async () => {
    const path = tmpLog();
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    openLog(path);
    line("app", "first launch");
    await closeLog();
    openLog(path);
    line("app", "second launch");
    await closeLog();
    line("app", "after close");
    expect(body(path)).toEqual([`${"app".padEnd(10)} second launch`]);
    expect(out).toHaveBeenCalledTimes(3);
  });
});
