# `FileTree` — the shared tree sidebar

`@frediverse/ui/file-tree` is lanes's workspace sidebar with everything
lanes-specific lifted out into props. calepin's note tree is the same
component, so the two behave identically instead of drifting.

## What it owns

- **Expansion state**, seeded from `reveal`. When `reveal` *changes* the tree
  collapses and re-opens only that path's ancestors; when the nodes refresh
  under the same `reveal`, the user's own toggles survive. Lanes wants the
  first behaviour on a project switch and the second on every 2 s poll — one
  prop covers both, and getting it wrong is how a sidebar "randomly" collapses.
- **The right-click menu**, including the inline prompt some entries need
  (rename, new file). A menu with nothing to offer does not open at all: an
  empty grey box you have to dismiss is worse than the browser's own menu.
- **Drag and drop**, of two kinds that land on the same folder rows:
  - an **OS file drag** → `onDropFiles(dir, files)`;
  - an **internal row drag** → `onMove(from, toDir)`, carried under
    `TREE_DRAG_MIME` so the two can never be confused. A folder dropped into
    its own subtree is refused before `dragover` calls `preventDefault`, so the
    cursor says "no" instead of the drop silently doing nothing.

  Each is opt-in: omit the handler and that drag is refused. Rows are only
  `draggable` when `onMove` is given.

## What it does not own

The node type. `TreeNode` is the minimum (`name`, `path`, `dir?`, `children?`)
and the component is generic over anything extending it, so lanes keeps
`kind`/`project` on its `FileNode` and gets them back in `rowEnd`, `icon`,
`isDisabled` and every action.

Nor the strings: actions carry their own labels, already translated by the app.
The single exception is the prompts' Cancel button (`cancelLabel`), which
belongs to machinery no app renders itself.

## `dragover` and `preventDefault`

A `dragover` handler that does not call `preventDefault()` refuses the drop —
silently, with no error and no handler ever firing. That is why the accept
tests run on *every* `dragover` rather than once on `dragstart`, and why
`dragenter` is handled too: Firefox establishes the target on enter, so
`dragover` alone refuses the first frames of a drag.

Browsers also disagree about what a `DataTransfer` exposes mid-drag: some
populate `types` with `"Files"`, others only `items[].kind === "file"`. The
default test accepts either. An app with a stricter rule — lanes refuses its
own page-local parameter drags — passes `acceptsFileDrop`.
