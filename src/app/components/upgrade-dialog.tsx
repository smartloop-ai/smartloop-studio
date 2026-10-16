import { Dialog, Box, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckIcon from '@mui/icons-material/Check';
import { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IapProduct, UpgradeStatus } from '@/electron';
import { AuthContext } from '@/app/contexts/AuthContext';
import { dialogStyles } from '@/app/shared/utils';
import { PRIVACY_URL, TERMS_URL } from '@/app/constants';

/**
 * Upgrade to Pro, the same dialog in every build (see UpgradeContext). The
 * payment runs in main and reports back over `upgrade-state`; Pro is only
 * "done" once the account is paid, which is the `purchased` state.
 *
 *  - storekit (Mac App Store): the copy under the button is what App Review
 *    requires on an auto-renewing subscription's purchase screen (3.1.2):
 *    price and period, renewal terms, working Terms / Privacy links, and
 *    Restore Purchases.
 *  - checkout (DMG / Windows / Linux): Stripe's page opens in the browser and
 *    the dialog waits, turning to "You're on Pro" when the payment lands.
 */

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  method: UpgradeStatus['method'];
  product: IapProduct | null;
}

type Phase = 'idle' | 'working' | 'restoring' | 'done' | 'error';

// StoreKit 1 sends nothing at all when there is nothing to restore, so a
// restore that has heard nothing by then found nothing.
const RESTORE_QUIET_MS = 20_000;

const FEATURES = [
  'Pro models in the model picker',
  '1,000 web searches a month, up from 100',
  'One subscription for your Smartloop account on every device',
];

function periodLabel(product: IapProduct | null) {
  const p = product?.period;
  if (!p) return 'month';
  return p.numberOfUnits === 1 ? p.unit : `${p.numberOfUnits} ${p.unit}s`;
}

