import { useFeedback } from "./feedback";
import { SettingRow, SettingsSwitch } from "./parts";

/** One row of the Usage card: adds a Project view to the mix. */
export function ProjectGrouping({
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
      return next ? "Project grouping shown in the model mix." : "Project grouping hidden.";
    });
  };

  return (
    <SettingRow label="Project Grouping" hint="Groups the mix by the workspace each run recorded.">
      <SettingsSwitch checked={on} disabled={saving} label="Project Grouping" onToggle={save} />
    </SettingRow>
  );
}
