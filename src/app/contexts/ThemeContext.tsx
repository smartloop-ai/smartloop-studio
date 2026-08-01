import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { themes, themeList, applyThemeCssVars, type ThemeDefinition } from '@/app/theme/themes';
import { loadCustomThemes, saveCustomThemes } from '@/app/theme/custom-themes';
import { storageService } from '@/app/services/storage.service';

interface ThemeContextValue {
  themeId: string;
  // The resolved active theme definition (falls back to the default).
  theme: ThemeDefinition;
  setThemeId: (id: string) => void;
  // Built-in themes plus any the user has imported.
  allThemes: ThemeDefinition[];
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'smartloop',
  theme: themes.smartloop,
  setThemeId: () => {},
  allThemes: themeList,
  addCustomTheme: () => {},
  removeCustomTheme: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>('smartloop');
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>([]);

  const allThemes = useMemo(() => [...themeList, ...customThemes], [customThemes]);
  const themeById = useMemo(() => {
    const map: Record<string, ThemeDefinition> = { ...themes };
    for (const t of customThemes) map[t.id] = t;
    return map;
  }, [customThemes]);
  const theme = useMemo(() => themeById[themeId] ?? themes.smartloop, [themeById, themeId]);

  // Load persisted selection + custom themes on mount.
  useEffect(() => {
    loadCustomThemes().then(setCustomThemes);
    storageService.getItem('app_theme').then((saved: string | null) => {
      // Migrate legacy/retired preset ids to their nearest current theme:
      //   'rams'/'sepia'/'ubuntu' (graphite) → solarized-dark
      //   'minecraft' (Blocks — now an importable example) → catppuccin-mocha
      const migrated =
        (saved === 'rams' || saved === 'sepia' || saved === 'ubuntu') ? 'solarized-dark'
        : saved === 'minecraft' ? 'catppuccin-mocha'
        : saved;
      if (migrated) setThemeIdState(migrated);
    });
  }, []);

  useEffect(() => {
    const t = themeById[themeId] ?? themes.smartloop;
    applyThemeCssVars(t);
    // Persist the subset of colors the native splash window uses, so the next
    // launch's splash reflects the current theme (built-in or custom) before
    // the renderer has mounted.
    const c = t.colors;
    storageService.setItem('app_theme_colors', JSON.stringify({
      '--sl-bg-base': c.bg.base,
      '--sl-bg-surface-1': c.bg.surface1,
      '--sl-bg-surface-2': c.bg.surface2,
      '--sl-bg-surface-3': c.bg.surface3,
      '--sl-brand-primary': c.brand.primary,
      '--sl-text-primary': c.text.primary,
      '--sl-text-secondary': c.text.secondary,
      '--sl-text-disabled': c.text.disabled,
      '--sl-text-faint': c.text.faint,
      '--sl-border-default': c.border.default,
    }));
    // Themed typeface (YAML-driven): set the font CSS vars consumed by body /
    // headings and load the webfont via a single managed <link>. Cleared when
    // the theme has no font so we fall back to the default (Poppins).
    const root = document.documentElement;
    if (t.font) {
      root.style.setProperty('--sl-font-family', t.font.family);
      root.style.setProperty('--sl-font-heading', t.font.heading || t.font.family);
    } else {
      root.style.removeProperty('--sl-font-family');
      root.style.removeProperty('--sl-font-heading');
    }
    let link = document.getElementById('sl-theme-font') as HTMLLinkElement | null;
    if (t.font?.url) {
      if (!link) {
        link = document.createElement('link');
        link.id = 'sl-theme-font';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      if (link.href !== t.font.url) link.href = t.font.url;
    } else if (link) {
      link.remove();
    }
    // Remaining non-color cues (textures, blocky icons) live behind a root class
    // since they can't be expressed as CSS-variable overrides.
    document.documentElement.classList.toggle('theme-minecraft', t.id === 'minecraft');
    document.documentElement.classList.toggle('theme-osaka-jade', t.id === 'osaka-jade');
    (window as any).electronAPI?.setNativeTheme?.(t.mode, t.colors.bg.base);
  }, [themeId, themeById]);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    storageService.setItem('app_theme', id);
  }, []);

  const addCustomTheme = useCallback((theme: ThemeDefinition) => {
    setCustomThemes((prev) => {
      // Replace any existing theme with the same id (re-import / overwrite).
      const next = [...prev.filter((t) => t.id !== theme.id), theme];
      saveCustomThemes(next);
      return next;
    });
    setThemeId(theme.id);
  }, [setThemeId]);

  const removeCustomTheme = useCallback((id: string) => {
    setCustomThemes((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveCustomThemes(next);
      return next;
    });
    // If the removed theme was active, fall back to the default.
    setThemeIdState((cur) => (cur === id ? 'smartloop' : cur));
  }, []);

  const muiTheme = useMemo(() => {
    const t = themeById[themeId] ?? themes.smartloop;
    // Portaled MUI surfaces (menus, popovers, tooltips) render outside the app
    // tree, and MUI sets its own typography fontFamily — so a themed font only
    // reaches them through the MUI theme, not the root CSS var.
    const themedFont = t.font?.family;
    return createTheme({
      palette: {
        mode: t.mode,
        primary: { main: t.colors.brand.primary },
        background: { default: t.colors.bg.base, paper: t.colors.bg.base },
      },
      ...(themedFont ? { typography: { fontFamily: themedFont } } : {}),
      components: {
        MuiDialog: { styleOverrides: { paper: { backgroundColor: t.colors.bg.base, backgroundImage: 'none' } } },
        MuiPaper: { styleOverrides: { root: { backgroundColor: t.colors.bg.base, backgroundImage: 'none' } } },
      },
    });
  }, [themeId, themeById]);

  return (
    <ThemeContext.Provider value={{ themeId, theme, setThemeId, allThemes, addCustomTheme, removeCustomTheme }}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
