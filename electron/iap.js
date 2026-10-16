/**
 * iap.js
 *
 * Pro through Mac App Store In-App Purchase — the MAS build's way to upgrade.
 * App Review (3.1.1) requires that what a Pro account unlocks be purchasable in
 * the app, and Electron's `inAppPurchase` (StoreKit) only exists under
 * `process.mas`. Every other build upgrades through Stripe Checkout instead
 * (`upgrade-purchase` in main.js); `isAvailable` is false there.
 *
 * Pro belongs to the account, not the machine, so a purchase only counts once
 * the cloud has verified it against Apple and marked the account paid. The
 * transaction goes to SLP's POST /v1/payments/apple/verify, which forwards it
 * with the user's token (the app never holds the cloud token). A transaction is
 * finished only after that answers definitively: StoreKit hands unfinished ones
 * back at every launch, so a verify that failed for a transient reason (offline,
 * signed out, service down) gets retried on its own.
 */

const { isMasBuild } = require('./build-mode');

// The auto-renewable subscription configured in App Store Connect.
const PRO_PRODUCT_ID = process.env.SMARTLOOP_IAP_PRODUCT_ID || 'ai.smartloop.studio.pro.monthly';

// SKErrorPaymentCancelled: the user closed the payment sheet. Not an error.
const SK_ERROR_PAYMENT_CANCELLED = 2;

let inAppPurchase = null;
if (isMasBuild()) {
  try {
    ({ inAppPurchase } = require('electron'));
  } catch {
    inAppPurchase = null;
  }
}

let deps = { getBaseUrl: () => null, send: () => {}, onEntitlementChanged: () => {} };
let cachedProduct = null;
// Transactions that verified as not-finishable-yet (e.g. signed out), by id, so
// a sign-in can retry them without waiting for the next launch.
const pending = new Map();
// Ids being verified right now, so a retry doesn't verify one twice.
const settling = new Set();

function isAvailable() {
  return !!inAppPurchase && inAppPurchase.canMakePayments();
}

function sendState(payload) {
  deps.send('upgrade-state', payload);
}

// The id the cloud looks up with the App Store Server API. A restore or a
// renewal carries the original purchase's id, which is the one Apple's server
// knows the subscription by; a fresh purchase only has its own.
function lookupId(tx) {
  return tx.originalTransactionIdentifier || tx.transactionIdentifier;
}

/**
 * Ask the cloud (through SLP) to verify a transaction and grant Pro.
 * `finish` says whether StoreKit may forget the transaction: true for a
 * definitive answer either way, false when it's worth trying again later.
 */
async function verify(tx) {
  const baseUrl = deps.getBaseUrl();
  if (!baseUrl) return { ok: false, finish: false, error: 'The local service is not running.' };
  try {
    const res = await fetch(`${baseUrl}/v1/payments/apple/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: lookupId(tx) }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, finish: true, data };
    if (res.status === 401) {
      return { ok: false, finish: false, error: 'Sign in to finish activating Pro.' };
    }
    // 400 (Apple doesn't know it) and 409 (another account owns it) won't
    // change on a retry. Everything else — 5xx, an SLP without the route —
    // might.
    const finish = res.status === 400 || res.status === 409;
    return { ok: false, finish, error: data?.detail || `Could not verify the purchase (HTTP ${res.status}).` };
  } catch (err) {
    return { ok: false, finish: false, error: err.message };
  }
}

async function settle(tx) {
  if (settling.has(tx.transactionIdentifier)) return;
  settling.add(tx.transactionIdentifier);
  let result;
  try {
    result = await verify(tx);
  } finally {
    settling.delete(tx.transactionIdentifier);
  }
  if (result.finish) {
    inAppPurchase.finishTransactionByDate(tx.transactionDate);
    pending.delete(tx.transactionIdentifier);
  } else {
    pending.set(tx.transactionIdentifier, tx);
  }
  if (result.ok) {
    console.log(`[IAP] Verified ${tx.transactionState} transaction ${tx.transactionIdentifier}`);
    await deps.onEntitlementChanged();
    sendState({ state: 'purchased', subscription: result.data });
  } else {
    console.warn(`[IAP] Verify failed for ${tx.transactionIdentifier}: ${result.error}`);
    sendState({ state: 'failed', error: result.error });
  }
}

function onTransactionsUpdated(_event, transactions) {
  for (const tx of transactions) {
    switch (tx.transactionState) {
      case 'purchasing':
        sendState({ state: 'purchasing' });
        break;
      case 'deferred':
        // Ask to Buy: a parent has to approve. The approved purchase arrives
        // later as its own 'purchased' update.
        sendState({ state: 'deferred' });
        break;
      case 'purchased':
      case 'restored':
        sendState({ state: 'verifying' });
        settle(tx);
        break;
      case 'failed':
        inAppPurchase.finishTransactionByDate(tx.transactionDate);
        if (tx.errorCode === SK_ERROR_PAYMENT_CANCELLED) {
          sendState({ state: 'cancelled' });
        } else {
          sendState({ state: 'failed', error: tx.errorMessage || 'The purchase did not complete.' });
        }
        break;
      default:
        break;
    }
  }
}

/**
 * Register the StoreKit observer. Call once, as early as possible after app
 * ready: transactions left unfinished last session are delivered as soon as an
 * observer exists.
 */
function init(options) {
  deps = { ...deps, ...options };
  if (!inAppPurchase) return;
  inAppPurchase.on('transactions-updated', onTransactionsUpdated);
}

async function getProduct() {
  if (!isAvailable()) return null;
  if (cachedProduct) return cachedProduct;
  const [product] = await inAppPurchase.getProducts([PRO_PRODUCT_ID]);
  if (!product) return null;
  cachedProduct = {
    id: product.productIdentifier,
    title: product.localizedTitle,
    description: product.localizedDescription,
    formattedPrice: product.formattedPrice,
    period: product.subscriptionPeriod || null,
  };
  return cachedProduct;
}

/**
 * Start the purchase sheet. Resolves once StoreKit accepted the payment
 * request; the outcome arrives later as 'upgrade-state' events.
 */
async function purchase() {
  if (!isAvailable()) return { success: false, error: 'Purchases are not available on this device.' };
  const product = await getProduct();
  if (!product) return { success: false, error: 'Pro is not available in the App Store right now.' };
  const queued = await inAppPurchase.purchaseProduct(PRO_PRODUCT_ID);
  return queued ? { success: true } : { success: false, error: 'The App Store did not accept the purchase request.' };
}

/** Restore Purchases: StoreKit replays past purchases as 'restored'. */
function restore() {
  if (!isAvailable()) return { success: false, error: 'Purchases are not available on this device.' };
  inAppPurchase.restoreCompletedTransactions();
  return { success: true };
}

/** Retry transactions that couldn't be verified earlier, e.g. after sign-in. */
function retryPending() {
  for (const tx of [...pending.values()]) settle(tx);
}

module.exports = { init, isAvailable, getProduct, purchase, restore, retryPending, PRO_PRODUCT_ID };
