"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Cookies from 'js-cookie'

type Theme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      console.log('Reading cookie:', Cookies.get('strxldr-theme'))
      const saved = Cookies.get('strxldr-theme')
      return (saved as Theme) || defaultTheme
    }
    return defaultTheme
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    
    // Set cookie options based on environment
    const cookieOptions = {
      expires: 365,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as 'lax' | 'strict' | 'none',
      ...(process.env.NODE_ENV === 'production' && {
        domain: 'strxldr.app'
      })
    }
    
    Cookies.set('strxldr-theme', theme, cookieOptions)
    
    console.log('Cookie set:', Cookies.get('strxldr-theme'))
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}; 