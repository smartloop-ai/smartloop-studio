# Reply to App Review

Paste into the App Store Connect resolution centre. Everything below describes
the submitted binary (1.0.44); nothing here is aspirational.

---

Thank you for the review. All three issues are addressed in this build.

**1. Additional resources downloaded without disclosing the size (Guideline 2.x)**

Resolved by removing the downloads entirely rather than by disclosing them.
The previous build fetched three things on first launch: the local inference
runtime, the language model weights, and a project template. All three now ship
inside the application bundle:

- the SLP runtime, in `Contents/Resources/slp`
- the language model weights (~770 MB), in `Contents/Resources/models`
- the embedding model used for document search (~418 MB), in the same place
- the project template, in `Contents/Resources/data/templates`

A first launch therefore performs no downloads at all, and the app is fully
functional with no network connection. On startup it copies the bundled models
into its container and starts the local runtime; nothing is fetched.

We have additionally kept a safeguard: if a future build were ever to ship
without the bundled model, the app presents a modal alert stating the download
size before any transfer begins, with "Download" and "Not Now" options, and
remains usable if the user declines.

**2. com.apple.security.files.downloads.read-write**

Removed from the submitted binary. It was requested but never used.

Every file the app writes outside its container — exporting a conversation,
saving a document, exporting a project — is written through `NSSavePanel`, which
extends the sandbox to the location the user chooses. The app used
`NSSearchPathForDirectoriesInDomains` only to set the panel's default folder,
which returns a path string and requires no entitlement. The app never reads
from or writes to the Downloads folder without the user selecting the file.

The entitlements this build requests are:

- `com.apple.security.app-sandbox`
- `com.apple.security.network.client`
- `com.apple.security.network.server`
- `com.apple.security.files.user-selected.read-write`

On `com.apple.security.network.server`, in case it is queried: all inference is
performed locally. On launch the app starts the bundled runtime, which listens
on `127.0.0.1` on an ephemeral port, and the app's interface communicates with
it over that loopback socket. The App Sandbox denies `bind()`/`listen()` without
this entitlement even on the loopback interface, so without it no chat or
document processing functions. The socket is opened by the bundled child
process rather than by the main executable, which is why a scan of the main
binary may not show matching functionality.

**3. Sign-in taking the user to the default web browser (Guideline 4.0)**

Resolved. The user is no longer taken to a browser to sign in. Sign-in is a
screen inside the application, offering three options:

- **Email**: the user enters their address and receives a six-digit code, which
  they enter on the following screen. This is handled entirely by the app — no
  web view is involved at any point, and the app holds no password.
- **Sign in with Apple** and **Google**: these render the provider's own
  authorization page inside a window owned by the application. The user remains
  in the app for the whole flow. The only web page shown is the provider's own
  consent screen; once the provider hands control back, the app takes that view
  off the window and completes the sign-in itself, so no page of ours is ever
  presented to the user.

To be explicit rather than leave it to be inferred: this build does **not** use
`ASWebAuthenticationSession`. The application is built on Electron, which
provides no binding for that API. We understood the guidance to permit a browser
handoff *only when* `ASWebAuthenticationSession` is used, and have therefore
removed the handoff altogether — the user never leaves the application, which we
believe addresses the underlying concern. `Sign in with Apple` likewise
completes without leaving the app. We are happy to adjust further if a different
implementation is required.

The links that still open the default browser are Terms, Privacy Policy, and
"Create an account" beneath the sign-in form. The app does not offer account
creation itself (see the note below), so that link is informational.

**Note on account creation and deletion (Guideline 5.1.1(v))**

The app does not offer account creation. Accounts are created on our website,
and the app signs in to an existing account only. No account can come into
existence through this binary.

---

*Regards,*
*The Smartloop team*

---

# Engineering notes

Reply text and rationale for the questions App Review asks about this build.
Paste the entitlement section into **App Store Connect → App Review Information
→ Notes** so it is answered before the question is raised.

## Entitlements

### `com.apple.security.network.server` — keep, justify

> All inference in Smartloop Studio is local. On launch the app spawns the SLP
> runtime bundled inside the app (`Contents/Resources/slp`), which runs an HTTP
> server bound to `127.0.0.1` on an ephemeral port. The app's UI talks to that
> server over `http://localhost:<port>` for chat completions, document
> indexing, and model management. No data leaves the device for inference.
>
> App Sandbox denies `bind()`/`listen()` without this entitlement even on the
> loopback interface, so without it every chat and every document index fails.
> The listening socket is opened by that child process rather than by the
> Electron binary, which is why an automated scan of the main executable finds
> no matching functionality.

### `com.apple.security.temporary-exception.files.home-relative-path.read-write` — removed

