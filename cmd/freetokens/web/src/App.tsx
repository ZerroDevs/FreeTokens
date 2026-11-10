import { useCallback, useEffect, useMemo, useState } from "react";
import { DailyHours } from "./components/DailyHours";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HistoryStrip, Movers, PeriodComparison } from "./components/History";
import { ChevronDownIcon } from "./components/Icons";
import { PeriodTabs, tabLabel } from "./components/PeriodTabs";
import { Settings } from "./components/Settings";
import { ErrorState, LoadingState } from "./components/States";
import { UsageSection } from "./components/UsageSection";
import { WeekHeatmap } from "./components/WeekHeatmap";
import { bridge, isDesktop } from "./lib/api";
import { formatDuration, formatTokens, formatUsd } from "./lib/format";
import type { Theme, ValueMode } from "./lib/types";
import { useNow, useSnapshot } from "./lib/useSnapshot";

const DASHBOARD_URL = "https://codebuff.com/account";

// The raw error says what failed; these say what to do about it.
const QUOTA_HINTS: Record<string, string> = {
  "signed-out": "Sign in to the Freebuff desktop app, then refresh.",
  expired: "The Freebuff sign-in expired. Sign in again in the desktop app, then refresh.",
  approval: "The system blocked the saved sign-in. Allow access, then refresh.",
  network: "Freebuff could not be reached. Check your connection, then refresh.",
};
// Browser previews have no config file, so the demo remembers the theme locally.
const THEME_KEY = "freetokens-theme";

function normalizeTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "system" ? value : "dark";
}

function storedTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "dark";
  }
}

