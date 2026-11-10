import { useFeedback } from "./feedback";
import { SettingRow, SettingsSwitch } from "./parts";

/** One row of the General card: the session countdown next to the menu bar icon. */
export function SessionTimer({
  on,
  demo,
  onShow,
}: {
  on: boolean;
  demo: boolean;
  onShow: (on: boolean) => Promise<void>;
}) {
  const { saving, run } = useFeedback();

  const save = () => {
    if (demo || saving) return;
    const next = !on;
    void run(async () => {
      await onShow(next);
      return next ? "Session countdowns shown." : "Session countdowns hidden.";
    });
  };

  return (
    <SettingRow label="Session Timer in Menu Bar">
      <SettingsSwitch
        checked={on}
        disabled={demo || saving}
        label="Session Timer in Menu Bar"
        onToggle={save}
      />
    </SettingRow>
  );
}
