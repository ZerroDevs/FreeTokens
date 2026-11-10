import { useEffect, useState } from "react";
import { bridge, errorMessage } from "../lib/api";
import { versionLabel } from "../lib/format";
import type { Day, Preferences, SourceHealth, Theme } from "../lib/types";
import { BackIcon, CheckIcon } from "./Icons";
import { Appearance } from "./settings/Appearance";
import { Budget } from "./settings/Budget";
import { FeedbackProvider, useFeedback } from "./settings/feedback";
import { LoginItem } from "./settings/LoginItem";
import { ProjectGrouping } from "./settings/ProjectGrouping";
import { RefreshInterval } from "./settings/RefreshInterval";
import { Report } from "./settings/Report";
import { SessionTimer } from "./settings/SessionTimer";
import { SourceHealthSection } from "./settings/SourceHealth";
import { TrayFigure } from "./settings/TrayFigure";
import { Updates } from "./settings/Updates";
import { UsageHistory } from "./settings/UsageHistory";

type Props = {
  demo: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => Promise<void>;
  showTimers: boolean;
  onShowTimers: (on: boolean) => Promise<void>;
  showHistory: boolean;
  onShowHistory: (on: boolean) => Promise<void>;
  budgetUsd: number;
  onBudget: (usd: number) => Promise<void>;
  showProjects: boolean;
  onShowProjects: (on: boolean) => Promise<void>;
  sources?: SourceHealth[];
  /** Retained daily rollups, so the CSV copy works without the engine (browser preview). */
  days?: Day[];
  onBack: () => void;
  onQuit: () => void;
};

export function Settings(props: Props) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) {
      setPrefs({
        refreshMinutes: 5,
        startAtLogin: false,
        theme: "dark",
        showTimers: true,
        showHistory: false,
        budgetUsd: 250,
        trayTitle: "session",
        showProjects: false,
        autoUpdate: "off",
        version: "preview",
        platform: "browser",
      });
      return;
    }
    bridge
      .GetPreferences()
      .then(setPrefs)
      .catch((error: unknown) => setLoadError(errorMessage(error)));
  }, []);

  return (
    <FeedbackProvider>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-3 pt-3">
          <button
            type="button"
            aria-label="Back to usage"
            onClick={props.onBack}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <BackIcon className="h-4 w-4" />
          </button>
          <h1 className="text-[14px] font-semibold text-ink">Settings</h1>
          <span className="ml-auto pr-1 text-[10.5px] text-faint">
            {prefs ? versionLabel(prefs.version) : ""}
          </span>
        </header>

        <div className="scroll-area mt-1 flex-1 overflow-y-auto px-4 pb-4">
          {loadError ? (
            <p role="alert" className="mt-3 rounded-[10px] bg-panel px-3 py-2.5 text-[11.5px] text-warn">
              {loadError}
            </p>
          ) : null}
          {!prefs && !loadError ? (
            <p role="status" className="mt-4 text-[11.5px] text-faint">
              Reading settings…
            </p>
          ) : null}

          {prefs ? (
            <>
              <RefreshInterval prefs={prefs} demo={props.demo} onPrefs={setPrefs} />
              <Budget budgetUsd={props.budgetUsd} onBudget={props.onBudget} />
              <Appearance theme={props.theme} onTheme={props.onTheme} />
              <LoginItem prefs={prefs} demo={props.demo} onPrefs={setPrefs} />
              <SessionTimer on={props.showTimers} demo={props.demo} onShow={props.onShowTimers} />
              <TrayFigure prefs={prefs} onPrefs={setPrefs} />
              <UsageHistory on={props.showHistory} onShow={props.onShowHistory} />
              <ProjectGrouping on={props.showProjects} onShow={props.onShowProjects} />
              <SourceHealthSection sources={props.sources} />
              <Updates prefs={prefs} demo={props.demo} onPrefs={setPrefs} />
              <Report demo={props.demo} days={props.days} />

              {!props.demo ? (
                <section className="mt-4 border-t border-line/70 pt-3">
                  <button
                    type="button"
                    onClick={props.onQuit}
                    className="h-[32px] w-full rounded-[8px] border border-line text-[11.5px] font-medium text-danger transition-colors hover:bg-panel"
                  >
                    Quit FreeTokens
                  </button>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
        <SettingsNote />
      </div>
    </FeedbackProvider>
  );
}

/** Pinned below the scroll area: a saved or rejected setting has to be visible without scrolling,
 * since the control that produced it can sit well above the fold. */
function SettingsNote() {
  const { note } = useFeedback();
  return (
    <p aria-live="polite" className="min-h-[18px] shrink-0 px-4 pb-3 text-[10.5px] leading-snug">
      {note ? (
        <span
          className={`inline-flex items-start gap-1 ${
            note.kind === "ok" ? "text-brand-strong" : "text-warn"
          }`}
        >
          {note.kind === "ok" ? <CheckIcon className="mt-[1px] h-3 w-3 shrink-0" /> : null}
          {note.text}
        </span>
      ) : null}
    </p>
  );
}
