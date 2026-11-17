// restart.test.ts — the crash policy: a doubling delay capped at its max, reset by a long run, given up past the limit in its window.

import { describe, expect, it } from "vitest";
import { freshRestart, onCrash, type RestartPolicy } from "./restart.ts";

const P: RestartPolicy = {
  firstMs: 1_000,
  maxMs: 4_000,
  resetAfterMs: 20_000,
  limit: 3,
  windowMs: 60_000,
};

describe("onCrash", () => {
  it("doubles the delay up to the max", () => {
    let s = freshRestart(P);
    const delays: number[] = [];
    for (let t = 0; t < 3; t++) {
      const d = onCrash(s, t * 100_000, 10, P);
      if (!d.restart) throw new Error("gave up");
      delays.push(d.delayMs);
      s = d.state;
    }
    expect(delays).toEqual([1_000, 2_000, 4_000]);
    expect(s.delayMs).toBe(4_000);
  });

  it("starts over after a run longer than resetAfterMs", () => {
    const s = { delayMs: 4_000, crashes: [] };
    const d = onCrash(s, 0, 25_000, P);
    expect(d.restart && d.delayMs).toBe(1_000);
  });

  it("gives up on the crash past the limit inside the window", () => {
    let s = freshRestart(P);
    for (const t of [0, 1_000, 2_000]) {
      const d = onCrash(s, t, 10, P);
      expect(d.restart).toBe(true);
      s = d.state;
    }
    const last = onCrash(s, 3_000, 10, P);
    expect(last.restart).toBe(false);
    expect(!last.restart && last.crashes).toBe(4);
  });

  it("forgets crashes older than the window", () => {
    let s = freshRestart(P);
    for (const t of [0, 1_000, 2_000]) s = onCrash(s, t, 10, P).state;
    const later = onCrash(s, 70_000, 10, P);
    expect(later.restart).toBe(true);
    expect(later.restart && later.attempt).toBe(1);
  });
});
