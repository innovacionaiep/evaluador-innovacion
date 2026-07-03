"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES, type AppTheme } from "@/lib/themes";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function selectTheme(id: AppTheme) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Cambiar tema"
        aria-label="Cambiar tema"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center justify-center rounded p-2 text-foreground-muted hover:text-foreground hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-focus-ring"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="13.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="10.5" r="2.5" />
          <circle cx="8.5" cy="7.5" r="2.5" />
          <circle cx="6.5" cy="12.5" r="2.5" />
          <path d="M12 22c4.97 0 9-4.03 9-9 0-1.2-.24-2.34-.67-3.38" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Temas disponibles"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-surface-overlay py-1 shadow-lg"
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={theme === t.id}
              onClick={() => selectTheme(t.id)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:bg-surface-elevated ${
                theme === t.id
                  ? "bg-surface-elevated font-medium text-foreground"
                  : "text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              <span className="flex shrink-0 gap-0.5" aria-hidden>
                {t.preview.map((color) => (
                  <span
                    key={color}
                    className="h-4 w-4 rounded-sm border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block">{t.label}</span>
                <span className="block truncate text-xs opacity-70">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
