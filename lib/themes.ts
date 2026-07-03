export type AppTheme = "dark" | "light" | "cream" | "green" | "blue";

export const THEME_STORAGE_KEY = "evaluador-theme";

export const DEFAULT_THEME: AppTheme = "dark";

export type ThemeDefinition = {
  id: AppTheme;
  label: string;
  description: string;
  preview: [string, string, string];
};

export const THEMES: ThemeDefinition[] = [
  {
    id: "dark",
    label: "Oscuro",
    description: "Tema oscuro actual (VS Code)",
    preview: ["#1e1e1e", "#252526", "#374151"],
  },
  {
    id: "light",
    label: "Claro",
    description: "Fondos claros y grises neutros",
    preview: ["#f5f5f5", "#ffffff", "#e5e5e5"],
  },
  {
    id: "cream",
    label: "Crema",
    description: "Tonos crema y grises cálidos",
    preview: ["#f5f0e6", "#ebe4d6", "#ddd4c4"],
  },
  {
    id: "green",
    label: "Verde",
    description: "Verdes y grises estilo Sublime",
    preview: ["#1e2822", "#253325", "#a6e22e"],
  },
  {
    id: "blue",
    label: "Azul",
    description: "Azules y grises estilo Mariana",
    preview: ["#1e2433", "#252836", "#66d9ef"],
  },
];

export function isAppTheme(value: string): value is AppTheme {
  return THEMES.some((t) => t.id === value);
}

export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isAppTheme(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
}

export function persistTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
