import type { Theme } from "../../lib/types";
import { useFeedback } from "./feedback";
import { ChoiceGrid, SettingsSection } from "./parts";

const THEMES: { value: Theme; label: string; note: string }[] = [
  { value: "system", label: "System", note: "Following the system appearance." },
  { value: "dark", label: "Dark", note: "Dark theme saved." },
  { value: "light", label: "Light", note: "Light theme saved." },
];

export function Appearance({
  theme,
  onTheme,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => Promise<void>;
}) {
  const { saving, run } = useFeedback();

  const save = (next: Theme) => {
    if (next === theme || saving) return;
    void run(async () => {
      await onTheme(next);
      return THEMES.find((option) => option.value === next)?.note ?? "Theme saved.";
    });
  };

  return (
    <SettingsSection id="appearance" title="Appearance">
      <ChoiceGrid
        label="Theme"
        options={THEMES}
        value={theme}
        columns={3}
        disabled={saving}
        onSelect={save}
      />
      <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
        Changes this window only. The tray icon follows the system.
      </p>
    </SettingsSection>
  );
}
