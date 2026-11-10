import { useFeedback } from "./feedback";
import { SwitchSection } from "./parts";

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
    <SwitchSection
      id="projects"
      title="Project grouping"
      hint="Adds a Project view to the mix, from the workspace each run recorded."
      checked={on}
      disabled={saving}
      onToggle={save}
    />
  );
}
