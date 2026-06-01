export type ThemeId = 'smartloop' | 'smartloop-light' | 'rams';

export interface ThemeColors {
  bg: { base: string; surface1: string; surface2: string; surface3: string; input: string; elevated: string };
  brand: { primary: string; hover: string; active: string; light: string };
  text: { primary: string; secondary: string; tertiary: string; muted: string; disabled: string; faint: string };
  status: { error: string; success: string; online: string; warning: string; info: string; purple: string };
  border: { subtle: string; default: string; hover: string; code: string };
  table: { head: string; hover: string; stripe: string; inlineCode: string };
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  colors: ThemeColors;
}

const smartloop: ThemeDefinition = {
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
};

const smartloopLight: ThemeDefinition = {
  id: 'smartloop-light',
  name: 'Smartloop',
  description: 'Clean and bright with Smartloop pink accents',
  mode: 'light',
  colors: {
    bg: { base: '#ffffff', surface1: '#f5f5f5', surface2: '#ebebeb', surface3: '#e0e0e0', input: '#f0f0f0', elevated: '#fafafa' },
    brand: { primary: '#db2777', hover: '#be185d', active: '#9d174d', light: '#ec4899' },
    text: { primary: '#1a1a1a', secondary: '#374151', tertiary: '#4b5563', muted: '#6b7280', disabled: '#8b95a3', faint: '#9ca3af' },
    status: { error: '#dc2626', success: '#059669', online: '#16a34a', warning: '#d97706', info: '#2563eb', purple: '#7c3aed' },
    border: { subtle: '#e5e5e5', default: '#d4d4d4', hover: '#c0c0c0', code: '#c7ccd3' },
    table: { head: '#f9fafb', hover: '#f3f4f6', stripe: '#fafafa', inlineCode: '#f3f4f6' },
  },
};

const rams: ThemeDefinition = {
  id: 'rams',
  name: 'Rams',
  description: 'Inspired by Dieter Rams and Braun design language',
  mode: 'dark',
  colors: {
    bg: { base: '#171412', surface1: '#211d18', surface2: '#2d2822', surface3: '#3d362e', input: '#292420', elevated: '#1c1915' },
    brand: { primary: '#d35b36', hover: '#c04e2c', active: '#a54324', light: '#e07048' },
    text: { primary: '#f2efe9', secondary: '#d4cbc3', tertiary: '#b8afa5', muted: '#8c857e', disabled: '#6b655e', faint: '#4a4540' },
    status: { error: '#c1392b', success: '#6b8040', online: '#7a8f47', warning: '#d4a843', info: '#4a7ba7', purple: '#9b8ec4' },
    border: { subtle: '#211d18', default: '#2d2822', hover: '#3d362e', code: '#3d3629' },
    table: { head: '#1c1915', hover: '#2d2822', stripe: '#191613', inlineCode: '#2d2822' },
  },
};

export const themes: Record<ThemeId, ThemeDefinition> = { smartloop, 'smartloop-light': smartloopLight, rams };
export const themeList: ThemeDefinition[] = [smartloop, smartloopLight, rams];

function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '0,0,0';
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
