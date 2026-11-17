// dialogs.ts — the one dialog a failure gets: Retry (or Restart), Open log, Quit; Open log leaves it up, so the person reads and then chooses.
// `keepAliveDialog` is the `KeepAlive` that asks it once a hosted server is given up on. See docs/shell.md.

import { BaseWindow, dialog, type MessageBoxOptions, shell } from "electron";
import { line } from "./log.ts";
import { type KeepAlive, restartServer } from "./servers.ts";

export interface FailureLabels {
  retry: string;
  openLog: string;
  quit: string;
}

export interface FailureAsk {
  title: string;
  message: string;
  detail?: string;
  logPath: string;
  labels?: Partial<FailureLabels>;
  /** The window the dialog is attached to; the first open one when absent. */
  parent?: BaseWindow | null;
}

const DEFAULT_LABELS: FailureLabels = {
  retry: "Retry",
  openLog: "Open log",
  quit: "Quit",
};

const firstWindow = (): BaseWindow | null =>
  BaseWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;

/** Ask until the person picks Retry or Quit. */
export async function askAfterFailure(
  a: FailureAsk,
): Promise<"retry" | "quit"> {
  const labels = { ...DEFAULT_LABELS, ...a.labels };
  const options: MessageBoxOptions = {
    type: "error",
    title: a.title,
    message: a.title,
    detail: `${a.message}${a.detail ? `\n\n${a.detail}` : ""}\n\nLog: ${a.logPath}`,
    buttons: [labels.retry, labels.openLog, labels.quit],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
  for (;;) {
    const parent = a.parent === undefined ? firstWindow() : a.parent;
    const { response } =
      parent && !parent.isDestroyed()
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options);
    if (response === 0) return "retry";
    if (response !== 1) return "quit";
    const err = await shell.openPath(a.logPath);
    if (err) line("app", `could not open the log: ${err}`);
  }
}

export interface KeepAliveDialog {
  /** "<title> stopped" heads the dialog. */
  title: string;
  logPath: string;
  labels?: Partial<FailureLabels>;
  /** Called on every state change too, e.g. to tell the pages. */
  onState?: KeepAlive["onState"];
  /** Quit was chosen. */
  onQuit: () => void;
}

/** Restarted on the default policy; given up on, the person chooses Restart (the server alone) or Quit. */
export function keepAliveDialog(d: KeepAliveDialog): KeepAlive {
  return {
    onState: d.onState,
    onGiveUp: (s, why) => {
      void askAfterFailure({
        title: `${d.title} stopped`,
        message: `Its server "${s.name}" ${why} and kept crashing, so it is no longer restarted on its own. Until it is, the window shows errors.`,
        logPath: d.logPath,
        labels: { retry: "Restart", ...d.labels },
      }).then((choice) => {
        if (choice === "retry") restartServer(s);
        else d.onQuit();
      });
    },
  };
}
