"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  const className =
    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground";

  // Render a stable placeholder until mounted to avoid a hydration mismatch
  // (server has no access to localStorage / prefers-color-scheme).
  if (!mounted) {
    return (
      <button
        type="button"
        className={className}
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <Moon size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      title="Toggle theme"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
