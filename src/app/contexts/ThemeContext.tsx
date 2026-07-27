import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { type ThemeId, themes, applyThemeCssVars } from '@/app/theme/themes';
import { storageService } from '@/app/services/storage.service';

interface ThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'smartloop',
  setThemeId: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>('smartloop');

  useEffect(() => {
    storageService.getItem('app_theme').then((saved: string | null) => {
      // Migrate legacy 'rams' id to its renamed 'sepia' equivalent.
      const migrated = saved === 'rams' ? 'sepia' : saved;
      if (migrated && migrated in themes) {
        setThemeIdState(migrated as ThemeId);
        if (migrated !== saved) storageService.setItem('app_theme', migrated);
      }
    });
  }, []);

  useEffect(() => {
    const t = themes[themeId];
    applyThemeCssVars(t);
    (window as any).electronAPI?.setNativeTheme?.(t.mode, t.colors.bg.base);
  }, [themeId]);

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    storageService.setItem('app_theme', id);
  };

  const muiTheme = useMemo(() => {
    const t = themes[themeId];
    return createTheme({
      palette: {
        mode: t.mode,
        primary: { main: t.colors.brand.primary },
        background: { default: t.colors.bg.base, paper: t.colors.bg.base },
      },
      components: {
        MuiDialog: { styleOverrides: { paper: { backgroundColor: t.colors.bg.base, backgroundImage: 'none' } } },
        MuiPaper: { styleOverrides: { root: { backgroundColor: t.colors.bg.base, backgroundImage: 'none' } } },
      },
    });
  }, [themeId]);

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
