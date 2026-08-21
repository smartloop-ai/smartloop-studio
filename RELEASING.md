# Releasing Smartloop Studio

How a production release is cut, who has to click what, and which GitHub Action
triggers which. There are only **four manual touch-points** — everything else is
automatic.

## TL;DR

1. **Dispatch "Release Prod"** → it bumps versions and opens a PR into `main`.
2. **Merge that PR.**
3. Merging **auto-tags `main` and builds/uploads all platforms**, then posts a
   *draft* release to the API. (No further clicks.)
4. **Publish the draft** when you're ready — that's what makes it go live in the
   auto-updater.

## The three workflows

| Workflow | Role | Triggers |
|---|---|---|
| `release-prod.yml` | **Orchestrator.** Bump → PR; then on merge: tag + build. | `workflow_dispatch` **and** `push` to `main` |
| `build-and-deploy.yml` | **Builder.** Compiles + signs all platforms, uploads to GCP, drafts the release. The only workflow that writes the release bucket. | `workflow_call` (from release-prod) **and** `workflow_dispatch` |
| `bump-framework.yml` | Legacy standalone version-bump PR opener. See [gotcha](#gotcha-two-bump-doors). | `workflow_dispatch` only |

Key point: **`release-prod.yml` triggers `build-and-deploy.yml`** (via
`workflow_call`) — you never dispatch the builder yourself for a prod release.

## Standard production release

### Step 1 — dispatch "Release Prod" (manual)

Actions → **Release Prod** → **Run workflow**. Inputs (both optional):

- `electron_version` — the app version in `package.json`. Blank = patch bump.
- `agent_version` — the SLP framework version. Blank = patch bump.

The `open-pr` job computes the next versions and edits three files:
`package.json`, `electron/slp-setup.js`, `Makefile`.
It pushes a `release-prod-<ver>` branch and opens a **"Release prod: …"** PR into
`main`.

### Step 2 — merge the PR (manual)

Review and merge into `main`. Merging is what kicks off the rest.

### Step 3 — build + draft (automatic)

The merge is a push to `main`, so **Release Prod runs again** (its `push` path):

- `detect-release` compares `package.json` version at `HEAD` vs `HEAD^`. If it
  changed, it **tags `main` as `v<ver>`** and pushes the tag.
- `build-and-deploy` runs via `workflow_call` (`with: version: <ver>`,
  `secrets: inherit`): builds and signs macOS / Linux / Windows, then
  `upload-to-gcp` pushes artifacts to `gs://…/​<ver>/` and `…/latest/`, then
  `create-draft-release` POSTs a **draft** to the releases API.

The release is now built and staged but **not yet live** — it's a draft.

### Step 4 — publish the draft (manual)

A verified superuser publishes it (`PATCH /v1/releases/<ver>` `status=published`),
via slp-api's `scripts/manage_releases.py`, or this repo's
`scripts/ci_push_release.py` run **without** `--draft-only`. Publishing is what
makes the version appear in the electron-updater feed and start rolling out.

## Bucket overwrite guard

`upload-to-gcp` **refuses to overwrite an existing version** — it fails if
`gs://…/​<version>/` already exists in the bucket. This prevents a rebuild of an
already-shipped version from silently swapping the CDN bytes out from under the
published feed's `sha512`/`size`.

- Production always runs with the guard **on**: `release-prod.yml` passes only
  `version`, so `overwrite` defaults to `false`.
- A standalone manual `build-and-deploy` dispatch exposes an **`overwrite`**
  checkbox to bypass the guard — only for iterating on an unpublished version.

**Never reuse a published version number.** Bump instead: electron-updater keys on
the version *string*, so clients already on `<ver>` will not re-download a rebuilt
`<ver>` even if the bytes changed.

## Fixing a bad release

- **Revoke** (`status=revoked`) — terminal. A pulled build never comes back; ship a
  new version. Run `make releases-revoke-prod VERSION=<ver>` (slp-api).
- **Unpublish** (`status=draft`) — reversible. Drops the release from the feed
  immediately, lets you edit metadata and re-publish. Use this for a release caught
  early (wrong notes, bad metadata). If the *artifacts* themselves are wrong, prefer
  a version bump — see the reuse warning above. Run
  `make releases-unpublish-prod VERSION=<ver>` (slp-api).

## Gotcha: two bump doors

`bump-framework.yml` is a second, older way to open a version-bump PR. Merging its
PR also changes `package.json` on `main`, so it **also** trips `release-prod`'s
`detect-release` and triggers a build. But it does **not** bump the agent version
(`electron/slp-setup.js`, `Makefile`) the way the Release Prod dispatch does, so
it can produce a subtly inconsistent release commit.

**Use the Release Prod dispatch (Step 1) as the canonical path.**
