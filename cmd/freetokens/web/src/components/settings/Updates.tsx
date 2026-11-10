import { useCallback, useState } from "react";
import { bridge, errorMessage } from "../../lib/api";
import { versionLabel } from "../../lib/format";
import { plainNotes } from "../../lib/notes";
import type { AutoUpdate, Preferences, UpdateStatus } from "../../lib/types";
import { ExternalIcon } from "../Icons";
import { useFeedback } from "./feedback";
import { SettingRow, SettingsCard, SettingsSection, SettingsSelect } from "./parts";

const POLICIES: { value: AutoUpdate; label: string; note: string }[] = [
  { value: "off", label: "Never Check", note: "Automatic update checks are off." },
  { value: "notify", label: "Check Daily", note: "FreeTokens will check daily and name a new release." },
  {
    value: "auto",
    label: "Install Automatically",
    note: "FreeTokens will check daily and install verified releases.",
  },
];

function policyHint(policy: AutoUpdate): string {
  switch (policy) {
    case "notify":
      return "Checks once a day and names a new release.";
    case "auto":
      return "Checks once a day and installs checksum-verified releases.";
    default:
      return "FreeTokens never contacts GitHub unless you ask.";
  }
}

export function Updates({
  prefs,
  demo,
  onPrefs,
}: {
  prefs: Preferences;
  demo: boolean;
  onPrefs: (prefs: Preferences) => void;
}) {
  const { saving, run } = useFeedback();
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const savePolicy = (next: AutoUpdate) => {
    const api = bridge;
    if (!api || demo || saving || next === prefs.autoUpdate) return;
    const previous = prefs.autoUpdate;
    void run(async () => {
      onPrefs({ ...prefs, autoUpdate: next });
      try {
        await api.SetAutoUpdate(next);
      } catch (error) {
        onPrefs({ ...prefs, autoUpdate: previous });
        throw error;
      }
      return POLICIES.find((option) => option.value === next)?.note ?? "Update policy saved.";
    });
  };

  const skipUpdate = () => {
    const api = bridge;
    if (!api || !update) return;
    void run(async () => {
      await api.SetSkippedVersion(update.latest);
      setUpdate({ ...update, available: false, skipped: true });
      return `${update.latest} won't be announced again.`;
    });
  };

  const unskipUpdate = () => {
    const api = bridge;
    if (!api || !update) return;
    void run(async () => {
      await api.SetSkippedVersion("");
      setUpdate({ ...update, available: true, skipped: false });
      return `${update.latest} will be announced again.`;
    });
  };

  const checkUpdates = useCallback(async () => {
    const api = bridge;
    if (!api) return;
    setChecking(true);
    setUpdateError(null);
    setUpdate(null);
    try {
      setUpdate(await api.CheckForUpdates());
    } catch (error) {
      setUpdateError(errorMessage(error));
    } finally {
      setChecking(false);
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
    <SettingsSection id="updates" title="Updates">
      <SettingsCard>
        <SettingRow label="GitHub Releases" htmlFor="update-policy">
          <SettingsSelect
            id="update-policy"
            label="Automatic update checks"
            value={prefs.autoUpdate}
            options={POLICIES}
            disabled={demo || saving}
            onChange={savePolicy}
          />
        </SettingRow>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <p className="min-w-0 text-[10.5px] leading-snug text-faint">{policyHint(prefs.autoUpdate)}</p>
          <button
            type="button"
            disabled={demo || checking}
            onClick={() => void checkUpdates()}
            className="h-[26px] shrink-0 rounded-[7px] border border-line bg-raised px-2.5 text-[10.5px] font-medium text-ink transition-colors hover:bg-raised-hover disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check Now"}
          </button>
        </div>
        <button
          type="button"
          onClick={openReleases}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-brand-strong transition-colors hover:bg-raised"
        >
          Release notes
          <ExternalIcon className="h-3 w-3" />
        </button>
      </SettingsCard>
      {update ? (
        <p className="mt-2 px-1 text-[11px] leading-snug text-muted">
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
                onClick={skipUpdate}
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
                onClick={unskipUpdate}
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
        <p role="alert" className="mt-2 px-1 text-[11px] leading-snug text-warn">
          {updateError}
        </p>
      ) : null}
      {demo ? (
        <p className="mt-2 px-1 text-[10.5px] leading-snug text-faint">
          These controls work in the desktop app.
        </p>
      ) : null}
    </SettingsSection>
  );
}
