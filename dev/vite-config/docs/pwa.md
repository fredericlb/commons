# The service worker every app gets

`defineAppConfig` adds `vite-plugin-pwa` to every frediverse app. What it buys is a **second
opening** — the assets are precached, so the app starts from disk instead of downloading its
bundle again, the page itself being one small request — and **installability**: with no worker, no browser offers to add
the app to a home screen.

It does not buy offline, and that is not an oversight. These apps read their state from a backend;
a cached shell with no backend behind it can only draw the error it already draws.

## What the app must provide

The preset generates **no** manifest (`manifest: false`). The name, the icons and the `start_url`
are the app's identity, not a preset's — and st0 carries two, swapped by page
(`apps/st0/frontend/docs/external.md`). So an app wants:

- `public/manifest.webmanifest`, with **relative** URLs: a manifest resolves its addresses
  against its own, not the document's, so an absolute `/…` escapes the app as soon as it is
  mounted under a prefix;
- 192 and 512 PNG icons, at the size they declare — a browser silently refuses one whose header
  does not match;
- `<link rel="manifest">` in its `index.html`;
- the registration, in its entry:

```ts
import { registerWorker } from "@frediverse/vite-config/register";

if ("serviceWorker" in navigator) registerWorker();
```

`injectRegister: null` is deliberate: a `<script>` injected by the plugin would put that decision
outside the file that decides everything else about the document.

## The scope, and why only one app needs `pwaDenylist`

A worker's scope is the folder it was served from, and it is a **prefix**: there is no way to say
"everything but `/pl8`".

An app mounted under a `base` therefore controls only its own prefix and has nothing to declare.
An app served at the **origin's root** controls everything, its neighbours included — and if its
`navigateFallback` answers their navigations, they serve its shell: a white page with its router
refusing an address it cannot read.

Hence `pwaDenylist`, which only the root app passes. In studio that is st0:

```ts
pwaDenylist: [/^\/(pl8|k7|z0|api|auth)(\/|$)/],
```

It is the same table as the image's `nginx.conf`. Two copies of one fact, and this is the one a
browser enforces — **check it first** if a neighbouring app ever serves the root app's shell.

## The shell comes from the network, the assets from the precache

In a build, a navigation asks the **network** for `index.html`, and a shell from disk answers only
when the network does not: offline, or past `SHELL_TIMEOUT_S` — the one last fetched for that
address, else the precached one. The handler is `NetworkFirst` because Workbox allows a timeout on no
other, and its cache keeps a 200 only: a navigation can answer a redirect, and replaying one is a
login loop. Everything the
shell then loads is hashed, so it comes from the precache when the worker has it and from the server
when it does not.

Answering navigations from the precache instead — Workbox's `navigateFallback` — starts every
opening on the build the INSTALLED worker holds, which after a deploy is the previous one. The new
build reaches the page only once the new worker has downloaded the whole precache and taken over,
and that costs twice:

- every start after a deploy runs the old build, then reloads onto the new one a few seconds later
  — on a phone, the time the precache takes to download;
- a precache that takes longer than the startup window leaves the old build running against the
  new server, and a reload brings back the same old shell. Only a hard reload, which skips the
  worker, gets past it.

`directoryIndex: null` belongs to the same choice: by default the precache route reads `/` as
`index.html` and answers it from disk before any other route is asked, so the app's own root
address would still start on the previous build.

The page is one small request, so asking the network for it costs a round trip where the precache
cost nothing, and that is the price of starting on the build that is deployed. A matcher spells
`pwaDenylist` into its own source, since Workbox copies the function's text into the worker. In dev
the precache is empty but for the fallback, so dev keeps `navigateFallback`, limited to `/` there.

## Every deploy reaches every open tab

A tab is left open for days, and a tab still running a bundle from before a protocol change talks to
a server that no longer answers it the same way. So a new build must replace the old one without
anyone having to close every tab of the origin — which is the only moment a waiting worker would
otherwise activate.

How it is replaced is what matters. `autoUpdate` sets `skipWaiting` + `clientsClaim`, so a new worker
takes over a tab that keeps RUNNING the old shell, while the precache is the new build's: the next
lazily loaded chunk is a hashed file that no longer exists. So the preset keeps
`registerType: "prompt"` — the new worker waits — and `register.ts` makes the swap whole:

- it tells the waiting worker to take over, and **every page of the scope reloads** onto the new
  bundle. A reload is the whole page, so no old shell is left asking for chunks;
