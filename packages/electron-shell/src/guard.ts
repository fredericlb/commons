// guard.ts — runs one server and dies with the app: its stdin is a pipe from the main process, and the OS closes it however that process ends.
// It leads the server's process group. Stopping asks the SERVER alone first, so it stops its own children in its own order;
// only then, or after SERVER_GRACE_MS, is the rest of the group swept. See docs/shell.md.

import { spawn, spawnSync } from "node:child_process";
import {
  SERVER_GRACE_MS,
  STDIN_STOP_ENV,
  SWEEP_GRACE_MS,
} from "./stopTimes.ts";

const win = process.platform === "win32";

// The server's stdin is a pipe too: its end is how a server is asked to stop where there is no SIGTERM.
const child = spawn(process.execPath, process.argv.slice(2), {
  stdio: ["pipe", "inherit", "inherit"],
  env: { ...process.env, [STDIN_STOP_ENV]: "1" },
});
child.stdin?.on("error", () => {
  // a server that already exited closed its end first
});

const running = (): boolean =>
  child.exitCode === null && child.signalCode === null;

let stopping = false;
let swept = false;

function signalGroup(sig: NodeJS.Signals): void {
  try {
    process.kill(-process.pid, sig);
  } catch {
    // the group is already gone
  }
}

/** Whatever is left of the group: asked, then killed — which ends this guard too. */
function sweep(): void {
  if (swept) return;
  swept = true;
  if (win) {
    if (child.pid && running())
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    process.exit(0);
  }
  signalGroup("SIGTERM");
  setTimeout(() => signalGroup("SIGKILL"), SWEEP_GRACE_MS);
}

/** The server alone first: its stdin closed, and SIGTERM where there is one; the sweep once it exits or its grace is up. */
function stop(): void {
  if (stopping) return;
  stopping = true;
  if (!running()) {
    sweep();
    return;
  }
  child.stdin?.end();
  if (!win) child.kill("SIGTERM");
  setTimeout(sweep, SERVER_GRACE_MS);
}

// Its own SIGTERM, sent by the sweep to the group, must not end it before the SIGKILL.
process.on("SIGTERM", stop);
process.stdin.on("end", stop);
process.stdin.on("error", stop);
process.stdin.resume();
// A server that exits, asked or not, still leaves what it spawned in the group, so that is swept too.
child.on("exit", (code, sig) => {
  console.error(`server exited (${code ?? sig})`);
  stopping = true;
  sweep();
});
