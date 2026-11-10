import { useCallback, useEffect, useState } from "react";
import { bridge } from "./api";
import { applyTheme } from "./themes";
import type { Theme, ThemeColors } from "./types";

// Browser previews have no config file, so the demo remembers the theme locally.
const THEME_KEY = "freetokens-theme";
const THEME_COLORS_KEY = "freetokens-theme-colors";

function normalizeTheme(value: string | null | undefined): Theme {
  switch (value) {
    case "light":
    case "system":
    case "sand":
    case "custom":
      return value;
    default:
      return "dark";
  }
}

/** normalizeColors keeps only the four colour fields and only string values. */
function normalizeColors(value: unknown): ThemeColors {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const colors: ThemeColors = {};
  for (const key of ["accent", "background", "card", "text"] as const) {
    const field = source[key];
    if (typeof field === "string" && field !== "") colors[key] = field;
  }
  return colors;
}

function storedTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "dark";
  }
}

function storedColors(): ThemeColors {
  try {
    return normalizeColors(JSON.parse(localStorage.getItem(THEME_COLORS_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

/**
 * The panel's copy of the settings the tray also writes. Each setter applies the value first and
 * puts it back if the bridge rejects it, so a control never shows a state the engine refused.
 */
export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(() => (bridge ? "dark" : storedTheme()));
  const [themeColors, setThemeColors] = useState<ThemeColors>(() => (bridge ? {} : storedColors()));
  const [opaque, setOpaque] = useState(false);
  const [showTimers, setShowTimers] = useState(true);
  // Off by default: the popover leads with the selected period, and the strip is opt-in from
  // settings or the tray menu.
  const [showHistory, setShowHistory] = useState(false);
  // The budget line and the project grouping are settings the mix reads, so the panel owns them.
  const [budgetUsd, setBudgetUsd] = useState(0);
  const [showProjects, setShowProjects] = useState(false);
  const [version, setVersion] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!bridge) return;
    bridge
      .GetPreferences()
      .then((prefs) => {
        setTheme(normalizeTheme(prefs.theme));
        setThemeColors(normalizeColors(prefs.themeColors));
        setOpaque(prefs.opaqueWindow === true);
        setShowTimers(prefs.showTimers !== false);
        setShowHistory(prefs.showHistory === true);
        setBudgetUsd(prefs.budgetUsd > 0 ? prefs.budgetUsd : 0);
        setShowProjects(prefs.showProjects === true);
        setVersion(prefs.version);
      })
      .catch(() => {});
  }, []);

  // The tray menu writes the same settings, so an open popover re-reads them when it says so.
  useEffect(() => {
    const off = window.runtime?.EventsOn("prefs", () => {
      if (!bridge) return;
      bridge
        .GetPreferences()
        .then((prefs) => {
          setShowTimers(prefs.showTimers !== false);
          setShowHistory(prefs.showHistory === true);
          setBudgetUsd(prefs.budgetUsd > 0 ? prefs.budgetUsd : 0);
          setShowProjects(prefs.showProjects === true);
        })
        .catch(() => {});
    });
    return () => off?.();
  }, []);

  // Platforms without a compositor report an opaque window, so the shell fills it instead of
  // leaving a transparent margin that would paint black.
  useEffect(() => {
    document.documentElement.dataset.opaque = opaque ? "true" : "false";
  }, [opaque]);

  // Every colour is a CSS variable written here, so presets and custom palettes take the same path.
  // "system" resolves inside applyTheme, and an OS change while the popover is open re-applies it.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => applyTheme(theme, themeColors, document.documentElement);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme, themeColors]);

  const changeTheme = useCallback(
    async (next: Theme) => {
      const previous = theme;
      setTheme(next);
      try {
        if (bridge) {
          await bridge.SetTheme(next);
        } else {
          localStorage.setItem(THEME_KEY, next);
        }
      } catch (error) {
        setTheme(previous);
        throw error;
      }
    },
    [theme],
  );

  const changeThemeColors = useCallback(
    async (next: ThemeColors) => {
      const previous = themeColors;
      const previousTheme = theme;
      setThemeColors(next);
      setTheme("custom");
      try {
        if (bridge) {
          await bridge.SetThemeColors(next);
          await bridge.SetTheme("custom");
        } else {
          localStorage.setItem(THEME_COLORS_KEY, JSON.stringify(next));
          localStorage.setItem(THEME_KEY, "custom");
        }
      } catch (error) {
        setThemeColors(previous);
        setTheme(previousTheme);
        throw error;
      }
    },
    [theme, themeColors],
  );

  const changeShowTimers = useCallback(
    async (next: boolean) => {
      const previous = showTimers;
      setShowTimers(next);
      try {
        if (bridge) await bridge.SetShowTimers(next);
      } catch (error) {
        setShowTimers(previous);
        throw error;
      }
    },
    [showTimers],
  );

  const changeShowHistory = useCallback(
    async (next: boolean) => {
      const previous = showHistory;
      setShowHistory(next);
      try {
        if (bridge) await bridge.SetShowHistory(next);
      } catch (error) {
        setShowHistory(previous);
        throw error;
      }
    },
    [showHistory],
  );

  const changeBudget = useCallback(
    async (next: number) => {
      const previous = budgetUsd;
      setBudgetUsd(next);
      try {
        if (bridge) await bridge.SetBudgetUSD(next);
      } catch (error) {
        setBudgetUsd(previous);
        throw error;
      }
    },
    [budgetUsd],
  );

  const changeShowProjects = useCallback(
    async (next: boolean) => {
      const previous = showProjects;
      setShowProjects(next);
      try {
        if (bridge) await bridge.SetShowProjects(next);
      } catch (error) {
        setShowProjects(previous);
        throw error;
      }
    },
    [showProjects],
  );

  return {
    theme,
    changeTheme,
    themeColors,
    changeThemeColors,
    showTimers,
    changeShowTimers,
    showHistory,
    changeShowHistory,
    budgetUsd,
    changeBudget,
    showProjects,
    changeShowProjects,
    version,
  };
}
