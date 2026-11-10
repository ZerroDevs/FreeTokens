import { useCallback, useEffect, useMemo, useState } from "react";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Settings } from "./components/Settings";
import { ErrorState, LoadingState } from "./components/States";
import { UsageView } from "./components/UsageView";
import { bridge, isDesktop } from "./lib/api";
import { formatDuration } from "./lib/format";
import type { ValueMode } from "./lib/types";
import { useNow, useSnapshot } from "./lib/useSnapshot";
import { usePreferences } from "./lib/usePreferences";

const DASHBOARD_URL = "https://codebuff.com/account";

export default function App() {
  const { snapshot, loading, refreshing, loadError, refresh } = useSnapshot();
  const now = useNow();
  const {
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
  } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState(3);
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<ValueMode>("tokens");

  // Countdowns are live figures, so they are derived from `now` instead of the snapshot, which
  // only changes on refresh.
  const sessions = useMemo(() => {
    const expiries = snapshot?.quota?.activeSessions ?? [];
    return expiries
      .map((iso) => Date.parse(iso))
      .filter((at) => !Number.isNaN(at) && at > now)
      .sort((a, b) => a - b)
      .map((at) => ({
        left: formatDuration(at - now),
        ends: new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      }));
  }, [snapshot, now]);

  const warnings = useMemo(() => {
    const all = [snapshot?.quotaError, snapshot?.quota?.warning, snapshot?.historyWarning].filter(
      (warning): warning is string => Boolean(warning),
    );
    return Array.from(new Set(all));
  }, [snapshot]);

  useEffect(() => {
    const off = window.runtime?.EventsOn("open-settings", () => setSettingsOpen(true));
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
    <div className="popover-frame flex h-screen w-screen p-1.5">
      <div className="popover-shell flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[16px] border border-edge bg-shell/95 shadow-popover">
        {settingsOpen ? (
          <Settings
            demo={!isDesktop}
            theme={theme}
            onTheme={changeTheme}
            themeColors={themeColors}
            onThemeColors={changeThemeColors}
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
            refreshedAt={snapshot?.refreshedAt}
            now={now}
            onBack={() => setSettingsOpen(false)}
            onQuit={quit}
          />
        ) : (
          <>
            <Header
              plan={snapshot?.quota?.plan}
              demo={!isDesktop}
              warnings={warnings}
              onOpenAccount={openDashboard}
            />

            {loading && !snapshot ? (
              <LoadingState refreshing={refreshing} />
            ) : loadError && !snapshot ? (
              <ErrorState message={loadError} onRetry={() => void refresh()} />
            ) : snapshot ? (
              <UsageView
                snapshot={snapshot}
                now={now}
                sessions={sessions}
                showTimers={showTimers}
                showHistory={showHistory}
                showProjects={showProjects}
                budgetUsd={budgetUsd}
                mode={mode}
                onMode={setMode}
                selection={selection}
                onSelect={setSelection}
                expanded={expanded}
                onExpanded={setExpanded}
              />
            ) : (
              <LoadingState refreshing={refreshing} />
            )}

            {snapshot ? (
              <Footer
                snapshot={snapshot}
                now={now}
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                onSettings={() => setSettingsOpen(true)}
                version={version}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
