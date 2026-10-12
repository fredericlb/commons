# commons

The shared base of the frediverse monorepos. Consumed as a **git submodule**
mounted at `commons/` by [studio](../studio) (radiok7, lanes, z0) and
[phare](../phare) (vestibule, calepin, routine, douane, labs).

```
packages/   @frediverse/{ui,i18n,http,oidc,db-grist,electron-shell}   — runtime libraries
dev/        @frediverse/{api-client,env,vite-config,tsconfig,docker-runtime}
scripts/    caddy.mjs, build-images.sh, check-image-closure.cjs, i18n-migration/
caddy/      global.caddy — the one Caddy global-options block
.storybook/ the design-system Storybook (packages only, no app stories)
```

Packages here are used as **raw TypeScript source** — the `exports` fields point
at `.ts`/`.tsx` and there is no build step. That is deliberate: editing a shared
component is immediately visible in the consuming app, with no publish cycle.
Adding a build step to a package here means adding one to both consumers.

## Working on it

```bash
npm ci
npm run lint
npm run test
npm run storybook
```

Standalone, this repo only lints, tests and renders its Storybook — it has no
app to run.

## From a consumer repo

The submodule is a real checkout of this repo, so you edit it in place:

```bash
cd commons && git commit -am "…" && cd ..
git add commons && git commit -m "bump commons"
```

`push.recurseSubmodules=on-demand` is set in both consumers, so pushing the
parent pushes commons first — without it you'd publish a pointer to a commit
nobody else can fetch. To pick the change up in the other repo:

```bash
npm run commons:sync
```

The two checkouts drift between syncs; that's expected. The submodule pointer
recorded in each consumer is the source of truth for which version an app uses.

## Docs

- [docs/caddy.md](docs/caddy.md) — how one Caddy serves sites from several repos
- [docs/images.md](docs/images.md) — the two Docker build contexts, and why
