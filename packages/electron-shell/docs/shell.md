# The Electron shell

What a desktop app on Electron shares: it runs an app's hosted Node servers on the user's machine,
unchanged, behind one window. It holds nothing about any one app: what is an app's own stays in that app's tree.

| subpath | what it holds |
|---|---|
| `servers` | a server started with Electron as its node — under tsx, or bundled — waited for, stopped |
| `guard` | the entry that leads each server's process group — built beside the main process |
| `log` | one merged log, every line prefixed by who said it |
| `boot` | the ports checked free, the session secret kept across launches |
| `window` | the window, and which links stay in it |
| `external` | `openExternalSafely`, the one way a URL reaches the OS |
| `permissions` | the session's permission handlers, request and check |
| `policy` | the two decisions behind those, pure: which URL may leave, which frame gets a permission |
| `lifecycle` | one copy of the app, a boot that reports its failure, a quit that waits |
| `build`, `start`, `builder` | the esbuild bundle, the unpackaged run, the electron-builder base |

## The servers run unchanged

**Under tsx, as children — the way their Docker images run them** — or, when the app hands a
bundle and no `tsx`, that bundle run by node as it is. Under tsx the packaged app carries source
plus `node_modules` and a server behaves exactly as in production, at the cost of size and a
compile on every start; a bundle is the app's choice when that cost matters.

**Electron is their node**, through `ELECTRON_RUN_AS_NODE=1`. It is inherited, and that is
load-bearing: a server that spawns with `process.execPath` gets Electron, and only that variable
keeps it node. VS Code's terminals export the same variable, which is why `start` clears it for
the app itself: with it set, Electron opens no window.

**A server's cwd is never a checkout.** `@frediverse/env` reads the nearest `env.yaml` above the
cwd and lets it outrank the environment, so a dev checkout's settings would otherwise win.
`TSX_TSCONFIG_PATH` keeps each server on its own tsconfig.

## Each server dies with the app

**Each server is a process group led by a guard**, stopped as one: a server need not handle any
signal, and what it spawned would outlive it. The guard's stdin is a pipe from the main process
that nothing writes. The OS closes it however that process ends — Quit, a crash, Force Quit,
SIGKILL — and the guard then stops its group.

Stopping from the main process alone is not enough: a main process that dies never runs its
shutdown, and its detached children keep the ports, which the next launch reports as already in
use. A server that exits on its own takes its group with it for the same reason.

**The server is asked first, alone; the group after it.** A server that spawned children of its
own (k7's backend runs a file service per account) stops them in the order it needs, and a
SIGTERM to the whole group would race it: a child killed before its parent asked it to stop is a
write cut in half. So the guard asks the server only — its stdin closed, and SIGTERM where there
is one — and gives it `SERVER_GRACE_MS` (`src/stopTimes.ts`), longer than any server here needs
for its own stop. When the server exits, or the grace is up, whatever is left of the group gets
SIGTERM, then SIGKILL after `SWEEP_GRACE_MS`. The main process waits for the guard longer than
both before it kills the group itself.

**On Windows the graceful stop is stdin.** There is no SIGTERM there: Node's `kill` and
`taskkill /F` both end a process on the spot. The guard sets `ELECTRON_SHELL_STDIN_STOP=1` in
the server's environment and gives it a stdin pipe; a server that reads the variable treats
the end of its stdin as its stop signal, and should delete the variable so its own children do
not inherit it. `taskkill /T /F` comes only once the grace is up.

**Quit waits for the app's `stop`, and only so long.** `lifecycle` holds Electron's quit until
it resolves, so the app decides the order its children go down in. A `stop` that throws or hangs
past `stopTimeoutMs` still ends in `app.exit(0)`: an app that never exits is worse than a server
stopped by its guard, which closing the app's pipes does anyway.

**The pages write first.** Before `stop`, every page is asked to run `globalThis.__beforeQuit`,
when it has one, and the quit waits for its promise up to 3 s. A page that holds typed text not
yet on disk sets it, since the servers it writes through are about to go. The shell names no
page: a page without the hook is simply not asked.

## The window

An app's own pages open as more windows of the app, with the same `webPreferences` — a preload
among them, which a page opened by `window.open` would otherwise not get. Anything else opens in
the system browser, and a navigation away from the app's pages is turned into the same: a
desktop app is not a browser, and has no address bar to come back with. A window a page opens
is guarded exactly like the first one, since it can navigate and open windows in turn.

## What reaches the OS

**Only `http:`, `https:` and `mailto:` are handed to `shell.openExternal`, never with a
credential in the URL** (`externalUrl` in `src/policy.ts`). The OS answers every scheme it has a
handler for: `file:` runs or reveals a local file, `smb:` leaks the user's NTLM hash to a remote
share, `ms-msdt:` and `search-ms:` have been remote code execution on Windows, and any app can
register one of its own. A page that calls `window.open` needs no click to reach that path, so
an app calls `openExternalSafely` and never `shell.openExternal` itself. A refused URL is logged by
its scheme alone and dropped.

## Permissions

**An app that hosts its pages installs `installPermissions` on its session.** Without a
handler, Electron grants every permission to every frame — a foreign iframe's geolocation and
notifications included. The handlers answer the request and the check alike, since most web APIs
check first and some only check.

A permission is granted when it is listed, the frame asking is on one of the app's origins, and
so is the page at the top of its tree. Its scope then says which frame: `top` for the app's top
frame alone, `app` for any of the app's frames inside one of its pages. The defaults are:

| permission | scope | why |
|---|---|---|
| `media` | `top` | a mic or a camera, for the page the user is looking at |
| `clipboard-sanitized-write` | `top` | a Copy button |
| `fullscreen` | `app` | an element made fullscreen; an iframe still needs `allowfullscreen` |

An app adds or widens what it needs (`grants`); everything else is refused, `geolocation`,
`notifications`, `clipboard-read`, `display-capture`, the device APIs and `openExternal`
among them. An external protocol a page navigates to (`openExternal`) is refused to Chromium and,
when an app frame asked, handed to `openExternalSafely` instead, so a `mailto:` link still works.

## Building and packaging

**The main process is bundled to CommonJS**, since Electron's ESM main is awkward around
`__dirname`, which `servers` needs to find the guard. The guard is built beside it, and
**unpacked from the asar**: a child node reads it from disk, and only Electron's own process reads
inside an asar.

**The app's `staging/` is copied into Resources from `afterPack`**, because electron-builder's
`extraResources` silently drops every directory named `node_modules`. `npmRebuild` is off:
nothing native loads in Electron's own process, and the servers' dependencies are staged with
their own install.

**`ELECTRON_DIST=<unpacked dist>`** points electron-builder at an Electron already on disk, for
the machines where its download keeps failing.
