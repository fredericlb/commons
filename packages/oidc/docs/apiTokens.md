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

`fileTokenStore(file)` is a JSON file, and `memoryTokenStore()` the same in memory, for tests. Any
object with the `ApiTokenStore` methods fits.

## Several processes on one file

Two processes may serve the same users from the same file — two backends, or a backend and a tool
beside it — so the file, not a process's memory, is the list of tokens:

- **A check costs one `stat`.** Verification runs on every request, so the store keeps the parsed
  file and parses it again only when its inode, modification time or size changed. A token minted
  or revoked by another process counts from that process's write.
- **Every write is read, merge, write.** Minting and revoking re-read the file, apply that one change
  and replace the file by a rename, so a write never carries a stale copy of the other process's
  tokens: it neither erases a token minted elsewhere nor brings back one revoked elsewhere.
- **`lastUsed` is the one thing held back**, written at most once a minute, and only onto the records
  the file still lists. It is a hint shown to the owner; losing a minute of it costs nothing.
- **No lock.** Two writes in the same instant can still lose one of them. Writes are rare (a mint, a
  revoke, a minute's last uses) and synchronous, and Node has no portable file lock, so the window
  of one write is accepted rather than adding a lock file that a crash would leave behind.

Ephemeral tokens (below) are a process's own and never reach the file.

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
