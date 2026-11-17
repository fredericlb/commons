// dev-perf.ts — React's DEV build records a `performance.measure` per component render, with a
// `detail` object for its DevTools track, and the browser keeps every entry until it is cleared:
// a long dev session grows the heap by gigabytes and Firefox's cycle collector stalls the page
// scanning it. An app calls this once at boot; a production build makes it a no-op.

/** How often the entries are dropped — often enough that a few seconds' worth is all there is. */
const CLEAR_MS = 5000;

/** In a DEV build, clear the performance timeline's marks and measures on a timer; nothing in production. */
export function clearDevPerfEntries(dev: boolean): void {
  if (!dev || typeof performance === "undefined") return;
  setInterval(() => {
    performance.clearMeasures();
    performance.clearMarks();
  }, CLEAR_MS);
}
