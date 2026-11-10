// The panel paints itself from one palette: every colour the UI uses is a CSS variable, so a theme
// is just a map of values. Presets are spelled out; a custom theme is derived from four colours the
// user picks, so nobody has to fill in twenty-four fields to get a background they like.

import type { Theme, ThemeColors } from "./types";

/** Theme ids, named locally so the palette code reads short. */
type ThemeId = Theme;

type Palette = Record<string, string>;

export const THEME_PRESETS: { id: ThemeId; name: string; note: string }[] = [
  { id: "dark", name: "Dark", note: "Neutral dark with a blue accent." },
  { id: "light", name: "Light", note: "White cards on a light background." },
  { id: "sand", name: "Sand", note: "Warm sepia dark with a green accent." },
  { id: "system", name: "System", note: "Follows the operating system appearance." },
  { id: "custom", name: "Custom", note: "Your own colours." },
];

/** Defaults for a custom theme before the user has picked anything. */
export const CUSTOM_FALLBACK: Required<ThemeColors> = {
  accent: "#0a84ff",
  background: "#0f0f11",
  card: "#232326",
  text: "#f5f5f7",
};

const GRAPHITE: Palette = {
  "color-shell": "#151517",
  "color-panel": "#242427",
  "color-raised": "#333336",
  "color-raised-hover": "#3d3d40",
  "color-line": "#3a3a3d",
  "color-edge": "rgba(255, 255, 255, 0.08)",
  "color-track": "#3a3a3d",
  "color-ink": "#f5f5f7",
  "color-muted": "#b9b9be",
  "color-faint": "#909096",
  "color-brand": "#0a84ff",
  "color-brand-strong": "#4da3ff",
  "color-hours": "#3b82f6",
  "color-warn": "#ff9f0a",
  "color-danger": "#ff453a",
  "color-slate": "#909096",
  "color-scroll": "#4a4a4d",
  "color-model-1": "#22d3ee",
  "color-model-2": "#3b82f6",
  "color-model-3": "#0a84ff",
  "color-model-4": "#a855f7",
  "color-model-5": "#f5f5f7",
  "color-model-6": "#909096",
  "color-model-7": "#f472b6",
  "color-model-8": "#34d399",
  "color-model-other": "#636366",
};

const LIGHT: Palette = {
  "color-shell": "#f2f2f4",
  "color-panel": "#ffffff",
  "color-raised": "#ececef",
  "color-raised-hover": "#e2e2e6",
  "color-line": "#dcdce0",
  "color-edge": "rgba(0, 0, 0, 0.08)",
  "color-track": "#e6e6ea",
  "color-ink": "#111114",
  "color-muted": "#55555c",
  "color-faint": "#73737b",
  "color-brand": "#0a84ff",
  "color-brand-strong": "#0066cc",
  "color-hours": "#2563eb",
  "color-warn": "#a35a00",
  "color-danger": "#c22a20",
  "color-slate": "#55555c",
  "color-scroll": "#cfcfd4",
  "color-model-1": "#0891b2",
  "color-model-2": "#2563eb",
  "color-model-3": "#0a84ff",
  "color-model-4": "#7c3aed",
  "color-model-5": "#4b5563",
  "color-model-6": "#6b7280",
  "color-model-7": "#be185d",
  "color-model-8": "#047857",
  "color-model-other": "#9ca3af",
};

// The palette FreeTokens shipped before Graphite, kept so the old look stays one click away.
const SAND: Palette = {
  "color-shell": "#161512",
  "color-panel": "#1e1c19",
  "color-raised": "#2a2722",
  "color-raised-hover": "#332f29",
  "color-line": "#3a352e",
  "color-edge": "rgba(255, 255, 255, 0.1)",
  "color-track": "#2f2b26",
  "color-ink": "#f2ede6",
  "color-muted": "#b8afa1",
  "color-faint": "#9a9184",
  "color-brand": "#4cc38a",
  "color-brand-strong": "#7ad8a9",
  "color-hours": "#5b9dff",
  "color-warn": "#e8b45c",
  "color-danger": "#f08a72",
  "color-slate": "#9aa3a8",
  "color-scroll": "#453f37",
  "color-model-1": "#c9a97b",
  "color-model-2": "#34b27f",
  "color-model-3": "#5b9dff",
  "color-model-4": "#ee7458",
  "color-model-5": "#efede8",
  "color-model-6": "#9aa3a8",
  "color-model-7": "#a78bfa",
  "color-model-8": "#e07ab0",
  "color-model-other": "#6f6a61",
};

