// restart.ts — when a hosted server that crashed is started again: 1 s doubling to 30 s, and never more than `limit` times in `windowMs`.
// Pure, so a test runs it under plain node; servers.ts applies it. A run longer than `resetAfterMs` starts the delay over. See docs/shell.md.

export interface RestartPolicy {
  /** The first delay. */
  firstMs: number;
  /** The delay doubles up to this. */
  maxMs: number;
  /** A server that ran this long before it crashed was healthy: its next delay is `firstMs` again. */
  resetAfterMs: number;
  /** How many crashes inside `windowMs` are restarted; the next one is given up on. */
  limit: number;
  windowMs: number;
}

export const RESTART_POLICY: RestartPolicy = {
  firstMs: 1_000,
  maxMs: 30_000,
  resetAfterMs: 20_000,
  limit: 5,
  windowMs: 5 * 60_000,
};

export interface RestartState {
  /** The delay the next restart waits. */
  delayMs: number;
  /** When each recent crash happened, oldest first. */
  crashes: number[];
}

export const freshRestart = (
  p: RestartPolicy = RESTART_POLICY,
): RestartState => ({
  delayMs: p.firstMs,
  crashes: [],
});

export type RestartDecision =
  | { restart: true; delayMs: number; attempt: number; state: RestartState }
  | { restart: false; crashes: number; state: RestartState };

/** What to do about a crash at `now`, after a run of `ranMs`. */
export function onCrash(
  state: RestartState,
  now: number,
  ranMs: number,
  p: RestartPolicy = RESTART_POLICY,
): RestartDecision {
  const crashes = [...state.crashes.filter((t) => now - t < p.windowMs), now];
  const delayMs = ranMs >= p.resetAfterMs ? p.firstMs : state.delayMs;
  if (crashes.length > p.limit)
    return {
      restart: false,
      crashes: crashes.length,
      state: { delayMs, crashes },
    };
  return {
    restart: true,
    delayMs,
    attempt: crashes.length,
    state: { delayMs: Math.min(delayMs * 2, p.maxMs), crashes },
  };
}
