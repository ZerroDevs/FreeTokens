import { useEffect, useState } from "react";
import { formatMoney } from "../../lib/format";
import { useFeedback } from "./feedback";
import { SettingsCard, SettingsSection } from "./parts";

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
    <SettingsSection id="budget" title="Budget">
      <SettingsCard>
        <div className="px-3 py-2.5">
          <p className="text-[12.5px] text-ink">Monthly ceiling</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-faint">
            Compares the rolling 30-day estimate with a ceiling. Empty turns the line off.
          </p>
          <form
            className="mt-2 flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <label className="flex h-[28px] min-w-0 flex-1 items-center gap-1 rounded-[7px] bg-raised px-2">
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
                disabled={saving}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-ink tnum outline-none disabled:opacity-60"
              />
            </label>
            <button
              type="submit"
              disabled={saving || input === (budgetUsd > 0 ? String(budgetUsd) : "")}
              className="h-[28px] rounded-[7px] bg-raised px-2.5 text-[10.5px] font-medium text-ink transition-colors hover:bg-raised-hover disabled:opacity-60"
            >
              Save
            </button>
          </form>
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}
