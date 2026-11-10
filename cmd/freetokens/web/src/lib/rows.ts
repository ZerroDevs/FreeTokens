import { OTHER_COLOR, modelColor } from "./colors";
import type { Kinds, ModelRow, Period, ValueMode } from "./types";

export type Grouping = "tool" | "provider" | "project";

export type UsageRow = {
  name: string;
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
  tools?: string[];
  kinds?: Kinds;
  color: string;
};

type RawRow = Omit<UsageRow, "color"> & { colorFrom: string };

// canGroupByProvider reports whether the snapshot carries provider names. Older snapshots have
// none, so the control stays hidden rather than listing everything as Other.
export function canGroupByProvider(period: Period): boolean {
  return (period.models ?? []).some((model) => model.provider);
}

// canGroupByProject reports whether any row recorded a workspace. Only some local readers do, so
// the grouping is opt-in and hidden when it would show one flat "No project" row.
export function canGroupByProject(period: Period): boolean {
  return (period.models ?? []).some((model) => model.project);
}

export function mergeIntoKinds(into: Kinds | undefined, add: Kinds | undefined): Kinds | undefined {
  if (!add) return into;
  if (!into) return { ...add };
  return {
    input: into.input + add.input,
    output: into.output + add.output,
    cacheRead: into.cacheRead + add.cacheRead,
    cacheWrite: into.cacheWrite + add.cacheWrite,
    reasoning: (into.reasoning ?? 0) + (add.reasoning ?? 0),
  };
}

// groupBy sums models that share a key, so a Claude Code session running a DeepSeek model counts
// toward DeepSeek (provider) or toward the workspace that ran it (project).
function groupBy(models: ModelRow[], keyOf: (model: ModelRow) => string): RawRow[] {
  type Bucket = {
    tokens: number;
    cost: number;
    priced: boolean;
    complete: boolean;
    tools: Map<string, number>;
    kinds?: Kinds;
    dominant: string;
    dominantTokens: number;
  };
  const acc = new Map<string, Bucket>();
  for (const model of models) {
    const key = keyOf(model);
    const row: Bucket =
      acc.get(key) ??
      { tokens: 0, cost: 0, priced: false, complete: true, tools: new Map(), dominant: model.name, dominantTokens: -1 };
    row.tokens += model.tokens;
    if (model.costUsd != null) {
      row.cost += model.costUsd;
      row.priced = true;
    }
    row.complete = row.complete && model.costComplete;
    row.kinds = mergeIntoKinds(row.kinds, model.kinds);
    const tool = model.source || "Freebuff";
    row.tools.set(tool, (row.tools.get(tool) ?? 0) + model.tokens);
    if (model.tokens > row.dominantTokens) {
      row.dominant = model.name;
      row.dominantTokens = model.tokens;
    }
    acc.set(key, row);
  }
  return [...acc.entries()].map(([name, row]) => ({
    name,
    tokens: row.tokens,
    costUsd: row.priced ? row.cost : undefined,
    costComplete: row.complete,
    kinds: row.kinds,
    tools: [...row.tools.entries()].sort((a, b) => b[1] - a[1]).map(([tool]) => tool),
    // A group wears the color of its biggest model, so the same identity keeps one color when the
    // panel switches between tool, provider and project grouping.
    colorFrom: row.dominant,
  }));
}

export function buildRows(period: Period, grouping: Grouping): UsageRow[] {
  const models = period.models ?? [];
  const ranked = [...models].sort((a, b) => b.tokens - a.tokens);
  const modelColors = new Map(ranked.map((model, index) => [model.name, modelColor(index)]));

  const raw: RawRow[] =
    grouping === "provider" && canGroupByProvider(period)
      ? groupBy(models, (model) => model.provider || "Other")
      : grouping === "project" && canGroupByProject(period)
        ? groupBy(models, (model) => model.project || "No project")
        : models.map((model) => ({
            name: model.name,
            tokens: model.tokens,
            costUsd: model.costUsd,
            costComplete: model.costComplete,
            kinds: model.kinds,
            colorFrom: model.name,
          }));

  return raw.map(({ colorFrom, ...row }) => ({ ...row, color: modelColors.get(colorFrom) ?? OTHER_COLOR }));
}

export function rowValue(row: UsageRow, mode: ValueMode): number {
  return mode === "tokens" ? row.tokens : (row.costUsd ?? 0);
}

/** Cache reads as a share of all prompt tokens, the figure that explains a cheap high-token row. */
export function cacheHitRate(kinds: Kinds | undefined): number | null {
  if (!kinds) return null;
  const prompt = kinds.cacheRead + kinds.input;
  if (prompt <= 0) return null;
  return kinds.cacheRead / prompt;
}
