# Snap packaging

Snapcraft project for the `smartloop-studio` snap, published to the Snap Store
under the `smartloop` publisher account.

This directory **is** the snapcraft project dir — `snapcraft` must be run from
here, not from the repo root (running it at the root would drag `node_modules/`
and `dist/` into the build instance).

```
packaging/snap/
  snap/snapcraft.yaml   the recipe
  snap/icon.png         store/desktop icon
  store/                listing assets — banner, screenshots
  docs/                 store forum requests
```

## Releasing

Driven from the repo-root `Makefile`, alongside the other release targets:

```bash
make build-snap                       # download the published Linux .deb + pack the snap
make push-to-snap                     # ...and upload it to latest/stable
make push-to-snap SNAP_CHANNEL=beta   # release to another channel
make build-snap FORCE=1               # re-download even if the staged .deb matches
make clean-snap                       # drop lifecycle dirs, staged .deb, packed .snap
```

`make build-snap`:

1. downloads `https://dl.smartloop.ai/<version>/linux/studio-<version>-amd64.deb`
   — the .deb CI built for the version in `package.json` — to
   `packaging/snap/studio-amd64.deb` (snapcraft only sees files inside its own
   project dir), skipping the download when the staged .deb is already that
   version,
2. syncs `version:` in `snapcraft.yaml` from `package.json`, and
3. runs `snapcraft clean && snapcraft pack`.

The snap wraps the **CI-published** .deb, so the store ships the same bytes as
every other Linux download and no local Electron build is needed. The trade-off:
the snap can only be cut once the release workflow has uploaded that version —
if the download 404s, CI hasn't published it yet. Override the host with
`DL_BASE_URL=...` to pull from somewhere else.

Commit the `version:` bump in `snapcraft.yaml` — it records which build went to
the store.

### Prerequisites

- `snapcraft` with an initialized LXD build provider:
  `sudo snap install snapcraft --classic && lxd init && sudo usermod -aG lxd $USER`
- `snapcraft login` for the upload
- the version in `package.json` published under
  `https://dl.smartloop.ai/<version>/linux/` by the release workflow
- Several GB of free disk; packing takes a while and the result is ~800 MB

## Confinement

The snap is **strict**, not classic. Classic was tried first and rejected by the
store (`confinement 'classic' not allowed` without a forum-approved request, and
classic snaps may not declare plugs at all); the draft of that request is kept
in `docs/classic-confinement-request.md` as a record of the path not taken.

Strict works because of three non-obvious plugs, each commented in
`snapcraft.yaml`:

| Plug | Why |
|---|---|
| `browser-support` | AppArmor rule for Chromium's `/dev/shm/.org.chromium.*` segments |
| `shared-memory` (private) | the PyInstaller-packaged `slp` agent's `sem_open()` calls need arbitrary semaphore names |
| `removable-media` | reading documents off external drives — users must `snap connect` this one by hand |

The `gnome` extension supplies GTK3/NSS/pango/cairo/atk/cups/alsa from the
`gnome-46-2404` platform snap and adds the `desktop`, `desktop-legacy`,
`gsettings`, `opengl`, `wayland` and `x11` plugs, so none of those may be
declared by hand.

## Verifying a build

```bash
unsquashfs -l packaging/snap/smartloop-studio_<version>_amd64.snap | head
sudo snap install --dangerous packaging/snap/smartloop-studio_<version>_amd64.snap
sudo snap connect smartloop-studio:removable-media
smartloop-studio
```
