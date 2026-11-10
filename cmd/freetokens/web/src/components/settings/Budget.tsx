import { useEffect, useState } from "react";
import { formatMoney } from "../../lib/format";
import { useFeedback } from "./feedback";
import { SettingsSection } from "./parts";

export function Budget({
  budgetUsd,
  onBudget,
}: {
  budgetUsd: number;
  onBudget: (usd: number) => Promise<void>;
}) {
  const { saving, run, reject, clear } = useFeedback();
  const [input, setInput] = useState(budgetUsd > 0 ? String(budgetUsd) : "");

  // The value lives in the panel, which also reads it after a save; keep the field in step.
  useEffect(() => {
    setInput(budgetUsd > 0 ? String(budgetUsd) : "");
  }, [budgetUsd]);

  const save = () => {
    if (saving) return;
    const parsed = Number(input.trim().replace(/[$,\s]/g, ""));
    if (input.trim() !== "" && (!Number.isFinite(parsed) || parsed < 0)) {
      reject("The budget must be a non-negative amount, or empty to turn it off.");
      return;
    }
    const next = input.trim() === "" ? 0 : parsed;
    void run(async () => {
      await onBudget(next);
      return next > 0 ? `Monthly budget set to ${formatMoney(next)}.` : "Budget line turned off.";
    });
  };

  return (
    <SettingsSection
      id="budget"
      title="Monthly budget"
      hint="Compares the rolling 30-day estimate with a ceiling. Empty turns the line off."
    >
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="flex h-[30px] min-w-0 flex-1 items-center gap-1 rounded-[8px] bg-panel px-2">
          <span className="text-[11px] text-faint">$</span>
          <span className="sr-only">Monthly budget in dollars</span>
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              // The last answer was about the value the user is now replacing.
              clear();
            }}
            inputMode="decimal"
            placeholder="250"
            disabled={saving}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink tnum outline-none placeholder:text-faint disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={saving || input === (budgetUsd > 0 ? String(budgetUsd) : "")}
          className="h-[30px] rounded-[8px] bg-panel px-2.5 text-[10.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          Save
        </button>
      </form>
    </SettingsSection>
  );
}
