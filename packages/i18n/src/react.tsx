// Runtime locale switching for our client-only SPAs.
//
// Paraglide's setLocale() reloads the document by default, because on a
// URL-routed or server-rendered app that's the only way every message re-runs.
// Our SPAs are neither: fully client-rendered, no locale in the path. That's
// exactly the case its `{ reload: false }` escape hatch is for — it swaps the
// locale without touching the document and leaves re-rendering to us.
//
// "Leaves re-rendering to us" is the whole reason this file exists. A compiled
// message is a plain function that reads getLocale() when called, so any
// component that re-renders after the switch shows the new language, and any
// component that doesn't, doesn't. Rather than hope every screen subscribes,
// LocaleProvider remounts its subtree on change (see remountOnChange).

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ParaglideRuntime } from "./paraglide.ts";

export interface LocaleContextValue<L extends string> {
  /** The active locale, as resolved by the runtime's strategy chain. */
  locale: L;
  /** Every locale this app was compiled for. */
  locales: readonly L[];
  /** Switch language in place. Persists via the runtime's strategies. */
  setLocale: (locale: L) => void;
}

export interface LocaleProviderProps {
  children: ReactNode;
  /**
   * Remount the subtree when the locale changes, so memoized branches and
   * components that never read the context still re-translate. Defaults to
   * true: switching language is rare and correctness beats preserving the
   * component state below the provider. Set false only if you've made every
   * translated component re-render some other way.
   */
  remountOnChange?: boolean;
}

/**
 * Binds Paraglide's generated runtime to React.
 *
 * Call once per app, at module scope, and export what it returns:
 *
 *   import * as runtime from "./paraglide/runtime.js";
 *   export const { LocaleProvider, useLocale } = createLocaleContext(runtime);
 *
 * Only components that offer a language switcher need useLocale(); everything
 * else just calls the compiled messages. Modules outside the React tree — a
 * store, a formatter — call messages directly too, since they read the locale
 * at call time rather than from context.
 *
 * MOUNT IT AT THE ROOT, above your App:
 *
 *   <LocaleProvider><App /></LocaleProvider>
 *
 * The remount re-runs message lookups in the subtree, so a lookup that happens
 * in the provider's OWN parent is not covered — that component doesn't
 * re-render, and its text stays in the previous language. Nothing above the
 * provider may render a message. Keeping it at the root makes that automatic;
 * putting it inside a component that also renders text is the one way to get a
 * half-translated screen.
 */
export function createLocaleContext<L extends string>(
  runtime: ParaglideRuntime<L>,
) {
  const Context = createContext<LocaleContextValue<L> | null>(null);

  function LocaleProvider({
    children,
    remountOnChange = true,
  }: LocaleProviderProps) {
    // Seeded from the runtime so the first paint matches whatever the strategy
    // chain resolved (localStorage, then browser preference, then baseLocale).
    const [locale, setLocaleState] = useState<L>(() => runtime.getLocale());

    const setLocale = useCallback((next: L) => {
      // reload: false is what makes this a switch rather than a page load. The
      // runtime still persists the choice through its configured strategies,
      // so a later hard refresh comes back in the same language.
      runtime.setLocale(next, { reload: false });
      setLocaleState(next);
    }, []);

    // <html lang> should always agree with the rendered language — screen
    // readers and translation prompts key off it. Owned here so apps don't
    // each set it once at boot and then let it go stale on switch.
    useEffect(() => {
      document.documentElement.lang = locale;
    }, [locale]);

    const value = useMemo<LocaleContextValue<L>>(
      () => ({ locale, locales: runtime.locales, setLocale }),
      [locale, setLocale],
    );

    // Changing the key throws away the subtree and builds it again, which
    // re-runs every message call in it. Cheaper than the document reload this
    // replaces, and unlike a plain re-render it can't miss a memoized branch.
    // The state above lives in LocaleProvider itself, so it survives the remount.
    return (
      <Context.Provider
        key={remountOnChange ? locale : undefined}
        value={value}
      >
        {children}
      </Context.Provider>
    );
  }

  function useLocale(): LocaleContextValue<L> {
    const value = useContext(Context);
    if (!value) {
      throw new Error("useLocale() requires a <LocaleProvider> above it.");
    }
    return value;
  }

  return { LocaleProvider, useLocale };
}
