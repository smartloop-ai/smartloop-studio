/**
 * macOS native authentication, or a clear failure when it isn't available.
 *
 * The binary is built by node-gyp and rebuilt against Electron's headers by
 * `electron-builder install-app-deps`. Loading it is still guarded: a source
 * checkout that has not been built yet, or a platform with no binding, must
 * degrade to a message rather than crash the main process at require time.
 */
const UNAVAILABLE = 'NATIVE_AUTH_UNAVAILABLE';

let binding = null;
let loadError = null;

try {
  binding = require('./build/Release/smartloop_auth.node');
} catch (err) {
  loadError = err;
}

/** True when the native sheets can actually be presented. */
const supported = Boolean(binding && binding.supported && process.platform === 'darwin');

function unavailable() {
  const error = new Error(
    loadError
      ? `Native authentication is not built: ${loadError.message}`
      : 'Native authentication is only available on macOS',
  );
  error.code = UNAVAILABLE;
  return Promise.reject(error);
}

/**
 * Present ASWebAuthenticationSession and resolve with the callback URL the
 * provider redirects to.
 *
 * @param {string} url            Provider authorization URL.
 * @param {string} callbackScheme Custom scheme to intercept, without "://".
 * @param {{ephemeral?: boolean}} [options] `ephemeral` opts out of Safari's
 *        cookie jar — off by default, because sharing it is what makes an
 *        already-signed-in account one click.
 * @returns {Promise<string>} the full callback URL.
 */
function startWebAuthSession(url, callbackScheme, options = {}) {
  if (!supported) return unavailable();
  return binding.startWebAuthSession(String(url), String(callbackScheme), options);
}

/**
 * Present the native Sign in with Apple sheet.
 *
 * @param {{nonce?: string}} [options] `nonce` is echoed into the identity
 *        token so the server can reject a replayed one.
 * @returns {Promise<{user: string, identityToken: string, authorizationCode: string,
 *                    email?: string, fullName?: string}>}
 *        `email` and `fullName` arrive on the FIRST authorization only; Apple
 *        never sends them again, so absence is normal for a returning user.
 */
function signInWithApple(options = {}) {
  if (!supported) return unavailable();
  return binding.signInWithApple(options);
}

module.exports = { supported, startWebAuthSession, signInWithApple, UNAVAILABLE };
