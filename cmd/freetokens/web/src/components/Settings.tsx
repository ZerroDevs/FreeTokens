import { useEffect, useState } from "react";
import { bridge, errorMessage } from "../lib/api";
import { formatAgo } from "../lib/format";
import type { Day, Preferences, SourceHealth, Theme, ThemeColors } from "../lib/types";
import { CheckIcon } from "./Icons";
import { About } from "./settings/About";
import { Appearance } from "./settings/Appearance";
import { Budget } from "./settings/Budget";
import { FeedbackProvider, useFeedback } from "./settings/feedback";
import { LoginItem } from "./settings/LoginItem";
import { ProjectGrouping } from "./settings/ProjectGrouping";
import { RefreshInterval } from "./settings/RefreshInterval";
import { Report } from "./settings/Report";
import { SessionTimer } from "./settings/SessionTimer";
import { SourceHealthSection } from "./settings/SourceHealth";
import { SettingsCard, SettingsSection } from "./settings/parts";
import { TrayFigure } from "./settings/TrayFigure";
import { Updates } from "./settings/Updates";
import { UsageHistory } from "./settings/UsageHistory";

type Props = {
  demo: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => Promise<void>;
  themeColors: ThemeColors;
  onThemeColors: (colors: ThemeColors) => Promise<void>;
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
  /** When the engine last read usage, shown in the footer like the popover's own. */
  refreshedAt?: string;
  now: number;
  onBack: () => void;
  onQuit: () => void;
};

/**
 * Settings is a stack of labelled cards: General, then the panel's own appearance, then the
 * usage features, updates and About, in the order the screen this follows uses.
 */
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
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pt-3.5 pb-4">
          {loadError ? (
            <p role="alert" className="rounded-[10px] bg-panel px-3 py-2.5 text-[11.5px] text-warn">
              {loadError}
            </p>
          ) : null}
          {!prefs && !loadError ? (
            <p role="status" className="text-[11.5px] text-faint">
              Reading settings…
            </p>
          ) : null}

          {prefs ? (
            <>
              <SettingsSection id="general" title="General" first>
                <SettingsCard>
                  <LoginItem prefs={prefs} demo={props.demo} onPrefs={setPrefs} />
                  <SessionTimer on={props.showTimers} demo={props.demo} onShow={props.onShowTimers} />
                  <RefreshInterval prefs={prefs} demo={props.demo} onPrefs={setPrefs} />
                </SettingsCard>
              </SettingsSection>

              <Appearance
                theme={props.theme}
                onTheme={props.onTheme}
                colors={props.themeColors}
                onColors={props.onThemeColors}
              />

              <TrayFigure prefs={prefs} onPrefs={setPrefs} />
              <Budget budgetUsd={props.budgetUsd} onBudget={props.onBudget} />

              <SettingsSection id="usage" title="Usage">
                <SettingsCard>
                  <UsageHistory on={props.showHistory} onShow={props.onShowHistory} />
                  <ProjectGrouping on={props.showProjects} onShow={props.onShowProjects} />
                </SettingsCard>
              </SettingsSection>

              <SourceHealthSection sources={props.sources} />
              <Updates prefs={prefs} demo={props.demo} onPrefs={setPrefs} />
              <Report demo={props.demo} days={props.days} />
              <About version={prefs.version} demo={props.demo} onQuit={props.onQuit} />
            </>
          ) : null}
        </div>
        <SettingsBar refreshedAt={props.refreshedAt} now={props.now} onDone={props.onBack} />
      </div>
    </FeedbackProvider>
  );
}

/** The pinned footer: what this screen is, when usage was last read, and the way out. */
function SettingsBar({
  refreshedAt,
  now,
  onDone,
}: {
  refreshedAt?: string;
  now: number;
  onDone: () => void;
}) {
  const { note } = useFeedback();
  return (
    <footer className="shrink-0 border-t border-line/70 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-ink">Settings</p>
          <p className="truncate text-[10.5px] text-faint">
            {refreshedAt ? `Updated ${formatAgo(refreshedAt, now)}` : "Saved to this computer"}
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="h-[26px] shrink-0 rounded-[7px] border border-line bg-raised px-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-raised-hover"
        >
          Done
        </button>
      </div>
      {/* Pinned below the cards: a saved or rejected setting has to be visible without scrolling. */}
      <p aria-live="polite" className="min-h-[16px] pt-1 text-[10.5px] leading-snug">
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
    </footer>
  );
}
