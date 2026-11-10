import { useCallback, useEffect, useState } from "react";
import { bridge, copyText, errorMessage } from "../lib/api";
import { toCsv } from "../lib/days";
import { formatAgo, formatMoney } from "../lib/format";
import { plainNotes } from "../lib/notes";
import type { AutoUpdate, Day, Preferences, SourceHealth, Theme, TrayTitle, UpdateStatus } from "../lib/types";
import { BackIcon, CheckIcon, ExternalIcon } from "./Icons";

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

const INTERVALS = [1, 5, 15, 30, 60];
const THEMES: { value: Theme; label: string; note: string }[] = [
  { value: "system", label: "System", note: "Following the system appearance." },
  { value: "dark", label: "Dark", note: "Dark theme saved." },
  { value: "light", label: "Light", note: "Light theme saved." },
];
const POLICIES: { value: AutoUpdate; label: string; note: string }[] = [
  { value: "off", label: "Never", note: "Automatic update checks are off." },
  { value: "notify", label: "Notify", note: "FreeTokens will check daily and name a new release." },
  { value: "auto", label: "Auto-install", note: "FreeTokens will check daily and install verified releases." },
];
const TRAY_TITLES: { value: TrayTitle; label: string; note: string }[] = [
  { value: "session", label: "Session", note: "The menu bar shows the session countdown." },
  { value: "hours", label: "Hours", note: "The menu bar shows the hours left today." },
  { value: "tokens", label: "Tokens", note: "The menu bar shows today's measured tokens." },
  { value: "cost", label: "Cost", note: "The menu bar shows today's estimated cost." },
  { value: "none", label: "None", note: "The menu bar shows only the icon." },
];
const SOURCE_TINT: Record<string, string> = {
  ok: "bg-brand",
  partial: "bg-warn",
  cached: "bg-warn",
  error: "bg-danger",
  missing: "bg-track",
  "signed-out": "bg-track",
};

function policyHint(policy: AutoUpdate): string {
  switch (policy) {
    case "notify":
      return "Checks once a day and names a new release.";
    case "auto":
      return "Checks once a day and installs checksum-verified releases.";
    default:
      return "Never contacts GitHub for releases.";
  }
}

function versionLabel(version: string): string {
  if (!version || version === "dev" || version === "preview") return "development build";
  return `v${version.replace(/^v/, "")}`;
}

