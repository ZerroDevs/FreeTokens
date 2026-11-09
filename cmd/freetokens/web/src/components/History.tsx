import { comparePeriod, lastDays } from "../lib/days";
import { formatTokens, formatUsd } from "../lib/format";
import type { Day, ValueMode } from "../lib/types";

const DAYS = 14;

function barValue(value: number, mode: ValueMode): string {
  if (mode === "cost") return formatUsd(value, false);
  return `${formatTokens(value)} tokens`;
}

/**
 * The last two weeks as bars, scaled to the busiest day. It answers "how is today going" without
 * opening the account page, which the per-period totals cannot.
 */
export function HistoryStrip({ days, mode, now }: { days: Day[]; mode: ValueMode; now: number }) {
  const bars = lastDays(days, DAYS, now, mode);
  const peak = Math.max(...bars.map((bar) => bar.value), 0);
  if (peak <= 0) return null;

  const busiest = bars.reduce((best, bar) => (bar.value > best.value ? bar : best), bars[0]);
  const label = `Daily ${mode === "cost" ? "cost" : "tokens"} for the last ${DAYS} days. Busiest was ${
    busiest.label
  } at ${barValue(busiest.value, mode)}.`;

  return (
    <figure className="mt-3">
      <figcaption className="text-[10.5px] text-faint">Last {DAYS} days</figcaption>
      <div role="img" aria-label={label} className="mt-1.5 flex h-11 items-end gap-[3px]">
        {bars.map((bar, index) => {
          const share = bar.value / peak;
          const today = index === bars.length - 1;
          // One fill class per bar: a zero day shows the track, not a brand-coloured sliver.
          const fill =
            bar.value > 0 ? (today ? "bg-brand" : "bg-brand/50") : "bg-track";
          return (
            <div key={bar.key} className="flex h-full flex-1 items-end">
              <div
                title={`${bar.label}: ${barValue(bar.value, mode)}`}
                className={`w-full rounded-[2px] ${fill}`}
                style={{ height: bar.value > 0 ? `${Math.max(share * 100, 4)}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint tnum">
        <span>{bars[0].label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </figure>
  );
}

/**
 * One line under the tabs comparing the selected period with the window before it. Silent when the
 * previous window had no usage, because any percentage there would be fabricated.
 */
export function PeriodComparison({
  label,
  days,
  now,
  mode,
}: {
  label: string;
  days: Day[];
  now: number;
  mode: ValueMode;
}) {
  const comparison = comparePeriod(label, days, now, mode);
  if (!comparison) return null;

  const percent = Math.round(Math.abs(comparison.change) * 100);
  if (percent < 1) {
    return <p className="mt-2 px-1 text-[10.5px] text-faint">About the same as {comparison.previousLabel}</p>;
  }

  const direction = comparison.change > 0 ? "more" : "less";

  return (
    <p className="mt-2 px-1 text-[10.5px] text-faint">
      <span className="font-medium text-muted">
        {percent}% {direction}
      </span>{" "}
      than {comparison.previousLabel}
    </p>
  );
}