export default function UpgradeDialog({ open, onClose, method, product }: UpgradeDialogProps) {
  const isStore = method === 'storekit';
  const { user } = useContext(AuthContext) as any;
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signedIn = !!user && !user.guest;
  const busy = phase === 'working' || phase === 'restoring';

  const clearRestoreTimer = () => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreTimer.current = null;
  };

  useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setStatus('');
    setError('');
  }, [open]);

  useEffect(() => {
    return window.electronAPI?.upgrade?.onState((s) => {
      clearRestoreTimer();
      switch (s.state) {
        case 'purchasing':
          setPhase('working');
          setStatus('Waiting for the App Store…');
          break;
        case 'verifying':
          setPhase('working');
          setStatus('Activating Pro on your account…');
          break;
        case 'checkout':
          // Not busy: the person may close the tab and want to try again.
          setPhase('idle');
          setStatus('Finish checking out in your browser. Pro turns on here as soon as the payment goes through.');
          break;
        case 'deferred':
          setPhase('idle');
          setStatus('Waiting for approval. Pro turns on once the purchase is approved.');
          break;
        case 'purchased':
          setPhase(s.subscription?.is_paid === false ? 'error' : 'done');
          if (s.subscription?.is_paid === false) {
            setError('That subscription has ended. Subscribe again to get Pro back.');
          }
          break;
        case 'cancelled':
          setPhase('idle');
          setStatus('');
          break;
        case 'failed':
          setPhase('error');
          setError(s.error || 'The purchase did not complete.');
          break;
      }
    });
  }, []);

  useEffect(() => clearRestoreTimer, []);

  const handleSubscribe = async () => {
    setError('');
    setPhase('working');
    setStatus(isStore ? 'Opening the App Store…' : 'Opening checkout…');
    const res = await window.electronAPI?.upgrade.purchase();
    if (!res?.success) {
      setPhase('error');
      setError(res?.error || 'Could not start the purchase.');
    }
  };

  const handleRestore = async () => {
    setError('');
    setPhase('restoring');
    setStatus('Looking for previous purchases…');
    const res = await window.electronAPI?.upgrade.restore();
    if (!res?.success) {
      setPhase('error');
      setError(res?.error || 'Could not restore purchases.');
      return;
    }
    clearRestoreTimer();
    restoreTimer.current = setTimeout(() => {
      setPhase('idle');
      setStatus('No previous Pro purchase was found for this Apple Account.');
    }, RESTORE_QUIET_MS);
  };

  const handleSignIn = () => {
    onClose();
    navigate('/login');
  };

  const linkClass = 'underline underline-offset-2 hover:text-sl-text-primary transition-colors';

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: dialogStyles.paper }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box className="p-5 flex flex-col gap-4">
        <Box className="flex items-start justify-between gap-4">
          {phase !== 'done' && (
            <Box className="flex flex-col gap-1">
              <h3 className="text-sl-text-primary text-sm font-semibold">{product?.title || 'Smartloop Pro'}</h3>
              <p className="text-[11px] text-sl-text-muted leading-relaxed">
                Get more out of Smartloop Studio.
              </p>
            </Box>
          )}
          <IconButton
            size="small"
            onClick={() => !busy && onClose()}
            sx={{ color: 'var(--sl-text-muted)', ml: 'auto' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {phase === 'done' ? (
          <Box className="flex flex-col items-center text-center gap-2 py-6">
            <CheckCircleOutlineIcon sx={{ fontSize: 32, color: 'var(--sl-brand-primary)' }} />
            <span className="text-[13px] font-semibold text-sl-text-primary">You're on Pro</span>
            <span className="text-[11px] text-sl-text-muted">Pro models are now available in the model picker.</span>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors"
              style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
            >
              Done
            </button>
          </Box>
        ) : (
          <>
            <Box className="flex flex-col gap-2">
              {FEATURES.map((f) => (
                <Box key={f} className="flex items-center gap-2">
                  <CheckIcon sx={{ fontSize: 14, color: 'var(--sl-brand-primary)' }} />
                  <span className="text-[12px] text-sl-text-primary">{f}</span>
                </Box>
              ))}
            </Box>

            <Box className="flex items-baseline gap-1">
              {!isStore ? null : product ? (
                <>
                  <span className="text-lg font-semibold text-sl-text-primary">{product.formattedPrice}</span>
                  <span className="text-[11px] text-sl-text-muted">/ {periodLabel(product)}</span>
                </>
              ) : (
                <span className="text-[11px] text-sl-text-muted">Pricing is unavailable right now. Check your connection and try again.</span>
              )}
            </Box>

            {status && <span className="text-[11px] text-sl-text-muted">{status}</span>}
            {error && (
              <span className="text-[11px]" style={{ color: 'var(--sl-status-error)' }}>{error}</span>
            )}

            <Box className="flex items-center justify-end gap-2">
              {signedIn && isStore && (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary border border-sl-border transition-colors disabled:opacity-50"
                >
                  Restore Purchases
                </button>
              )}
              {signedIn ? (
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={busy || (isStore && !product)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
                >
                  {phase === 'working' && <CircularProgress size={12} sx={{ color: 'currentColor' }} />}
                  {isStore ? 'Subscribe' : 'Continue to checkout'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors"
                  style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
                >
                  Sign in to subscribe
                </button>
              )}
            </Box>

            {!isStore && (
              <p className="text-[10px] text-sl-text-faint leading-relaxed">
                {!signedIn && 'Pro is tied to your Smartloop account, so sign in first. '}
                Checkout opens in your browser and is handled securely by Stripe. Cancel anytime.{' '}
                <button type="button" className={linkClass} onClick={() => window.electronAPI?.openExternal(TERMS_URL)}>
                  Terms of Use
                </button>
                {' · '}
                <button type="button" className={linkClass} onClick={() => window.electronAPI?.openExternal(PRIVACY_URL)}>
                  Privacy Policy
                </button>
              </p>
            )}

            {isStore && (
            <p className="text-[10px] text-sl-text-faint leading-relaxed">
              {!signedIn && 'Pro is tied to your Smartloop account, so sign in first. '}
              Payment is charged to your Apple Account at confirmation. The subscription renews
              automatically{product ? ` at ${product.formattedPrice} per ${periodLabel(product)}` : ''} unless
              it is cancelled at least 24 hours before the end of the current period. Manage or cancel it
              in your App Store account settings.{' '}
              <button type="button" className={linkClass} onClick={() => window.electronAPI?.openExternal(TERMS_URL)}>
                Terms of Use
              </button>
              {' · '}
              <button type="button" className={linkClass} onClick={() => window.electronAPI?.openExternal(PRIVACY_URL)}>
                Privacy Policy
              </button>
            </p>
            )}
          </>
        )}
      </Box>
    </Dialog>
  );
}
