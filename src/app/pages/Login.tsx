import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppleIcon from '@mui/icons-material/Apple';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { LogoMark } from '@/app/components/logo';
import { PRIVACY_URL, TERMS_URL } from '@/app/constants';

/**
 * In-app sign-in.
 *
 * Sign-in used to open app.smartloop.ai in the default browser. App Review
 * guideline 4.0 rejects that handoff unless it is an
 * ASWebAuthenticationSession, which Electron cannot give us — so the whole
 * flow lives here instead.
 *
 * Three ways in, and no passwords:
 *   - Email: a six-digit code, requested and verified through the main process.
 *     One screen for the address, one for the code. Nothing to remember, nothing
 *     to reset, and no credential for this app to hold.
 *   - Google / Apple: only the provider may render its own consent screen, so
 *     main layers that page into `providerSlotRef` as a WebContentsView and this
 *     page keeps the chrome around it.
 *
 * Every route ends the same way: tokens land on the local service and arrive
 * back here as a `loginState` event.
 */

/** Which of the two email screens is showing. */
type Step = 'identify' | 'code';

const CODE_LENGTH = 6;

const buttonBase =
  'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-[13px] font-medium transition-colors';

const providerButtonClass =
  `${buttonBase} text-sl-text-primary bg-sl-bg-surface-2 border border-sl-border hover:border-sl-border-hover`;

const primaryButtonClass = `${buttonBase} disabled:cursor-not-allowed`;

/**
 * Filled brand surface, or a plainly disabled one.
 *
 * Not `disabled:opacity-40`: fading a filled button drags its label down with
 * the fill, and accent-contrast text on a 40%-faded accent is unreadable — the
 * label disappeared entirely. A disabled control should look disabled, not
 * look like the enabled one behind frosted glass, so it gets its own surface
 * and its own foreground.
 *
 * The foreground is --sl-brand-contrast, derived per theme from the accent's
 * luminance (see brandContrast in theme/themes.ts).
 */
function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  if (disabled) {
    return { background: 'var(--sl-bg-surface-2)', color: 'var(--sl-text-disabled)' };
  }
  return { background: 'var(--sl-brand-primary)', color: 'var(--sl-brand-contrast, #ffffff)' };
}

/**
 * Matches the field styling used by the app's dialogs, one surface up, with a
 * focus ring: this is the one thing on the card you type into, so it should be
 * obvious where the caret went.
 */
const inputClass =
  'w-full rounded-lg px-3 py-2 text-[13px] bg-sl-bg-surface-2 text-sl-text-primary '
  + 'border border-sl-border outline-none transition-all '
  + 'hover:border-sl-border-hover focus:border-sl-brand-primary '
  + 'focus:ring-2 focus:ring-[var(--sl-brand-alpha-30)] '
  + 'placeholder:text-sl-text-muted';

/** 12px corner and a subtle border, the same shape dialogStyles.paper uses. */
const cardClass =
  'relative w-full max-w-[360px] rounded-xl border border-sl-border-subtle '
  + 'bg-sl-bg-surface-1 shadow-[var(--sl-shadow-lg)] flex flex-col';

/**
 * Bracketed monospace link, the same idiom as the [ESC] hint.
 *
 * The label takes the accent rather than near-white: against the muted
 * sentence around it that is what marks it as something to click, and the
 * accent still clears AA on the card (5.3:1) so the notice stays legible —
 * conspicuousness is the point of it. The brackets are dimmed so they read as
 * decoration around the word instead of competing with it.
 */
function BracketLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[10px] tracking-[0.02em] text-sl-brand-primary hover:text-sl-brand-light transition-colors"
    >
      <span className="opacity-40">[</span>
      {label}
      <span className="opacity-40">]</span>
    </button>
  );
}

