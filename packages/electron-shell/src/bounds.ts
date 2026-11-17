// bounds.ts — a saved window rectangle read back and fitted onto a display that is there now. Pure; windowState.ts does the I/O.
// A rectangle saved on a monitor since unplugged must still open on screen, whole: it is shrunk to the work area, then moved into it.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedBounds extends Rect {
  maximized: boolean;
}

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** The saved state in `raw` (the parsed JSON), or null when it is not one. */
export function readBounds(raw: unknown): SavedBounds | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!finite(r.x) || !finite(r.y) || !finite(r.width) || !finite(r.height))
    return null;
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
    maximized: r.maximized === true,
  };
}

/** `r` fitted inside `area`: no larger than it, and moved in whole; `min` wins over the area only where the area is smaller. */
export function clampBounds(
  r: Rect,
  area: Rect,
  min: { width: number; height: number } = { width: 0, height: 0 },
): Rect {
  const width = Math.max(
    Math.min(r.width, area.width),
    Math.min(min.width, r.width),
  );
  const height = Math.max(
    Math.min(r.height, area.height),
    Math.min(min.height, r.height),
  );
  const fit = (v: number, start: number, span: number, size: number) =>
    Math.min(Math.max(v, start), start + Math.max(0, span - size));
  return {
    x: fit(r.x, area.x, area.width, width),
    y: fit(r.y, area.y, area.height, height),
    width,
    height,
  };
}
