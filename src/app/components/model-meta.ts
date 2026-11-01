// Shared model metadata decoding: turning a raw catalog entry into the numbers
// and plain-language labels the UI shows (friendly name, size tier, RAM
// pressure, capability/tier copy).
//
// These used to live inside the right sidebar's models panel. The composer's
// model picker replaced that panel and needs the same vocabulary, so they moved
// here rather than being duplicated.

// Model parameter count in billions. The backend doesn't send a param field, so
// we read an explicit one if present, otherwise parse it out of the model name /
// id — e.g. "gemma3-4b" → 4, "gemma-4-e2b-it" → 2, "qwen2-vl-2b" → 2.
export function paramBillions(m: any): number | null {
    const explicit = m.parameters ?? m.params ?? m.param_count ?? m.param_size;
    if (explicit != null && explicit !== '') {
        if (typeof explicit === 'number') return explicit >= 1e6 ? explicit / 1e9 : explicit;
        const n = parseFloat(String(explicit));
        if (!isNaN(n)) return /m/i.test(String(explicit)) && !/b/i.test(String(explicit)) ? n / 1000 : n;
    }
    // "<digits>b" tokens in the name (e.g. the 2 in "e2b"). Pick the largest.
    const src = `${m.name || ''} ${m.model_id || m.model || m.id || ''}`;
    const vals = [...src.matchAll(/(\d+(?:\.\d+)?)\s*b\b/gi)]
        .map((x) => parseFloat(x[1]))
        .filter((v) => v > 0 && v < 1000);
    return vals.length ? Math.max(...vals) : null;
}

// Size cue for a row: pairs the real parameter size with the benefit it buys, so
// a non-technical user sees both the number (which distinguishes two same-family
// models) and what it means — smaller = faster/lighter, bigger = more capable.
export function sizeTier(m: any): { label: string; tip: string } | null {
    const b = paramBillions(m);
    if (b == null) return null;
    const approx = b >= 10 ? Math.round(b) : Number.isInteger(b) ? b : +b.toFixed(1);
    const benefit = b < 1 ? 'Fastest' : b < 2.5 ? 'Fast' : b < 5 ? 'Balanced' : b < 10 ? 'Smarter' : 'Smartest';
    return {
        label: benefit,
        tip: `About ${approx} billion parameters — ${benefit.toLowerCase()}. Larger models are more capable but use more memory and respond slower.`,
    };
}

// Short tokens that are acronyms, not words, so title-casing them looks wrong.
const ACRONYMS = new Set(['sl', 'ai', 'ml', 'llm', 'slm', 'gpt', 'tts', 'stt', 'ocr']);

// Engineering tokens that mean nothing to a regular user — dropped from the
// friendly name (quantization, fine-tune method, date tags, etc.).
const NAME_NOISE = new Set([
    'instruct', 'it', 'chat', 'base', 'sft', 'dpo', 'rlhf', 'gguf', 'ggml',
    'hf', 'mlx', 'onnx', 'preview', 'latest', 'text', 'tuned', 'finetune', 'finetuned',
]);

// Turn a raw model id into a friendly, human-readable name. Regular users don't
// care about version numbers (Gemma 3 vs 4) or the parameter size (that lives in
// its own explained tag), so we keep just the family name plus any capability
// word. We drop the org prefix, engineering noise, quantization, dates, versions,
// and the size token. Examples:
//   "gemma3-4b"                        → "Gemma"
//   "qwen2.5-vl-3b"                    → "Qwen Vision"
//   "mistralai/Ministral-3B-Instruct" → "Ministral"
export function prettyModelName(m: any): string {
    const raw = String(m.name || m.id || m.model || '');
    const id = raw.split('/').pop() || raw;
    const parts = id
        .split(/[-_\s]+/)
        .filter(Boolean)
        .filter((t) => {
            const l = t.toLowerCase();
            if (NAME_NOISE.has(l)) return false;
            if (/^v?\d+(?:\.\d+)*$/.test(l)) return false;              // bare version/date (3, 2.5, 2512)
            if (/^(q\d|int\d|fp\d|bf\d|awq|gptq|\d+bit)/i.test(l)) return false; // quantization
            if (/^[a-z]?\d+(?:\.\d+)?b$/i.test(l)) return false;        // size token (4b, e2b)
            return true;
        })
        .map((t) => {
            const l = t.toLowerCase();
            if (l === 'vl' || l === 'vision') return 'Vision';
            if (l === 'coder') return 'Coder';
            // Brand acronyms stay upper case — "sl-mini" is SL Mini, not Sl Mini.
            if (ACRONYMS.has(l)) return t.toUpperCase();
            // Strip the version/size digits off a family token: "gemma3" → "Gemma",
            // "qwen2.5" → "Qwen", "llama3.2" → "Llama".
            const alpha = t.replace(/[\d.].*$/, '') || t;
            return /[A-Z]/.test(alpha) ? alpha : alpha.charAt(0).toUpperCase() + alpha.slice(1);
        });
    return parts.join(' ').replace(/\s+/g, ' ').trim() || raw;
}

