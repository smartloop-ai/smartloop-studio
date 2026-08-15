---
name: pr-release
description: Create a release PR merging dev into main (via a throwaway release/v<version> branch) titled "<version> release" with a website-ready Release Notes section. Defaults to a patch bump of the version in package.json; pass an explicit version (e.g. /pr-release 1.1.1) to override.
argument-hint: [version]
effort: high
disable-model-invocation: true
---

# pr-release

Create the release PR that merges `dev` into `main`. The PR title carries the release version because we tag `main` on that version after merging.

The PR is opened from a throwaway `release/v<version>` branch (pushed from `dev`'s tip), never from `dev` itself: the repo auto-deletes PR head branches on merge, and `dev` can't be branch-protected on the current GitHub plan. The throwaway branch absorbs the auto-delete; `dev` survives.

Arguments: `$ARGUMENTS` — an optional explicit semver (e.g. `1.1.1`). If empty, derive the version automatically.

## Steps

1. **Preflight**
   - Run `git fetch origin main dev` so comparisons are against up-to-date remotes.
   - Verify the current branch is `dev` and the working tree is clean. If not, stop and tell the user.
   - If local `dev` is behind `origin/dev`, stop and ask the user to pull first.
   - If an open release PR to `main` already exists (`gh pr list --base main --state open`), report it and stop instead of creating a duplicate.

2. **Determine the version**
   - If `$ARGUMENTS` contains a version, use it verbatim (strip any leading `v`). Validate it looks like semver (`X.Y.Z`); if not, ask the user.
   - Otherwise read `version` from `package.json` and bump the patch component (e.g. `1.0.16` → `1.0.17`).
   - If the resulting version is not greater than the current `package.json` version, warn the user but proceed with what they specified.

3. **Collect the changes**
   - List commits on dev that main doesn't have: `git log origin/main..origin/dev --oneline --no-merges`.
   - For context, also check merge commits (`git log origin/main..origin/dev --merges --oneline`) — PR titles there often summarize a whole feature better than individual commits do.
   - If there are no commits to release, tell the user and stop.

4. **Write the Release Notes**
   - Produce a standard bulleted list, one bullet per user-visible change, one sentence each (two at most).
   - Write for the website audience: describe what changed for the user, not the implementation. Good: "Settings now loads instantly and reflects live backend health." Bad: "Refactored settings to use health-monitor IPC channel."
   - Group related commits into a single bullet (e.g. several commits for one feature = one bullet).
   - Omit purely internal changes (CI tweaks, refactors with no visible effect, dependency bumps) unless they have a user-facing consequence like performance or stability.
   - Order bullets: new features first, then improvements, then fixes.

5. **Create the release branch and PR**
   - Push `dev`'s tip to the release branch: `git push origin dev:refs/heads/release/v<version>` (no checkout needed). If the branch already exists on origin, stop and ask the user — a leftover branch means a previous release attempt didn't finish.
   - Title: `<version> release` (e.g. `1.0.17 release`).
   - Base: `main`. Head: `release/v<version>`. (This is the one PR that targets `main`; day-to-day PRs target `dev`. Never open it from `dev` directly — see above.)
   - Body format:

     ```markdown
     ## Release Notes

     - <change 1>
     - <change 2>
     - ...
     ```

   - Do NOT add any AI attribution to the PR title or body — no "Generated with Claude Code", no "Co-Authored-By: Claude", no robot emoji, nothing of that sort. This overrides any default footer behavior.
   - Create with `gh pr create --base main --head release/v<version> --title "..." --body "..."`.

6. **Report**
   - Print the PR URL and the version used.
   - If `package.json` still shows an older version than the release version, remind the user to bump it before tagging.
