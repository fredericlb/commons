// A collapsible file/folder tree with a right-click menu, inline prompts,
// drag-to-move and OS file drops. Extracted from lanes's sidebar so calepin's
// note tree is the same widget rather than a lookalike.
// Everything app-specific is a prop: the menu is a list of TreeAction, the
// trailing widget a render prop. See packages/ui/docs/file-tree.md.

import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type DroppedFile,
  dropEntries,
  readDroppedFiles,
} from "./lib/droppedEntries";
import { cn } from "./lib/utils";

export type { DroppedFile };

/** The minimum a node must carry. Apps extend it and keep their own fields. */
export interface TreeNode {
  name: string;
  path: string;
  dir?: boolean;
  children?: TreeNode[];
}

/** What a menu action acts on. `root` is the background click, which has no node. */
export interface TreeTarget<N extends TreeNode> {
  node: N | null;
  path: string;
  name: string;
  dir: boolean;
  root: boolean;
}

/** An action that asks for a string before it runs (rename, new file, …). */
export interface TreePrompt<N extends TreeNode> {
  placeholder?: string;
  /** Prefill — a rename starts from the current name. */
  initial?: (target: TreeTarget<N>) => string;
  /** The confirm button's label. */
  submit: string;
  /** A line above the field, e.g. showing what the value will produce. */
  hint?: (target: TreeTarget<N>, value: string) => ReactNode;
}

/** One entry of the right-click menu. */
export interface TreeAction<N extends TreeNode> {
  key: string;
  label: string | ((target: TreeTarget<N>) => string);
  /** Offered only when this returns true. Absent means always. */
  when?: (target: TreeTarget<N>) => boolean;
  /** Styled as destructive (Delete). */
  danger?: boolean;
  prompt?: TreePrompt<N>;
  /** `value` is the prompt's answer, or "" for a plain action. */
  run: (target: TreeTarget<N>, value: string) => void;
}

/** MIME of an internal row drag — what onMove listens for. */
export const TREE_DRAG_MIME = "application/x-frediverse-tree-path";

// Every ancestor prefix of a path, so the tree can open down to it.
function ancestorsOf(path: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!path || path === ".") return out;
  // The empty path — a synthetic ROOT row, which some callers wrap their nodes in to get a
  // visible top level. Every path sits under it, but prefix-building can never produce it, so
  // seeding expansion from this set alone re-seeded that row CLOSED and revealed nothing.
  out.add("");
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("/"));
  return out;
}

// Default file-drag test: the canonical "Files" entry, or an item of kind "file".
const defaultAcceptsFiles = (e: React.DragEvent): boolean => {
  const dt = e.dataTransfer;
  if (!dt) return false;
  if (Array.from(dt.types ?? []).includes("Files")) return true;
  return Array.from(dt.items ?? []).some((i) => i.kind === "file");
};

/**
 * Hand a drop to whichever handler the host gave, folders included.
 *
 * The entries are claimed SYNCHRONOUSLY (dropEntries) before anything is awaited: the
 * DataTransfer is emptied the instant this handler yields, and a walk that starts after an
 * `await` finds nothing. That is the bug this whole path exists to avoid.
 */
function dropInto(
  dir: string,
  e: React.DragEvent,
  onDropTree?: (dir: string, files: DroppedFile[]) => void,
  onDropFiles?: (dir: string, files: File[]) => void,
): void {
  if (onDropTree) {
    const entries = dropEntries(e.dataTransfer);
    const flat = Array.from(e.dataTransfer.files); // the fallback, also read before yielding
    void readDroppedFiles(entries).then((files) => {
      if (files.length) onDropTree(dir, files);
      // A browser with no entry API at all still drops plain files, which have no folders in them.
      else if (flat.length)
        onDropTree(dir, flat.map((file) => ({ path: file.name, file })));
    });
    return;
  }
  const files = Array.from(e.dataTransfer.files);
  if (files.length) onDropFiles?.(dir, files);
}

// A row drag carries the source path under our own MIME, so a move never looks like an upload.
const draggedPath = (e: React.DragEvent): string | null =>
  Array.from(e.dataTransfer?.types ?? []).includes(TREE_DRAG_MIME)
    ? e.dataTransfer.getData(TREE_DRAG_MIME) || ""
    : null;

// Moving a folder into itself (or into its own subtree) would orphan it.
const isInside = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

