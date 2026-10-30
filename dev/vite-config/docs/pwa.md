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

- it tells the waiting worker to take over, and **every tab it controlled reloads** onto the new
  bundle. A reload is the whole page, so no old shell is left asking for chunks;
- **except a tab that already runs the new build** — its shell came from the network. Its hashed
  entry script is named in the waiting worker's precache manifest (`sw.js`), so the swap is silent:
  reloading it would only start again what is on screen;
- **when**: an update found at startup applies at once, nothing having been done in the tab yet;
  one found later — a tab asks every half hour, navigations ask on their own — waits until that tab
  is hidden, so a deploy never reloads a page under someone's hands;
- any OTHER tab reloads the moment the new worker takes over, visible or not: left running, it
  would be the old shell over the new precache.

What a hidden reload costs is the app's in-memory state. An app that holds work only in memory
must save it before it can afford this.

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
