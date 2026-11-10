import { useFeedback } from "./feedback";
import { SwitchSection } from "./parts";

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
    <SwitchSection
      id="timers"
      title="Session timer"
      hint="Shows the active session countdown in the hours card."
      checked={on}
      disabled={demo || saving}
      onToggle={save}
    />
  );
}
