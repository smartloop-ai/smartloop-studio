/**
 * Centralized color tokens for the SmartLoop dark theme.
 * Single source of truth — consumed by MUI createTheme() and available
 * for any TS/JS code that needs raw hex values.
 *
 * CSS counterparts live in ./theme.css as --sl-* custom properties.
 */

export const colors = {
  bg: {
    base: '#100c0e',
    surface1: '#211b1f',
    surface2: '#31292e',
    surface3: '#43393f',
    input: '#292126',
    elevated: '#0c090b',
  },
  brand: {
    primary: '#e55d9c',
    hover: '#dd408a',
    active: '#ce2775',
    light: '#f089b9',
  },
  text: {
    primary: '#f6f1f4',
    secondary: '#e3dbe0',
    tertiary: '#cdc1c8',
    muted: '#aea0a8',
    disabled: '#887781',
    faint: '#736570',
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
    code: '#4a3f46',
  },
};
