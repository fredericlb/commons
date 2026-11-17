# The shared Caddy

Every app is served over HTTPS on a `.test` domain in development, fronted by a
single Caddy instance. That instance is started by `scripts/caddy.mjs`, which
each repo exposes as `npm run caddy`.

## Why the config is merged

Caddy binds `:80` and `:443`. Only one process can, so there cannot be one
Caddy per repo — the second would fail to bind, or (worse) the second
`npm run caddy` would see the first one answering on the admin API and exit
believing its work was done, leaving its own sites unserved.

The apps also can't share one checked-in Caddyfile any more: `studio` and
`phare` are separate repos and neither can see the other's sites.

So the config is assembled at run time from three sources:

| source | holds |
|---|---|
| `commons/caddy/global.caddy` | the global options block |
| `<repo>/Caddyfile` | the site blocks of the repo you're in |
| `../studio/Caddyfile`, `../phare/Caddyfile` | the sibling repo's sites, if cloned |

The result is written to a temp file and handed to Caddy. Global options may
appear only once in a Caddyfile, which is exactly why they live in commons and
not in either repo.

This works as a plain concatenation because **ports are unique across every
app** — 5173/5183/5193/5203/5213/5223/5233 for the SPAs, 8787–8791 and 3001–3006
for the backends. Adding an app means picking a port no other repo uses.

## Reload, not skip

If Caddy is already up, the script pushes the merged config with
`caddy reload` instead of exiting early. That matters: the running instance may
have been started from the sibling repo before yours was cloned, so "already
running" does not mean "already serving your sites".

## Sibling discovery

The sibling repos are listed explicitly (`SIBLING_REPOS` in the script) rather
than discovered by scanning. The repos sit directly in `Src/` alongside
unrelated projects, and a stray `Caddyfile` in one of those should never end up
in the served config.

If a sibling isn't cloned, you simply get your own sites — no error.
