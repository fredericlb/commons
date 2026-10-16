// lifecycle.ts — one copy of the app, a boot whose failure offers Retry / Open log / Quit, and a quit that waits for the app's own teardown.
// Quit is held until `stop` resolves: the servers are children, and an app that exits first leaves them holding the ports.
// The windows are hidden the moment it starts, so a teardown of many seconds never looks like a frozen window. See docs/shell.md.

import { app, BaseWindow, webContents } from "electron";
import { askAfterFailure } from "./dialogs.ts";
import { closeLog, line } from "./log.ts";
import { GUARD_WAIT_MS } from "./stopTimes.ts";

/** How long the pages get to write what they hold before the servers are stopped. */
const FLUSH_MS = 3_000;

/** How long the log gets to write what it buffers before the app exits. */
const LOG_CLOSE_MS = 2_000;

/** The page hook a quit calls: a page that holds unsaved work sets it, and the promise it returns is awaited. */
const BEFORE_QUIT =
  'typeof globalThis.__beforeQuit === "function" ? globalThis.__beforeQuit() : null';

/** `p`, or undefined once `ms` passed — whichever comes first. */
export function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
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

/** Out of sight at once; still alive, and not throttled, since their pages are flushed next. */
function hideWindows(): void {
  for (const w of webContents.getAllWebContents())
    if (!w.isDestroyed()) w.setBackgroundThrottling(false);
  for (const w of BaseWindow.getAllWindows()) if (!w.isDestroyed()) w.hide();
}

export interface AppSpec {
  /** Heads the dialog a failed boot opens: "<title> could not start". */
  title: string;
  /** Named in that dialog, and opened by its Open log. */
  logPath: string;
  /** Starts the servers and opens the window; a throw is a failed boot. */
  boot: () => Promise<void>;
  /** A failed boot painted in the app's own window too, which the dialog is then attached to. */
  showFailure?: (why: string) => void;
  /** Asked before a quit the person started; false keeps the app running. A throw counts as yes. */
  confirmQuit?: () => Promise<boolean>;
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

export interface RunningApp {
  /** Quit without `confirmQuit`: the person already chose to. */
  quitNow: () => void;
  /** Quit, then start again: a fresh boot, with nothing of this one left. */
  relaunch: () => void;
}

export function runApp(spec: AppSpec): RunningApp {
  if (!app.requestSingleInstanceLock()) app.exit(0);
  app.on("second-instance", spec.onSecondInstance);

  let quitting = false;
  let asking = false;
  let confirmed = false;
  const quitNow = () => {
    confirmed = true;
    app.quit();
  };
  const relaunch = () => {
    app.relaunch();
    quitNow();
  };

  app.whenReady().then(() => {
    if (spec.windowless) app.dock?.hide();
    else if (!app.isPackaged && spec.devIcon) app.dock?.setIcon(spec.devIcon);
    return spec.boot().catch(async (e: unknown) => {
      const why = e instanceof Error ? e.message : String(e);
      line("app", `failed to start: ${why}`);
      spec.showFailure?.(why);
      const choice = await askAfterFailure({
        title: `${spec.title} could not start`,
        message: why,
        logPath: spec.logPath,
      });
      if (choice === "retry") relaunch();
      else quitNow();
    });
  });

  app.on("activate", spec.onActivate);
  app.on("window-all-closed", () => {
    if (!spec.windowless) app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    if (asking) return;
    if (spec.confirmQuit && !confirmed) {
      asking = true;
      void spec
        .confirmQuit()
        .catch(() => true)
        .then((yes) => {
          asking = false;
          if (yes) quitNow();
          else line("app", "quit cancelled");
        });
      return;
    }
    quitting = true;
    hideWindows();
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
        // The log is buffered: closed last, so the quit's own lines reach the file.
        await within(closeLog(), LOG_CLOSE_MS);
        app.exit(0);
      }
    })();
  });

  // A signal is no person to ask.
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const)
    process.on(sig, quitNow);

  return { quitNow, relaunch };
}
