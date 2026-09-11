import { parseThemeYaml } from './theme-parse';

// Theme ids are strings (built-in preset ids + user `custom-*` ids).
export type ThemeId = string;

export interface ThemeColors {
  bg: { base: string; surface1: string; surface2: string; surface3: string; input: string; elevated: string };
  brand: { primary: string; hover: string; active: string; light: string };
  text: { primary: string; secondary: string; tertiary: string; muted: string; disabled: string; faint: string };
  status: { error: string; success: string; online: string; warning: string; info: string; purple: string };
  border: { subtle: string; default: string; hover: string; code: string };
  table: { head: string; hover: string; stripe: string; inlineCode: string };
}

// Rail icons a theme may override with its own artwork (right-sidebar rail).
export type RailIconName = 'logs' | 'models' | 'documents' | 'mcp' | 'skills' | 'settings';

// Optional per-theme typography. `family` is applied to body/UI text (and MUI),
// `heading` (falling back to `family`) to h1–h6, and `url` is a stylesheet the
// renderer injects to load the webfont (e.g. a Google Fonts link).
export interface ThemeFont {
  family: string;
  heading?: string;
  url?: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  colors: ThemeColors;
  // Optional per-theme rail icons: name → raw inline SVG markup. When present a
  // theme (built-in preset or user-imported YAML) ships its own iconography for
  // the right-sidebar rail, replacing the default vector icons. SVGs should use
  // `stroke="currentColor"`/`fill="currentColor"` so they inherit rail states.
  icons?: Partial<Record<RailIconName, string>>;
  // Optional themed typeface (family + optional heading font + webfont URL).
  font?: ThemeFont;
}

// ── Theme presets are shipped as YAML, not hardcoded here ────────────────────
// Every built-in theme lives in ./presets/*.yaml and is loaded + parsed at
// build time, so themes are data (a single YAML source) rather than code.
// User-imported custom themes (see custom-themes.ts) use the exact same parser.
const presetModules = import.meta.glob('./presets/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const loadedThemes: ThemeDefinition[] = [];
for (const path of Object.keys(presetModules).sort()) {
  const { theme, error } = parseThemeYaml(presetModules[path], { allowExplicitId: true });
  if (theme) loadedThemes.push(theme);
  else console.error(`[themes] failed to load preset ${path}: ${error}`);
}

// Safety net: never leave the app without the default theme (Smartloop).
if (!loadedThemes.some((t) => t.id === 'smartloop')) {
  loadedThemes.unshift({
    id: 'smartloop',
    name: 'Smartloop',
    description: 'Pink accent dark theme inspired by GitHub Dark',
    mode: 'dark',
    colors: {
      bg: { base: '#000000', surface1: '#1a1a1a', surface2: '#2a2a2a', surface3: '#3a3a3a', input: '#303030', elevated: '#1b1b1b' },
      brand: { primary: '#ec4899', hover: '#db2777', active: '#be185d', light: '#f472b6' },
      text: { primary: '#ffffff', secondary: '#e5e7eb', tertiary: '#d1d5db', muted: '#9ca3af', disabled: '#6b7280', faint: '#4b5563' },
      status: { error: '#ef4444', success: '#10b981', online: '#22c55e', warning: '#f59e0b', info: '#3b82f6', purple: '#a855f7' },
      border: { subtle: '#1a1a1a', default: '#2a2a2a', hover: '#3a3a3a', code: '#374151' },
      table: { head: '#111827', hover: '#1f2937', stripe: '#0f1419', inlineCode: '#1f2937' },
    },
  });
}

export const themeList: ThemeDefinition[] = loadedThemes;
export const themes: Record<string, ThemeDefinition> = Object.fromEntries(loadedThemes.map((t) => [t.id, t]));

function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '0,0,0';
}

/**
 * A foreground that stays readable on a filled brand surface.
 *
 * Every theme picks its own accent, and they span light pastels (Catppuccin's
 * mauve, our pink) to saturated mid-tones (Solarized blue). One fixed
 * foreground cannot serve all of them — black vanishes on a dark accent and
 * white vanishes on a light one — so it is derived per theme from the accent's
 * relative luminance (WCAG's 0.179 crossover, the point where black and white
 * contrast equally).
 */
