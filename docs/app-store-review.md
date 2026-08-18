# Mac App Store review notes

Standing answers for App Review, plus the build-side guards that keep the two
rejections we have already hit from recurring. Paste the "Review notes" blocks
verbatim into **App Store Connect → App Information → App Review Information →
Notes** so the next submission carries the explanation up front.

---

## 1. `com.apple.security.network.server` — keep it, explain it

**Rejection text:** *"the app includes the com.apple.security.network.server
entitlement but does not appear to have matching functionality."*

**Resolution: keep the entitlement and reply.** It is genuinely required and
removing it breaks the app.

### Why it is required

Smartloop Studio runs its language models entirely on-device. The app bundles
the SLP inference framework at `Contents/Resources/slp` and spawns it as a child
process (`electron/slp-service.js` → `slp agent start --port <port>`). SLP is a
Python/uvicorn HTTP server exposing an OpenAI-compatible API; the renderer
consumes it through the OpenAI SDK at `http://localhost:<port>`.

That server calls `bind()` + `listen()`. App Sandbox denies a listening socket
without `com.apple.security.network.server` **even on the loopback interface**,
so without the entitlement the local server never starts and every feature —
chat, document indexing/RAG, model management — fails.

Scope is deliberately narrow:

- Bound to `127.0.0.1` only, never `0.0.0.0`. `slp-service.js` sets
  `SLP_API_HOST=127.0.0.1` whenever `isSandboxed()` is true (`build-mode.js`),
  overriding SLP's own default.
- Nothing outside the app's container can reach it, and the app advertises no
  Bonjour/network service.
- The child process runs inside the same sandbox by inheritance
  (`build/entitlements.mas.inherit.plist`: `app-sandbox` + `inherit`).

### Why the automated scan misses it

The scan inspects the Electron executable. That binary never opens a listening
socket — the bundled Python child process does. Hence "no matching
functionality" despite the entitlement being load-bearing.

### Review notes (paste into App Store Connect / reply to the reviewer)

> Smartloop Studio performs all AI inference locally on the user's Mac; no
> prompt or document content is sent to a server. The app bundles a local
> inference engine inside the app bundle and launches it as a child process.
> That engine exposes an OpenAI-compatible HTTP API bound exclusively to the
> loopback interface (127.0.0.1), which the app's UI calls to run chats,
> index documents, and manage models.
>
> Because that component calls listen() on a loopback socket, App Sandbox
> requires com.apple.security.network.server. Without it the local inference
> server cannot start and the app is non-functional.
>
> The automated analysis does not detect matching functionality because the
> listening socket is opened by the bundled child process, not by the main
> application binary that the scan inspects. The child process runs inside the
> app's sandbox via com.apple.security.inherit.
>
> The app never binds to 0.0.0.0, never accepts connections from outside the
> device, and advertises no network services. com.apple.security.network.client
> is used separately for outbound HTTPS to our own API for sign-in and release
> checks.

### Entitlements we do *not* ship in the MAS build

`build/entitlements.mas.plist` is already minimal: no camera, microphone,
Contacts, Calendars, Location, or Photos. Those appear only in the Developer ID
build's `entitlements.mac.plist`. Keep it that way — every extra entitlement is
another automated-scan finding.

---

## 2. Deprecated Accelerate LAPACK symbols — fixed in the SLP build

**Rejection text:** *"The app uses or references the following non-public or
deprecated APIs: `_dcabs1_`, `_lsame_`, `_xerbla_array__`."*

**Resolution: fixed at the source.** No reply needed; resubmit with an SLP
framework built after the fix.

### Cause

All three are legacy reference-BLAS/LAPACK helpers exported by
`Accelerate.framework`. They came from exactly two files in the bundled SLP
framework:

```
Contents/Resources/slp/_internal/scipy/linalg/cython_blas.cpython-311-darwin.so   → U _dcabs1_, U _lsame_
Contents/Resources/slp/_internal/scipy/linalg/cython_lapack.cpython-311-darwin.so → U _xerbla_array__
```

SciPy publishes two macOS arm64 wheels per release:

| Wheel tag | BLAS backend | Flagged symbols |
|---|---|---|
| `macosx_14_0_arm64` | links `Accelerate.framework` | **yes** |
| `macosx_12_0_arm64` | self-contained OpenBLAS in `scipy/.dylibs` | no |

pip prefers the `macosx_14_0` wheel on macOS 14+, which is what the `macos-14`
CI runner picked. SciPy links Accelerate's modern `$NEWLAPACK` interface for the
real routines, but these three helpers have no `$NEWLAPACK` equivalent, so they
resolve against the deprecated legacy exports — which is what the scan reports.

SciPy is not a direct dependency; it arrives transitively via `scikit-learn`
(used in `smartloop/db/sqlite_store.py` for TF-IDF fallback search).

### Fix (in the `smartloop` repo)

- `Makefile` — `SCIPY_OPENBLAS_CMD`, run from the `build` target, reinstalls the
  **same** SciPy version from the `macosx_12_0_arm64` (OpenBLAS) wheel after
  requirements are installed. A wheel *variant* cannot be pinned in
  `requirements.txt`, hence the post-install swap.
- `Makefile` — `make check-apple-symbols` scans every Mach-O in `dist/slp` for
  an *undefined* reference to any of the three symbols and fails the build.
  (A library that *defines* them itself, as bundled OpenBLAS does, is not an
  Apple API reference and is correctly ignored.)
- `.github/workflows/build.yml` — the macOS job runs that check after
  `build-binary`, and asserts `libscipy_openblas*` survived PyInstaller
  collection.

### Verifying a framework before submitting

```sh
cd ~/source/smartloop
make check-apple-symbols DIST_DIR=/path/to/studio-desktop/build/slp
```

Run this against the staged `build/slp/` before any MAS build. The framework
currently staged in `build/slp/` predates the fix — restage it from a CI build
(`make stage-slp-latest`) that includes it.
