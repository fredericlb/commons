# Personal access tokens

A token is `payload.signature`: an HMAC-SHA256 over `{v: 2, jti, sub, iat, exp}`, for a client with
no cookie jar (`apiToken.ts`). `jti` is random, and it is what makes one token revocable without
touching the others.

## The store decides

- **With a store** (`createApiTokens(secret, { store })`), a token is valid only while its `jti` is
  listed there for the same subject and has not expired. Revoking is removing the record. The store
  keeps the id, subject, label, creation, expiry and last use — never the token, which the owner
  sees once, when it is minted.
- **Without a store**, a token is valid until it expires and cannot be revoked one by one; rotating
  the secret is the only way to kill them. That is the scheme for a service that has nowhere to keep
  a list.

`fileTokenStore(file)` is a JSON file read once and answered from memory, since verification runs
on every request; `lastUsed` is written back at most once a minute. `memoryTokenStore()` is the
same in memory, for tests. Any object with the `ApiTokenStore` methods fits.

## Ephemeral tokens

`issue(sub, { ephemeral: true })` mints a token held in this process's memory only, with no
expiry, and never listed. It is for a token handed over in code — to a child process or a mount
beside this one — which nobody must manage, and which dies when the process does.

## Lifetime and format

The default lifetime is 90 days (`API_TOKEN_TTL_MS`), set per scheme with `ttlMs` or per token at
issue. A token without `jti` — the `{sub, iat}` format — is refused even when its signature is
good: it can be neither listed nor revoked, and its owner mints a new one.

## Minting

A token is minted behind the cookie session, by a POST, never by a GET: a GET is something a link
or an image can make a browser send. A token never mints another.
