# An app under a prefix answers its bare prefix

An app served under a `base` — douane at `/f`, the médiathèque at `/pl8` — has a prefix that
people **type, bookmark and link**. `/pl8` and `/pl8/` are the same place to everyone but a
server, so both have to work.

Vite alone does not make them work. Its base middleware redirects only `/` and `/index.html`;
anything else outside the base gets a **404 whose body suggests the slashed form**. That page
reads like a dead link at exactly the moment the address was correct, and the app it belongs to
is one keystroke away. `defineAppConfig` therefore installs a middleware that answers the bare
prefix with a redirect to `base`, query string carried across.

## Why a redirect and not a second mount

The slashed form stays **canonical**: it is what `base` says, what the built `index.html`
resolves its assets against, and what a router takes as its basename. Serving the shell at the
bare prefix too would give the app two addresses with one of them subtly different — a router
whose basename ends in `/` does not match a location that does not, so the app would mount and
render nothing.

One redirect keeps a single canonical address and costs a round trip on a path nobody links
twice.

## Dev is the half that was missing

The edge already does this in production — each app's prefix carries an exact-match rule that
redirects to the slashed form. This plugin is the dev-server equivalent, so an address behaves
the same in both places, which is the only way the dev session is worth trusting.

It is installed from the body of `configureServer`, not from the function that hook returns:
that is what puts it **ahead** of vite's internal middlewares, and the base middleware is the
one it has to beat.

The redirect is a **302**. A 301 to a fixed dev port is cached by the browser past the life of
the base it was issued for, and the way out of that is a manual cache purge on a machine where
nothing looks wrong.