export default function App() {
  const { snapshot, loading, refreshing, loadError, refresh } = useSnapshot();
  const now = useNow();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState(3);
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<ValueMode>("tokens");
  const [theme, setTheme] = useState<Theme>(() => (bridge ? "dark" : storedTheme()));
  const [opaque, setOpaque] = useState(false);
  const [showTimers, setShowTimers] = useState(true);
  // Off by default: the popover leads with the selected period, and the strip is opt-in from
  // settings or the tray menu.
  const [showHistory, setShowHistory] = useState(false);
  // The budget line and the project grouping are settings the mix reads, so the panel owns them.
  const [budgetUsd, setBudgetUsd] = useState(0);
  const [showProjects, setShowProjects] = useState(false);
  const [version, setVersion] = useState<string | undefined>(undefined);

  const periods = snapshot?.periods ?? [];
  const safeSelection = periods.length === 0 ? 0 : Math.min(selection, periods.length - 1);
  const period = periods[safeSelection];
  // The budget measures the rolling 30 days, not the selected tab, so it reads that period.
  const monthly = periods.find((item) => item.label === "Last 30 Days");

  // Countdowns are live figures, so they are derived from `now` instead of the snapshot, which
  // only changes on refresh.
  const sessions = useMemo(() => {
    const expiries = snapshot?.quota?.activeSessions ?? [];
    return expiries
      .map((iso) => Date.parse(iso))
      .filter((at) => !Number.isNaN(at) && at > now)
      .sort((a, b) => a - b)
      .map((at) => formatDuration(at - now));
  }, [snapshot, now]);

  const warnings = useMemo(() => {
    const all = [snapshot?.quotaError, snapshot?.quota?.warning, snapshot?.historyWarning].filter(
      (warning): warning is string => Boolean(warning),
    );
    return Array.from(new Set(all));
  }, [snapshot]);

  useEffect(() => {
    if (!bridge) return;
    bridge
      .GetPreferences()
      .then((prefs) => {
        setTheme(normalizeTheme(prefs.theme));
        setOpaque(prefs.opaqueWindow === true);
        setShowTimers(prefs.showTimers !== false);
        setShowHistory(prefs.showHistory === true);
        setBudgetUsd(prefs.budgetUsd > 0 ? prefs.budgetUsd : 0);
        setShowProjects(prefs.showProjects === true);
        setVersion(prefs.version);
      })
      .catch(() => {});
  }, []);

  // Platforms without a compositor report an opaque window, so the shell fills it instead of
  // leaving a transparent margin that would paint black.
  useEffect(() => {
    document.documentElement.dataset.opaque = opaque ? "true" : "false";
  }, [opaque]);

  // "system" is resolved here rather than in CSS so the document has one concrete palette and
  // color-scheme follows it; an OS change while the popover is open re-applies it.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = theme === "system" ? (query.matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);

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

  useEffect(() => {
    const off = window.runtime?.EventsOn("open-settings", () => setSettingsOpen(true));
    return () => off?.();
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (isDesktop) bridge?.HideWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  useEffect(() => {
    if (!isDesktop) return;
    // A freshly shown window blurs by itself, which would close the popover right after the tray
    // click opens it. Only a blur after the pointer or a key reached the popover counts as a click
    // away, and the next hide starts unarmed again.
    let engaged = false;
    const onEngage = () => {
      engaged = true;
    };
    const onBlur = () => {
      if (!engaged) return;
      engaged = false;
      bridge?.RequestHide();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") engaged = false;
    };
    window.addEventListener("pointermove", onEngage, { passive: true });
    window.addEventListener("pointerdown", onEngage, { passive: true });
    window.addEventListener("keydown", onEngage);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onEngage);
      window.removeEventListener("pointerdown", onEngage);
      window.removeEventListener("keydown", onEngage);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const openDashboard = useCallback(() => {
    if (bridge) {
      void bridge.OpenDashboard().catch(() => {});
      return;
    }
    window.open(DASHBOARD_URL, "_blank", "noopener,noreferrer");
  }, []);

  const quit = useCallback(() => bridge?.Quit(), []);

  return (
    <div className="popover-frame flex h-screen w-screen p-2">
      <div className="popover-shell flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[16px] border border-edge bg-shell/90 shadow-popover backdrop-blur-2xl">
        {settingsOpen ? (
          <Settings
            demo={!isDesktop}
            theme={theme}
            onTheme={changeTheme}
            showTimers={showTimers}
            onShowTimers={changeShowTimers}
            showHistory={showHistory}
            onShowHistory={changeShowHistory}
            budgetUsd={budgetUsd}
            onBudget={changeBudget}
            showProjects={showProjects}
            onShowProjects={changeShowProjects}
            sources={snapshot?.sources}
            days={snapshot?.days}
            onBack={() => setSettingsOpen(false)}
            onQuit={quit}
          />
        ) : (
          <>
            <Header
              plan={snapshot?.quota?.plan}
              demo={!isDesktop}
              refreshing={refreshing}
              warnings={warnings}
              onRefresh={() => void refresh()}
              onSettings={() => setSettingsOpen(true)}
            />

            {loading && !snapshot ? (
              <LoadingState refreshing={refreshing} />
            ) : loadError && !snapshot ? (
              <ErrorState message={loadError} onRetry={() => void refresh()} />
            ) : snapshot ? (
              <main className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-2">
                {snapshot.quota ? (
                  <DailyHours quota={snapshot.quota} now={now} sessions={showTimers ? sessions : []} />
                ) : (
                  // Hours are a hosted figure. Without a readable Freebuff login the section would
                  // vanish and the panel would look like it lost a feature instead of a login.
                  <section aria-labelledby="hours-heading" className="rounded-[12px] bg-panel px-3.5 py-3">
                    <h2 id="hours-heading" className="text-[12px] font-medium text-muted">
                      Daily Hours
                    </h2>
                    <p className="mt-1 text-[13px] leading-snug text-ink">Hours unavailable</p>
                    <p className="mt-1 text-[10.5px] leading-snug text-faint">
                      {snapshot.quotaError || "Freebuff returned no usage session."}
                    </p>
                    {snapshot.quotaErrorCode && QUOTA_HINTS[snapshot.quotaErrorCode] ? (
                      <p className="mt-1 text-[10.5px] leading-snug text-muted">
                        {QUOTA_HINTS[snapshot.quotaErrorCode]}
                      </p>
                    ) : null}
                  </section>
                )}

                {periods.length === 0 ? (
                  <div className="mt-3 rounded-[12px] border border-dashed border-line px-4 py-7 text-center">
                    <p className="text-[12px] font-medium text-muted">No token history yet</p>
                    <p className="mt-1 text-[11px] leading-snug text-faint">
                      FreeTokens reads measured Freebuff, Antigravity, Claude, Codex and OpenCode runs
                      on this computer. Run a turn, then refresh.
                    </p>
                  </div>
                ) : expanded ? (
                  <>
                    <div className="mt-3">
                      <PeriodTabs periods={periods} selected={safeSelection} onSelect={setSelection} />
                    </div>
                    {/* The strip and the scalar comparison stay opt-in, as asked. */}
                    {showHistory ? (
                      <>
                        {period ? (
                          <PeriodComparison
                            label={period.label}
                            days={snapshot.days ?? []}
                            now={now}
                            mode={mode}
                          />
                        ) : null}
                        <HistoryStrip days={snapshot.days ?? []} mode={mode} now={now} />
                      </>
                    ) : null}
                    {period ? (
                      <UsageSection
                        period={period}
                        selected={safeSelection}
                        mode={mode}
                        onMode={setMode}
                        budgetUsd={budgetUsd}
                        monthlyCost={monthly?.costUsd}
                        monthlyCostLowerBound={monthly?.costLowerBound ?? false}
                        showProjects={showProjects}
                      />
                    ) : null}
                    {/* Movers and the hour grid are not the optional history views, so they keep
                        their own place below the mix instead of hiding behind that switch. */}
                    {period ? <Movers label={period.label} days={snapshot.days ?? []} now={now} mode={mode} /> : null}
                    {snapshot.slots ? <WeekHeatmap slots={snapshot.slots} mode={mode} /> : null}
                    <button
                      type="button"
                      aria-expanded={true}
                      onClick={() => setExpanded(false)}
                      className="mt-2 flex h-8 w-full items-center justify-center gap-1 text-[10.5px] font-medium text-faint transition-colors hover:text-muted"
                    >
                      Show compact list
                      <ChevronDownIcon className="h-3.5 w-3.5 rotate-180" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mt-3 divide-y divide-line/60 overflow-hidden rounded-[12px] bg-panel">
                      {periods.map((item, index) => (
                        <button
                          key={item.label}
                          type="button"
                          aria-pressed={index === safeSelection}
                          aria-label={`Show ${item.label} model breakdown`}
                          onClick={() => {
                            setSelection(index);
                            setExpanded(true);
                          }}
                          className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-raised ${
                            index === safeSelection ? "bg-raised/60" : ""
                          }`}
                        >
                          <span className="text-[12.5px] text-muted">{tabLabel(item.label)}</span>
                          <span className="min-w-0 truncate text-right text-[12.5px] font-medium text-ink tnum">
                            {item.hasData ? (
                              <>
                                {item.costUsd != null
                                  ? formatUsd(item.costUsd, item.costLowerBound)
                                  : "unpriced"}
                                <span className="px-1 text-faint">·</span>
                                {formatTokens(item.tokens)} tokens
                              </>
                            ) : (
                              <span className="text-faint">no usage</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-expanded={false}
                      onClick={() => setExpanded(true)}
                      className="mt-2 flex h-8 w-full items-center justify-center gap-1 text-[10.5px] font-medium text-faint transition-colors hover:text-muted"
                    >
                      Show full view
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </main>
            ) : (
              <LoadingState refreshing={refreshing} />
            )}

            {snapshot ? (
              <Footer
                snapshot={snapshot}
                now={now}
                mode={mode}
                onOpenDashboard={openDashboard}
                version={version}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
