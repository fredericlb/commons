// windowState.ts — a window reopens where it was left: its bounds and whether it was maximized, kept in a JSON file the app names.
// What is saved is the NORMAL bounds, so a maximized window unmaximizes to where it was. Fullscreen is not kept. See docs/shell.md.

import { readFileSync, writeFileSync } from "node:fs";
import { type BaseWindow, screen } from "electron";
import { clampBounds, type Rect, readBounds } from "./bounds.ts";
import { line } from "./log.ts";

/** A move or a resize is written once it has settled this long. */
const SAVE_DELAY_MS = 500;

/** Either fullscreen: its bounds are the screen's, not the window's. */
const fullscreen = (w: BaseWindow): boolean =>
  w.isFullScreen() || (process.platform === "darwin" && w.isSimpleFullScreen());

export interface WindowState {
  /** Spread into the window's options: the restored rectangle, or the default size centred. */
  bounds: Partial<Rect>;
  /** Restored maximized: call `win.maximize()` once it exists. */
  maximized: boolean;
  /** Keep `win`'s bounds in the file from now on. */
  track: (win: BaseWindow) => void;
}

/** The state kept in `file`, fitted onto a display that is there now; `size` when there is none. */
export function windowState(
  file: string,
  size: { width: number; height: number },
  min?: { width: number; height: number },
): WindowState {
  let saved = null;
  try {
    saved = readBounds(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    // Never saved, or unreadable: the default size.
  }
  const bounds = saved
    ? clampBounds(saved, screen.getDisplayMatching(saved).workArea, min)
    : size;
  return {
    bounds,
    maximized: saved?.maximized ?? false,
    track: (win) => {
      let timer: NodeJS.Timeout | undefined;
      const save = () => {
        clearTimeout(timer);
        if (win.isDestroyed() || fullscreen(win)) return;
        const state = {
          ...win.getNormalBounds(),
          maximized: win.isMaximized(),
        };
        try {
          writeFileSync(file, `${JSON.stringify(state)}\n`);
        } catch (e: unknown) {
          line("app", `could not keep the window's bounds: ${String(e)}`);
        }
      };
      const later = () => {
        clearTimeout(timer);
        timer = setTimeout(save, SAVE_DELAY_MS);
      };
      win.on("resize", later);
      win.on("move", later);
      win.on("maximize", later);
      win.on("unmaximize", later);
      // A quit hides the windows and then exits with no `close`: the hide is the last chance.
      win.on("hide", save);
      win.on("close", save);
    },
  };
}
