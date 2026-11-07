import { modelColor } from "../lib/colors";
import { formatTokens, formatUsd, percent, share } from "../lib/format";
import type { Period, ValueMode } from "../lib/types";

type Props = {
  period: Period;
  mode: ValueMode;
  total: number;
};

export function ModelBreakdown({ period, mode, total }: Props) {
  const byTokens = [...(period.models ?? [])].sort((a, b) => b.tokens - a.tokens);
  const colors = new Map(byTokens.map((model, index) => [model.name, modelColor(index)]));
  const models = [...byTokens].sort((a, b) => {
    if (mode === "tokens") return b.tokens - a.tokens;
    return (b.costUsd ?? -1) - (a.costUsd ?? -1);
  });

  if (models.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-medium text-muted">Breakdown</h3>
        <span className="text-[10.5px] text-faint">share of {mode === "tokens" ? "tokens" : "cost"}</span>
      </div>
      <ul className="mt-2 divide-y divide-line/60">
        {models.map((model) => {
          const value = mode === "tokens" ? model.tokens : (model.costUsd ?? 0);
          const costLabel =
            model.costUsd != null ? formatUsd(model.costUsd, !model.costComplete) : "unpriced";
          const primary = mode === "tokens" ? formatTokens(model.tokens) : costLabel;
          const secondary = mode === "tokens" ? costLabel : `${formatTokens(model.tokens)} tokens`;
          return (
            <li key={model.name} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[12.5px] font-medium text-ink" title={model.name}>
                  {model.name}
                </p>
                <p className="shrink-0 text-[12.5px] font-semibold text-ink tnum">{primary}</p>
              </div>
              <div className="mt-[3px] flex items-baseline justify-between gap-3 text-[10.5px] text-faint tnum">
                <span>{percent(value, total)}</span>
                <span className="truncate">{secondary}</span>
              </div>
              <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${value > 0 ? Math.max(1, share(value, total) * 100) : 0}%`,
                    backgroundColor: colors.get(model.name) ?? "var(--color-slate)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {period.unknownModels && period.unknownModels.length > 0 ? (
        <p className="mt-2 text-[10.5px] leading-snug text-faint">
          Unrecognized models: {period.unknownModels.join(", ")}. Their usage is counted but not priced.
        </p>
      ) : null}
    </div>
  );
}