/** The custom theme's chart colours, so a ring is never monochrome when the accent is reused. */
const CUSTOM_CHARTS = ["#22d3ee", "#a855f7", "#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#f87171"];

function parse(hex: string): [number, number, number] | null {
  const value = hex.trim();
  const full =
    value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value;
  if (!/^#[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(1, 3), 16),
    parseInt(full.slice(3, 5), 16),
    parseInt(full.slice(5, 7), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

/** mix returns `amount` of `b` blended into `a`. */
export function mix(a: string, b: string, amount: number): string {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return a;
  const t = Math.min(1, Math.max(0, amount));
  return toHex([
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t,
  ]);
}

function luminance(hex: string): number {
  const rgb = parse(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((part) => {
    const channel = part / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isLightBackground(hex: string): boolean {
  return luminance(hex) > 0.4;
}

/** customPalette derives a full palette from the four colours the user picks. */
export function customPalette(colors: ThemeColors): Palette {
  const accent = parse(colors.accent ?? "") ? (colors.accent as string) : CUSTOM_FALLBACK.accent;
  const background = parse(colors.background ?? "")
    ? (colors.background as string)
    : CUSTOM_FALLBACK.background;
  const card = parse(colors.card ?? "") ? (colors.card as string) : CUSTOM_FALLBACK.card;
  const text = parse(colors.text ?? "") ? (colors.text as string) : CUSTOM_FALLBACK.text;
  const light = isLightBackground(background);

  const palette: Palette = {
    "color-shell": background,
    "color-panel": card,
    "color-raised": mix(card, text, 0.1),
    "color-raised-hover": mix(card, text, 0.16),
    "color-line": mix(card, text, light ? 0.16 : 0.2),
    "color-edge": light ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)",
    "color-track": mix(card, text, 0.14),
    "color-ink": text,
    // Secondary text keeps a fixed distance from the body colour, so it stays readable without a
    // per-colour contrast pass.
    "color-muted": mix(text, card, 0.3),
    "color-faint": mix(text, card, 0.45),
    "color-brand": accent,
    "color-brand-strong": light ? mix(accent, "#000000", 0.2) : mix(accent, "#ffffff", 0.25),
    "color-hours": accent,
    "color-warn": light ? "#a35a00" : "#ff9f0a",
    "color-danger": light ? "#c22a20" : "#ff453a",
    "color-slate": mix(text, card, 0.4),
    "color-scroll": mix(card, text, 0.25),
    "color-model-1": accent,
    "color-model-other": mix(text, card, 0.55),
  };
  CUSTOM_CHARTS.forEach((color, index) => {
    palette[`color-model-${index + 2}`] = color;
  });
  return palette;
}

function paletteFor(id: ThemeId, colors: ThemeColors): { palette: Palette; dark: boolean } {
  switch (id) {
    case "light":
      return { palette: LIGHT, dark: false };
    case "sand":
      return { palette: SAND, dark: true };
    case "custom": {
      const palette = customPalette(colors);
      return { palette, dark: !isLightBackground(palette["color-shell"]) };
    }
    case "dark":
    case "system":
    default:
      return { palette: GRAPHITE, dark: true };
  }
}

/** The four colours a swatch needs, for the picker's preview tiles. */
export function swatchColors(
  id: ThemeId,
  colors: ThemeColors,
): { background: string; card: string; accent: string; text: string } {
  const { palette } = paletteFor(id === "system" ? "dark" : id, colors);
  return {
    background: palette["color-shell"],
    card: palette["color-panel"],
    accent: palette["color-brand"],
    text: palette["color-ink"],
  };
}

/** resolveTheme reports the concrete appearance a theme id renders as right now. */
export function resolveTheme(id: ThemeId, colors: ThemeColors): { palette: Palette; dark: boolean } {
  if (id === "system") {
    const light = window.matchMedia("(prefers-color-scheme: light)").matches;
    return paletteFor(light ? "light" : "dark", colors);
  }
  return paletteFor(id, colors);
}

let applied: string[] = [];

/**
 * applyTheme writes the palette onto the document as CSS variables. `data-theme` still says light or
 * dark so `color-scheme`, native form controls and scrollbars follow the theme.
 */
export function applyTheme(id: ThemeId, colors: ThemeColors, root: HTMLElement): void {
  const { palette, dark } = resolveTheme(id, colors);
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = [];
  for (const [name, value] of Object.entries(palette)) {
    root.style.setProperty(`--${name}`, value);
    applied.push(name);
  }
  root.dataset.theme = dark ? "dark" : "light";
}
