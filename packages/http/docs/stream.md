# Serving a file: validators and caching

`streamFile` (`stream.ts`) serves a file with Range support, and every answer carries an `ETag`
and a `Last-Modified`. A media player replays, seeks and reloads the same file all the time; with
a validator, each of those after the first costs a 304 instead of the whole file again.

## The tag is weak, and made of size and modification time

The tag is `W/"<size>-<mtime>"`, in hex. It is computed from the `stat` the function already
makes, so it costs no read of the file. It is WEAK because it does not prove two files are byte
for byte the same: a rewrite that keeps the size inside one modification-time tick keeps the tag.
That is the same trade the static file servers of Express make.

## Cache-Control defaults to `private, no-cache`

The files served this way can change in place — a song replaced, a recording re-cut — and they
sit behind a login. So the default lets the browser KEEP the bytes but ask before every use:
`private` keeps a shared proxy from storing them, `no-cache` forces the conditional request the
validator answers. A caller that knows better sets its own `Cache-Control` before calling, and it
is left alone.

## Conditional requests

- **`If-None-Match`** wins over `If-Modified-Since` and is compared weakly, as that header asks:
  `"x"` and `W/"x"` match. A match is a 304 with the validators and no body, for GET and HEAD only.
- **`If-Modified-Since`** applies only when no tag is sent; the file's time is floored to the
  second, since an HTTP date has no finer precision.
- **`If-Range`** decides whether a `Range` still applies. A tag must equal ours exactly; a date
  must equal our `Last-Modified`. Anything else means the client's piece belongs to an older file,
  so it gets the whole new file as a 200 rather than a 206 it would splice into the wrong bytes.
  Taking a weak tag here is looser than the specification, which asks for a strong comparison;
  it is what Express's own static server does, and a tag that changes with the file is enough.

`fileEtag` and `notModified` are exported for a route that answers with something DERIVED from a
file rather than the file itself, so it can use the same validators.
