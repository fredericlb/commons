// One Paraglide configuration for all twelve SPAs.
//
// The compiler is configured per app, in each vite.config.ts, which is twelve
// chances for the locale-resolution order to drift apart. Apps call this
// instead and only pass what genuinely differs.

import { paraglideVitePlugin } from "@inlang/paraglide-js";

type ParaglideVitePluginOptions = Parameters<typeof paraglideVitePlugin>[0];

/** Everything an app may tune. `project`/`outdir` are conventions, not choices. */
export type ParaglideOverrides = Omit<
  Partial<ParaglideVitePluginOptions>,
  "project" | "outdir"
>;

/**
 * The shared compiler setup. Conventions assumed by every app:
 * `project.inlang/` at the package root, generated output in `src/paraglide/`.
 *
 *   // vite.config.ts
 *   import { frediverseParaglide } from "@frediverse/i18n/vite";
 *   export default defineAppConfig({
 *     …,
 *     extend: { plugins: [frediverseParaglide()] },
 *   });
 */
export function frediverseParaglide(overrides: ParaglideOverrides = {}) {
  return paraglideVitePlugin({
    project: "./project.inlang",
    outdir: "./src/paraglide",
    // Generates .d.ts for the compiled messages, so a wrong key or a missing
    // parameter is a build error. Off by default upstream; we always want it.
    emitTsDeclarations: true,
    // Order matters — the first strategy to return a locale wins. A stored
    // choice beats the browser's Accept-Language, which beats the base locale.
    // This replaces the upstream default of ["cookie", "globalVariable",
    // "baseLocale"]: no cookie (nothing server-side reads it) and no "url",
    // since none of these apps put the locale in the path.
    strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    ...overrides,
  });
}
