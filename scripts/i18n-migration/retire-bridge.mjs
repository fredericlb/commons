// Rewrites t()-style call sites onto Paraglide's compiled messages.
//
//   t("editor.save")                      ->  m["editor.save"]()
//   t("editor.saveResult", { created })   ->  m["editor.saveResult"]({ created })
//
// Every key in this codebase is a literal at the call site, which is what makes
// this a text transform rather than an AST one. The keys themselves don't
// change — Paraglide exports them verbatim, dots and all.
//
//   node scripts/i18n-migration/retire-bridge.mjs <messagesImportSpecifier> <file...>
//
// The import specifier is relative to the FILES being rewritten, so group the
// invocation by directory depth (src/App.tsx wants "./paraglide/messages.js",
// src/views/X.tsx wants "../paraglide/messages.js").
//
// CAVEAT: the import rewrite only matches `import { t } from "…";` exactly.
// A file importing { t, tOr } or { locale, t } must be untangled by hand first.
//
// Proven on z0/editor (84 call sites). Delete this directory once
// every app is on Paraglide.

import { readFileSync, writeFileSync } from "node:fs";

const [messagesImport, ...files] = process.argv.slice(2);
if (!messagesImport || files.length === 0) {
  console.error("usage: retire-bridge.mjs <messages-import> <file...>");
  process.exit(1);
}

// `(?<![.\w])` keeps this off `format(`, `obj.t(`, and friends. \s spans
// newlines, so multi-line argument objects are handled by the same pattern.
const NO_ARGS = /(?<![.\w])t\(\s*"([^"]+)"\s*\)/g;
const WITH_ARGS = /(?<![.\w])t\(\s*"([^"]+)"\s*,\s*/g;
const IMPORT = /^import \{ t \} from "([^"]+)";$/m;

let failed = false;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const callsBefore = (before.match(/(?<![.\w])t\(/g) ?? []).length;

  let after = before
    .replace(NO_ARGS, 'm["$1"]()')
    .replace(WITH_ARGS, 'm["$1"](');

  if (!IMPORT.test(after)) {
    console.error(`✗ ${file}: no \`import { t }\` line to rewrite`);
    failed = true;
    continue;
  }
  after = after.replace(IMPORT, `import { m } from "${messagesImport}";`);

  const callsAfter = (after.match(/(?<![.\w])t\(/g) ?? []).length;
  if (callsAfter !== 0) {
    console.error(`✗ ${file}: ${callsAfter} t( call(s) left unconverted`);
    failed = true;
    continue;
  }

  writeFileSync(file, after);
  console.log(`${file}: ${callsBefore} call sites -> m[…]()`);
}

process.exit(failed ? 1 : 0);
