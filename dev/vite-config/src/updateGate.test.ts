// updateGate.test.ts — two pages of one scope wired through a fake channel: who swaps, who reloads, and when.
import { describe, expect, it } from "vitest";
import {
  ASK_MS,
  createUpdateGate,
  type GateMessage,
  STARTUP_MS,
  type UpdateGate,
} from "./updateGate.ts";

interface Page {
  gate: UpdateGate;
  hidden: boolean;
  reloads: number;
}

function world() {
  let clock = 0;
  let ids = 0;
  let timers: { at: number; run: () => void }[] = [];
  let skips = 0;
  const pages: Page[] = [];
  const open = (hidden: boolean, busy = false): Page => {
    const page = { hidden, reloads: 0 } as Page;
    page.gate = createUpdateGate(
      {
        hidden: () => page.hidden,
        now: () => clock,
        reload: () => void page.reloads++,
        skipWaiting: () => void skips++,
        post: (m: GateMessage) => {
          for (const other of pages) if (other !== page) other.gate.receive(m);
        },
        later: (run, ms) => void timers.push({ at: clock + ms, run }),
        newId: () => String(ids++),
      },
      busy,
    );
    pages.push(page);
    return page;
  };
  const advance = (ms: number) => {
    clock += ms;
    const due = timers.filter((t) => t.at <= clock);
    timers = timers.filter((t) => t.at > clock);
    for (const t of due) t.run();
  };
  return { open, advance, skips: () => skips };
}

describe("updateGate", () => {
  it("swaps at startup when no other page is in use", () => {
    const w = world();
    const a = w.open(false);
    a.gate.needRefresh();
    w.advance(ASK_MS);
    expect(w.skips()).toBe(1);
  });

  it("a hidden page does not swap while another is visible and in use", () => {
    const w = world();
    const hidden = w.open(true);
    const visible = w.open(false);
    w.advance(STARTUP_MS);
    hidden.gate.needRefresh();
    w.advance(ASK_MS);
    expect(w.skips()).toBe(0);
    visible.hidden = true;
    visible.gate.visibilityChanged();
    w.advance(ASK_MS);
    expect(w.skips()).toBe(1);
  });

  it("a busy page holds the swap even hidden, until it is done", () => {
    const w = world();
    const a = w.open(true);
    const b = w.open(true, true);
    a.gate.needRefresh();
    w.advance(ASK_MS);
    expect(w.skips()).toBe(0);
    b.gate.setBusy(false);
    w.advance(ASK_MS);
    expect(w.skips()).toBe(1);
  });

  it("a page already on the new build swaps while visible, and never reloads", () => {
    const w = world();
    const a = w.open(false);
    w.advance(STARTUP_MS);
    a.gate.markCurrent();
    a.gate.needRefresh();
    w.advance(ASK_MS);
    expect(w.skips()).toBe(1);
    a.gate.controllerChanged();
    expect(a.reloads).toBe(0);
  });

  it("a page in use defers its reload when the controller changes anyway", () => {
    const w = world();
    const a = w.open(false);
    w.advance(STARTUP_MS);
    a.gate.controllerChanged();
    expect(a.reloads).toBe(0);
    a.hidden = true;
    a.gate.visibilityChanged();
    a.gate.controllerChanged();
    expect(a.reloads).toBe(1);
  });
});
