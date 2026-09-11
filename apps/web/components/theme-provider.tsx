'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme);
    }
    setMounted(true);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Update CSS variables based on theme
    if (theme === 'light') {
      root.style.setProperty('--color-bg', '#ffffff');
      root.style.setProperty('--color-surface', '#f6f8fa');
      root.style.setProperty('--color-surface-elevated', '#eaeef2');
      root.style.setProperty('--color-surface-hover', '#d0d7de');
      root.style.setProperty('--color-border', 'rgba(31, 35, 40, 0.06)');
      root.style.setProperty('--color-border-hover', 'rgba(31, 35, 40, 0.12)');
      root.style.setProperty('--color-text-primary', '#0d1117');
      root.style.setProperty('--color-text-secondary', '#57606a');
      root.style.setProperty('--color-text-muted', '#6e7681');
      root.style.setProperty('--color-accent', '#0969da');
      root.style.setProperty('--color-accent-hover', '#0860ca');
      root.style.setProperty('--color-success', '#1a7f0e');
      root.style.setProperty('--color-warning', '#bf8700');
      root.style.setProperty('--color-danger', '#da3633');
    } else {
      // Dark theme (default)
      root.style.setProperty('--color-bg', '#050a0e');
      root.style.setProperty('--color-surface', '#0a1118');
      root.style.setProperty('--color-surface-elevated', '#111a22');
      root.style.setProperty('--color-surface-hover', '#152028');
      root.style.setProperty('--color-border', 'rgba(255, 255, 255, 0.06)');
      root.style.setProperty('--color-border-hover', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--color-text-primary', '#f0f6fc');
      root.style.setProperty('--color-text-secondary', '#8b949e');
      root.style.setProperty('--color-text-muted', '#6e7681');
      root.style.setProperty('--color-accent', '#58a6ff');
      root.style.setProperty('--color-accent-hover', '#79b8ff');
      root.style.setProperty('--color-success', '#3fb950');
      root.style.setProperty('--color-warning', '#d29922');
      root.style.setProperty('--color-danger', '#f85149');
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {mounted ? children : null}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
