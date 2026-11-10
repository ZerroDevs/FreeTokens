import { bridge } from "../../lib/api";
import type { Preferences } from "../../lib/types";
import { useFeedback } from "./feedback";
import { SwitchSection } from "./parts";

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

  return (
    <SwitchSection
      id="login"
      title={prefs.platform === "windows" ? "Start with Windows" : "Start at login"}
      hint="Adds the tray icon when you sign in."
      checked={prefs.startAtLogin}
      disabled={demo || saving}
      onToggle={save}
    />
  );
}
