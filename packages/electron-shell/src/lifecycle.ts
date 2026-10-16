// lifecycle.ts — one copy of the app, a boot that reports its failure, and a quit that waits for the app's own teardown.
// Quit is held until `stop` resolves: the servers are children, and an app that exits first leaves them holding the ports.
// Before `stop`, every page runs its `__beforeQuit`; and the whole quit is capped, so a throw or a hang still exits.

import { app, dialog, webContents } from "electron";
import { line } from "./log.ts";
import { GUARD_WAIT_MS } from "./stopTimes.ts";

/** How long the pages get to write what they hold before the servers are stopped. */
const FLUSH_MS = 3_000;

/** The page hook a quit calls: a page that holds unsaved work sets it, and the promise it returns is awaited. */
const BEFORE_QUIT =
  'typeof globalThis.__beforeQuit === "function" ? globalThis.__beforeQuit() : null';

/** `p`, or undefined once `ms` passed — whichever comes first. */
function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((r) => {
    timer = setTimeout(() => r(undefined), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Every page runs its `__beforeQuit`, while the servers it writes through are still up. */
async function flushPages(): Promise<void> {
  const pages = webContents.getAllWebContents().filter((w) => !w.isDestroyed());
  await within(
    Promise.all(
      pages.map((w) =>
        w.executeJavaScript(BEFORE_QUIT, true).catch((e: unknown) => {
          line(
            "app",
            `a page did not flush: ${e instanceof Error ? e.message : e}`,
          );
        }),
      ),
    ),
    FLUSH_MS,
  );
}

export interface AppSpec {
  /** Shown in the error box a failed boot opens: "<title> could not start". */
  title: string;
  /** Named in that box, so the person knows where to look. */
  logPath: string;
  /** Starts the servers and opens the window; a throw ends the app. */
  boot: () => Promise<void>;
  /** Stops what boot started, in the order it needs. */
  stop: () => Promise<void>;
  /** How long `stop` may take before the app exits anyway; the guards still stop their servers then. */
  stopTimeoutMs?: number;
  /** A second launch: bring the window forward. */
  onSecondInstance: () => void;
  /** The Dock icon clicked with no window open (macOS). */
  onActivate: () => void;
  /** The Dock icon of an unpackaged run, which would otherwise be Electron's. */
  devIcon?: string;
  /** A menu-bar app: no Dock icon, and closing its last window does not quit it. */
  windowless?: boolean;
}

export function runApp(spec: AppSpec): void {
  if (!app.requestSingleInstanceLock()) app.exit(0);
  app.on("second-instance", spec.onSecondInstance);

  app.whenReady().then(() => {
    if (spec.windowless) app.dock?.hide();
    else if (!app.isPackaged && spec.devIcon) app.dock?.setIcon(spec.devIcon);
    return spec.boot().catch((e: unknown) => {
      const why = e instanceof Error ? e.message : String(e);
      line("app", `failed to start: ${why}`);
      dialog.showErrorBox(
        `${spec.title} could not start`,
        `${why}\n\nLog: ${spec.logPath}`,
      );
      app.quit();
    });
  });

  app.on("activate", spec.onActivate);
  app.on("window-all-closed", () => {
    if (!spec.windowless) app.quit();
  });

  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    void (async () => {
      line("app", "quitting");
      try {
        await flushPages();
        const done = await within(
          spec.stop().then(() => true),
          spec.stopTimeoutMs ?? GUARD_WAIT_MS + 10_000,
        );
        if (!done) line("app", "stop took too long, exiting anyway");
      } catch (e: unknown) {
        line("app", `stop failed: ${e instanceof Error ? e.message : e}`);
      } finally {
        app.exit(0);
      }
    })();
  });

  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const)
    process.on(sig, () => app.quit());
}
