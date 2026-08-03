#!/usr/bin/env node
// Start (or reload) the single Caddy that fronts every frediverse repo: one
// process binds :80/:443, but the sites live in sibling repos (studio, phare),
// so this merges commons' global options with each repo's own Caddyfile.
// See docs/caddy.md.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commonsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// npm scripts run from the consuming repo's root, which is what we want —
// resolving from this script's own path would always land in commons.
const repoRoot = process.cwd();
const ADMIN = "http://127.0.0.1:2019/config/";
const LOG = join(tmpdir(), "frediverse-caddy.log");
const MERGED = join(tmpdir(), "frediverse-Caddyfile");
// `--adapter` is NOT optional. Caddy infers the Caddyfile adapter from the file
// NAME — basename exactly `Caddyfile`, or a `.caddyfile` extension — and this
// merged file is neither, so without it Caddy parses the config as JSON and dies
// on the first `#` comment. Naming the temp file `Caddyfile` would work too, but
// only until someone moves it; saying which adapter we mean cannot rot.
const CONFIG = ["--adapter", "caddyfile", "--config", MERGED];
const isWindows = process.platform === "win32";

// Explicit rather than "scan every sibling directory": these repos sit directly
// in Src/ next to unrelated projects, and a stray Caddyfile shouldn't be loaded.
const SIBLING_REPOS = ["studio", "phare"];

function collectCaddyfiles() {
  const global = join(commonsRoot, "caddy", "global.caddy");
  const parts = [readFileSync(global, "utf8")];
  const seen = new Set();
  const add = (dir) => {
    const file = join(dir, "Caddyfile");
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    parts.push(`# --- ${file} ---\n${readFileSync(file, "utf8")}`);
  };
  add(repoRoot);
  for (const name of SIBLING_REPOS) add(resolve(repoRoot, "..", name));
  return { text: parts.join("\n\n"), files: [...seen] };
}

// Any HTTP answer on the admin port means Caddy is up — don't check the status.
// Caddy guards the admin API against DNS rebinding and answers 403 to a request
// carrying an unexpected `Origin` (which fetch sends and curl doesn't), so
// `res.ok` would wrongly read a live Caddy as "down". Only a connection error
// (nothing listening) means it isn't running.
async function isRunning() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    await fetch(ADMIN, { signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

const { text, files } = collectCaddyfiles();
if (files.length === 0) {
  console.error(
    `No Caddyfile found in ${repoRoot} — run this from a repo root.`,
  );
  process.exit(1);
}
writeFileSync(MERGED, text);
for (const f of files) console.log(`  sites: ${f}`);

// Unlike the old single-repo script this is NOT a no-op when Caddy is already
// up: the running instance may have been started from the sibling repo and know
// nothing about our sites, so we always push the merged config.
if (await isRunning()) {
  const reload = spawnSync("caddy", ["reload", ...CONFIG], {
    cwd: commonsRoot,
    stdio: "inherit",
  });
  if (reload.status === 0)
    console.log("Caddy reloaded with the merged config.");
  process.exit(reload.status ?? 1);
}

// Caddy binds :80/:443. On Windows that needs no elevation; on macOS/Linux it
// does, so we prompt for sudo up front (before detaching) — a detached process
// has no tty and could never ask for the password itself.
if (!isWindows) {
  const sudo = spawnSync("sudo", ["-v"], { stdio: "inherit" });
  if (sudo.status !== 0) {
    console.error("sudo is required to bind :80/:443");
    process.exit(1);
  }
}

const out = openSync(LOG, "a");
const [cmd, args] = isWindows
  ? ["caddy", ["run", ...CONFIG]]
  : ["sudo", ["-n", "caddy", "run", ...CONFIG]];

const child = spawn(cmd, args, {
  cwd: commonsRoot,
  detached: true,
  stdio: ["ignore", out, out],
  windowsHide: true,
});
child.unref();

// Don't claim success until the admin API actually answers.
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await isRunning()) {
    console.log(`Caddy started in the background (pid ${child.pid}).`);
    console.log(`  logs:  ${LOG}`);
    console.log("  stop:  caddy stop");
    process.exit(0);
  }
}

console.error(`Caddy did not come up within 10s — check ${LOG}`);
process.exit(1);
