/**
 * Centralized color tokens for the SmartLoop dark theme.
 * Single source of truth — consumed by MUI createTheme() and available
 * for any TS/JS code that needs raw hex values.
 *
 * CSS counterparts live in ./theme.css as --sl-* custom properties.
 */

export const colors = {
  bg: {
    base: '#000000',
    surface1: '#1a1a1a',
    surface2: '#2a2a2a',
    surface3: '#3a3a3a',
    input: '#303030',
    elevated: '#1b1b1b',
  },
  brand: {
    primary: '#ec4899',
    hover: '#db2777',
    active: '#be185d',
    light: '#f472b6',
  },
  text: {
    primary: '#ffffff',
    secondary: '#e5e7eb',
    tertiary: '#d1d5db',
    muted: '#9ca3af',
    disabled: '#6b7280',
    faint: '#4b5563',
  },
  status: {
    error: '#ef4444',
    success: '#10b981',
    online: '#22c55e',
    warning: '#f59e0b',
    info: '#3b82f6',
    purple: '#a855f7',
  },
  border: {
    code: '#374151',
  },
};
