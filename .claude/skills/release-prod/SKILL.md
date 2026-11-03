---
name: release-prod
description: Production release of Smartloop Studio desktop — dispatch the Release Prod workflow (electron app + bundled slp agent versions), merge its "Release prod" PR, and follow build & deploy up to the manual production approval. Use when the user says to release/ship the desktop app or Studio, usually right after a new slp agent release.
argument-hint: [agent_version] [electron_version]
disable-model-invocation: true
---

# release-prod

Ship a production build of Studio. The app pins the slp agent version it runs and downloads it from `https://dl.smartloop.ai/slp/<agent_version>/` at runtime, so a desktop release normally follows an agent release (the `release` skill in the smartloop repo).

Arguments: `$ARGUMENTS` — optional `agent_version` then `electron_version`. Blank means a patch bump of each (the workflow's default).

All `gh` calls run as the **mehfuzh** account: prefix them with `GH_TOKEN=$(gh auth token --user mehfuzh)`. The active `gh` account is sometimes `mehfuzheibuddy`, which cannot see `smartloop-ai` repos.

## How the pipeline works

`.github/workflows/release-prod.yml`:

1. **Dispatch** (`workflow_dispatch`, inputs `electron_version`, `agent_version`) — bumps `package.json` (electron app), `electron/slp-setup.js` (`const VERSION`) and `Makefile` (`SLP_VERSION`), and opens PR **"Release prod: electron <app>, agent <agent>"** from `release-prod-<app>`.
2. **Merge** — a push to `main` that changes the `package.json` version (and isn't tagged yet) tags `v<app>` and calls `build-and-deploy.yml` with `publish: true`: build all platforms → upload to R2 → draft release → **publish**. The publish job runs in the `production` environment; if that environment has required reviewers it waits for a person to approve it in GitHub (never try to bypass it). Without reviewers it publishes straight away, which is what happened for 1.0.68 — so merging the release PR means shipping to users.

## Steps

1. **Preflight**
   - `gh pr list -R smartloop-ai/smartloop-studio --base main --state open` — if a `release-prod-*` PR is already open, report it and stop.
   - Current versions on main: `electron/slp-setup.js` `const VERSION` (agent) and `package.json` `version` (app). State current → next for both.
   - **The agent must already be published.** Every archive the app downloads must return 200 for the agent version being shipped:
     ```
     for f in darwin-arm64-slp.tar.gz linux-amd64-slp.tar.gz linux-arm64-slp.tar.gz windows-amd64-slp.zip; do
       echo "$f $(curl -s -o /dev/null -w '%{http_code}' https://dl.smartloop.ai/slp/<agent_version>/$f)"
     done
     ```
     Any non-200: stop — releasing would ship an app that cannot install its agent. Also compare each `content-length` with the previous agent version's (~430–450 MB): the archives bundle the embedding model, and the "Stage bundled resources" build step fails on an archive without it (1.2.20's linux-arm64 did). A far smaller archive must be rebuilt in the smartloop repo first.

2. **Dispatch**
   - `gh workflow run release-prod.yml -R smartloop-ai/smartloop-studio -f agent_version=<agent> [-f electron_version=<app>]` — pass the agent version explicitly when following an agent release, so it matches exactly.
   - Wait for the dispatch run to complete, then find the PR.

3. **Review and merge**
   - `gh pr diff <n>` must touch only `package.json`, `electron/slp-setup.js` and `Makefile`, with the versions stated in step 1. Anything else: stop and show the user.
   - `gh pr merge <n> --merge`.

4. **Follow build & deploy**
   - Find the `push` run of Release Prod on `main` (`gh run list --workflow release-prod.yml --event push -L1`). Confirm `detect-release` tagged `v<app>`.
   - Watch it in the background (`gh run watch <id> --interval 30`) until it completes or sits **waiting** on the `production` environment.
   - On a build failure: read the failing step's log (`gh api repos/smartloop-ai/smartloop-studio/actions/jobs/<job>/logs | tail -60`), fix the cause, then `gh run rerun <id> --failed` — this re-runs only the failed platform and the skipped upload/publish jobs, not the platforms that already built.

5. **Report** the app and agent versions, the tag, the run URL, and either the published download links (from the Publish Release job log) or that publishing is waiting for approval of the `production` deployment (link the run).

Do not add AI attribution to anything the release creates.
