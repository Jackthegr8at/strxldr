"use client";

import { useTheme } from "./ThemeProvider";
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors"
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? (
        <MoonIcon className="w-5 h-5" />
      ) : (
        <SunIcon className="w-5 h-5" />
      )}
    </button>
  );
} 