import { load as yamlLoad } from 'js-yaml';
import type { ThemeColors, ThemeDefinition } from './themes';

// ── Color math ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
const lighten = (hex: string, amt: number) => mix(hex, '#ffffff', amt);
const darken = (hex: string, amt: number) => mix(hex, '#000000', amt);

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#?[a-f\d]{6}$/i.test(v.trim());
}
const norm = (hex: string) => (hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
}

// ── Minimal → full palette derivation ───────────────────────────────────────
// From a base background, a brand color and a text color, derive a cohesive
// full palette (surfaces, borders, muted text ramp, status defaults).
export function deriveThemeColors(mode: 'dark' | 'light', base: string, primary: string, textPrimary: string): ThemeColors {
  base = norm(base); primary = norm(primary); textPrimary = norm(textPrimary);
  // Surfaces move toward the foreground: lighter in dark mode, darker in light.
  const lift = (amt: number) => (mode === 'dark' ? lighten(base, amt) : darken(base, amt));

  const surface1 = lift(0.06);
  const surface2 = lift(0.12);
  const surface3 = lift(0.2);
  const inputBg = lift(0.08);
  const elevated = lift(0.03);

  return {
    bg: { base, surface1, surface2, surface3, input: inputBg, elevated },
    brand: { primary, hover: darken(primary, 0.1), active: darken(primary, 0.2), light: lighten(primary, 0.18) },
    text: {
      primary: textPrimary,
      secondary: mix(textPrimary, base, 0.12),
      tertiary: mix(textPrimary, base, 0.24),
      muted: mix(textPrimary, base, 0.45),
      disabled: mix(textPrimary, base, 0.62),
      faint: mix(textPrimary, base, 0.74),
    },
    status: { error: '#ef4444', success: '#10b981', online: '#22c55e', warning: '#f59e0b', info: '#3b82f6', purple: '#a855f7' },
    border: { subtle: surface1, default: lift(0.14), hover: surface3, code: lift(0.14) },
    table: { head: surface1, hover: surface2, stripe: elevated, inlineCode: surface2 },
  };
}

// Build a full ThemeColors from a YAML `colors` doc that may be minimal
// (bg/brand/text as single hex strings) or full (nested objects). The palette
// is first derived from the base/brand/text, then any explicit nested values
// are overlaid — so a full palette reproduces exactly, and a minimal one fills
// in automatically.
function buildColors(colorsDoc: any, mode: 'dark' | 'light'): { colors?: ThemeColors; error?: string } {
  if (!colorsDoc || typeof colorsDoc !== 'object') return { error: 'Missing "colors".' };
  const bgBase = typeof colorsDoc.bg === 'object' ? colorsDoc.bg?.base : colorsDoc.bg;
  const brandPrimary = typeof colorsDoc.brand === 'object' ? colorsDoc.brand?.primary : colorsDoc.brand;
  const textPrimary = typeof colorsDoc.text === 'object' ? colorsDoc.text?.primary : colorsDoc.text;
  for (const [key, val] of [['bg', bgBase], ['brand', brandPrimary], ['text', textPrimary]] as const) {
    if (!isHexColor(val)) return { error: `colors.${key} must be a 6-digit hex color (got: ${val ?? 'nothing'}).` };
  }

  const derived = deriveThemeColors(mode, bgBase, brandPrimary, textPrimary);
  for (const section of ['bg', 'brand', 'text', 'status', 'border', 'table'] as const) {
    const provided = colorsDoc[section];
    if (provided && typeof provided === 'object') {
      for (const [key, val] of Object.entries(provided)) {
        if (!isHexColor(val)) return { error: `colors.${section}.${key} must be a 6-digit hex color.` };
        (derived as any)[section][key] = norm(val as string);
      }
    }
  }
  return { colors: derived };
}

// ── Theme rail icons ─────────────────────────────────────────────────────────
const RAIL_ICON_NAMES = ['models', 'documents', 'mcp', 'skills', 'settings'] as const;

// User-imported YAML is untrusted and rail icons render as raw inline SVG, so
// strip anything that could execute: <script> tags, on*= event handlers, and
// javascript: URLs. Only accept a value that is actually a single <svg> element.
function sanitizeSvg(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return null;
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/((?:xlink:)?href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '');
}

function parseIcons(doc: any): Partial<Record<string, string>> | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const name of RAIL_ICON_NAMES) {
    const clean = sanitizeSvg(doc[name]);
    if (clean) out[name] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

// Parse an already-loaded YAML document into a ready-to-use theme.
// `allowExplicitId` trusts the doc's `id` (for shipped presets); otherwise a
// `custom-*` id is generated so user imports can never clobber a built-in.
export function parseThemeDoc(doc: any, opts: { allowExplicitId?: boolean } = {}): { theme?: ThemeDefinition; error?: string } {
  if (!doc || typeof doc !== 'object') return { error: 'YAML must be a mapping with a name and colors.' };
  if (typeof doc.name !== 'string' || !doc.name.trim()) return { error: 'Missing "name".' };
  if (doc.mode && doc.mode !== 'dark' && doc.mode !== 'light') return { error: 'mode must be "dark" or "light".' };
  const mode: 'dark' | 'light' = doc.mode === 'light' ? 'light' : 'dark';

  const { colors, error } = buildColors(doc.colors, mode);
  if (error || !colors) return { error: error || 'Invalid colors.' };

  const name = doc.name.trim();
  const id = opts.allowExplicitId && typeof doc.id === 'string' && doc.id.trim() ? doc.id.trim() : `custom-${slug(name)}`;
  const icons = parseIcons(doc.icons);
  return {
    theme: {
      id,
      name,
      description: (typeof doc.description === 'string' && doc.description.trim()) || 'Custom theme',
      mode,
      colors,
      ...(icons ? { icons } : {}),
    },
  };
}

// Parse a raw YAML string (a dropped file or a shipped preset).
export function parseThemeYaml(text: string, opts: { allowExplicitId?: boolean } = {}): { theme?: ThemeDefinition; error?: string } {
  let doc: any;
  try {
    doc = yamlLoad(text);
  } catch (e: any) {
    return { error: `Invalid YAML: ${e?.reason || e?.message || 'could not parse'}` };
  }
  return parseThemeDoc(doc, opts);
}
