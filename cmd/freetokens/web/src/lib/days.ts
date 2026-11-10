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

/**
 * The daily rollups as CSV, matching `freetokens export --csv`: oldest first, one row per local day,
 * and an unpriced day leaves its cost cell empty instead of writing zero, which would read as a
 * measured free day. The browser preview has no engine to call, so it builds the same rows here.
 */
export function toCsv(days: Day[]): string {
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const lines = ["date,tokens,cost_usd,cost_complete,partial"];
  for (const day of ordered) {
    const cost = day.costUsd == null ? "" : day.costUsd.toFixed(4);
    lines.push([day.date, String(day.tokens), cost, String(day.costComplete), String(day.partial)].join(","));
  }
  return `${lines.join("\n")}\n`;
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

export interface PeriodWindow {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  previousLabel: string;
}

/** The selected period's day range and the equal window before it. */
export function periodWindow(label: string, now: number): PeriodWindow | null {
  const span = SPANS[label];
  if (!span) return null;
  return {
    from: shiftKey(now, span.offset + span.span - 1),
    to: shiftKey(now, span.offset),
    previousFrom: shiftKey(now, span.offset + span.span * 2 - 1),
    previousTo: shiftKey(now, span.offset + span.span),
    previousLabel: span.previous,
  };
}

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
  const window = periodWindow(label, now);
  if (!window) return null;
  const current = sumWindow(days, window.from, window.to, mode);
  const previous = sumWindow(days, window.previousFrom, window.previousTo, mode);
  if (previous <= 0) return null;
  return { current, previous, change: (current - previous) / previous, previousLabel: window.previousLabel };
}

export interface Mover {
  name: string;
  current: number;
  previous: number;
  delta: number;
  /** Fractional change, or null when the model was absent from the previous window. */
  change: number | null;
}

/**
 * The models that changed most between the selected period and the equal window before it. Day rows
 * carry their own per-model split, so this needs no extra scan. Returns nothing when the reader kept
 * no per-model rows or the previous window recorded no usage.
 */
export function topMovers(
  label: string,
  days: Day[],
  now: number,
  mode: ValueMode,
  limit = 3,
): Mover[] {
  const window = periodWindow(label, now);
  if (!window) return [];
  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  for (const day of days) {
    const bucket =
      day.date >= window.from && day.date <= window.to
        ? current
        : day.date >= window.previousFrom && day.date <= window.previousTo
          ? previous
          : null;
    if (!bucket) continue;
    for (const model of day.models ?? []) {
      const value = mode === "cost" ? (model.costUsd ?? 0) : model.tokens;
      bucket.set(model.name, (bucket.get(model.name) ?? 0) + value);
    }
  }
  if (current.size === 0 && previous.size === 0) return [];
  let previousTotal = 0;
  for (const value of previous.values()) previousTotal += value;
  if (previousTotal <= 0) return [];
  const names = new Set([...current.keys(), ...previous.keys()]);
  const movers: Mover[] = [];
  for (const name of names) {
    const nowValue = current.get(name) ?? 0;
    const before = previous.get(name) ?? 0;
    const delta = nowValue - before;
    if (delta === 0) continue;
    movers.push({ name, current: nowValue, previous: before, delta, change: before > 0 ? delta / before : null });
  }
  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}
