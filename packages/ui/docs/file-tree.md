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

  `additiveReveal` drops the collapse: a `reveal` change still opens the
  target's ancestors but every other toggle stays as the user left it. That is
  for a tree that must remember where it was — calepin's phone layout swaps
  the tree out for the selected note and back (`reveal` passing through
  `null`), and the reset would fold everything on every round trip.

  `open` + `onOpenChange` hand the map itself to the caller: every write —
  toggles and reveals alike — comes back through the callback, and the tree
  renders whatever it is given. That is what persistence needs, and it stays
  outside this component on purpose: only the app knows where folds may be
  kept (calepin hashes them into localStorage rather than write plaintext
  paths to disk). Pass both or neither — `open` alone is a frozen tree.

  A caller that wraps its nodes in a **synthetic root row** — one whose `path`
  is `""`, which is the only way to get a visible top level, since `rootLabel`
  only names the background menu's target — is covered too. Prefix-building
  cannot produce `""`, so seeding from the ancestors alone re-seeded that row
  CLOSED and revealed nothing at all; the empty path is now treated as the
  ancestor of everything. A tree with no such row is unaffected: nothing reads
  the extra key.
- **The right-click menu**, including the inline follow-up some entries need:
  a typed `prompt` (rename, new file) or a yes/no `confirm` — mutually
  exclusive, and an entry with neither runs the moment it is picked. `confirm`
  exists for an action too destructive for one click but with nothing to type
  (deleting a folder that is not the one thing selected, so there is no name
  to echo back as a prompt's answer would). A menu with nothing to offer does
  not open at all: an empty grey box you have to dismiss is worse than the
  browser's own menu.
- **Drag and drop**, of two kinds that land on the same folder rows:
  - an **OS file drag** → `onDropFiles(dir, files)`, or `onDropTree(dir, files)`
    when the app can take folders (see below);
  - an **internal row drag** → `onMove(from, toDir)`, carried under
    `TREE_DRAG_MIME` so the two can never be confused. A folder dropped into
    its own subtree is refused before `dragover` calls `preventDefault`, so the
    cursor says "no" instead of the drop silently doing nothing.

  Each is opt-in: omit the handler and that drag is refused. Rows are only
  `draggable` when `onMove` is given.

## Dropping a FOLDER

`dataTransfer.files` is a flat `FileList` and **cannot carry a directory** — a
dropped folder arrives in it as an entry that will not read, or not at all. So
an app whose content is folder-shaped (studio's modules are three files in a
folder) got nothing from a folder drop, with no error to explain it.

`onDropTree(dir, files)` is the same gesture read properly: each file paired
with the path it sat at inside what was dropped, so `audio/reverb/` arrives as
`audio/reverb/module.yaml` and its siblings. It wins over `onDropFiles` when
both are given, and falls back to the flat list on a browser with no entry API.

Two traps live in `lib/droppedEntries.ts`, both of which fail *silently*:

- `dataTransfer.items` is emptied the instant the drop handler yields, so the
  entries must be claimed **before** anything is awaited. A walk that starts
  after an `await` finds an empty list.
- `readEntries()` answers a **batch** (100 in Chrome), not the whole directory.
  It has to be called until it answers an empty one, or a big folder arrives
  quietly truncated.

## A folder that is also a thing you open

Clicking a folder row folds it. That is right for a *place*, and wrong for a
folder that is one **thing** — studio's modules are a folder holding a
definition and the assets it loads, and the point of the row is to open the
module.

`opensOnName(node)` marks those rows: the chevron folds them, and the name
calls `onOpen` like a leaf's does. It also makes them highlight on `activePath`,
since a row you select is a row that should look selected.

Two targets on one row is a cost, so it is opt-in and off by default — omit the
prop and every folder folds on click, exactly as before. Reach for it when the
alternative is making the row a leaf, because a leaf cannot hold children and,
more quietly, cannot be a **drop target**: a drop on a leaf lands in its parent,
so a folder you can drop *into* has to be a folder.

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
