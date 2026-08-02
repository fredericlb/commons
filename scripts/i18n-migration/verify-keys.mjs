// Every key the codemod emitted must exist in EVERY locale's catalogue.
//
// Checks the message files rather than calling the compiled functions on
// purpose: Paraglide's strategy chain is localStorage/preferredLanguage, and
// under Node neither exists, so setLocale() silently stays on the base locale
// and a call-based check would test the base locale twice.
//
//   node scripts/i18n-migration/verify-keys.mjs <app-dir>
//
// Delete this directory once every app is on Paraglide.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const appDir = process.argv[2];
if (!appDir) {
  console.error("usage: verify-keys.mjs <app-dir>");
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "paraglide" || entry === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield p;
    }
  }
}

const keys = new Set();
for (const file of walk(join(appDir, "src"))) {
  for (const match of readFileSync(file, "utf8").matchAll(/m\["([^"]+)"\]/g)) {
    keys.add(match[1]);
  }
}

const locales = readdirSync(join(appDir, "messages"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

console.log(`${appDir}: ${keys.size} keys at m["…"] call sites`);
let ok = true;
const catalogues = {};
for (const locale of locales) {
  catalogues[locale] = JSON.parse(
    readFileSync(join(appDir, "messages", `${locale}.json`), "utf8"),
  );
  const missing = [...keys].filter(
    (k) => typeof catalogues[locale][k] !== "string" || !catalogues[locale][k],
  );
  console.log(
    `  ${locale}: ${missing.length ? `MISSING ${missing.join(", ")}` : "all present"}`,
  );
  if (missing.length) ok = false;
}

// Spot-check that multi-locale catalogues actually differ, i.e. one isn't a
// copy of another. Identical values are legitimate for technical labels, so
// this is informational, not a failure.
if (locales.length > 1) {
  const [a, b] = locales;
  const differing = [...keys].filter(
    (k) => catalogues[a][k] !== catalogues[b][k],
  );
  console.log(`  differ between ${a}/${b}: ${differing.length}/${keys.size}`);
}

process.exit(ok ? 0 : 1);
