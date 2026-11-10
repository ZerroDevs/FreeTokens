import { bridge } from "../../lib/api";
import type { Preferences } from "../../lib/types";
import { useFeedback } from "./feedback";
import { SettingRow, SettingsSwitch } from "./parts";

/** One row of the General card: adds the tray icon to the login items. */
export function LoginItem({
  prefs,
  demo,
  onPrefs,
}: {
  prefs: Preferences;
  demo: boolean;
  onPrefs: (prefs: Preferences) => void;
}) {
  const { saving, run } = useFeedback();

  const save = () => {
    const api = bridge;
    if (!api || demo || saving) return;
    const next = !prefs.startAtLogin;
    void run(async () => {
      onPrefs({ ...prefs, startAtLogin: next });
      try {
        await api.SetStartAtLogin(next);
      } catch (error) {
        onPrefs({ ...prefs, startAtLogin: !next });
        throw error;
      }
      return next ? "FreeTokens will start automatically." : "Login item removed.";
    });
  };

  const label = prefs.platform === "windows" ? "Start with Windows" : "Start at Login";
  return (
    <SettingRow label={label}>
      <SettingsSwitch
        checked={prefs.startAtLogin}
        disabled={demo || saving}
        label={label}
        onToggle={save}
      />
    </SettingRow>
  );
}
