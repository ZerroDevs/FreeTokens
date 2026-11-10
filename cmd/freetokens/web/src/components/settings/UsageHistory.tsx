import { useFeedback } from "./feedback";
import { SettingRow, SettingsSwitch } from "./parts";

/** One row of the Usage card: the history views under the mix — the 30-day bars, the
 * previous-period comparison and the by-hour grid. One switch, all three. */
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
    <SettingRow
      label="Usage History"
      hint="The 30-day bars, the period comparison and the by-hour grid, under the mix."
    >
      <SettingsSwitch checked={on} disabled={saving} label="Usage History" onToggle={save} />
    </SettingRow>
  );
}