export function Settings({
  demo,
  theme,
  onTheme,
  showTimers,
  onShowTimers,
  showHistory,
  onShowHistory,
  budgetUsd,
  onBudget,
  showProjects,
  onShowProjects,
  sources,
  days,
  onBack,
  onQuit,
}: Props) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [budgetInput, setBudgetInput] = useState(budgetUsd > 0 ? String(budgetUsd) : "");
  const [updateError, setUpdateError] = useState<string | null>(null);

  // The value lives in the panel, which also reads it after a save; keep the field in step.
  useEffect(() => {
    setBudgetInput(budgetUsd > 0 ? String(budgetUsd) : "");
  }, [budgetUsd]);

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

  const saveMinutes = useCallback(
    async (minutes: number) => {
      if (!bridge || !prefs) return;
      const previous = prefs.refreshMinutes;
      setPrefs({ ...prefs, refreshMinutes: minutes });
      setSaving(true);
      setNote(null);
      try {
        await bridge.SaveRefreshMinutes(minutes);
        setNote({ kind: "ok", text: "Refresh interval saved." });
      } catch (error) {
        setPrefs((current) => (current ? { ...current, refreshMinutes: previous } : current));
        setNote({ kind: "error", text: errorMessage(error) });
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  const saveLogin = useCallback(async () => {
    if (!bridge || !prefs) return;
    const next = !prefs.startAtLogin;
    setPrefs({ ...prefs, startAtLogin: next });
    setSaving(true);
    setNote(null);
    try {
      await bridge.SetStartAtLogin(next);        setNote({ kind: "ok", text: next ? "FreeTokens will start automatically." : "Login item removed." });
    } catch (error) {
      setPrefs((current) => (current ? { ...current, startAtLogin: !next } : current));
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const saveTheme = useCallback(
    async (next: Theme) => {
      if (next === theme || saving) return;
      setSaving(true);
      setNote(null);
      try {
        await onTheme(next);
        const saved = THEMES.find((option) => option.value === next);
        setNote({ kind: "ok", text: saved ? saved.note : "Theme saved." });
      } catch (error) {
        setNote({ kind: "error", text: errorMessage(error) });
      } finally {
        setSaving(false);
      }
    },
    [theme, saving, onTheme],
  );

  const saveTimers = useCallback(async () => {
    if (demo || saving) return;
    const next = !showTimers;
    setSaving(true);
    setNote(null);
    try {
      await onShowTimers(next);
      setNote({ kind: "ok", text: next ? "Session countdowns shown." : "Session countdowns hidden." });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [demo, saving, showTimers, onShowTimers]);

  // Demo mode still toggles, so the preview can show both states; only a real run persists it.
  const saveHistory = useCallback(async () => {
    if (saving) return;
    const next = !showHistory;
    setSaving(true);
    setNote(null);
    try {
      await onShowHistory(next);
      setNote({ kind: "ok", text: next ? "Usage history shown." : "Usage history hidden." });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [saving, showHistory, onShowHistory]);

  const saveBudget = useCallback(async () => {
    if (saving) return;
    const parsed = Number(budgetInput.trim().replace(/[$,\s]/g, ""));
    if (budgetInput.trim() !== "" && (!Number.isFinite(parsed) || parsed < 0)) {
      setNote({ kind: "error", text: "The budget must be a non-negative amount, or empty to turn it off." });
      return;
    }
    const next = budgetInput.trim() === "" ? 0 : parsed;
    setSaving(true);
    setNote(null);
    try {
      await onBudget(next);
      setNote({
        kind: "ok",
        text: next > 0 ? `Monthly budget set to ${formatMoney(next)}.` : "Budget line turned off.",
      });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [budgetInput, onBudget, saving]);

  const saveTrayTitle = useCallback(
    async (next: TrayTitle) => {
      if (!prefs || saving || next === prefs.trayTitle) return;
      const previous = prefs.trayTitle;
      setPrefs({ ...prefs, trayTitle: next });
      setSaving(true);
      setNote(null);
      try {
        if (bridge) await bridge.SetTrayTitle(next);
        const saved = TRAY_TITLES.find((option) => option.value === next);
        setNote({ kind: "ok", text: saved ? saved.note : "Menu bar setting saved." });
      } catch (error) {
        setPrefs((current) => (current ? { ...current, trayTitle: previous } : current));
        setNote({ kind: "error", text: errorMessage(error) });
      } finally {
        setSaving(false);
      }
    },
    [prefs, saving],
  );

  const saveProjects = useCallback(async () => {
    if (saving) return;
    const next = !showProjects;
    setSaving(true);
    setNote(null);
    try {
      await onShowProjects(next);
      setNote({ kind: "ok", text: next ? "Project grouping shown in the model mix." : "Project grouping hidden." });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [onShowProjects, saving, showProjects]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    setNote(null);
    try {
      await copyText(bridge ? await bridge.ExportCSV() : toCsv(days ?? []));
      setNote({ kind: "ok", text: "Daily usage copied as CSV." });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setExporting(false);
    }
  }, [days]);

  const savePolicy = useCallback(
    async (next: AutoUpdate) => {
      if (!bridge || !prefs || demo || saving || next === prefs.autoUpdate) return;
      const previous = prefs.autoUpdate;
      setPrefs({ ...prefs, autoUpdate: next });
      setSaving(true);
      setNote(null);
      try {
        await bridge.SetAutoUpdate(next);
        const saved = POLICIES.find((option) => option.value === next);
        setNote({ kind: "ok", text: saved ? saved.note : "Update policy saved." });
      } catch (error) {
        setPrefs((current) => (current ? { ...current, autoUpdate: previous } : current));
        setNote({ kind: "error", text: errorMessage(error) });
      } finally {
        setSaving(false);
      }
    },
    [prefs, demo, saving],
  );

  const skipUpdate = useCallback(async () => {
    if (!bridge || !update) return;
    try {
      await bridge.SetSkippedVersion(update.latest);
      setUpdate({ ...update, available: false, skipped: true });
      setNote({ kind: "ok", text: `${update.latest} won't be announced again.` });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    }
  }, [update]);

  const unskipUpdate = useCallback(async () => {
    if (!bridge || !update) return;
    try {
      await bridge.SetSkippedVersion("");
      setUpdate({ ...update, available: true, skipped: false });
      setNote({ kind: "ok", text: `${update.latest} will be announced again.` });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    }
  }, [update]);

  const checkUpdates = useCallback(async () => {
    if (!bridge) return;
    setChecking(true);
    setUpdateError(null);
    setUpdate(null);
    try {
      setUpdate(await bridge.CheckForUpdates());
    } catch (error) {
      setUpdateError(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }, []);

  const copyStatus = useCallback(async () => {
    if (!bridge) return;
    setCopying(true);
    setNote(null);
    try {
      await copyText(await bridge.StatusText());
      setNote({ kind: "ok", text: "Status copied to the clipboard." });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setCopying(false);
    }
  }, []);

  const openReleases = useCallback(() => {
    if (bridge) {
      void bridge.OpenReleases().catch(() => {});
      return;
    }
    window.open("https://github.com/tverma101/FreeTokens/releases", "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 px-3 pt-3">
        <button
          type="button"
          aria-label="Back to usage"
          onClick={onBack}
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
            <section aria-labelledby="refresh-heading" className="mt-3">
              <h2 id="refresh-heading" className="text-[12px] font-medium text-muted">
                Refresh every
              </h2>
              <div role="group" aria-label="Refresh interval" className="mt-2 grid grid-cols-5 gap-1">
                {INTERVALS.map((minutes) => {
                  const active = prefs.refreshMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={active}
                      disabled={demo || saving}
                      onClick={() => void saveMinutes(minutes)}
                      className={`h-[30px] rounded-[8px] text-[10.5px] font-medium transition-colors ${
                        active
                          ? "bg-raised text-ink"
                          : "bg-panel text-muted hover:text-ink disabled:hover:text-muted"
                      } disabled:opacity-60`}
                    >
                      {minutes === 60 ? "1 hr" : `${minutes} min`}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
                The background refresh uses the same interval as the tray.
              </p>
            </section>

            <section aria-labelledby="budget-heading" className="mt-4 border-t border-line/70 pt-3">
              <h2 id="budget-heading" className="text-[12px] font-medium text-muted">
                Monthly budget
              </h2>
              <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                Compares the rolling 30-day estimate with a ceiling. Empty turns the line off.
              </p>
              <form
                className="mt-2 flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveBudget();
                }}
              >
                <label className="flex h-[30px] min-w-0 flex-1 items-center gap-1 rounded-[8px] bg-panel px-2">
                  <span className="text-[11px] text-faint">$</span>
                  <span className="sr-only">Monthly budget in dollars</span>
                  <input
                    value={budgetInput}
                    onChange={(event) => {
                      setBudgetInput(event.target.value);
                      // The last answer was about the value the user is now replacing.
                      setNote(null);
                    }}
                    inputMode="decimal"
                    placeholder="250"
                    disabled={saving}
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-ink tnum outline-none placeholder:text-faint disabled:opacity-60"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || budgetInput === (budgetUsd > 0 ? String(budgetUsd) : "")}
                  className="h-[30px] rounded-[8px] bg-panel px-2.5 text-[10.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  Save
                </button>
              </form>
            </section>

            <section aria-labelledby="appearance-heading" className="mt-4 border-t border-line/70 pt-3">
              <h2 id="appearance-heading" className="text-[12px] font-medium text-muted">
                Appearance
              </h2>
              <div role="group" aria-label="Theme" className="mt-2 grid grid-cols-3 gap-1">
                {THEMES.map((option) => {
                  const active = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      disabled={saving}
                      onClick={() => void saveTheme(option.value)}
                      className={`h-[30px] rounded-[8px] text-[10.5px] font-medium transition-colors ${
                        active
                          ? "bg-raised text-ink"
                          : "bg-panel text-muted hover:text-ink disabled:hover:text-muted"
                      } disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
                Changes this window only. The tray icon follows the system.
              </p>
            </section>

            <section aria-labelledby="login-heading" className="mt-4 border-t border-line/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="login-heading" className="text-[12px] font-medium text-muted">
                    {prefs.platform === "windows" ? "Start with Windows" : "Start at login"}
                  </h2>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                    Adds the tray icon when you sign in.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.startAtLogin}
                  aria-labelledby="login-heading"
                  disabled={demo || saving}
                  onClick={() => void saveLogin()}
                  className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                    prefs.startAtLogin ? "bg-brand" : "bg-track"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-4 w-4 rounded-full bg-shell transition-[left] motion-reduce:transition-none ${
                      prefs.startAtLogin ? "left-[19px]" : "left-[3px]"
                    }`}
                  />
                </button>
              </div>
            </section>

            <section aria-labelledby="timers-heading" className="mt-4 border-t border-line/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="timers-heading" className="text-[12px] font-medium text-muted">
                    Session timer
                  </h2>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                    Shows the active session countdown in the hours card.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showTimers}
                  aria-labelledby="timers-heading"
                  disabled={demo || saving}
                  onClick={() => void saveTimers()}
                  className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                    showTimers ? "bg-brand" : "bg-track"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-4 w-4 rounded-full bg-shell transition-[left] motion-reduce:transition-none ${
                      showTimers ? "left-[19px]" : "left-[3px]"
                    }`}
                  />
                </button>
              </div>
            </section>

            <section aria-labelledby="tray-title-heading" className="mt-4 border-t border-line/70 pt-3">
              <h2 id="tray-title-heading" className="text-[12px] font-medium text-muted">
                Menu bar figure
              </h2>
              <div role="group" aria-label="Menu bar figure" className="mt-2 grid grid-cols-5 gap-1">
                {TRAY_TITLES.map((option) => {
                  const active = prefs.trayTitle === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      disabled={saving}
                      onClick={() => void saveTrayTitle(option.value)}
                      className={`h-[30px] rounded-[8px] text-[10px] font-medium transition-colors ${
                        active
                          ? "bg-raised text-ink"
                          : "bg-panel text-muted hover:text-ink disabled:hover:text-muted"
                      } disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
                macOS draws this next to the icon; other systems show it in the tray tooltip. The
                countdown still needs the session timer on.
              </p>
            </section>

            <section aria-labelledby="history-heading" className="mt-4 border-t border-line/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="history-heading" className="text-[12px] font-medium text-muted">
                    Usage history
                  </h2>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                    Shows the 14-day strip and the previous-period comparison above the model mix.
                    The movers and the hour grid always show.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showHistory}
                  aria-labelledby="history-heading"
                  disabled={saving}
                  onClick={() => void saveHistory()}
                  className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                    showHistory ? "bg-brand" : "bg-track"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-4 w-4 rounded-full bg-shell transition-[left] motion-reduce:transition-none ${
                      showHistory ? "left-[19px]" : "left-[3px]"
                    }`}
                  />
                </button>
              </div>
            </section>

            <section aria-labelledby="projects-heading" className="mt-4 border-t border-line/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="projects-heading" className="text-[12px] font-medium text-muted">
                    Project grouping
                  </h2>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                    Adds a Project view to the mix, from the workspace each run recorded.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showProjects}
                  aria-labelledby="projects-heading"
                  disabled={saving}
                  onClick={() => void saveProjects()}
                  className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                    showProjects ? "bg-brand" : "bg-track"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-4 w-4 rounded-full bg-shell transition-[left] motion-reduce:transition-none ${
                      showProjects ? "left-[19px]" : "left-[3px]"
                    }`}
                  />
                </button>
              </div>
            </section>

            <section aria-labelledby="sources-heading" className="mt-4 border-t border-line/70 pt-3">
              <h2 id="sources-heading" className="text-[12px] font-medium text-muted">
                Usage sources
              </h2>
              <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                What each reader found on the last refresh, so a missing total has an address.
              </p>
              {sources && sources.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {sources.map((source) => (
                    <li key={source.name} className="flex items-start gap-2 text-[10.5px]">
                      <span
                        aria-hidden="true"
                        className={`mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full ${
                          SOURCE_TINT[source.state] ?? "bg-track"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-muted">{source.name}</span>
                          <span className="shrink-0 text-faint tnum">
                            {source.files > 0
                              ? `${source.files} file${source.files === 1 ? "" : "s"}`
                              : source.state === "signed-out"
                                ? "signed out"
                                : source.state === "ok" || source.state === "cached"
                                  ? "signed in"
                                  : "none found"}
                          </span>
                        </span>
                        {source.detail ? (
                          <span className="mt-0.5 block text-faint" title={source.detail}>
                            {source.detail}
                          </span>
                        ) : null}
                        {source.lastReadAt ? (
                          <span className="mt-0.5 block text-[10px] text-faint">
                            Last read {formatAgo(source.lastReadAt, Date.now())}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[10.5px] text-faint">Sources appear after the first refresh.</p>
              )}
            </section>

            <section aria-labelledby="updates-heading" className="mt-4 border-t border-line/70 pt-3">
              <h2 id="updates-heading" className="text-[12px] font-medium text-muted">
                Updates
              </h2>
              <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                {versionLabel(prefs.version)} · {prefs.platform}
              </p>
              <div
                role="group"
                aria-label="Automatic update checks"
                className="mt-2 grid grid-cols-3 gap-1"
              >
                {POLICIES.map((option) => {
                  const active = prefs.autoUpdate === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      disabled={demo || saving}
                      onClick={() => void savePolicy(option.value)}
                      className={`h-[30px] rounded-[8px] text-[10.5px] font-medium transition-colors ${
                        active
                          ? "bg-raised text-ink"
                          : "bg-panel text-muted hover:text-ink disabled:hover:text-muted"
                      } disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
                {policyHint(prefs.autoUpdate)} The tray applies this when it next starts.
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={demo || checking}
                  onClick={() => void checkUpdates()}
                  className="h-[30px] rounded-[8px] bg-panel px-2.5 text-[10.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  {checking ? "Checking…" : "Check for updates"}
                </button>
                <button
                  type="button"
                  onClick={openReleases}
                  className="flex h-[30px] items-center gap-1 rounded-[8px] px-2 text-[10.5px] font-medium text-muted transition-colors hover:text-ink"
                >
                  Releases
                  <ExternalIcon className="h-3 w-3" />
                </button>
              </div>
              {update ? (
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  {update.available ? (
                    <>
                      {update.latest} is available.{" "}
                      <button
                        type="button"
                        onClick={openReleases}
                        className="font-medium text-brand-strong underline underline-offset-2"
                      >
                        Open the release page
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => void skipUpdate()}
                        className="text-muted underline underline-offset-2 hover:text-ink"
                      >
                        Skip this version
                      </button>
                    </>
                  ) : update.skipped ? (
                    <>
                      {update.latest} is available; you skipped it.{" "}
                      <button
                        type="button"
                        onClick={() => void unskipUpdate()}
                        className="font-medium text-brand-strong underline underline-offset-2"
                      >
                        Show it again
                      </button>
                    </>
                  ) : update.devBuild ? (
                    <>Development build. The latest release is {update.latest || "not published yet"}.</>
                  ) : (
                    <>FreeTokens {versionLabel(update.current)} is up to date.</>
                  )}
                </p>
              ) : null}
              {update?.available && update.notes ? (
                <details className="mt-2 rounded-[8px] bg-panel px-2.5 py-2">
                  <summary className="cursor-pointer text-[10.5px] font-medium text-muted">
                    What's new in {update.latest}
                  </summary>
                  <p className="scroll-area mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-snug text-faint">
                    {plainNotes(update.notes)}
                  </p>
                </details>
              ) : null}
              {updateError ? (
                <p role="alert" className="mt-2 text-[11px] leading-snug text-warn">
                  {updateError}
                </p>
              ) : null}
              {demo ? (
                <p className="mt-2 text-[10.5px] leading-snug text-faint">
                  These controls work in the desktop app.
                </p>
              ) : null}
            </section>

            <section aria-labelledby="report-heading" className="mt-4 border-t border-line/70 pt-3">
              <h2 id="report-heading" className="text-[12px] font-medium text-muted">
                Report
              </h2>
              <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
                Copies the same text `freetokens status` prints, for a bug report.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={demo || copying}
                  onClick={() => void copyStatus()}
                  className="h-[30px] rounded-[8px] bg-panel px-2.5 text-[10.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  {copying ? "Copying…" : "Copy status"}
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void exportCsv()}
                  className="h-[30px] rounded-[8px] bg-panel px-2.5 text-[10.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  {exporting ? "Copying…" : "Copy daily CSV"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-faint">
                The CSV is one row per local day with tokens, estimated cost and whether either was
                complete. <code>freetokens export --csv</code> prints the same rows.
              </p>
            </section>

            {!demo ? (
              <section className="mt-4 border-t border-line/70 pt-3">
                <button
                  type="button"
                  onClick={onQuit}
                  className="h-[32px] w-full rounded-[8px] border border-line text-[11.5px] font-medium text-danger transition-colors hover:bg-panel"
                >
                  Quit FreeTokens
                </button>
              </section>
            ) : null}

          </>
        ) : null}
      </div>
      {/* Pinned below the scroll area: a saved or rejected setting has to be visible without
          scrolling, since the control that produced it can sit well above the fold. */}
      <p aria-live="polite" className="min-h-[18px] shrink-0 px-4 pb-3 text-[10.5px] leading-snug">
        {note ? (
          <span
            className={`inline-flex items-start gap-1 ${note.kind === "ok" ? "text-brand-strong" : "text-warn"}`}
          >
            {note.kind === "ok" ? <CheckIcon className="mt-[1px] h-3 w-3 shrink-0" /> : null}
            {note.text}
          </span>
        ) : null}
      </p>
    </div>
  );
}
