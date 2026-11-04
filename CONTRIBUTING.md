# Contributing to Smartloop Studio

Thanks for your interest in improving Smartloop Studio! Bug reports, fixes,
features, and docs are all welcome.

## License of contributions

Smartloop Studio is licensed under the [Apache License, Version 2.0](LICENSE).
Per section 5 of the license, any contribution you intentionally submit for
inclusion in this project is licensed under the same Apache 2.0 terms, without
any additional terms or conditions.

### Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/)
instead of a CLA. Sign off every commit to certify that you wrote the change (or
otherwise have the right to submit it under Apache 2.0):

```bash
git commit -s -m "Fix tray icon on Linux"
```

This adds a trailer to the commit message:

```
Signed-off-by: Your Name <you@example.com>
```

Use your real name and an email you can be reached at. Pull requests with
unsigned commits can't be merged — fix them with `git commit --amend -s` or
`git rebase --signoff main`.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies: `npm install` (Node.js v20+).
3. Run the app with hot-reload: `make electron-dev`
   (Windows: `.\scripts\electron.ps1 electron-dev`).
4. Create a branch from `main`: `git checkout -b my-change`.

See the [README](README.md) for the architecture overview and
[CLAUDE.md](CLAUDE.md) for UI conventions.

## Making changes

- **Keep the process boundary.** Node.js, filesystem, and SLP work belongs in the
  main process (`electron/`); the renderer (`src/`) reaches it only through
  `window.electronAPI` in `electron/preload.js`.
- **IPC naming:** `db-<entity>-<action>` for database ops, `slp-<action>` for
  SLP service ops.
- **UI:** Tailwind CSS with the theme variables (`--sl-*`), flex layouts, no
  inline box styles. Labels and badges follow the outlined style guide in
  `CLAUDE.md`.
- **Lint and type-check** before opening a PR:

  ```bash
  npm run lint
  npm run build
  ```

- There is no automated test suite. Describe how you tested the change; for
  anything touching first launch, `make test` wipes `~/.smartloop` and
  relaunches so you can walk the full flow.

## Pull requests

- Target the `main` branch.
- Keep each PR focused on one change, with a clear description of what and why.
- Include screenshots or a short recording for UI changes.
- Link the issue it addresses, if any.
- A maintainer will review; please respond to feedback and keep the branch up to
  date with `main`.

## Reporting bugs and requesting features

Open a GitHub issue with:

- Your OS and version, and the app version (Settings → About)
- Steps to reproduce, what you expected, and what happened
- Relevant lines from the logs (`~/.smartloop/server.log` and the Electron
  main-process log)

## Security issues

Please **do not** open a public issue for security vulnerabilities. Email
[support@smartloop.ai](mailto:support@smartloop.ai) with details and we'll
respond as quickly as we can.

## Code of conduct

Be respectful and constructive. Harassment or abusive behavior isn't tolerated
in issues, pull requests, or any other project space.