// The label a picker row leads with: a curated backend display_name when it's
// actually different from the raw id, otherwise the decoded friendly name.
export function modelLabel(m: any): string {
    const name = m.name || m.id || m.model;
    return m.display_name && m.display_name !== name ? m.display_name : prettyModelName(m);
}

// Approximate the model's RAM footprint in GB. Prefers an explicit memory/size
// field (GB or raw bytes); otherwise estimates from the param count at ~1GB per
// billion params, which keeps a 4B model at ~4GB. Returns null when unknown.
export function memoryGb(m: any): number | null {
    const raw = m.memory ?? m.memory_gb ?? m.memory_required ?? m.min_memory ?? m.ram ?? m.size_gb ?? m.size;
    if (raw != null && raw !== '') {
        if (typeof raw === 'number') {
            // Big enough to be bytes → GB; big enough to be MB → GB; else already GB.
            const gb = raw >= 1024 ** 3 ? raw / 1024 ** 3 : raw >= 1024 ? raw / 1024 : raw;
            if (isFinite(gb) && gb > 0) return gb;
        } else {
            const s = String(raw).trim();
            const n = parseFloat(s);
            if (!isNaN(n) && n > 0) return /mb/i.test(s) ? n / 1024 : n;
        }
    }
    const billions = paramBillions(m);
    return billions != null ? billions : null;
}

// Memory pressure = the model's estimated RAM footprint relative to the machine's
// total RAM. This is what "pressure" actually means: the same model is High on an
// 8GB laptop and Low on a 32GB workstation. Buckets: >=80% won't fit (too big to
// run alongside the OS + app), >=40% high, >10% medium, otherwise low. `fits` is
// false only for the won't-fit bucket. Falls back to null when we know neither the
// size nor the RAM.
export function memoryPressure(m: any, totalRamGb: number | null): { gb: number; pct: number; label: string; color: string; border: string; fits: boolean } | null {
    const gb = memoryGb(m);
    if (gb == null || !totalRamGb || totalRamGb <= 0) return null;
    const rounded = gb >= 10 ? Math.round(gb) : +gb.toFixed(1);
    const pct = Math.round((gb / totalRamGb) * 100);
    if (pct >= 80) return { gb: rounded, pct, label: "Won't fit", color: '#f87171', border: 'rgba(248,113,113,0.45)', fits: false };
    if (pct >= 40) return { gb: rounded, pct, label: 'High', color: '#fb923c', border: 'rgba(251,146,60,0.35)', fits: true };
    if (pct > 10) return { gb: rounded, pct, label: 'Medium', color: '#fbbf24', border: 'rgba(251,191,36,0.35)', fits: true };
    return { gb: rounded, pct, label: 'Low', color: '#86efac', border: 'rgba(134,239,172,0.35)', fits: true };
}

// A model served from the cloud rather than run from weights on this machine.
// An entry without `type` is local.
export function isRemote(m: any): boolean {
    return m.type === 'remote';
}

// Where the model runs, as a tag. Shown on every row so local and cloud models
// read apart at a glance.
export function locationTag(m: any): { label: string; color: string; border: string; tip: string } {
    return isRemote(m)
        ? { label: 'Cloud', color: '#7dd3fc', border: 'rgba(125,211,252,0.35)', tip: 'Cloud — runs on Smartloop servers, nothing to download. Requests leave this machine.' }
        : { label: 'Local', color: 'var(--sl-text-faint)', border: 'var(--sl-border-default)', tip: 'Local — runs on this machine from downloaded weights. Requests stay on this machine.' };
}

