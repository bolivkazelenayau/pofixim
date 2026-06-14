'use client';

import * as React from 'react';
import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const FALLBACK_THEME_CONTEXT: ThemeContextValue = {
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
};

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function writeThemeCookie(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readThemeFromStorage(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readThemeFromDocument(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribeTheme(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === 'theme') listener();
  };
  const onThemeChange = () => listener();
  window.addEventListener('storage', onStorage);
  window.addEventListener('theme-change', onThemeChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('theme-change', onThemeChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readThemeFromStorage,
    readThemeFromDocument,
  );

  React.useEffect(() => {
    applyTheme(theme);
    writeThemeCookie(theme);
  }, [theme]);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    applyTheme(nextTheme);
    writeThemeCookie(nextTheme);
    try {
      window.localStorage.setItem('theme', nextTheme);
      window.dispatchEvent(new Event('theme-change'));
    } catch {}
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });
  }, []);

  const value = React.useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme: theme,
    setTheme,
  }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    return FALLBACK_THEME_CONTEXT;
  }
  return context;
}
