import { useState } from "react";
import { formatClockHours, formatMoney, formatReset } from "../lib/format";
import type { Quota } from "../lib/types";
import { ChevronDownIcon } from "./Icons";

type Props = {
  quota: Quota;
  now: number;
  // Session countdowns, already formatted and only the ones still running. They share this card
  // so a running session costs one row instead of a second panel.
  sessions: string[];
};

function hoursLabel(value: number): string {
  return `${formatClockHours(value)} h`;
}

export function DailyHours({ quota, now, sessions }: Props) {
  // Balance and session rows are secondary, so they stay collapsed until asked for.
  const [showMore, setShowMore] = useState(false);

  const meter = quota.meters.find((item) => item.label === "Daily Hours") ?? quota.meters[0];
  if (!meter) return null;

  const remaining = Math.max(0, meter.limit - meter.used);
  const fraction = meter.limit > 0 ? remaining / meter.limit : 0;
  // Under a fifth of the budget left, the bar uses the warning colour the tray dot already uses.
  const low = meter.limit > 0 && fraction <= 0.2;
  const reset = formatReset(meter.resetsAt, now);

  let lead: string;
  let sub: string;
  switch (meter.unit) {
    case "hours":
      lead = `${hoursLabel(remaining)} left`;
      sub = `of ${hoursLabel(meter.limit)}`;
      break;
    case "usd":
      lead = `${formatMoney(remaining)} left`;
      sub = `of ${formatMoney(meter.limit)}`;
      break;
    default:
      lead = `${formatClockHours(remaining)} left`;
      sub = `of ${formatClockHours(meter.limit)} sessions`;
  }

  const monthlyMeter = quota.meters.some((item) => item.label === "Monthly Spend");
  const showMonthly = quota.monthlySpendUsd != null && !monthlyMeter;
  const balance = quota.hoursBalance;

  return (
    <section aria-labelledby="hours-heading" className="rounded-[12px] bg-panel px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hours-heading" className="text-[12px] font-medium text-muted">
          {meter.label}
        </h2>
        <div className="flex items-center gap-1">
          {reset ? <p className="text-[11px] text-faint tnum">Resets in {reset}</p> : null}
          {balance != null || showMonthly || sessions.length > 0 ? (
            <button
              type="button"
              aria-expanded={showMore}
              aria-controls="hours-more"
              aria-label={
                showMore ? "Hide hours balance and session" : "Show hours balance and session"
              }
              title={showMore ? "Hide hours balance and session" : "Show hours balance and session"}
              onClick={() => setShowMore((open) => !open)}
              className="-mr-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] text-faint transition-colors hover:bg-raised hover:text-ink"
            >
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
                  showMore ? "rotate-180" : ""
                }`}
              />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink tnum">{lead}</p>
        <p className="shrink-0 text-[11px] text-faint tnum">{sub}</p>
      </div>

      <div
        role="progressbar"
        aria-label={`${meter.label} remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuetext={`${lead}, ${Math.round(fraction * 100)} percent remaining`}
        className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-track"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
            low ? "bg-warn" : "bg-hours"
          }`}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>

      {meter.detail ? <p className="mt-1.5 text-[10.5px] text-faint">{meter.detail}</p> : null}

      {showMore && (balance != null || showMonthly || sessions.length > 0) ? (
        <div id="hours-more" className="mt-2.5 space-y-1.5 border-t border-line/70 pt-2.5">
          {balance != null ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted">Hours balance</span>
              <span className="text-[13.5px] font-semibold text-ink tnum">
                {balance} {balance === 1 ? "hour" : "hours"}
              </span>
            </div>
          ) : null}
          {showMonthly ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted">Monthly spend</span>
              <span className="text-[13.5px] font-semibold text-ink tnum">
                {formatMoney(quota.monthlySpendUsd ?? 0)}
              </span>
            </div>
          ) : null}
          {sessions.map((left, index) => (
            <div key={index} className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted">
                {sessions.length === 1 ? "Active session" : `Session ${index + 1}`}
              </span>
              <span className="text-[13px] font-semibold text-ink tnum">{left} left</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
