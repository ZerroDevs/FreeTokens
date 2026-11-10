import { bridge } from "../../lib/api";
import type { Preferences } from "../../lib/types";
import { useFeedback } from "./feedback";
import { SettingRow, SettingsSelect } from "./parts";

const INTERVALS = [1, 5, 15, 30, 60];

/** One row of the General card: how often the tray re-reads usage. */
export function RefreshInterval({
  prefs,
  demo,
  onPrefs,
}: {
  prefs: Preferences;
  demo: boolean;
  onPrefs: (prefs: Preferences) => void;
}) {
  const { saving, run } = useFeedback();

  const save = (minutes: number) => {
    if (minutes === prefs.refreshMinutes) return;
    void run(async () => {
      const previous = prefs.refreshMinutes;
      onPrefs({ ...prefs, refreshMinutes: minutes });
      try {
        if (bridge) await bridge.SaveRefreshMinutes(minutes);
      } catch (error) {
        onPrefs({ ...prefs, refreshMinutes: previous });
        throw error;
      }
      return "Refresh interval saved.";
    });
  };

  return (
    <SettingRow label="Refresh Every" htmlFor="refresh-every">
      <SettingsSelect
        id="refresh-every"
        label="Refresh every"
        value={prefs.refreshMinutes}
        options={INTERVALS.map((minutes) => ({
          value: minutes,
          label: minutes === 60 ? "1 hr" : `${minutes} min`,
        }))}
        disabled={demo || saving}
        onChange={save}
      />
    </SettingRow>
  );
}
