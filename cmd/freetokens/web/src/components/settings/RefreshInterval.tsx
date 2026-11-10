import { bridge } from "../../lib/api";
import type { Preferences } from "../../lib/types";
import { useFeedback } from "./feedback";
import { ChoiceGrid, SettingsSection } from "./parts";

const INTERVALS = [1, 5, 15, 30, 60];

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

  const save = (minutes: number) =>
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

  return (
    <SettingsSection id="refresh" title="Refresh every" first>
      <ChoiceGrid
        label="Refresh interval"
        options={INTERVALS.map((minutes) => ({
          value: minutes,
          label: minutes === 60 ? "1 hr" : `${minutes} min`,
        }))}
        value={prefs.refreshMinutes}
        columns={5}
        disabled={demo || saving}
        onSelect={save}
      />
      <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
        The background refresh uses the same interval as the tray.
      </p>
    </SettingsSection>
  );
}
