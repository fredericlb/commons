// Guards a bug that has bitten twice in production: node_modules/<workspace pkg>
// are SYMLINKS into the workspace, so any package missing from an image's
// runtime stage is a dangling link and an ERR_MODULE_NOT_FOUND on first import.
// Runs `turbo prune` per backend and asserts each pruned tree is closed over
// every workspace package that backend transitively needs. See docs/images.md.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Every workspace root a repo may have: commons is the submodule, packages/ is
// the repo's own shared tier (studio has one), apps/ holds the apps.
const ROOTS = ["commons/packages", "commons/dev", "packages", "dev", "apps"];

const pkgs = [];
const walk = (d, dep = 0) => {
  if (dep > 3) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, dep + 1);
    else if (e.name === "package.json") {
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        if (j.name)
          pkgs.push({
            name: j.name,
            dir: d.split(path.sep).join("/"),
            deps: Object.keys(j.dependencies || {}),
          });
      } catch {}
    }
  }
};
for (const g of ROOTS) if (fs.existsSync(g)) walk(g);

const byName = Object.fromEntries(pkgs.map((p) => [p.name, p]));

// Any dependency that names a workspace package is a symlink in the image —
// not just the @frediverse/* ones. Scoping the check to one prefix is how an
// app-local package (@radiok7/shared, @lanes/song) would slip through.
const closure = (n, seen = new Set()) => {
  for (const d of byName[n]?.deps ?? [])
    if (byName[d] && !seen.has(d)) {
      seen.add(d);
      closure(d, seen);
    }
  return seen;
};

// Backends to check: argv, else every workspace package named *-backend.
const backends = process.argv.slice(2).length
  ? process.argv.slice(2)
  : pkgs
      .map((p) => p.name)
      .filter((n) => n.endsWith("-backend"))
      .sort();

if (!backends.length) {
  console.error("no *-backend workspace package found");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-closure-"));
let ok = true;
for (const b of backends) {
  const out = path.join(tmp, b);
  execFileSync("npx", ["turbo", "prune", b, "--docker", `--out-dir=${out}`], {
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  const need = [...closure(b)].map((n) => byName[n].dir);
  const missing = need.filter((d) => !fs.existsSync(path.join(out, "full", d)));
  // A pruned tree must never carry node_modules: the image installs its own.
  const nm = fs.existsSync(path.join(out, "full", "node_modules"));
  console.log(
    `  ${b.padEnd(22)}${
      missing.length
        ? `MISSING ${missing.join(",")}`
        : `all ${need.length} pkgs present ✓`
    }${nm ? "  !! contains node_modules" : ""}`,
  );
  if (missing.length || nm) ok = false;
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  ok
    ? "\n  --> wholesale copy is correct BY CONSTRUCTION for every image"
    : "\n  --> PROBLEM",
);
process.exit(ok ? 0 : 1);