- **except a tab that already runs the new build** — its shell came from the network. Its hashed
  entry script is named in the waiting worker's precache manifest (`sw.js`), so the swap is silent:
  reloading it would only start again what is on screen. Such a tab never holds the swap either,
  since it costs that tab nothing;
- **the swap is everyone's decision**, because it reloads every page at once — tabs, and on Android
  the separate WebViews of k7, the médiathèque and the recorder, which share one worker. Before
  telling the worker, a page asks the others over a `BroadcastChannel`; any page **in use** answers
  "hold", and the swap waits. In use means visible past its first ten seconds, or marked busy by
  the app (below). A page that held says "free" once it is hidden and idle, and whoever has an
  update pending asks again. The rules are `src/updateGate.ts`, without a DOM so they are tested;
- **when**: an update found at startup applies at once, nothing having been done in the tab yet;
  one found later — a tab asks every half hour, navigations ask on their own — waits until no page
  is in use, so a deploy never reloads a page under someone's hands;
- a page the new worker takes over anyway — a race with the question, a browser without
  `BroadcastChannel` — reloads at once if free, and otherwise at its next moment free.

**Busy.** Visibility is not enough for an app that plays or records: a set playing in a hidden
tab, a take recording with the screen off. Such an app marks itself:

```ts
import { setUpdateBusy } from "@frediverse/vite-config/register";

setUpdateBusy(playing || recording);
```

called whenever that state changes. A busy page holds the swap even hidden, and never reloads.

**The trade-off.** A page that defers its reload runs the old shell under the new worker, whose
precache is the new build's: the next lazy chunk it asks for no longer exists. The app's
missing-chunk handler (k7's `chunkReload.ts`) reloads it once at that moment,
busy or not. That window only opens on a race, and the reload then comes from a click that opened
something, not from a deploy landing in the middle of a song. An app with no such handler shows its
pane's error instead.

What a hidden reload costs is the app's in-memory state. An app that holds work only in memory
must save it before it can afford this, or stay busy while it holds it.

## Registered once the page is idle

`registerWorker` registers after `load`, in an idle moment: installing a worker downloads the whole
precache, and on a first visit over mobile data that competes with the first screen's own chunks.
The second opening is what the worker buys, so the first one owes it nothing.

## `pwaPrecacheIgnore`: heavy files few sessions open

The precache downloads everything the build emits, at every first start and every deploy. An app
with heavy chunks that most sessions never load passes their globs (relative to the build folder):

```ts
pwaPrecacheIgnore: ["assets/verovio-module-*.js", "assets/*-cyrillic*"],
```

What it buys is the install's weight; what it costs is that a left-out file is fetched from the
network the first time it is used. A hashed file under `assets/` is then kept by a `CacheFirst`
runtime route (a hashed name never changes content, so the first copy is the last), capped at 40
entries; an unhashed one rests on the HTTP cache. The list is the app's, since only the app knows
which of its screens are rare — k7's is `RARELY_USED` in its `vite.config.ts`. Both apply to a build
only, the dev worker precaching nothing; the route sits after the shell's, which only navigations match.

## `clientsClaim` in dev only

A browser offers installation only once a worker **controls** the page. Without `clients.claim()`,
the first visit registers one that controls nothing: the affordance appears only at the **second**
navigation.

On a desktop people reload by reflex and nobody notices. On a tablet they do not — and that is the
device a PWA exists for. In dev there are no hashed assets, so nothing to desynchronise: the claim
is free there. In a build it stays off, for the reason above.

`IS_BUILD` is read from the command line because `defineAppConfig` returns an object and offers no
`({ command })` to capture.

## `devOptions.enabled: true`

Otherwise there is **no** worker in dev, and the browser never offers installation — while the
manifest, the icons and HTTPS are all in place, so everything looks ready. The one thing this
plugin is for would be testable only in a build.

The dev worker precaches nothing (there are no hashed assets before a build) and Workbox restricts
its navigation fallback to `/` alone there, so Vite's module URLs go past it.

## When `pwa: false`

For an app that is not a screen: an internal tool served in an iframe, a page that should not be
offered for installation. It is not the common case — by default a frediverse app installs.

## Mixed content makes an app uninstallable

An HTTPS page that loads the smallest resource in the clear is flagged "includes resources that are
not secure", and **that alone makes it uninstallable**. The certificate can be perfect, the manifest
complete, the icons valid: nothing helps.

Looking at the certificate is the reflex, and it is a dead end. The site information panel tells
the two apart: a certificate problem says so; mixed content says "resources that are not secure".
Read that line first.
