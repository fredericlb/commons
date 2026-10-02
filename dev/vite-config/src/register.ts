// register.ts — registers the app's service worker so that every deploy reaches every open tab: a
// waiting worker takes over and the page reloads on the new bundle. The one thing a reader would get
// wrong: the reload is deferred while someone uses the tab — found at startup it applies at once,
// found later it waits until the tab is hidden. See docs/pwa.md.
/// <reference types="vite-plugin-pwa/client" />

/** How often a long-open tab asks whether a new build was deployed; navigations ask on their own. */
const CHECK_EVERY_MS = 30 * 60_000;
/** An update found this soon after load is applied at once: nothing has been done in the tab yet. */
const STARTUP_MS = 10_000;

/** Call once from the app's entry, behind `"serviceWorker" in navigator`. */
export function registerWorker(): void {
  const loadedAt = Date.now();
  // A worker controlled this page before, so a new one taking over means another build: reload onto it.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  void import("virtual:pwa-register").then(({ registerSW }) => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        const apply = () => void update(true);
        if (
          Date.now() - loadedAt < STARTUP_MS ||
          document.visibilityState === "hidden"
        )
          return apply();
        document.addEventListener(
          "visibilitychange",
          () => document.visibilityState === "hidden" && apply(),
        );
      },
      onRegisteredSW(_url, r) {
        if (r) setInterval(() => void r.update(), CHECK_EVERY_MS);
      },
    });
  });
}
