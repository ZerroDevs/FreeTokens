import type { Day, ValueMode } from "./types";

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Key of the local calendar day `back` days before `now`. */
export function shiftKey(now: number, back: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() - back);
  return dayKey(date);
}

export function dayValue(day: Day, mode: ValueMode): number {
  return mode === "cost" ? (day.costUsd ?? 0) : day.tokens;
}

export function sumWindow(days: Day[], from: string, to: string, mode: ValueMode): number {
  let total = 0;
  for (const day of days) {
    if (day.date >= from && day.date <= to) total += dayValue(day, mode);
  }
  return total;
}

export interface Bar {
  key: string;
  label: string;
  value: number;
}

const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The last `count` days ending today, including days with no recorded usage. */
export function lastDays(days: Day[], count: number, now: number, mode: ValueMode): Bar[] {
  const byKey = new Map(days.map((day) => [day.date, day]));
  const bars: Bar[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const key = shiftKey(now, back);
    const day = byKey.get(key);
    const at = new Date(now);
    at.setDate(at.getDate() - back);
    bars.push({
      key,
      label: back === 0 ? "Today" : monthDay.format(at),
      value: day ? dayValue(day, mode) : 0,
    });
  }
  return bars;
}

interface Span {
  /** Days counted in the selected period. */
  span: number;
  /** Days back where the selected period ends. */
  offset: number;
  previous: string;
}

const SPANS: Record<string, Span> = {
  Today: { span: 1, offset: 0, previous: "yesterday" },
  Yesterday: { span: 1, offset: 1, previous: "the day before" },
  Week: { span: 7, offset: 0, previous: "the previous 7 days" },
  "Last 30 Days": { span: 30, offset: 0, previous: "the previous 30 days" },
};

export interface Comparison {
  current: number;
  previous: number;
  /** Fractional change against the previous window, e.g. 0.18 for 18% more. */
  change: number;
  previousLabel: string;
}

/**
 * Compares the selected period with the window of the same length before it. Returns null when
 * the label has no known window or the previous window recorded nothing, since "up from zero" or
 * "up from missing data" would be a lie.
 */
export function comparePeriod(
  label: string,
  days: Day[],
  now: number,
  mode: ValueMode,
): Comparison | null {
  const span = SPANS[label];
  if (!span) return null;
  const current = sumWindow(
    days,
    shiftKey(now, span.offset + span.span - 1),
    shiftKey(now, span.offset),
    mode,
  );
  const previous = sumWindow(
    days,
    shiftKey(now, span.offset + span.span * 2 - 1),
    shiftKey(now, span.offset + span.span),
    mode,
  );
  if (previous <= 0) return null;
  return { current, previous, change: (current - previous) / previous, previousLabel: span.previous };
}