// Context window as a short tag ("128K context"), or null when the catalog
// doesn't say.
export function contextTag(m: any): { label: string; tip: string } | null {
    const n = m.context_length;
    if (typeof n !== 'number' || !(n > 0)) return null;
    const short = n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
    return { label: `${short} context`, tip: `Reads up to ${n.toLocaleString()} tokens of conversation and documents at once` };
}

// Normalized title used to match a model against the SSE "Selected …" status
// message. The message is built from the model_id (e.g.
// "mistralai/Ministral-3-3B-Instruct-2512" → "ministral 3 3b instruct 2512"),
// so we derive the same string from the model to test containment.
export function matchTitle(m: any): string {
    const id = String(m.model_id || m.name || m.id || m.model || '');
    return id.split('/').pop()!.replace(/[-_]+/g, ' ').trim().toLowerCase();
}

// Human-readable explanation for each capability tag, shown on hover.
// Capabilities are what a model has, not what a turn is about: every text
// model reads documents and writes code, so there is no tag for those.
export const CAPABILITY_INFO: Record<string, string> = {
    vision: 'Vision — understands and interprets images alongside text',
    reasoning: 'Reasoning — plans, picks tools and skills, and thinks before answering',
    skills: 'Skills — can invoke skills to extend what it can do',
};

// Outlined colors for each capability tag, per the app's label style guide.
export const CAPABILITY_STYLE: Record<string, { color: string; border: string }> = {
    vision: { color: '#93c5fd', border: 'rgba(147,197,253,0.35)' },
    reasoning: { color: '#c4b5fd', border: 'rgba(196,181,253,0.35)' },
    skills: { color: '#86efac', border: 'rgba(134,239,172,0.35)' },
};

// Short explanation for each plan/access tier tag, shown on hover.
export const TIER_INFO: Record<string, string> = {
    'Free with sign-in': 'Free with sign-in — available to any logged-in account',
    Pro: 'Pro model — included with a Pro plan',
    Internal: 'Internal model — available to your account',
};

// Tier tag shown on gated models: free_login a green "Free with sign-in", pro
// the brand color, internal a blue "Internal". A free model gets no tag.
export function tierTag(m: any): { label: string; color: string; border: string } | null {
    if (m.access_level === 'free_login') return { label: 'Free with sign-in', color: '#6ee7b7', border: 'rgba(110,231,183,0.35)' };
    if (m.access_level === 'pro') return { label: 'Pro', color: 'var(--sl-brand-primary)', border: 'var(--sl-brand-alpha-30)' };
    if (m.access_level === 'internal') return { label: 'Internal', color: 'rgb(96,165,250)', border: 'rgba(96,165,250,0.3)' };
    return null;
}

// The single gate on a model the user cannot download. `is_accessible` is
// computed per-user by the cloud catalog (ModelAccessManager.can_access_model)
// and already accounts for every tier: free is true for everyone, anonymous
// callers included; free_login is true for any signed-in account; pro is true for paid accounts and superusers; internal is
// true for superusers and withheld from the catalog entirely for anyone else.
// So there is nothing to combine it with — reading `access_level` alongside it
// only ever risks disagreeing with the cloud.
//
// Weights already on disk stay usable whatever the plan says now, so a
// downloaded model is never locked. A cloud model is checked on every request,
// so having added it earns nothing.
export function isLocked(m: any): boolean {
    return m.is_accessible === false && (isRemote(m) || !m.downloaded);
}

// What unlocks a locked model: signing in, for a free_login model and a
// signed-out user; otherwise a plan the account doesn't have.
export function lockRemedy(m: any, signedIn: boolean): 'login' | 'upgrade' {
    return m.access_level === 'free_login' && !signedIn ? 'login' : 'upgrade';
}

