import { useFeedback } from "./feedback";
import { SettingRow, SettingsSwitch } from "./parts";

/** One row of the Usage card: the 30-day bars and the previous-period comparison under the mix. */
export function UsageHistory({
  on,
  onShow,
}: {
  on: boolean;
  onShow: (on: boolean) => Promise<void>;
}) {
  const { saving, run } = useFeedback();

  const save = () => {
    if (saving) return;
    const next = !on;
    void run(async () => {
      await onShow(next);
      return next ? "Usage history shown." : "Usage history hidden.";
    });
  };

  return (
    <SettingRow label="Usage History" hint="The 30-day bars and the period comparison, under the mix.">
      <SettingsSwitch checked={on} disabled={saving} label="Usage History" onToggle={save} />
    </SettingRow>
  );
}
