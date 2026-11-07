import { OTHER_COLOR, modelColor } from "../lib/colors";
import { formatTokens, formatUsd } from "../lib/format";
import type { Period, ValueMode } from "../lib/types";
import { Donut, type DonutSlice } from "./Donut";
import { ModelBreakdown } from "./ModelBreakdown";

type Props = {
  period: Period;
  selected: number;
  mode: ValueMode;
  onMode: (mode: ValueMode) => void;
};

type LegendRow = {
  name: string;
  value: number;
  color: string;
  unpriced: boolean;
  lower: boolean;
};

export function UsageSection({ period, selected, mode, onMode }: Props) {
  const models = [...(period.models ?? [])].sort((a, b) => b.tokens - a.tokens);
  const total =
    mode === "tokens" ? period.tokens : (period.costUsd ?? models.reduce((sum, m) => sum + (m.costUsd ?? 0), 0));

  const rows: LegendRow[] = models.map((model, index) => ({
    name: model.name,
    value: mode === "tokens" ? model.tokens : (model.costUsd ?? 0),
    color: modelColor(index),
    unpriced: model.costUsd == null,
    lower: !model.costComplete,
  }));

  const sources = period.sources ?? [];
  const visible = mode === "cost" ? rows.filter((row) => !row.unpriced && row.value > 0) : rows.filter((row) => row.value > 0);
  const unpricedCount = mode === "cost" ? rows.filter((row) => row.unpriced).length : 0;
  const empty = total <= 0 || visible.length === 0;

  let slices: DonutSlice[] = visible.map((row) => ({ name: row.name, value: row.value, color: row.color }));
  let legend: LegendRow[] = visible;
  if (slices.length > 6) {
    const restRows = visible.slice(6);
    const rest = restRows.reduce((sum, row) => sum + row.value, 0);
    slices = [...slices.slice(0, 6), { name: "Other models", value: rest, color: OTHER_COLOR }];
    legend = [
      ...visible.slice(0, 6),
      {
        name: "Other models",
        value: rest,
        color: OTHER_COLOR,
        unpriced: restRows.every((row) => row.unpriced),
        lower: restRows.some((row) => row.lower),
      },
    ];
  }

  const centerValue =
    mode === "tokens" ? formatTokens(total) : formatUsd(total, period.costLowerBound);
  const centerLabel = mode === "tokens" ? "tokens" : "estimated";

  return (
    <section
      id="usage-panel"
      role="tabpanel"
      aria-labelledby={`period-tab-${selected}`}
      className="mt-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-medium text-muted">Model mix</h2>
        <div role="group" aria-label="Show values as" className="flex rounded-[8px] border border-line p-[2px]">
          {(["tokens", "cost"] as const).map((option) => {
            const active = mode === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => onMode(option)}
                className={`h-[24px] rounded-[6px] px-2 text-[10.5px] font-medium transition-colors ${
                  active ? "bg-raised text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {option === "tokens" ? "Tokens" : "Cost"}
              </button>
            );
          })}
        </div>
      </div>

      {empty ? (
        <div className="mt-3 rounded-[12px] border border-dashed border-line px-4 py-6 text-center">
          <p className="text-[12px] font-medium text-muted">
            {!period.hasData
              ? "No measured usage for this period"
              : mode === "cost"
                ? "No public price for this period's models"
                : "No token usage recorded for this period"}
          </p>
          <p className="mt-1 text-[11px] text-faint">
            {period.hasData && mode === "cost"
              ? "Switch to tokens to see the measured counts."
              : "Run a Freebuff or Antigravity turn, then refresh."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-4">
            <Donut slices={slices} total={total} centerValue={centerValue} centerLabel={centerLabel} />
            <ul className="min-w-0 flex-1 space-y-[7px]">
              {legend.map((row) => (
                <li key={row.name} className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted" title={row.name}>
                    {row.name}
                  </span>
                  <span className="shrink-0 text-[11.5px] font-medium text-ink tnum">
                    {mode === "tokens"
                      ? formatTokens(row.value)
                      : formatUsd(row.value, row.lower)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {sources.length > 0 ? (
            <div className="mt-3 border-t border-line/70 pt-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[12px] font-medium text-muted">By source</h3>
                <span className="text-[10.5px] text-faint">tokens</span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                {sources.map((source) => (
                  <div key={source.name} className="flex min-w-0 items-baseline justify-between gap-2">
                    <dt className="min-w-0 truncate text-[11.5px] text-muted" title={source.name}>
                      {source.name}
                    </dt>
                    <dd className="shrink-0 text-[11.5px] font-medium text-ink tnum">
                      {formatTokens(source.tokens)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {unpricedCount > 0 ? (
            <p className="mt-2 text-[10.5px] text-faint">
              {unpricedCount === 1 ? "One model has" : `${unpricedCount} models have`} no public price, so the
              cost total is a lower bound.
            </p>
          ) : null}
          <ModelBreakdown period={period} mode={mode} total={total} />
        </>
      )}
    </section>
  );
}
