// The seam between our apps and Paraglide's generated code.
//
// Paraglide compiles per-app: every SPA gets its own `src/paraglide/` with a
// `messages.js` and a `runtime.js`, so a shared package can't import either by
// path. Instead apps hand us their runtime module and we return the React glue
// bound to it. Nothing here knows an app's locales or keys.

/**
 * The slice of a generated `paraglide/runtime.js` we depend on. Declared
 * structurally so this package needs no dependency on @inlang/paraglide-js —
 * an app passes `import * as runtime from "./paraglide/runtime.js"` and TS
 * checks the shape at the call site.
 */
export interface ParaglideRuntime<L extends string = string> {
  readonly locales: readonly L[];
  readonly baseLocale: L;
  getLocale: () => L;
  setLocale: (locale: L, options?: { reload?: boolean }) => void;
}

/** The locale type of a given runtime, for apps that want to name it. */
export type LocaleOf<R> = R extends ParaglideRuntime<infer L> ? L : never;
