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
make build-snap                       # build the Linux .deb (if needed) + pack the snap
make push-to-snap                     # ...and upload it to latest/stable
make push-to-snap SNAP_CHANNEL=beta   # release to another channel
make clean-snap                       # drop lifecycle dirs, staged .deb, packed .snap
```

`make build-snap`:

1. builds `dist/studio-<version>-amd64.deb` via `build-electron-linux` if it
   isn't there already,
2. copies it to `packaging/snap/studio-amd64.deb` (snapcraft only sees files
   inside its own project dir, so `dist/` can't be referenced directly),
3. syncs `version:` in `snapcraft.yaml` from `package.json`, and
4. runs `snapcraft clean && snapcraft pack`.

The snap wraps the .deb **built from this repo**. It previously pulled the
published .deb from `dl.smartloop.ai`, which meant the snap could only be cut
after the CDN upload and could silently wrap a different build than the one in
`dist/`.

Commit the `version:` bump in `snapcraft.yaml` — it records which build went to
the store.

### Prerequisites

- `snapcraft` with an initialized LXD build provider:
  `sudo snap install snapcraft --classic && lxd init && sudo usermod -aG lxd $USER`
- `snapcraft login` for the upload
- `build/slp/` staged with the **Linux** SLP framework — `build-electron-linux`
  refuses to package without it (see `require-staged-slp`)
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
