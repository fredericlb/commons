// portHolder.ts — which process listens on a port, best effort: lsof on macOS and Linux, netstat and tasklist on Windows.
// An answer of null is common and not an error: another user's process is invisible to lsof without root. See docs/shell.md.

import { execFile } from "node:child_process";

export interface PortHolder {
  pid: number;
  command?: string;
  user?: string;
}

/** How long each probe may run: it only words an error message. */
const PROBE_MS = 2_000;

/** The first process of `lsof -F pcL` output. */
export function parseLsof(out: string): PortHolder | null {
  let h: PortHolder | null = null;
  for (const l of out.split(/\r?\n/)) {
    const tag = l[0];
    const v = l.slice(1);
    if (tag === "p") {
      if (h) break;
      const pid = Number(v);
      if (Number.isInteger(pid) && pid > 0) h = { pid };
    } else if (h && tag === "c" && v) h.command = v;
    else if (h && tag === "L" && v) h.user = v;
  }
  return h;
}

/** The pid listening on `port` in `netstat -ano` output; matched on the zero foreign address, since the state's word is localised. */
export function parseNetstat(out: string, port: number): number | null {
  for (const l of out.split(/\r?\n/)) {
    const f = l.trim().split(/\s+/);
    if (f.length < 5 || f[0].toUpperCase() !== "TCP") continue;
    const local = f[1];
    const foreign = f[2];
    if (!local.endsWith(`:${port}`)) continue;
    if (foreign !== "0.0.0.0:0" && foreign !== "[::]:0") continue;
    const pid = Number(f[f.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

/** The image name in `tasklist /FO CSV /NH` output. */
export function parseTasklist(out: string): string | null {
  const m = /^"([^"]+)"/.exec(out.trim());
  return m ? m[1] : null;
}

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((res) => {
    execFile(
      cmd,
      args,
      { timeout: PROBE_MS, windowsHide: true },
      (_e, stdout) => res(String(stdout ?? "")),
    );
  });

/** The process listening on `port` on this machine, when this account can see it. */
export async function portHolder(port: number): Promise<PortHolder | null> {
  try {
    if (process.platform !== "win32")
      return parseLsof(
        await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-FpcL"]),
      );
    const pid = parseNetstat(await run("netstat", ["-ano", "-p", "TCP"]), port);
    if (pid === null) return null;
    const name = parseTasklist(
      await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]),
    );
    return name ? { pid, command: name } : { pid };
  } catch {
    return null;
  }
}

/** What a busy port's error says: who holds it if known, and the case the per-user instance lock cannot see. */
export function portBusyMessage(
  port: number,
  holder: PortHolder | null,
  app: string,
): string {
  const who = holder
    ? `${holder.command ?? "a process"} (pid ${holder.pid}${holder.user ? `, user ${holder.user}` : ""})`
    : "a process this account cannot see";
  return `Port ${port} is already in use by ${who}. ${app} needs it. If another user account on this computer is running ${app}, quit it there first: only one copy per user is prevented.`;
}
