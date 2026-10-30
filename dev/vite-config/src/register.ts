// register.ts — registers the app's service worker so that every deploy reaches every open tab: a
// waiting worker takes over and the pages reload on the new bundle — unless a page already IS that
// bundle (the shell comes from the network), when its swap is silent. The one thing a reader would get
// wrong: no page reloads while someone uses it — visible past its startup, or marked busy with
// `setUpdateBusy` — and since the swap reloads every page of the scope, one in use holds it for all.
// The rules live in ./updateGate.ts; see docs/pwa.md.
/// <reference types="vite-plugin-pwa/client" />
import {
  createUpdateGate,
  type GateMessage,
  type UpdateGate,
} from "./updateGate.ts";

/** How often a long-open tab asks whether a new build was deployed; navigations ask on their own. */
const CHECK_EVERY_MS = 30 * 60_000;
/** The longest the registration waits for an idle moment once the page has loaded. */
const IDLE_TIMEOUT_MS = 5_000;

let busy = false;
let gate: UpdateGate | null = null;

/** Mark the page in use (playing, recording…) so no deploy reloads it, even hidden; clear it once done. */
export function setUpdateBusy(next: boolean): void {
  busy = next;
  gate?.setBusy(next);
}

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

/** Call once from the app's entry, behind `"serviceWorker" in navigator`; it registers once the page is loaded and idle. */
export function registerWorker(): void {
  // A worker controlled this page before, so a new one taking over means another build.
  const hadController = !!navigator.serviceWorker.controller;
  const start = () => {
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(
            `frediverse-sw:${new URL(".", document.baseURI).pathname}`,
          );
    let update: (reload?: boolean) => Promise<void> = async () => {};
    const g = createUpdateGate(
      {
        hidden: () => document.visibilityState === "hidden",
        now: () => Date.now(),
        reload: () => window.location.reload(),
        skipWaiting: () => void update(true),
        post: (message) => channel?.postMessage(message),
        later: (run, ms) => void setTimeout(run, ms),
        newId: () => `${Date.now()}-${Math.random()}`,
      },
      busy,
    );
    gate = g;
    if (channel)
      channel.onmessage = (e: MessageEvent<GateMessage>) => g.receive(e.data);
    document.addEventListener("visibilitychange", () => g.visibilityChanged());
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) g.controllerChanged();
    });
    void import("virtual:pwa-register").then(({ registerSW }) => {
      update = registerSW({
        immediate: true,
        // The reload is the `controllerchange` above, through the gate, which knows when there is none to do.
        onNeedReload: () => {},
        onNeedRefresh() {
          void runsNewBuild().then((same) => {
            if (same) g.markCurrent();
            g.needRefresh();
          });
        },
        onRegisteredSW(_url, r) {
          if (r) setInterval(() => void r.update(), CHECK_EVERY_MS);
        },
      });
    });
  };
  const idle = () =>
    "requestIdleCallback" in window
      ? requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS })
      : setTimeout(start, 1);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}