/**
 * Warmth behind the card. A flat base makes a sign-in screen feel like an error
 * state; two soft brand-tinted pools give it some depth without becoming
 * decoration. Built from --sl-brand-primary rather than a fixed pink, so it
 * re-tints with the theme, and kept at low alpha so it never competes with the
 * card's own border. Shared by the form and the wait, which is half of what
 * makes them read as one screen.
 */
function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: [
          'radial-gradient(60% 45% at 50% 8%, color-mix(in srgb, var(--sl-brand-primary) 16%, transparent) 0%, transparent 70%)',
          'radial-gradient(45% 40% at 85% 95%, color-mix(in srgb, var(--sl-brand-primary) 10%, transparent) 0%, transparent 70%)',
        ].join(', '),
      }}
    />
  );
}

/** Google's mark, inline so the page pulls in no remote asset. */
function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('identify');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  // Non-null while a provider's consent page is layered over the slot below.
  const [provider, setProvider] = useState<'google' | 'apple' | null>(null);
  const providerSlotRef = useRef<HTMLDivElement | null>(null);
  // False until main has the provider's page painted and layered over the slot.
  // Until then the slot is ours to draw in.
  const [providerReady, setProviderReady] = useState(false);
  // True once the provider has handed back and main is finishing the sign-in.
  // The native view is off the window again, so the slot is ours once more.
  const [finishing, setFinishing] = useState(false);
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);

  const api = (window as any).electronAPI;
  const code = digits.join('');

  // The IPC bridge is built in preload.js, which only reloads when Electron
  // itself restarts — a Vite hot reload swaps this page but not the bridge
  // under it. A dev instance started before these handlers existed would
  // otherwise fail every attempt with a generic "please try again", so say what
  // actually needs to happen.
  const bridgeStale = !api?.authOtpRequest || !api?.authOtpVerify;
  const STALE_BRIDGE_MESSAGE = 'Restart Smartloop Studio to finish updating, then sign in.';

  /**
   * Where the provider's page should sit, in window coordinates. The view is a
   * native layer with no idea what the DOM is doing, so its bounds have to be
   * pushed to main whenever the slot moves — mount, resize, window resize.
   */
  const slotBounds = useCallback(() => {
    const rect = providerSlotRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, []);

  // Keep the native view glued to the slot for as long as one is up.
  useLayoutEffect(() => {
    if (!provider || !api?.authProviderBounds) return;
    const push = () => {
      const bounds = slotBounds();
      if (bounds) api.authProviderBounds(bounds);
    };
    push();
    const observer = new ResizeObserver(push);
    if (providerSlotRef.current) observer.observe(providerSlotRef.current);
    window.addEventListener('resize', push);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', push);
    };
  }, [provider, api, slotBounds]);

  useEffect(() => {
    if (!api?.onAuthViewReady) return;
    return api.onAuthViewReady(() => setProviderReady(true));
  }, [api]);

  // The provider is done; what follows is our own callback, which is plumbing
  // and not a page anyone should be shown. Main hides it and the slot goes back
  // to being ours — so say what is happening rather than leave a gap.
  useEffect(() => {
    if (!api?.onAuthViewFinishing) return;
    return api.onAuthViewFinishing(() => {
      setProviderReady(false);
      setFinishing(true);
    });
  }, [api]);

  // Main tears the view down on its own when a provider page fails to load;
  // without this the page would keep rendering an empty slot.
  useEffect(() => {
    if (!api?.onAuthViewClosed) return;
    return api.onAuthViewClosed((data: { error?: string }) => {
      setProvider(null);
      setProviderReady(false);
      setFinishing(false);
      if (data?.error) setError(data.error);
    });
  }, [api]);

  // Every route into this page ends the same way: the local service gets the
  // tokens, main announces the user, and there is nothing left to sign in to.
  useEffect(() => {
    const onLoginState = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      // A provider flow that failed reports here too — without this the view
      // just disappears and the card sits there looking untouched.
      if (detail.state === 'error') {
        setProvider(null);
        setFinishing(false);
        setStarting(null);
        setBusy(false);
        setError(detail.error || 'Sign-in did not complete. Please try again.');
        return;
      }
      if (detail.state !== 'success') return;

      // Straight to the app. A successful code is the end of signing in, and
      // the button the user pressed has been showing the progress all along —
      // an interstitial here would only put a screen between them and the
      // window they asked for.
      window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: true, user: detail.user } }));
      navigate('/');
    };
    window.addEventListener('loginState', onLoginState);
    return () => window.removeEventListener('loginState', onLoginState);
  }, [navigate]);

  // Leaving mid-flow must not strand a native view over whatever renders next.
  useEffect(() => () => { api?.authProviderCancel?.(); }, [api]);

  // Escape dismisses the whole screen, the way it closes any modal surface in
  // the app. It leaves outright rather than stepping back through the code
  // screen: the chevron is the step-back, Escape is the way out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      api?.authProviderCancel?.();
      navigate('/');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, navigate]);

  // Land the caret in the first empty box whenever the code screen appears.
  useEffect(() => {
    if (step !== 'code') return;
    const t = setTimeout(() => codeInputs.current[0]?.focus(), 60);
    return () => clearTimeout(t);
  }, [step]);

  // ── Provider flow ─────────────────────────────────────────────────────────
  // Starting is split across a render on purpose: main positions the view over
  // `providerSlotRef`, and the slot only exists once `provider` has rendered.
  // Measuring in the click handler would hand main the bounds of an element
  // React has not committed yet.
  const [starting, setStarting] = useState<'google' | 'apple' | null>(null);

  const startProvider = (which: 'google' | 'apple') => {
    if (!api?.authProviderStart) { setError(STALE_BRIDGE_MESSAGE); return; }
    setError('');
    setProviderReady(false);
    setFinishing(false);
    setProvider(which);
    setStarting(which);
  };

  useEffect(() => {
    if (!starting) return;
    let cancelled = false;
    (async () => {
      const result = await api?.authProviderStart?.(starting, slotBounds());
      if (cancelled) return;
      if (!result?.success) {
        setProvider(null);
        setError(result?.error || `Could not start ${starting} sign-in.`);
      }
      setStarting(null);
    })();
    return () => { cancelled = true; };
  }, [starting, api, slotBounds]);

  // Back is immediate. Waiting on the IPC before dropping the flow would leave
  // the wait on screen for as long as main takes to answer — which is the one
  // thing someone pressing Back has said they are done looking at.
  const cancelProvider = () => {
    setStarting(null);
    setProviderReady(false);
    setFinishing(false);
    setProvider(null);
    setError('');
    void api?.authProviderCancel?.();
  };

  // ── Email code flow ───────────────────────────────────────────────────────
  const emailLooksValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy || !emailLooksValid) return;
    if (bridgeStale) { setError(STALE_BRIDGE_MESSAGE); return; }
    setBusy(true);
    setError('');
    try {
      const result = await api?.authOtpRequest?.(email.trim());
      if (!result?.success) {
        setError(result?.error || (result ? 'Could not send the code. Please try again.' : STALE_BRIDGE_MESSAGE));
        return;
      }
      setDigits(Array(CODE_LENGTH).fill(''));
      setStep('code');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api?.authOtpRequest?.(email.trim());
      if (!result?.success) {
        setError(result?.error || 'Could not resend the code.');
        return;
      }
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = useCallback(async (value: string) => {
    if (busy || value.length !== CODE_LENGTH) return;
    setBusy(true);
    setError('');
    try {
      const result = await api?.authOtpVerify?.(email.trim(), value);
      // Success navigates via the loginState listener — main broadcasts the
      // user once the local service holds the tokens.
      if (!result?.success) {
        setError(result?.error || (result ? 'That code did not work. Try again.' : STALE_BRIDGE_MESSAGE));
        setDigits(Array(CODE_LENGTH).fill(''));
        codeInputs.current[0]?.focus();
      }
    } finally {
      setBusy(false);
    }
  }, [api, busy, email]);

  /** Write one box and move on; a full code verifies without another click. */
  const setDigit = (index: number, raw: string) => {
    const chars = raw.replace(/\D/g, '');
    if (!chars) return;

    setDigits((prev) => {
      const next = [...prev];
      // A paste lands in one box but fills the rest — people paste the whole
      // code out of the email far more often than they retype it.
      for (let i = 0; i < chars.length && index + i < CODE_LENGTH; i++) {
        next[index + i] = chars[i];
      }
      const landed = Math.min(index + chars.length, CODE_LENGTH - 1);
      codeInputs.current[landed]?.focus();

      const joined = next.join('');
      if (joined.length === CODE_LENGTH && !joined.includes('')) void verifyCode(joined);
      return next;
    });
  };

  const onCodeKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      setDigits((prev) => {
        const next = [...prev];
        // Backspace in an empty box steps back and clears the one before it,
        // which is what every OS code field does.
        if (next[index]) next[index] = '';
        else if (index > 0) {
          next[index - 1] = '';
          codeInputs.current[index - 1]?.focus();
        }
        return next;
      });
    } else if (event.key === 'ArrowLeft' && index > 0) {
      codeInputs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      codeInputs.current[index + 1]?.focus();
    }
  };

  const backToEmail = () => {
    setStep('identify');
    setError('');
    setDigits(Array(CODE_LENGTH).fill(''));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // `h-screen` rather than `h-full`: #root has no height of its own, so a
  // percentage collapses and nothing can centre against it. globals.css already
  // corrects h-screen for the title bar (`.cet-container .h-screen`).
  const page = (children: React.ReactNode, showBack = true) => (
    <Box className="relative h-screen w-full flex items-center justify-center bg-sl-bg-base overflow-y-auto px-6">
      <AmbientGlow />
      {/* Leaving without signing in. A chevron in the corner rather than a link
          under the form: it is navigation, not one of the choices the card
          offers, and this is where a native app puts it. The macOS traffic
          lights live in the title bar above, so there is nothing to collide
          with. */}
      {showBack && (
        <>
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back"
            title="Back"
            className="absolute top-3 left-3 flex items-center justify-center w-8 h-8 rounded-lg text-sl-text-faint hover:text-sl-text-primary hover:bg-sl-bg-surface-1 transition-colors"
          >
            <ArrowBackIosNewIcon sx={{ fontSize: 13 }} />
          </button>

          {/* Keyboard equivalent of the chevron. Along the bottom edge rather
              than in a top corner: up there it sits level with the card's
              heading and reads as part of the title bar, competing with the
              chevron opposite it. Down here it is out of the way until looked
              for, which is all a keyboard hint needs to be. Bracketed and
              monospaced so it reads as a key, not a word. */}
          <Box className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 select-none">
            <kbd
              className="px-1.5 py-[3px] rounded-[5px] font-mono text-[9.5px] font-semibold tracking-[0.08em] leading-none"
              style={{
                color: 'var(--sl-brand-primary)',
                border: '1px solid var(--sl-brand-alpha-30)',
                opacity: 0.85,
              }}
            >
              [ESC]
            </kbd>
            <span className="text-[10.5px] text-sl-text-faint">to go back</span>
          </Box>
        </>
      )}
      {children}
    </Box>
  );

  // A provider flow takes the window over: its consent screen is a native layer,
  // so the card would only be chrome behind it.
  if (provider) {
    return (
      <Box className="relative h-screen w-full flex flex-col bg-sl-bg-base">
        <AmbientGlow />
        {/* The same chrome throughout. Going to the provider and coming back
            are two halves of one wait, so nothing about this screen is allowed
            to change between them — a second layout, or a second wording, is
            read as a second step even when it is the same screen. Back stops
            working once the provider has handed back: the account is signed in
            by then, and cancelling would only strand it. */}
        <Box className="relative flex items-center gap-1.5 px-4 h-[44px] shrink-0 border-b border-sl-border-subtle">
          <button
            type="button"
            onClick={cancelProvider}
            disabled={finishing}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-sl-text-muted hover:text-sl-text-primary transition-colors disabled:opacity-40 disabled:hover:text-sl-text-muted"
          >
            <ArrowBackIosNewIcon sx={{ fontSize: 11 }} />
            Back
          </button>
          <span className="text-[12px] font-medium text-sl-text-secondary">
            Continue with {provider === 'google' ? 'Google' : 'Apple'}
          </span>
        </Box>
        {/* The WebContentsView is positioned over exactly this box once it has
            a page to show. Until then it is not attached at all, so what is
            drawn here is what the user sees — the alternative is a blank
            native layer for the length of the redirect chain. It comes off
            again the moment the provider is done, so this same wait also
            covers the callback finishing in the background. */}
        <div ref={providerSlotRef} className="relative flex-1 min-h-0 flex items-center justify-center px-6">
          {!providerReady && (
            /* Outlined and transparent, the shape "Tips to Get Started" uses in
               chat — a filled card here reads as a thing sitting on the window,
               and nothing is sitting: this is the window's own state while it
               waits. The mark gets the same soft brand tile that box gives its
               icon, so the two are recognisably the same furniture.

               And it says something. A bare spinner is accurate and tells you
               nothing, which is the wrong answer in the one stretch where the
               user has handed their account somewhere and is waiting to hear
               back. */
            <Box className="w-full max-w-[380px] flex flex-col items-center text-center gap-4 rounded-2xl border border-sl-border-subtle px-8 py-9">
              <Box className="flex items-center justify-center w-10 h-10 rounded-[10px] bg-[var(--sl-brand-alpha-10)] border border-[var(--sl-brand-alpha-20)]">
                <LogoMark className="h-5 w-5" />
              </Box>
              <Box className="flex flex-col gap-1.5">
                <h2 className="text-sl-text-primary text-[15px] font-semibold tracking-[-0.01em]">
                  Signing you in
                </h2>
                <p className="text-sl-text-tertiary text-[12.5px] leading-relaxed">
                  {provider === 'google' ? 'Google' : 'Apple'} is confirming it&apos;s you.
                  We&apos;ll finish up here as soon as it does — it only takes a moment.
                </p>
              </Box>
              <CircularProgress size={15} sx={{ color: 'var(--sl-brand-primary)' }} />
            </Box>
          )}
        </div>
      </Box>
    );
  }

  if (step === 'code') {
    return page(
      <Box className={`${cardClass} px-7 pt-4 pb-7 gap-5`}>
        <button
          type="button"
          onClick={backToEmail}
          className="flex items-center gap-1.5 self-start text-[12px] text-sl-text-muted hover:text-sl-text-primary transition-colors"
        >
          <ArrowBackIosNewIcon sx={{ fontSize: 11 }} />
          Back
        </button>

        <Box className="flex flex-col items-center gap-2 text-center">
          <LogoMark className="h-7 w-7" />
          <h1 className="text-sl-text-primary text-[17px] font-semibold tracking-[-0.01em] mt-1">
            Verify your email
          </h1>
          <p className="text-[12px] text-sl-text-muted leading-[1.5]">
            Enter the code we sent to <span className="text-sl-text-secondary">{email.trim()}</span>
          </p>
        </Box>

        <Box className="flex justify-center gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { codeInputs.current[index] = el; }}
              value={digit}
              onChange={(e) => setDigit(index, e.target.value)}
              onKeyDown={onCodeKeyDown(index)}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={CODE_LENGTH}
              disabled={busy}
              className="w-[42px] h-[46px] rounded-lg text-center text-[18px] font-medium bg-sl-bg-surface-2 text-sl-text-primary border border-sl-border outline-none transition-all focus:border-sl-brand-primary focus:ring-2 focus:ring-[var(--sl-brand-alpha-30)] disabled:opacity-60"
            />
          ))}
        </Box>

        {error && <span className="text-[11.5px] text-sl-status-error text-center leading-[1.45]">{error}</span>}

        <Box className="flex justify-center text-[11.5px] text-sl-text-muted">
          {resent ? (
            <span className="text-sl-text-secondary">A new code is on its way.</span>
          ) : (
            <span>
              Didn&apos;t get it?{' '}
              <button
                type="button"
                onClick={resendCode}
                disabled={busy}
                className="text-sl-text-primary font-medium hover:text-sl-brand-primary transition-colors disabled:opacity-50"
              >
                Resend
              </button>
            </span>
          )}
        </Box>

        <button
          type="button"
          onClick={() => verifyCode(code)}
          disabled={busy || code.length !== CODE_LENGTH}
          className={primaryButtonClass}
          style={primaryButtonStyle(busy || code.length !== CODE_LENGTH)}
        >
          {busy && <CircularProgress size={14} sx={{ color: 'inherit' }} />}
          Verify
        </button>
      </Box>,
      false,
    );
  }

  return page(
    <>
      <Box className={`${cardClass} px-7 py-8 gap-6`}>
        <Box className="flex flex-col items-center gap-2.5 text-center">
          <LogoMark className="h-8 w-8" />
          <h1 className="text-sl-text-primary text-[17px] font-semibold tracking-[-0.01em] mt-1">
            Sign in to Smartloop
          </h1>
          <p className="text-[12px] text-sl-text-muted leading-[1.5]">
            Enter your email and we&apos;ll send you a sign-in code
          </p>
        </Box>

        <Box className="flex flex-col gap-2">
          <button type="button" onClick={() => startProvider('apple')} className={providerButtonClass}>
            <AppleIcon sx={{ fontSize: 16, mt: '-2px' }} />
            Continue with Apple
          </button>
          <button type="button" onClick={() => startProvider('google')} className={providerButtonClass}>
            <GoogleIcon />
            Continue with Google
          </button>
        </Box>

        <Box className="flex items-center gap-3">
          <span className="flex-1 h-px bg-sl-border-subtle" />
          <span className="text-[11px] text-sl-text-faint">or</span>
          <span className="flex-1 h-px bg-sl-border-subtle" />
        </Box>

        <form className="flex flex-col gap-2" onSubmit={requestCode}>
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            className={inputClass}
          />
          {error && <span className="text-[11.5px] text-sl-status-error leading-[1.45]">{error}</span>}
          <button
            type="submit"
            disabled={busy || !emailLooksValid}
            className={primaryButtonClass}
            style={primaryButtonStyle(busy || !emailLooksValid)}
          >
            {busy && <CircularProgress size={14} sx={{ color: 'inherit' }} />}
            Continue with email
          </button>
        </form>

        {/* Sign-in wrap: the notice sits immediately below the button that
            constitutes agreement, which is what makes this kind of assent hold
            up — a notice buried away from the action does not.
            Deliberately text-muted rather than text-faint: terms that are not
            legible are not conspicuous, and faint grey on a dark card fails
            contrast. A tick-box (clickwrap) would be stronger still, but the
            binding agreement is made at sign-up, which happens on the web —
            this screen only signs an existing account in. */}
        <Box className="flex justify-center text-[10px] text-sl-text-muted text-center leading-[1.6]">
          <span>
            By continuing you agree to our{' '}
            <BracketLink label="Terms" onClick={() => api?.openExternal?.(TERMS_URL)} />
            {' '}and{' '}
            <BracketLink label="Privacy" onClick={() => api?.openExternal?.(PRIVACY_URL)} />
          </span>
        </Box>

      </Box>
    </>,
  );
}