// What to say, and what to offer, for a download that failed.
//
// SLP classifies the failure for us — `status_for` in the backend's
// api/routers/_errors.py answers one status for both halves of /v1/init and for
// /v1/models/load — so this reads the code and nothing else. It used to be
// decided by a `requiresAuth` boolean that merged 401 and 403, plus a guess at
// which of them it was from whether the app thought it was signed in. That told
// a user whose session had died that their plan was insufficient.
//
// `message` is prose written for a person and gets reworded, so it is only ever
// a last resort here.
export type DownloadFailure = {
    message: string;
    detail?: string;
    code?: number | null;
    requiresAuth?: boolean;
};

export type FailureCopy = {
    headline: string;
    body: string;
    // What the user can do about it. `null` means there is nothing to offer.
    action: 'login' | 'contact' | 'upgrade' | 'retry' | null;
    // Which failure this reads as: an entitlement gate (a lock, in brand colour)
    // or something that went wrong (an error glyph, in red).
    tone: 'auth' | 'error';
};

const SIGN_IN: FailureCopy = {
    headline: 'Log in to download this model',
    body: 'Model weights are tied to your account — logging in is free and takes a few seconds.',
    action: 'login',
    tone: 'auth',
};

const SIGN_IN_REMOTE: FailureCopy = {
    headline: 'Log in to use this model',
    body: 'Cloud models run on your Smartloop account — logging in is free and takes a few seconds.',
    action: 'login',
    tone: 'auth',
};

// `canUpgrade` is true only in the Mac App Store build, the one build that
// sells Pro itself (UpgradeContext). Everywhere else a plan refusal offers
// "Contact us" and never a purchase.
// `remote` picks the copy for a cloud model, which is added rather than
// downloaded: the same /v1/init statuses, minus any talk of weights or transfers.
export function describeFailure(failure: DownloadFailure, canContact: boolean, canUpgrade = false, remote = false): FailureCopy {
    const { code, detail, message } = failure;
    const signIn = remote ? SIGN_IN_REMOTE : SIGN_IN;
    const failed = remote ? 'Couldn’t add this model' : 'Download failed';

    switch (code) {
        // No credentials the platform will accept. The backend refreshes and
        // retries before answering this, so it means sign in again — not "wait
        // and see", and never an upgrade prompt.
        case 401:
            return signIn;

        // Signed in, but the model isn't on this plan. The server says the useful
        // thing ("Upgrade required to access this model"); fall back only when it
        // said nothing. No button without an email to contact us from.
        case 403:
            return {
                headline: 'Your plan doesn’t include this model',
                body: detail || 'Tell us which models you need and we’ll sort out access.',
                action: canUpgrade ? 'upgrade' : canContact ? 'contact' : null,
                tone: 'auth',
            };

        // Gone from the catalog. Retrying fetches the same 404.
        case 404:
            return {
                headline: 'This model is no longer available',
                body: detail || 'It has been removed from the catalog.',
                action: null,
                tone: 'error',
            };

        case 429:
            return {
                headline: remote ? 'Too many requests right now' : 'Too many downloads right now',
                body: remote ? 'The service is rate-limiting requests — try again in a moment.' : 'The service is rate-limiting downloads — try again in a moment.',
                action: 'retry',
                tone: 'error',
            };

        // Local disk: an unwritable models directory, a full disk, a checksum
        // that didn't match. `detail` names which, and all three are things the
        // user fixes outside the app and then retries.
        case 500:
            return { headline: failed, body: detail || message, action: 'retry', tone: 'error' };

        // The transfer died; the weights are still there to fetch. /v1/init is a
        // real repair action now — it no longer reports an interrupted download
        // as ready — so the retry resumes rather than lying.
        case 502:
            if (remote) return { headline: failed, body: detail || message, action: 'retry', tone: 'error' };
            return {
                headline: 'Connection lost during download',
                body: detail || 'The transfer was interrupted before it finished.',
                action: 'retry',
                tone: 'error',
            };

        default:
            // No code: an older service, or a socket that died before any frame.
            // `requiresAuth` may still have been recovered from the message text,
            // and sign-in is the one remedy worth guessing at. Everything else
            // gets the button, because a retry the user can ignore is a smaller
            // failure than hiding the only way out of a download that would have
            // worked.
            if (failure.requiresAuth) return signIn;
            return { headline: failed, body: detail || message, action: 'retry', tone: 'error' };
    }
}
