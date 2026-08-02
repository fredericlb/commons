// Lifts the `const <locale>: Messages = {…}` literals out of an app's i18n.ts
// into inlang message-format files, one per locale, and writes the matching
// project.inlang/settings.json.
//
// Locales and the fallback are read from the app's own createI18n() call rather
// than assumed — three of these apps are French-only, with no `en` catalogue.
//
//   node scripts/i18n-migration/extract-catalogue.mjs <path/to/i18n.ts> <app-dir>
//
// Proven on obscura/editor (86 keys × en/fr). Delete this directory once
// every app is on Paraglide.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [source, appDir] = process.argv.slice(2);
if (!source || !appDir) {
  console.error("usage: extract-catalogue.mjs <i18n.ts> <app-dir>");
  process.exit(1);
}

const text = readFileSync(source, "utf8");

// `messages: { en, fr }` / `messages: { fr }`
const messagesMatch = text.match(/messages:\s*\{([^}]*)\}/);
if (!messagesMatch) throw new Error("no `messages: { … }` in createI18n call");
const locales = messagesMatch[1]
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const fallbackMatch = text.match(/fallbackLocale:\s*"([^"]+)"/);
if (!fallbackMatch) throw new Error("no fallbackLocale in createI18n call");
const baseLocale = fallbackMatch[1];

function extract(locale) {
  const start = text.indexOf(`const ${locale}: Messages = {`);
  if (start === -1) throw new Error(`no catalogue for "${locale}"`);
  const open = text.indexOf("{", start);
  // Empty stub: `const en: Messages = {};`
  if (
    text
      .slice(open, open + 3)
      .replace(/\s/g, "")
      .startsWith("{}")
  )
    return {};
  const end = text.indexOf("\n};", open);
  if (end === -1) throw new Error(`unterminated catalogue for "${locale}"`);
  const body = text.slice(open + 1, end);
  try {
    return JSON.parse(`{${body.replace(/,(\s*)$/, "$1")}}`);
  } catch (error) {
    throw new Error(
      `"${locale}" is not plain JSON after comma strip: ${error.message}`,
    );
  }
}

const catalogues = Object.fromEntries(locales.map((l) => [l, extract(l)]));

// Every locale must carry the same keys, or a message silently falls back.
const base = Object.keys(catalogues[baseLocale]);
for (const locale of locales.filter((l) => l !== baseLocale)) {
  const keys = new Set(Object.keys(catalogues[locale]));
  const missing = base.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !base.includes(k));
  if (missing.length)
    console.warn(`  ! ${locale} missing: ${missing.join(", ")}`);
  if (extra.length) console.warn(`  ! ${locale} extra: ${extra.join(", ")}`);
}

mkdirSync(join(appDir, "messages"), { recursive: true });
for (const locale of locales) {
  const out = {
    $schema: "https://inlang.com/schema/inlang-message-format",
    ...catalogues[locale],
  };
  writeFileSync(
    join(appDir, "messages", `${locale}.json`),
    `${JSON.stringify(out, null, 2)}\n`,
  );
}

mkdirSync(join(appDir, "project.inlang"), { recursive: true });
writeFileSync(
  join(appDir, "project.inlang", "settings.json"),
  `${JSON.stringify(
    {
      $schema: "https://inlang.com/schema/project-settings",
      baseLocale,
      locales,
      modules: [
        "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.4.0/dist/index.js",
        "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2.2.6/dist/index.js",
      ],
      "plugin.inlang.messageFormat": {
        pathPattern: "./messages/{locale}.json",
      },
    },
    null,
    2,
  )}\n`,
);

console.log(
  `${appDir}: locales=[${locales.join(", ")}] base=${baseLocale} keys=${base.length}`,
);
