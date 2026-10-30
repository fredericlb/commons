// register.ts — registers the app's service worker so that every deploy reaches every open tab: a
// waiting worker takes over and the page reloads on the new bundle — unless the page already IS that
// bundle (the shell comes from the network), when the swap is silent. The reload is deferred while
// someone uses the tab: found at startup it applies at once, found later it waits until the tab is
// hidden. See docs/pwa.md.
/// <reference types="vite-plugin-pwa/client" />

/** How often a long-open tab asks whether a new build was deployed; navigations ask on their own. */
const CHECK_EVERY_MS = 30 * 60_000;
/** An update found this soon after load is applied at once: nothing has been done in the tab yet. */
const STARTUP_MS = 10_000;

/** Whether this page runs the build the new worker precaches: its hashed entry is in that worker's manifest. */
async function runsNewBuild(): Promise<boolean> {
  const entry = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  )?.src;
  const name = entry ? new URL(entry).pathname.split("/").pop() : "";
  const r = await navigator.serviceWorker.getRegistration();
  const next = r?.waiting ?? r?.installing;
  // An unhashed entry (dev) proves nothing, so it reloads as before.
  if (!name || !/-[\w-]{6,}\.js$/.test(name) || !next) return false;
  const source = await fetch(next.scriptURL, { cache: "no-store" })
    .then((res) => (res.ok ? res.text() : ""))
    .catch(() => "");
  return source.includes(name);
}

/** Call once from the app's entry, behind `"serviceWorker" in navigator`. */
export function registerWorker(): void {
  const loadedAt = Date.now();
  // A worker controlled this page before, so a new one taking over means another build: reload onto it.
  const hadController = !!navigator.serviceWorker.controller;
  // Set when this page is already the new build: the new worker takes over with nothing to reload.
  let current = false;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || current || reloading) return;
    reloading = true;
    window.location.reload();
  });

  void import("virtual:pwa-register").then(({ registerSW }) => {
    const update = registerSW({
      immediate: true,
      // The reload is the `controllerchange` above, which knows when there is none to do.
      onNeedReload: () => {},
      onNeedRefresh() {
        const apply = () => void update(true);
        void runsNewBuild().then((same) => {
          if (same) {
            current = true;
            return apply();
          }
          if (
            Date.now() - loadedAt < STARTUP_MS ||
            document.visibilityState === "hidden"
          )
            return apply();
          document.addEventListener(
            "visibilitychange",
            () => document.visibilityState === "hidden" && apply(),
          );
        });
      },
      onRegisteredSW(_url, r) {
        if (r) setInterval(() => void r.update(), CHECK_EVERY_MS);
      },
    });
  });
}