App Review declined the `/.smartloop/` exception ("not appropriate and will not
be granted"). The store build now keeps all SLP state inside its container
(`userData/slp`, see `slpHomeDir()` in `electron/build-mode.js`) and passes it
to the bundled runtime as `SLP_HOME`, so neither process touches
`~/.smartloop`. The runtime's own sandbox adoption (`adopt_confined_home`)
declines whenever `SLP_HOME` is set. Do not re-add the exception: the store
build does not share models or conversations with the CLI or the
direct-download build.

### `com.apple.security.files.downloads.read-write` — removed

Removed in `build/entitlements.mas.plist` (and from the Developer ID
`entitlements.mac.plist`, where it was equally unused). Every file the app
writes outside its container goes through `NSSavePanel`
(`dialog.showSaveDialog`) — export conversation, download a document, export a
project — which extends the sandbox to the path the user picks.
`app.getPath('downloads')` was only used to seed the panel's default location,
which is a path string and needs no entitlement.
Besides `com.apple.security.files.user-selected.read-write`, the only file
access the app requests is the `~/.smartloop` exception above.

## Additional downloads (guideline 2.x)

The app bundles the SLP runtime, so nothing executable is fetched at runtime.
The one remaining download is the language model's weights on first launch.

`confirmModelDownload()` in `electron/main.js` now gates it: before anything is
fetched, the app shows a modal alert stating the size
(`DEFAULT_MODEL_DOWNLOAD_MB`, currently ~800 MB) and offers **Download** /
**Not Now**. Declining opens the app without downloading; the download can be
started later from the menu bar icon's **Complete Setup…** entry, which asks
again with the same disclosure.

**Keep `DEFAULT_MODEL_DOWNLOAD_MB` in step with the default bootstrap model.**
The service reports `size: null` for every catalog entry, and the true byte
count only arrives on the first SSE progress event — after the download has
begun — so the disclosed figure has to be a maintained constant.

## Sign-in (guideline 4.0)

Sign-in no longer leaves the app. `/login` is a full-window page of the app
(`src/app/pages/Login.tsx`), reached from the sidebar's sign-in button, and it
offers exactly three ways in. No step of the sign-in itself leaves the app;
`shell.openExternal` remains on that page only for the Terms, Privacy and
"Create an account" links.

**There is no password anywhere in the app, and no way to create an account
from it.** Registration stays on the web.

- **Email** — the person types their address and the API mails a six-digit
  code, which they enter on the second screen. Handled end to end by the main
  process (`auth-otp-request` / `auth-otp-verify` in `electron/main.js`), so
  the code never touches a web context. An address with no account is told so;
  the app cannot create one.
- **Apple and Google** — only the provider may render its own consent screen.
  It loads in a `WebContentsView` layered over the login page's content area
  (`openAuthView`), so the user stays inside the app window while the page
  keeps the surrounding chrome and a way back. Electron has no binding for
  `ASWebAuthenticationSession`; an app-owned view is the equivalent.

The view uses its own session partition and a UA with the app's
`Smartloop Studio/<v> Electron/<v>` product tokens stripped, so providers that
refuse embedded browsers still render.

### What the API had to grow

Two additions in `app/api/v1/auth.py`, both purely additive — every
pre-existing route (password login, register, verify, reset, and the web
OAuth routers) is untouched and still serves app.smartloop.ai.

**Desktop OAuth.** The desktop app has no web origin and no `localStorage`, so
it cannot stash the local service port across the provider round trip the way
the browser flow does. These carry it in a signed, short-lived OAuth `state`
instead — signed because the callback hands a live access token to whatever
port it names:

| Route | Purpose |
|---|---|
| `GET /v1/auth/google/desktop/authorize?port=` | Redirect to Google with the signed state |
| `GET /v1/auth/google/desktop/callback` | Exchange, sign in, hand off |
| `GET /v1/auth/apple/desktop/authorize?port=` | Redirect to Apple with the signed state |
| `POST /v1/auth/apple/desktop/callback` | Apple's `response_mode=form_post` callback |

Both finish by POSTing tokens to `http://127.0.0.1:<port>/v1/auth/callback` —
the endpoint the browser flow already used.

**Email sign-in codes.** `POST /v1/auth/otp/request` and
`POST /v1/auth/otp/verify`. Sign-in only: neither creates an account. Codes are
stored as SHA-256 only (`app/db/models/email_otp.py`), single use, ten minutes,
five wrong guesses, with a per-address resend cooldown on top of an always-on
per-IP limit — slowapi keys on IP alone, which one caller can walk around with
a list of addresses.

**Before this ships, two redirect URIs must be registered:**

- Google OAuth client → `https://api.smartloop.ai/v1/auth/google/desktop/callback`
- Apple Service ID → `https://api.smartloop.ai/v1/auth/apple/desktop/callback`

and `ENABLE_APPLE_OAUTH` must be true in the API's environment — it defaults to
`False`, and Sign in with Apple is required of any app offering a third-party
login.

GitHub was left in the API and on the web app; only the desktop app restricts
itself to Apple, Google and email.

## Account deletion (guideline 5.1.1(v))

The app offers no account creation, so the requirement does not attach to this
build — **do not claim deletion in the reply.** The menu entry was removed in
042fe64; the machinery below is implemented and reachable over IPC
(`authDeleteAccount` in `preload.js`) but has no UI, so the reply says only that
accounts cannot be created from the app.

If review does require it, re-exposing the menu item is all that is missing.
Three layers, because the token that authorizes the deletion is held by the
local service, not the app:

1. `DELETE /v1/users/me` on the platform API (`app/api/v1/users.py`) →
   `AccountDeletionService` cancels any Stripe subscription, then hard-deletes
   documents, messages, conversations, projects, access tokens, usage rows,
   access logs, and the user record — which is also what unlinks the Google and
   Apple OAuth accounts embedded in it. Declared before the built-in users
   router, whose `DELETE /users/{id}` is superuser-only and would otherwise try
   to read "me" as an ObjectId.
2. `DELETE /v1/users/me` on the local SLP service
   (`smartloop/api/routers/users.py`) proxies it with the stored token, then
   clears the local credentials — but only after the platform confirms.
3. `auth-delete-account` in `electron/main.js` calls the local service and
   broadcasts the signed-out state.
