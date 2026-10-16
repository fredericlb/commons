// bounds.test.ts — a saved rectangle is read strictly and always lands whole on the display it is fitted to.

import { describe, expect, it } from "vitest";
import { clampBounds, readBounds } from "./bounds.ts";

const AREA = { x: 0, y: 25, width: 1440, height: 875 };

describe("readBounds", () => {
  it("keeps a well-formed state, rounded", () => {
    expect(
      readBounds({ x: 10.4, y: 20, width: 800, height: 600, maximized: true }),
    ).toEqual({ x: 10, y: 20, width: 800, height: 600, maximized: true });
  });

  it("refuses anything else", () => {
    expect(readBounds(null)).toBeNull();
    expect(readBounds({ x: 0, y: 0, width: 0, height: 10 })).toBeNull();
    expect(readBounds({ x: "1", y: 0, width: 10, height: 10 })).toBeNull();
    expect(
      readBounds({ x: 0, y: 0, width: Number.NaN, height: 10 }),
    ).toBeNull();
  });
});

describe("clampBounds", () => {
  it("leaves a rectangle that fits alone", () => {
    const r = { x: 100, y: 100, width: 800, height: 600 };
    expect(clampBounds(r, AREA)).toEqual(r);
  });

  it("brings back one left on an unplugged monitor to the right", () => {
    expect(
      clampBounds({ x: 3000, y: 200, width: 800, height: 600 }, AREA),
    ).toEqual({ x: 640, y: 200, width: 800, height: 600 });
  });

  it("shrinks one larger than the area and puts it at its origin", () => {
    expect(
      clampBounds({ x: -500, y: -50, width: 2560, height: 1600 }, AREA),
    ).toEqual({ x: 0, y: 25, width: 1440, height: 875 });
  });

  it("keeps the minimum size even on a smaller area", () => {
    const small = { x: 0, y: 0, width: 800, height: 500 };
    expect(
      clampBounds({ x: 50, y: 50, width: 1000, height: 700 }, small, {
        width: 900,
        height: 600,
      }),
    ).toEqual({ x: 0, y: 0, width: 900, height: 600 });
  });

  it("works on a display left of the main one", () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1080 };
    expect(
      clampBounds({ x: -2500, y: 900, width: 1000, height: 400 }, left),
    ).toEqual({ x: -1920, y: 680, width: 1000, height: 400 });
  });
});
