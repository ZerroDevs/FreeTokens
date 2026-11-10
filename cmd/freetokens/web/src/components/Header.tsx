import { useEffect, useState } from "react";
import { AlertIcon, ExternalIcon } from "./Icons";

type Props = {
  plan?: string;
  demo: boolean;
  warnings: string[];
  onOpenAccount: () => void;
};

/**
 * Names the account being measured and shows its plan, the way the Freebuff app does. Refresh and
 * settings live in the footer, where the picture puts them.
 */
export function Header({ plan, demo, warnings, onOpenAccount }: Props) {
  const [showWarnings, setShowWarnings] = useState(false);

  useEffect(() => {
    if (warnings.length === 0) setShowWarnings(false);
  }, [warnings.length]);

  return (
    <header className="shrink-0 px-4 pt-3.5">
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-bold tracking-[-0.01em] text-ink">Freebuff</h1>
        {plan ? (
          <span
            title="Freebuff plan"
            className="max-w-[86px] truncate rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted"
          >
            {plan}
          </span>
        ) : null}
        {demo ? (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium text-brand-strong"
            title="Preview data shown because this page is running outside the desktop app"
          >
            Preview data
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          {warnings.length > 0 ? (
            <button
              type="button"
              aria-label={warnings.length === 1 ? "Show warning" : `Show ${warnings.length} warnings`}
              aria-expanded={showWarnings}
              onClick={() => setShowWarnings((open) => !open)}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-warn transition-colors hover:bg-raised"
            >
              <AlertIcon className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Open Freebuff account"
            title="Open Freebuff account"
            onClick={onOpenAccount}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <ExternalIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {showWarnings && warnings.length > 0 ? (
        <div role="status" className="mt-2.5 space-y-1.5 rounded-[10px] bg-panel px-3 py-2.5">
          {warnings.map((warning) => (
            <p key={warning} className="flex gap-1.5 text-[11.5px] leading-snug text-warn">
              <AlertIcon className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
    </header>
  );
}
