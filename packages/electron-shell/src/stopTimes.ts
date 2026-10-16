// stopTimes.ts — how long a server gets to stop itself, and how long its leftovers get after it; read by guard.ts and servers.ts.
// A server that needs longer than SERVER_GRACE_MS for its own stop is force-killed mid-teardown. See docs/shell.md.

/** The server alone is asked to stop (SIGTERM, or its stdin closed on Windows), and given this long. */
export const SERVER_GRACE_MS = 12_000;

/** Then whatever is left of its group is asked too, and killed after this. */
export const SWEEP_GRACE_MS = 3_000;

/** What the main process waits for a guard before it kills the group itself. */
export const GUARD_WAIT_MS = SERVER_GRACE_MS + SWEEP_GRACE_MS + 1_000;

/** Set in a server's environment: its stdin is a pipe whose end means "stop" — the only graceful stop Windows has. */
export const STDIN_STOP_ENV = "ELECTRON_SHELL_STDIN_STOP";
