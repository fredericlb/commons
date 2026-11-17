// updateGate.ts — when a page may let a waiting worker take over, and when it may reload onto it, with no DOM
// of its own so it can be tested. The thing a reader would get wrong: the swap reloads EVERY page of the
// scope, so a page asks the others over a channel first, and one in use (visible, or marked busy) holds
// it until it is free. See docs/pwa.md, "Every deploy reaches every open tab".

/** An update found this soon after the registration is applied at once: nothing has been done in the tab yet. */
export const STARTUP_MS = 10_000;
/** How long an asking page waits for another to hold the swap before it goes ahead. */
export const ASK_MS = 300;

/** What the pages of one scope tell each other. */
export type GateMessage =
  | { t: "ask"; id: string }
  | { t: "hold"; id: string }
  | { t: "free" };

/** Everything the gate reads or does outside itself. */
export interface GateEnv {
  hidden(): boolean;
  now(): number;
  reload(): void;
  skipWaiting(): void;
  post(message: GateMessage): void;
  later(run: () => void, ms: number): void;
  newId(): string;
}

export interface UpdateGate {
  /** A new worker is waiting. */
  needRefresh(): void;
  /** A new worker took control of this page. */
  controllerChanged(): void;
  /** This page already runs the build the new worker holds: the swap costs it nothing, and it never reloads. */
  markCurrent(): void;
  setBusy(busy: boolean): void;
  visibilityChanged(): void;
  receive(message: GateMessage): void;
}

export function createUpdateGate(env: GateEnv, busy = false): UpdateGate {
  const startedAt = env.now();
  let pending = false;
  let reloadOwed = false;
  let reloading = false;
  let owesFree = false;
  let asking: string | null = null;
  let heldBack = false;
  let current = false;

  const inStartup = () => env.now() - startedAt < STARTUP_MS;
  // A page is free when the swap cannot hurt it: on the new build already, or not busy and hidden or still starting.
  const free = () => current || (!busy && (env.hidden() || inStartup()));

  const reload = () => {
    if (reloading || current) return;
    reloading = true;
    env.reload();
  };

  const tryApply = () => {
    if (!pending || asking || !free()) return;
    const id = env.newId();
    asking = id;
    heldBack = false;
    env.post({ t: "ask", id });
    env.later(() => {
      if (asking !== id) return;
      asking = null;
      if (!heldBack && free()) env.skipWaiting();
    }, ASK_MS);
  };

  const settle = () => {
    if (!free()) return;
    if (reloadOwed) return reload();
    if (owesFree) {
      owesFree = false;
      env.post({ t: "free" });
    }
    tryApply();
  };

  return {
    needRefresh() {
      pending = true;
      tryApply();
    },
    controllerChanged() {
      if (free()) reload();
      else reloadOwed = true;
    },
    markCurrent() {
      current = true;
    },
    setBusy(next) {
      busy = next;
      settle();
    },
    visibilityChanged: settle,
    receive(message) {
      if (message.t === "ask") {
        if (free()) return;
        owesFree = true;
        env.post({ t: "hold", id: message.id });
      } else if (message.t === "hold") {
        if (message.id === asking) heldBack = true;
      } else tryApply();
    },
  };
}