function brandContrast(brandHex: string): string {
  const hex = brandHex.replace('#', '');
  if (hex.length < 6) return '#ffffff';
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export function applyThemeCssVars(theme: ThemeDefinition) {
  const s = document.documentElement.style;
  const { colors: c } = theme;

  s.setProperty('--sl-bg-base', c.bg.base);
  s.setProperty('--sl-bg-surface-1', c.bg.surface1);
  s.setProperty('--sl-bg-surface-2', c.bg.surface2);
  s.setProperty('--sl-bg-surface-3', c.bg.surface3);
  s.setProperty('--sl-bg-input', c.bg.input);
  s.setProperty('--sl-bg-elevated', c.bg.elevated);

  s.setProperty('--sl-brand-primary', c.brand.primary);
  s.setProperty('--sl-brand-hover', c.brand.hover);
  s.setProperty('--sl-brand-active', c.brand.active);
  s.setProperty('--sl-brand-light', c.brand.light);
  // Derived, never authored: a theme only declares its accent, and anything
  // drawn ON that accent (button labels, filled badges) needs a foreground that
  // survives it. Without this the token fell back to the stylesheet's single
  // value and went invisible on any theme with a dark accent.
  s.setProperty('--sl-brand-contrast', brandContrast(c.brand.primary));

  // Body fill for the Smartloop logo mark — the theme's primary text in both
  // modes, so the mark is the app-icon white on a dark surface and near-black on
  // a light one. It used to take the brand primary on light themes, which was
  // the same colour as the mark's dot: body and dot resolved identically and the
  // glyph flattened into one solid brand-coloured shape on every light theme.
  // Primary text is also the higher-contrast choice of the two (#1f2328 vs
  // #ec4899 on white), so the mark reads better as well as reading correctly.
  s.setProperty('--sl-brand-mark', c.text.primary);

  s.setProperty('--sl-text-primary', c.text.primary);
  s.setProperty('--sl-text-secondary', c.text.secondary);
  s.setProperty('--sl-text-tertiary', c.text.tertiary);
  s.setProperty('--sl-text-muted', c.text.muted);
  s.setProperty('--sl-text-disabled', c.text.disabled);
  s.setProperty('--sl-text-faint', c.text.faint);

  s.setProperty('--sl-status-error', c.status.error);
  s.setProperty('--sl-status-success', c.status.success);
  s.setProperty('--sl-status-online', c.status.online);
  s.setProperty('--sl-status-warning', c.status.warning);
  s.setProperty('--sl-status-info', c.status.info);
  s.setProperty('--sl-status-purple', c.status.purple);

  s.setProperty('--sl-border-subtle', c.border.subtle);
  s.setProperty('--sl-border-default', c.border.default);
  s.setProperty('--sl-border-hover', c.border.hover);
  s.setProperty('--sl-border-code', c.border.code);

  s.setProperty('--sl-bg-table-head', c.table.head);
  s.setProperty('--sl-bg-table-hover', c.table.hover);
  s.setProperty('--sl-bg-table-stripe', c.table.stripe);
  s.setProperty('--sl-bg-inline-code', c.table.inlineCode);

  const brandRgb = hexToRgb(c.brand.primary);
  s.setProperty('--sl-brand-primary-rgb', brandRgb);
  for (const a of [10, 15, 18, 20, 30, 35, 40, 50, 60]) {
    s.setProperty(`--sl-brand-alpha-${a}`, `rgba(${brandRgb}, ${a / 100})`);
  }

  const dangerRgb = hexToRgb(c.status.error);
  for (const a of [10, 15, 20, 30, 50]) {
    s.setProperty(`--sl-danger-alpha-${a}`, `rgba(${dangerRgb}, ${a / 100})`);
  }

  const isLight = theme.mode === 'light';
  const overlayBase = isLight ? '0,0,0' : hexToRgb(c.text.primary);
  const invertBase = isLight ? hexToRgb(c.text.primary) : '0,0,0';
  for (const a of [2, 5, 7, 8, 10, 15, 20, 30, 40, 50, 60, 70, 80, 85]) {
    s.setProperty(`--sl-white-alpha-${a}`, `rgba(${overlayBase}, ${a / 100})`);
  }
  for (const a of [20, 30, 40, 50]) {
    s.setProperty(`--sl-black-alpha-${a}`, `rgba(${invertBase}, ${a / 100})`);
  }
}
