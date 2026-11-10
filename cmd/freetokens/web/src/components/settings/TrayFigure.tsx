import { bridge } from "../../lib/api";
import type { Preferences, TrayTitle } from "../../lib/types";
import { useFeedback } from "./feedback";
import { ChoiceGrid, SettingsSection } from "./parts";

const TRAY_TITLES: { value: TrayTitle; label: string; note: string }[] = [
  { value: "session", label: "Session", note: "The menu bar shows the session countdown." },
  { value: "hours", label: "Hours", note: "The menu bar shows the hours left today." },
  { value: "tokens", label: "Tokens", note: "The menu bar shows today's measured tokens." },
  { value: "cost", label: "Cost", note: "The menu bar shows today's estimated cost." },
  { value: "none", label: "None", note: "The menu bar shows only the icon." },
];

export function TrayFigure({
  prefs,
  onPrefs,
}: {
  prefs: Preferences;
  onPrefs: (prefs: Preferences) => void;
}) {
  const { saving, run } = useFeedback();

  const save = (next: TrayTitle) => {
    if (saving || next === prefs.trayTitle) return;
    const previous = prefs.trayTitle;
    void run(async () => {
      onPrefs({ ...prefs, trayTitle: next });
      try {
        if (bridge) await bridge.SetTrayTitle(next);
      } catch (error) {
        onPrefs({ ...prefs, trayTitle: previous });
        throw error;
      }
      return TRAY_TITLES.find((option) => option.value === next)?.note ?? "Menu bar setting saved.";
    });
  };

  return (
    <SettingsSection id="tray-title" title="Menu bar figure">
      <ChoiceGrid
        label="Menu bar figure"
        options={TRAY_TITLES}
        value={prefs.trayTitle}
        columns={5}
        textClass="text-[10px]"
        disabled={saving}
        onSelect={save}
      />
      <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
        macOS draws this next to the icon; other systems show it in the tray tooltip. The countdown
        still needs the session timer on.
      </p>
    </SettingsSection>
  );
}
