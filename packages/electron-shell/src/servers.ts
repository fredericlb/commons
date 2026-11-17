// servers.ts — an app's Node servers, run as children with Electron as their node: under tsx, or a bundle on its own.
// Each runs under guard.ts, which leads its process group and stops it when the pipe from this process closes — on a crash too.
// With `keepAlive`, a server that crashes once it has answered is started again on restart.ts's policy. See docs/shell.md.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { line, relay } from "./log.ts";
import {
  freshRestart,
  onCrash,
  RESTART_POLICY,
  type RestartPolicy,
} from "./restart.ts";
import { GUARD_WAIT_MS } from "./stopTimes.ts";

export interface Server {
  name: string;
  port: number;
  /** The running child; `keepAlive` replaces it when it starts the server again. */
  child: ChildProcess;
}

/** A kept-alive server's state, as its app may show it. */
export type ServerState = "up" | "restarting" | "failed";

export interface KeepAlive {
  policy?: RestartPolicy;
  /** Every change of state, with a line saying why. */
  onState?: (s: Server, state: ServerState, detail: string) => void;
  /** The restart limit is reached: the server stays down until `restartServer`. */
  onGiveUp?: (s: Server, why: string) => void;
}

export interface ServerSpec {
  /** The prefix of its lines in the merged log. */
  name: string;
  port: number;
  /** The server's entry: TypeScript run by tsx, or with no `tsx` a bundle node runs as it is. */
  entry: string;
  /** tsx's cli.mjs; absent for a bundled entry. */
  tsx?: string;
  /** The server's own tsconfig, which tsx would not find from `cwd`. */
  tsconfig?: string;
  /** Laid over this process's environment. */
  env: Record<string, string>;
  /** Variables of this process's environment the server must not inherit. */
  unset?: string[];
  /** Kept outside any checkout — docs/shell.md. */
  cwd: string;
}

/** dist/guard.cjs, beside main.cjs — unpacked from the asar when packaged, since a child node reads it from disk. */
const guardScript = (): string =>
  join(__dirname, "guard.cjs").replace(
    /app\.asar([/\\])/,
    "app.asar.unpacked$1",
  );

/** What keeps a server alive: armed once `waitListening` saw it answer, disarmed by `stopServer`. */
interface Keeper {
  answered: boolean;
  stopped: boolean;
  timer?: NodeJS.Timeout;
  restartNow: () => void;
}
const keepers = new WeakMap<Server, Keeper>();

function spawnGuarded(spec: ServerSpec): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...spec.env,
    // Electron as plain node, inherited by whatever the server spawns with `process.execPath`.
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(spec.port),
    ...(spec.tsconfig ? { TSX_TSCONFIG_PATH: spec.tsconfig } : {}),
  };
  for (const name of ["NODE_OPTIONS", ...(spec.unset ?? [])]) delete env[name];
  mkdirSync(spec.cwd, { recursive: true });
  const run = spec.tsx ? [spec.tsx, spec.entry] : [spec.entry];
  const child = spawn(process.execPath, [guardScript(), ...run], {
    cwd: spec.cwd,
    env,
    // stdin is the guard's lifeline: never written, and closed by the OS however this process ends.
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout?.on("data", relay(spec.name));
  child.stderr?.on("data", relay(spec.name));
  child.on("exit", (code, signal) =>
    line(spec.name, `exited (${code ?? signal})`),
  );
  return child;
}

/** Start one server on its port, its process group led by the guard; with `keepAlive`, restarted when it crashes after it answered. */
export function startServer(spec: ServerSpec, keepAlive?: KeepAlive): Server {
  const s: Server = {
    name: spec.name,
    port: spec.port,
    child: spawnGuarded(spec),
  };
  if (!keepAlive) return s;
  const policy = keepAlive.policy ?? RESTART_POLICY;
  let state = freshRestart(policy);
  const k: Keeper = { answered: false, stopped: false, restartNow: () => {} };
  const tell = (st: ServerState, detail: string) => {
    line(spec.name, detail);
    keepAlive.onState?.(s, st, detail);
  };
  const watch = (child: ChildProcess, startedAt: number) => {
    child.once("exit", (code, signal) => {
      // Before it ever answered, an exit is a failed start, which waitListening reports.
      if (k.stopped || !k.answered || child !== s.child) return;
      const d = onCrash(state, Date.now(), Date.now() - startedAt, policy);
      state = d.state;
      const how = `exited unexpectedly (${code ?? signal})`;
      if (!d.restart) {
        tell(
          "failed",
          `${how}: ${d.crashes} crashes within ${policy.windowMs / 1000} s, not restarted`,
        );
        keepAlive.onGiveUp?.(s, how);
        return;
      }
      tell(
        "restarting",
        `${how}: restart ${d.attempt} in ${d.delayMs / 1000} s`,
      );
      k.timer = setTimeout(launch, d.delayMs);
    });
  };
  const launch = () => {
    k.timer = undefined;
    if (k.stopped) return;
    s.child = spawnGuarded(spec);
    watch(s.child, Date.now());
    waitListening(s).then(
      () => tell("up", "answering again"),
      () => undefined,
    );
  };
  k.restartNow = () => {
    const running = s.child.exitCode === null && s.child.signalCode === null;
    if (k.stopped || running) return;
    clearTimeout(k.timer);
    state = freshRestart(policy);
    tell("restarting", "restarting on request");
    launch();
  };
  watch(s.child, Date.now());
  keepers.set(s, k);
  return s;
}

/** Start a kept-alive server that is down again at once, its crash count cleared; nothing when it runs. */
export function restartServer(s: Server): void {
  keepers.get(s)?.restartNow();
}

/** Resolve once the server answers HTTP at all; reject if it exits or never does. */
export async function waitListening(
  s: Server,
  timeoutMs = 60_000,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (s.child.exitCode !== null)
      throw new Error(`${s.name} exited (${s.child.exitCode})`);
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      const k = keepers.get(s);
      if (k) k.answered = true;
      return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `${s.name} did not answer on ${s.port} within ${timeoutMs / 1000} s`,
  );
}

/** Stop the server and everything it spawned; kill whatever is still there once the guard had its time. */
export async function stopServer(
  s: Server,
  waitMs = GUARD_WAIT_MS,
): Promise<void> {
  const k = keepers.get(s);
  if (k) {
    k.stopped = true;
    clearTimeout(k.timer);
  }
  const pid = s.child.pid;
  if (pid === undefined || s.child.exitCode !== null) return;
  const exited = new Promise<void>((r) => s.child.once("exit", () => r()));
  // The guard's own way out first; the sweep below is for a guard that did not take it.
  s.child.stdin?.end();
  await Promise.race([exited, new Promise((r) => setTimeout(r, waitMs))]);
  if (s.child.exitCode !== null || s.child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"]);
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}
