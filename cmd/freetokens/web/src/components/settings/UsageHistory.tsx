import { useFeedback } from "./feedback";
import { SwitchSection } from "./parts";

// Demo mode still toggles, so the preview can show both states; only a real run persists it.
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
    <SwitchSection
      id="history"
      title="Usage history"
      hint="Shows the 14-day strip and the previous-period comparison above the model mix. The movers and the hour grid always show."
      checked={on}
      disabled={saving}
      onToggle={save}
    />
  );
}
