import { formatTokens, formatUsd, share } from "../lib/format";
import type { Slot, ValueMode } from "../lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Index is Sunday 00:00 first, which is the order the engine sends.
const slotIndex = (weekday: number, hour: number) => weekday * 24 + hour;

function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * Measured usage by weekday and hour across the retained window. It answers "when do I burn this"
 * rather than "how much did I burn", which the daily strip cannot; every cell names its hour on
 * hover because a colour alone is not a value.
 */
export function WeekHeatmap({ slots, mode }: { slots: Slot[]; mode: ValueMode }) {
  if (slots.length < 168) return null;
  const value = (slot: Slot) => (mode === "cost" ? (slot.costUsd ?? 0) : slot.tokens);
  const peak = Math.max(...slots.map(value), 0);
  if (peak <= 0) return null;

  const busiest = slots.reduce((best, slot, index) => (value(slot) > value(slots[best]) ? index : best), 0);
  const busiestDay = WEEKDAYS[Math.floor(busiest / 24)];
  const busiestHour = busiest % 24;
  const busiestValue = value(slots[busiest]);
  const summary = `Usage by weekday and hour. Busiest ${busiestDay} ${hourLabel(busiestHour)} at ${
    mode === "cost" ? formatUsd(busiestValue) : `${formatTokens(busiestValue)} tokens`
  }.`;

  return (
    <figure className="mt-3">
      <figcaption className="flex items-baseline justify-between gap-2 text-[10.5px] text-faint">
        <span>By hour</span>
        <span className="tnum">
          Busiest {busiestDay} {hourLabel(busiestHour)}
        </span>
      </figcaption>
      <div role="img" aria-label={summary} className="mt-1.5 flex gap-1.5">
        <div aria-hidden="true" className="flex w-[22px] shrink-0 flex-col justify-between py-[1px] text-[9px] leading-none text-faint">
          <span>Sun</span>
          <span>Wed</span>
          <span>Sat</span>
        </div>
        <div
          className="grid flex-1 gap-[2px]"
          style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        >
          {WEEKDAYS.flatMap((day, weekday) =>
            HOURS.map((hour) => {
              const slot = slots[slotIndex(weekday, hour)];
              const amount = value(slot);
              const detail =
                mode === "cost" ? formatUsd(amount, !slot.costComplete) : `${formatTokens(amount)} tokens`;
              return (
                <div
                  key={`${day}-${hour}`}
                  title={`${day} ${hourLabel(hour)}: ${detail}`}
                  className="h-[9px] rounded-[2px]"
                  style={{
                    backgroundColor: amount > 0 ? "var(--color-brand)" : "var(--color-track)",
                    opacity: amount > 0 ? 0.25 + 0.75 * share(amount, peak) : 1,
                  }}
                />
              );
            }),
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between pl-[28px] text-[9px] leading-none text-faint"
      >
        <span>12am</span>
        <span>6am</span>
        <span>noon</span>
        <span>6pm</span>
        <span>11pm</span>
      </div>
    </figure>
  );
}
