import { comparePeriod, lastDays, periodWindow, topMovers } from "../lib/days";
import { formatMoney, formatTokens, formatUsd } from "../lib/format";
import type { Day, ValueMode } from "../lib/types";

const DAYS = 30;

function barValue(value: number, mode: ValueMode): string {
  if (mode === "cost") return formatUsd(value, false);
  return `${formatTokens(value)} tokens`;
}

/**
 * The last 30 days as bars, scaled to the busiest day. It answers "how is today going" without
 * opening the account page, which the per-period totals cannot.
 */
export function HistoryStrip({ days, mode, now }: { days: Day[]; mode: ValueMode; now: number }) {
  const bars = lastDays(days, DAYS, now, mode);
  const peak = Math.max(...bars.map((bar) => bar.value), 0);
  if (peak <= 0) return null;
  const activeDays = bars.filter((bar) => bar.value > 0).length;

  const busiest = bars.reduce((best, bar) => (bar.value > best.value ? bar : best), bars[0]);
  const label = `Daily ${mode === "cost" ? "cost" : "tokens"} for the last ${DAYS} days. Busiest was ${
    busiest.label
  } at ${barValue(busiest.value, mode)}.`;

  return (
    <section aria-labelledby="history-heading" className="mt-3">
      <h2 id="history-heading" className="text-[14px] font-semibold text-ink">
        Last {DAYS} Days
      </h2>
      <figure className="mt-2 rounded-[12px] bg-panel px-3 py-2.5">
        <figcaption className="text-[10.5px] text-muted">
          {activeDays} active {activeDays === 1 ? "day" : "days"} · hover a bar for details
        </figcaption>
        <div role="img" aria-label={label} className="mt-2 flex h-[62px] items-end gap-[3px]">
          {bars.map((bar, index) => {
            const share = bar.value / peak;
            const today = index === bars.length - 1;
            // One fill class per bar: a zero day shows the track, not a brand-coloured sliver.
            const fill = bar.value > 0 ? (today ? "bg-brand-strong" : "bg-brand") : "bg-track";
            return (
              <div key={bar.key} className="flex h-full flex-1 items-end">
                <div
                  title={`${bar.label}: ${barValue(bar.value, mode)}`}
                  className={`w-full rounded-[2px] ${fill}`}
                  style={{ height: bar.value > 0 ? `${Math.max(share * 100, 8)}%` : "3px" }}
                />
              </div>
            );
          })}
        </div>
      </figure>
    </section>
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

  // The sign carries the direction, so the sentence only has to name the window being compared
  // against. Grouping keeps a five-digit figure readable instead of a wall of digits.
  const signed = `${comparison.change > 0 ? "+" : "−"}${percent.toLocaleString()}%`;

  return (
    <p className="mt-2 px-1 text-[10.5px] text-faint">
      <span className="font-medium text-muted tnum">{signed}</span> vs {comparison.previousLabel}
    </p>
  );
}

/** A signed amount for a mover: +51M or −12.4M tokens, +$4.20 or −$0.80. */
function signedValue(value: number, mode: ValueMode): string {
  const sign = value > 0 ? "+" : "−";
  const size = Math.abs(value);
  return mode === "tokens" ? `${sign}${formatTokens(size)}` : `${sign}${formatMoney(size)}`;
}

/**
 * The models behind the comparison line. A total can fall while one model rises, and the name is
 * what makes the change actionable; a model new to this window says so instead of a fake percentage.
 */
export function Movers({
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
  const movers = topMovers(label, days, now, mode);
  const window = periodWindow(label, now);
  if (movers.length === 0 || !window) return null;

  return (
    <div className="mt-1.5 px-1">
      <p className="text-[10px] text-faint">Moved most vs {window.previousLabel}</p>
      <ul className="mt-1 space-y-[2px]">
        {movers.map((mover) => {
          const percent = mover.change == null ? null : Math.round(Math.abs(mover.change) * 100);
          return (
            <li key={mover.name} className="flex items-baseline gap-2 text-[10.5px]">
              <span className="min-w-0 flex-1 truncate text-muted" title={mover.name}>
                {mover.name}
              </span>
              <span className="shrink-0 font-medium text-ink tnum">{signedValue(mover.delta, mode)}</span>
              <span className="w-[42px] shrink-0 text-right text-faint tnum">
                {percent == null ? "new" : `${percent < 1 ? "<1" : percent}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
