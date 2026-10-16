// The FileTree's action menu: the list of offered actions, and the inline prompt or confirm
// one of them turns it into. Mounted fresh per opening, so no answer leaks into the next.
// The tree decides WHERE and FOR WHAT; see packages/ui/docs/file-tree.md.

import { useEffect, useMemo, useRef, useState } from "react";
import type { TreeAction, TreeNode, TreeTarget } from "./file-tree";
import { cn } from "./lib/utils";

export interface TreeMenuProps<N extends TreeNode> {
  target: TreeTarget<N>;
  x: number;
  y: number;
  actions: TreeAction<N>[];
  cancelLabel: string;
  onClose: () => void;
}

export function TreeMenu<N extends TreeNode>({
  target,
  x,
  y,
  actions,
  cancelLabel,
  onClose,
}: TreeMenuProps<N>) {
  const [prompting, setPrompting] = useState<TreeAction<N> | null>(null);
  const [value, setValue] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const offered = useMemo(
    () => actions.filter((a) => a.when?.(target) ?? true),
    [target, actions],
  );

  // Dismiss on Escape; an outside click is caught by the backdrop below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // A menu opened from the keyboard (the ⋮ button) must be reachable from it, and hand focus back after.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);

  const start = (action: TreeAction<N>) => {
    if (!action.prompt && !action.confirm) {
      onClose();
      action.run(target, "");
      return;
    }
    setValue(action.prompt?.initial?.(target) ?? "");
    setPrompting(action);
  };

  const commit = () => {
    if (!prompting) return;
    const answer = value.trim();
    onClose();
    if (answer) prompting.run(target, answer);
  };

  const confirmRun = () => {
    if (!prompting?.confirm) return;
    onClose();
    prompting.run(target, "");
  };

  return (
    <div className="fixed inset-0 z-50" onPointerDown={onClose}>
      <div
        ref={box}
        role="menu"
        style={{ left: x, top: y }}
        className="fixed min-w-[11rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {prompting?.prompt ? (
          <div className="px-2 py-1">
            {prompting.prompt.hint && (
              <div className="mb-1 text-xs text-muted-foreground">
                {prompting.prompt.hint(target, value)}
              </div>
            )}
            <input
              // biome-ignore lint/a11y/noAutofocus: the prompt IS the menu now — a field you must click first is a menu that swallowed your click.
              autoFocus
              placeholder={prompting.prompt.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                else if (e.key === "Escape") onClose();
              }}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-1 flex justify-end gap-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={commit}
                className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
              >
                {prompting.prompt.submit}
              </button>
            </div>
          </div>
        ) : prompting?.confirm ? (
          <div className="px-2 py-1">
            <div className="mb-1 text-xs text-muted-foreground">
              {prompting.confirm.message(target)}
            </div>
            <div className="mt-1 flex justify-end gap-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                // biome-ignore lint/a11y/noAutofocus: the prompt IS the menu now — a button you must click first is a menu that swallowed your click.
                autoFocus
                onClick={confirmRun}
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  prompting.danger
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {prompting.confirm.submit}
              </button>
            </div>
          </div>
        ) : (
          offered.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              onClick={() => start(action)}
              className={cn(
                "block w-full px-3 py-1 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                action.danger
                  ? "text-destructive"
                  : "hover:text-accent-foreground",
                "[@media(hover:none)]:py-2",
              )}
            >
              {typeof action.label === "function"
                ? action.label(target)
                : action.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