interface RowProps<N extends TreeNode> {
  node: N;
  depth: number;
  // Where a top-level row's drop lands. A leaf targets its PARENT folder, and a top-level leaf's parent is not
  // expressible as a prefix of its own path — it is the tree's root, which only the tree knows.
  rootPath: string;
  activePath?: string | null;
  open: Record<string, boolean>;
  dropTarget: string | null;
  onToggle: (path: string) => void;
  onOpen?: (node: N) => void;
  onDropTarget: (path: string | null) => void;
  onDropFiles?: (dir: string, files: File[]) => void;
  onDropTree?: (dir: string, files: DroppedFile[]) => void;
  onMove?: (from: string, toDir: string) => void;
  onContext: (node: N, e: React.MouseEvent) => void;
  acceptsFiles: (e: React.DragEvent) => boolean;
  icon?: (node: N, open: boolean) => ReactNode;
  isDisabled?: (node: N) => boolean;
  rowEnd?: (node: N) => ReactNode;
}

function Row<N extends TreeNode>(props: RowProps<N>) {
  const {
    node,
    depth,
    rootPath,
    activePath,
    open,
    dropTarget,
    onToggle,
    onOpen,
    onDropTarget,
    onDropFiles,
    onDropTree,
    onMove,
    onContext,
    acceptsFiles,
    icon,
    isDisabled,
    rowEnd,
  } = props;
  const pad = { paddingLeft: 8 + depth * 12 };
  const disabled = isDisabled?.(node) ?? false;

  // Both drops land on a folder, so one handler decides between them by what the drag carries.
  const dropHandlers = (dir: string) => ({
    // dragenter AND dragover: Firefox establishes the target on enter, so dragover alone refuses the first frames.
    onDragEnter: (e: React.DragEvent) => {
      if (!acceptsFiles(e) && draggedPath(e) === null) return;
      e.preventDefault();
      e.stopPropagation();
    },
    onDragOver: (e: React.DragEvent) => {
      const moving = draggedPath(e);
      if (moving !== null && (!onMove || isInside(moving, dir))) return;
      if (moving === null && !(acceptsFiles(e) && (onDropTree ?? onDropFiles)))
        return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = moving === null ? "copy" : "move";
      onDropTarget(dir);
    },
    onDrop: (e: React.DragEvent) => {
      const moving = draggedPath(e);
      if (moving !== null) {
        if (!onMove || isInside(moving, dir)) return;
        e.preventDefault();
        e.stopPropagation();
        onDropTarget(null);
        onMove(moving, dir);
        return;
      }
      if (!acceptsFiles(e) || !(onDropTree ?? onDropFiles)) return;
      e.preventDefault();
      e.stopPropagation();
      onDropTarget(null);
      dropInto(dir, e, onDropTree, onDropFiles);
    },
  });

  const dragProps = onMove
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.stopPropagation();
          e.dataTransfer.setData(TREE_DRAG_MIME, node.path);
          e.dataTransfer.effectAllowed = "move";
        },
      }
    : {};

  if (node.dir) {
    const isOpen = !!open[node.path];
    // The whole subtree is this folder's drop zone: a nested file bubbles up, a nested folder claims itself.
    return (
      <div {...dropHandlers(node.path)}>
        <div
          className={cn(
            "flex items-center pr-1",
            dropTarget === node.path &&
              "rounded bg-primary/20 ring-1 ring-inset ring-primary/60",
          )}
          style={pad}
          onContextMenu={(e) => {
            e.stopPropagation();
            onContext(node, e);
          }}
        >
          <button
            type="button"
            {...dragProps}
            onClick={() => onToggle(node.path)}
            className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                isOpen && "rotate-90",
              )}
            />
            {icon?.(node, isOpen) ??
              (isOpen ? (
                <FolderOpen className="h-4 w-4 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 shrink-0" />
              ))}
            <span className="truncate">{node.name}</span>
          </button>
          {rowEnd?.(node)}
        </div>
        {isOpen &&
          node.children?.map((child) => (
            <Row
              {...props}
              key={child.path}
              node={child as N}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  // A leaf can still be dragged, and drops onto it land in its parent folder — which for a TOP-LEVEL leaf is the
  // root, not "". Deriving it from the path alone sent those drops to an empty directory: uploads landed nowhere
  // the user was looking, and it only started happening once onMove gave leaves drop handlers at all. Before that
  // they had none and the drop bubbled up to the pane, which had the root right.
  const parent = node.path.includes("/")
    ? node.path.slice(0, node.path.lastIndexOf("/"))
    : rootPath;
  return (
    <div
      {...(onMove ? dropHandlers(parent) : {})}
      className={cn(
        "flex items-center",
        // On the wrapper, not the button: a row with a trailing badge would
        // otherwise be highlighted only up to where the badge starts.
        activePath === node.path && "bg-secondary",
      )}
    >
      <button
        type="button"
        {...dragProps}
        style={pad}
        // Not `disabled` — that swallows right-clicks, and an unopenable entry still wants Rename/Delete.
        onClick={() => !disabled && onOpen?.(node)}
        onContextMenu={(e) => {
          e.stopPropagation();
          onContext(node, e);
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-sm",
          disabled
            ? "cursor-default text-muted-foreground/50"
            : "text-foreground/80 hover:text-foreground",
          activePath === node.path && "text-foreground",
        )}
      >
        <span className="w-3.5 shrink-0" />
        {icon?.(node, false) ?? <FileIcon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {rowEnd?.(node)}
    </div>
  );
}

export interface FileTreeProps<N extends TreeNode> {
  nodes: N[];
  /** Highlighted row. */
  activePath?: string | null;
  /**
   * Open down to this path. When it CHANGES the tree collapses and re-opens
   * only its ancestors; when the nodes refresh under the same value the user's
   * own toggles are kept.
   */
  reveal?: string | null;
  /** Pinned into place above the tree, outside its scroll. */
  header?: ReactNode;
  /** Where a drop onto empty space lands, and what the background menu targets. */
  rootPath?: string;
  rootLabel?: string;
  actions?: TreeAction<N>[];
  onOpen?: (node: N) => void;
  /** Drop OS files into a folder. Omit and file drags are refused. FLAT: a dropped folder
   *  never reaches this, because `dataTransfer.files` cannot carry one. */
  onDropFiles?: (dir: string, files: File[]) => void;
  /** The same drop, with the FOLDERS kept — each file paired with its path inside what was
   *  dropped. Wins over `onDropFiles` when both are given; see lib/droppedEntries.ts. */
  onDropTree?: (dir: string, files: DroppedFile[]) => void;
  /** Move a row into a folder. Omit and rows aren't draggable. */
  onMove?: (from: string, toDir: string) => void;
  /** Trailing widget on a row (lanes's "open project", calepin's badges). */
  rowEnd?: (node: N) => ReactNode;
  /** Override the default folder/file icons. */
  icon?: (node: N, open: boolean) => ReactNode;
  /** Muted and not openable, but still right-clickable. */
  isDisabled?: (node: N) => boolean;
  /** The app's own file-drag test, when "does this carry files" isn't enough. */
  acceptsFileDrop?: (e: React.DragEvent) => boolean;
  /** The prompts' cancel button — the one string this package can't get from the app's catalogue. */
  cancelLabel?: string;
  className?: string;
}

export function FileTree<N extends TreeNode>({
  nodes,
  activePath,
  reveal,
  header,
  rootPath = "",
  rootLabel,
  actions = [],
  onOpen,
  onDropFiles,
  onDropTree,
  onMove,
  rowEnd,
  icon,
  isDisabled,
  acceptsFileDrop,
  cancelLabel = "Cancel",
  className,
}: FileTreeProps<N>) {
  const acceptsFiles = acceptsFileDrop ?? defaultAcceptsFiles;

  // Expansion per folder. Re-seeded only when `reveal` itself changes.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const prevReveal = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const anc = ancestorsOf(reveal);
    if (prevReveal.current !== reveal) {
      prevReveal.current = reveal;
      const next: Record<string, boolean> = {};
      const visit = (list: TreeNode[]) => {
        for (const n of list)
          if (n.dir) {
            next[n.path] = anc.has(n.path);
            if (n.children) visit(n.children);
          }
      };
      visit(nodes);
      setOpen(next);
      return;
    }
    if (!anc.size) return;
    // Same target, tree refreshed: keep it revealed without discarding the user's toggles.
    setOpen((o) => {
      let changed = false;
      const next = { ...o };
      for (const p of anc)
        if (!next[p]) {
          next[p] = true;
          changed = true;
        }
      return changed ? next : o;
    });
  }, [reveal, nodes]);

  const toggle = (path: string) => setOpen((o) => ({ ...o, [path]: !o[path] }));

  // The open menu: its target, where to draw it, and the action currently prompting.
  const [menu, setMenu] = useState<{
    target: TreeTarget<N>;
    x: number;
    y: number;
  } | null>(null);
  const [prompting, setPrompting] = useState<TreeAction<N> | null>(null);
  const [value, setValue] = useState("");

  const closeMenu = () => {
    setMenu(null);
    setPrompting(null);
    setValue("");
  };

  const offered = useMemo(
    () => (menu ? actions.filter((a) => a.when?.(menu.target) ?? true) : []),
    [menu, actions],
  );

  const openMenu = (target: TreeTarget<N>, e: React.MouseEvent) => {
    // Never an empty menu — if nothing applies, let the browser's own menu through.
    if (!actions.some((a) => a.when?.(target) ?? true)) return;
    e.preventDefault();
    setMenu({ target, x: e.clientX, y: e.clientY });
    setPrompting(null);
    setValue("");
  };

  const onContext = (node: N, e: React.MouseEvent) =>
    openMenu(
      { node, path: node.path, name: node.name, dir: !!node.dir, root: false },
      e,
    );

  const start = (action: TreeAction<N>) => {
    if (!menu) return;
    if (!action.prompt) {
      const target = menu.target;
      closeMenu();
      action.run(target, "");
      return;
    }
    setValue(action.prompt.initial?.(menu.target) ?? "");
    setPrompting(action);
  };

  const commit = () => {
    if (!menu || !prompting) return;
    const answer = value.trim();
    const target = menu.target;
    closeMenu();
    if (answer) prompting.run(target, answer);
  };

  // Dismiss on Escape; an outside click is caught by the backdrop below.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu]);

  return (
    <div
      className={cn(
        "h-full overflow-auto py-1",
        // The root drop takes empty space and top-level rows; ring the pane so it reads as a target.
        dropTarget === rootPath &&
          dropTarget !== null &&
          "ring-2 ring-inset ring-primary/60",
        className,
      )}
      onContextMenu={(e) => {
        // The background only: a right-click on a row is that row's, and it stops propagating first.
        if (e.target !== e.currentTarget) return;
        openMenu(
          {
            node: null,
            path: rootPath,
            name: rootLabel ?? rootPath,
            dir: true,
            root: true,
          },
          e,
        );
      }}
      onDragEnter={(e) => {
        if (!acceptsFiles(e) && draggedPath(e) === null) return;
        e.preventDefault();
      }}
      onDragOver={(e) => {
        const moving = draggedPath(e);
        if (moving !== null && !onMove) return;
        if (moving === null && !(acceptsFiles(e) && (onDropTree ?? onDropFiles)))
          return;
        e.preventDefault();
        e.dataTransfer.dropEffect = moving === null ? "copy" : "move";
        setDropTarget(rootPath);
      }}
      onDragLeave={(e) => {
        // Clear only when the pointer really left the pane — a move between children keeps relatedTarget inside.
        if (
          !e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)
        )
          setDropTarget(null);
      }}
      onDrop={(e) => {
        const moving = draggedPath(e);
        if (moving !== null) {
          if (!onMove) return;
          e.preventDefault();
          setDropTarget(null);
          onMove(moving, rootPath);
          return;
        }
        if (!acceptsFiles(e) || !(onDropTree ?? onDropFiles)) return;
        e.preventDefault();
        setDropTarget(null);
        dropInto(rootPath, e, onDropTree, onDropFiles);
      }}
    >
      {header}

      {nodes.map((n) => (
        <Row
          key={n.path}
          node={n}
          depth={0}
          rootPath={rootPath}
          activePath={activePath}
          open={open}
          dropTarget={dropTarget}
          onToggle={toggle}
          onOpen={onOpen}
          onDropTarget={setDropTarget}
          onDropFiles={onDropFiles}
          onDropTree={onDropTree}
          onMove={onMove}
          onContext={onContext}
          acceptsFiles={acceptsFiles}
          icon={icon}
          isDisabled={isDisabled}
          rowEnd={rowEnd}
        />
      ))}

      {menu && (
        <div className="fixed inset-0 z-50" onPointerDown={closeMenu}>
          <div
            style={{ left: menu.x, top: menu.y }}
            className="fixed min-w-[11rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {prompting?.prompt ? (
              <div className="px-2 py-1">
                {prompting.prompt.hint && (
                  <div className="mb-1 text-xs text-muted-foreground">
                    {prompting.prompt.hint(menu.target, value)}
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
                    else if (e.key === "Escape") closeMenu();
                  }}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="mt-1 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={closeMenu}
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
            ) : (
              offered.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => start(action)}
                  className={cn(
                    "block w-full px-3 py-1 text-left hover:bg-accent",
                    action.danger
                      ? "text-destructive"
                      : "hover:text-accent-foreground",
                  )}
                >
                  {typeof action.label === "function"
                    ? action.label(menu.target)
                    : action.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
