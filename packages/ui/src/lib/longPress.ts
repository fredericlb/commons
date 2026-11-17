// A touch or pen press held still for LONG_PRESS_MS calls back with where it landed — the
// right-click of a device that has none. The click that ends a press which fired is swallowed,
// or the finger lifting would also open the row. See ../../docs/file-tree.md.

import { useEffect, useRef } from "react";

export const LONG_PRESS_MS = 500;
// A finger drifting further than this is a scroll, not a press.
const SLOP_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClickCapture: (e: React.MouseEvent) => void;
}

/** Handlers to spread on the pressed element; `onPress` null disables them. */
export function useLongPress(
  onPress: ((x: number, y: number) => void) | null,
): Partial<LongPressHandlers> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!onPress) return {};
  return {
    onPointerDown: (e) => {
      fired.current = false;
      if (e.pointerType === "mouse" || e.button !== 0) return;
      cancel();
      const x = e.clientX;
      const y = e.clientY;
      start.current = { x, y };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onPress(x, y);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (e) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
