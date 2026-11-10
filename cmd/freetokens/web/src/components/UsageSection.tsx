import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { copyText } from "../lib/api";
import { OTHER_COLOR } from "../lib/colors";
import { formatMoney, formatTokens, formatUsd, formatUsdCompact, percent, share } from "../lib/format";
import {
  buildRows,
  cacheHitRate,
  canGroupByProject,
  canGroupByProvider,
  rowValue,
  type Grouping,
  type UsageRow,
} from "../lib/rows";
import type { Kinds, Period, ValueMode } from "../lib/types";
import { CheckIcon, ChevronDownIcon, CopyIcon, InfoIcon } from "./Icons";
import { Donut, type DonutSlice } from "./Donut";
import { ModelBreakdown } from "./ModelBreakdown";

type Props = {
  period: Period;
  selected: number;
  mode: ValueMode;
  onMode: (mode: ValueMode) => void;
  /** Monthly spending ceiling; 0 hides the budget line. */
  budgetUsd?: number;
  /** The rolling 30-day estimate, which is what the budget is measured against. */
  monthlyCost?: number;
  monthlyCostLowerBound?: boolean;
  /** Reveals the project grouping, which only some readers can populate. */
  showProjects?: boolean;
  /** The opt-in history views, drawn directly under the mix so they read as its continuation. */
  history?: ReactNode;
};

type LegendRow = UsageRow & { value: number };

// Eight rows is what the ring has colors for; anything past that folds into one row.
const DONUT_SLICES = 8;
const COPY_FEEDBACK_MS = 1600;

const MIX_NOTE =
  "Shares use measured tokens. Cost mode multiplies them by published API rates, so a model with no public price counts as zero and the total is a lower bound. Tool groups by the model that ran; Provider groups by who published it; Project groups by the workspace a run recorded.";

// The kinds a reader can report, in reading order: the cache usually dominates, so it comes first.
const KIND_ROWS: { name: string; color: string; pick: (kinds: Kinds) => number }[] = [
  { name: "Cache read", color: "var(--color-model-3)", pick: (kinds) => kinds.cacheRead },
  { name: "Input", color: "var(--color-model-1)", pick: (kinds) => kinds.input },
  { name: "Output", color: "var(--color-model-2)", pick: (kinds) => kinds.output },
  { name: "Cache write", color: "var(--color-model-4)", pick: (kinds) => kinds.cacheWrite },
];

function rowText(row: LegendRow, mode: ValueMode): string {
  if (mode === "tokens") return formatTokens(row.value);
  return formatUsd(row.value, row.costUsd != null && !row.costComplete);
}

// What the row is, in one line: how much of the total, what it measured, and which tools ran it.
function rowDetail(row: LegendRow, mode: ValueMode, total: number, withName = false): string {
  const parts = [
    ...(withName ? [row.name] : []),
    `${percent(row.value, total)} of ${mode === "tokens" ? "tokens" : "estimated cost"}`,
  ];
  if (mode === "cost") parts.push(`${formatTokens(row.tokens)} tokens`);
  parts.push(
    row.costUsd == null
      ? "no public price"
      : formatUsd(mode === "cost" ? row.value : row.costUsd, !row.costComplete),
  );
  if (row.tools?.length) parts.push(row.tools.join(", "));
  return parts.join(" · ");
}

export function UsageSection({
  period,
  selected,
  mode,
  onMode,
  budgetUsd = 0,
  monthlyCost,
  monthlyCostLowerBound = false,
  showProjects = false,
  history = null,
}: Props) {
  const [grouping, setGrouping] = useState<Grouping>("tool");
  // Splits the ring into token kinds instead of models. Costs are rates per token kind, not
  // reported by any source, so this view only exists in token mode.
  const [split, setSplit] = useState<"mix" | "kinds">("mix");
  // The hole alternates between the period total and what the rolling 30 days have left in budget.
  const [hole, setHole] = useState<"total" | "budget">("total");
  // The mix is the tallest block in the panel; folding it leaves the tabs and strip visible.
  const [open, setOpen] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The menu opens upward when the section header sits near the footer, so no option is cut off.
  const [optionsUp, setOptionsUp] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const optionsRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const noteTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const models = period.models ?? [];
  const groupable = canGroupByProvider(period) && models.length > 1;
  const projectable = showProjects && canGroupByProject(period) && models.length > 1;
  const activeGrouping: Grouping =
    (grouping === "provider" && groupable) || (grouping === "project" && projectable) ? grouping : "tool";
  const rows = buildRows(period, activeGrouping);

  const total =
    mode === "tokens" ? period.tokens : (period.costUsd ?? models.reduce((sum, m) => sum + (m.costUsd ?? 0), 0));

  const sources = period.sources ?? [];
  const legendRows: LegendRow[] = rows
    .map((row) => ({ ...row, value: rowValue(row, mode) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const totalRows = legendRows.length;
  const empty = total <= 0 || totalRows === 0;

  const restLabel =
    activeGrouping === "provider" ? "More providers" : activeGrouping === "project" ? "More projects" : "Other models";
  let slices: DonutSlice[] = legendRows.map((row) => ({ name: row.name, value: row.value, color: row.color }));
  let legend: LegendRow[] = legendRows;
  if (legendRows.length > DONUT_SLICES) {
    const restRows = legendRows.slice(DONUT_SLICES);
    const rest = restRows.reduce((sum, row) => sum + row.value, 0);
    slices = [...slices.slice(0, DONUT_SLICES), { name: restLabel, value: rest, color: OTHER_COLOR }];
    legend = [
      ...legendRows.slice(0, DONUT_SLICES),
      {
        ...restRows[0],
        name: restLabel,
        value: rest,
        color: OTHER_COLOR,
        costUsd: restRows.some((row) => row.costUsd != null) ? restRows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : undefined,
        costComplete: restRows.every((row) => row.costComplete),
        tools: undefined,
      },
    ];
  }

  // Token kinds come from the rows that reported them; a period where no reader did has no view.
  const kinds = period.kinds;
  const kindsView = split === "kinds" && mode === "tokens" && kinds != null;
  const kindRows: LegendRow[] = kinds
    ? KIND_ROWS.map((kind) => {
        const tokens = kind.pick(kinds);
        return { name: kind.name, tokens, value: tokens, costComplete: true, color: kind.color };
      }).filter((row) => row.value > 0)
    : [];
  const viewSlices: DonutSlice[] = kindsView
    ? kindRows.map((row) => ({ name: row.name, value: row.value, color: row.color }))
    : slices;
  const viewLegend = kindsView ? kindRows : legend;
  const viewTotal = kindsView ? kindRows.reduce((sum, row) => sum + row.value, 0) : total;
  const cacheHit = cacheHitRate(kinds);

  // The budget is the rolling 30-day estimate against the configured ceiling, which is the shape a
  // usage watcher is asked for; a calendar month would need another scan and another tab.
  const budget = budgetUsd > 0 ? budgetUsd : 0;
  const budgetOn = budget > 0 && monthlyCost != null;
  const budgetOver = budgetOn && (monthlyCost ?? 0) > budget;
  const budgetRemaining = budgetOn ? Math.max(0, budget - (monthlyCost ?? 0)) : 0;
  const onBudgetHole = budgetOn && hole === "budget";

  // Compact money keeps a large total inside the ring; small totals keep exact cents.
  const centerValue =
    mode === "tokens" ? formatTokens(viewTotal) : formatUsdCompact(viewTotal, period.costLowerBound);
  const centerLabel = mode === "tokens" ? "tokens" : "dollars";
  const activeRow = viewLegend.find((row) => row.name === active) ?? null;
  // On hover the hole keeps the measured figure in front and names the share underneath, so the
  // ring never turns into a percentage-only chart.
  const activeValue = activeRow
    ? mode === "tokens"
      ? formatTokens(activeRow.value)
      : formatUsdCompact(activeRow.value, activeRow.costUsd != null && !activeRow.costComplete)
    : null;
  const activeLabel = activeRow
    ? `${percent(activeRow.value, viewTotal)} of ${mode === "tokens" ? "tokens" : "cost"}`
    : null;
  const unpricedCount = mode === "cost" ? models.filter((model) => model.costUsd == null).length : 0;
  // Names no provider rule recognized: the fastest way to see which keyword is missing.
  const unmatchedVendors =
    activeGrouping === "provider"
      ? models
          .filter((model) => model.provider === "Other")
          .sort((a, b) => b.tokens - a.tokens)
          .map((model) => model.name)
      : [];
  const mixName = kindsView
    ? "Token kinds"
    : activeGrouping === "provider"
      ? "Provider mix"
      : activeGrouping === "project"
        ? "Project mix"
        : mode === "cost"
          ? "Estimated Cost"
          : "Estimated Tokens";
  const unitName = kindsView ? "kinds" : activeGrouping === "provider" ? "providers" : activeGrouping === "project" ? "projects" : "models";
  const totalDetail = [
    period.label,
    `${viewLegend.length} ${unitName}`,
    mode === "tokens" ? `${formatTokens(viewTotal)} tokens` : formatUsd(viewTotal, period.costLowerBound),
  ].join(" · ");
  // Budget remaining is a money figure even in token mode, so the hole says what it is.
  const shownValue = onBudgetHole && activeRow === null ? (budgetOver ? formatMoney((monthlyCost ?? 0) - budget) : formatUsdCompact(budgetRemaining)) : centerValue;
  const shownLabel = onBudgetHole && activeRow === null ? (budgetOver ? "over budget" : `of ${formatMoney(budget)}`) : centerLabel;
  // The figure under the ring repeats the unit the hole is not showing, so both totals stay on the
  // card the way the app shows them.
  const totalCaption =
    mode === "cost"
      ? `${formatTokens(period.tokens)} tokens`
      : period.costUsd != null
        ? `${formatUsd(period.costUsd, period.costLowerBound)} est. cost`
        : null;

  // The menu and the note are both small popovers; either one closes on a click away or Escape.
  useEffect(() => {
    if (!optionsOpen && !noteOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (optionsOpen && !optionsRef.current?.contains(target)) setOptionsOpen(false);
      // The note text is separate from its button, and reading or selecting it must not close it.
      if (noteOpen && !noteRef.current?.contains(target) && !noteTextRef.current?.contains(target)) {
        setNoteOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOptionsOpen(false);
      setNoteOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [optionsOpen, noteOpen]);

  // A highlighted row from the old data would point at a name the new grouping may not have.
  useEffect(() => setActive(null), [period.label, mode, activeGrouping, split]);

  // Cost mode has no per-kind rates, so the kinds view cannot stay open when the mode changes.
  useEffect(() => {
    if (split === "kinds" && (mode === "cost" || !period.kinds)) setSplit("mix");
  }, [split, mode, period.kinds]);

  // The budget figure belongs to the rolling 30 days, so switching period keeps the hole on it.
  useEffect(() => {
    if (!budgetOn) setHole("total");
  }, [budgetOn]);

  const copyMix = useCallback(async () => {
    const header = `FreeTokens · ${period.label} · ${mixName.toLowerCase()} · ${
      mode === "tokens" ? "tokens" : "estimated cost"
    }`;
    const lines = viewLegend.map((row) => `${row.name}: ${rowText(row, mode)} (${percent(row.value, viewTotal)})`);
    try {
      await copyText([header, ...lines].join("\n"));
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // The clipboard refused; leaving the button unchanged is better than a false success.
    }
  }, [viewLegend, mixName, mode, period.label, viewTotal]);

  return (
    <section id="usage-panel" role="tabpanel" aria-labelledby={`period-tab-${selected}`} className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="min-w-0 truncate text-[12px] font-medium text-muted">{mixName}</h2>
          {empty ? null : (
            <div ref={optionsRef} className="relative shrink-0">
              <button
                type="button"
                aria-expanded={optionsOpen}
                aria-haspopup="true"
                aria-label={`Show as ${mode === "tokens" ? "tokens" : "cost"}. Change values or grouping`}
                title="Values and grouping"
                onClick={() => {
                  const box = optionsRef.current?.getBoundingClientRect();
                  if (box) setOptionsUp(window.innerHeight - box.bottom < 240);
                  setOptionsOpen((value) => !value);
                }}
                className={`flex h-[22px] items-center gap-0.5 rounded-[6px] pr-1 pl-1.5 text-[11.5px] font-medium transition-colors ${
                  optionsOpen ? "bg-raised text-ink" : "text-ink hover:bg-raised"
                }`}
              >
                {mode === "tokens" ? "Tokens" : "Cost"}
                <ChevronDownIcon
                  className={`h-3 w-3 text-faint transition-transform motion-reduce:transition-none ${
                    optionsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {optionsOpen ? (
                <div
                  role="group"
                  aria-label="Values and grouping"
                  className={`absolute left-0 z-30 w-[184px] rounded-[10px] border border-line bg-raised p-1.5 shadow-popover ${
                    optionsUp ? "bottom-full mb-1" : "top-full mt-1"
                  }`}
                >
                  <p className="px-1 pb-1 text-[10px] font-medium text-faint">Values</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(["tokens", "cost"] as const).map((option) => {
                      const activeOption = mode === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={activeOption}
                          onClick={() => {
                            onMode(option);
                            setOptionsOpen(false);
                          }}
                          className={`h-[24px] rounded-[6px] text-[11px] font-medium transition-colors ${
                            activeOption ? "bg-panel text-ink" : "text-muted hover:bg-panel hover:text-ink"
                          }`}
                        >
                          {option === "tokens" ? "Tokens" : "Cost"}
                        </button>
                      );
                    })}
                  </div>
                  {groupable || projectable ? (
                    <>
                      <div className="my-1.5 h-px bg-line/70" />
                      <p className="px-1 pb-1 text-[10px] font-medium text-faint">Group by</p>
                      <div className={`grid gap-1 ${projectable ? "grid-cols-3" : "grid-cols-2"}`}>
                        {(projectable ? (["tool", "provider", "project"] as const) : (["tool", "provider"] as const)).map(
                          (option) => {
                            const activeOption = activeGrouping === option;
                            const hint =
                              option === "provider"
                                ? "Group by the model's provider, whichever tool ran it"
                                : option === "project"
                                  ? "Group by the workspace a run recorded"
                                  : "Group by the model, with the tool that ran it";
                            return (
                              <button
                                key={option}
                                type="button"
                                aria-pressed={activeOption}
                                title={hint}
                                onClick={() => {
                                  setGrouping(option);
                                  setOptionsOpen(false);
                                }}
                                className={`h-[24px] rounded-[6px] text-[11px] font-medium transition-colors ${
                                  activeOption ? "bg-panel text-ink" : "text-muted hover:bg-panel hover:text-ink"
                                }`}
                              >
                                {option === "tool" ? "Tool" : option === "provider" ? "Provider" : "Project"}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </>
                  ) : null}
                  {mode === "tokens" && period.kinds ? (
                    <>
                      <div className="my-1.5 h-px bg-line/70" />
                      <p className="px-1 pb-1 text-[10px] font-medium text-faint">Split</p>
                      <div className="grid grid-cols-2 gap-1">
                        {(["mix", "kinds"] as const).map((option) => {
                          const activeOption = split === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={activeOption}
                              title={
                                option === "kinds"
                                  ? "Split the ring into cache reads, input and output"
                                  : "Split the ring by model"
                              }
                              onClick={() => {
                                setSplit(option);
                                setOptionsOpen(false);
                              }}
                              className={`h-[24px] rounded-[6px] text-[11px] font-medium transition-colors ${
                                activeOption ? "bg-panel text-ink" : "text-muted hover:bg-panel hover:text-ink"
                              }`}
                            >
                              {option === "mix" ? "By model" : "By kind"}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {empty ? null : (
            <div ref={noteRef} className="relative shrink-0">
              <button
                type="button"
                aria-expanded={noteOpen}
                aria-controls="mix-note"
                aria-label={`About the ${mixName.toLowerCase()}`}
                title={`About the ${mixName.toLowerCase()}`}
                onClick={() => setNoteOpen((value) => !value)}
                className={`grid h-[22px] w-[22px] place-items-center rounded-[6px] transition-colors ${
                  noteOpen ? "bg-raised text-ink" : "text-faint hover:bg-raised hover:text-ink"
                }`}
              >
                <InfoIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        {empty ? null : (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => void copyMix()}
              aria-label={copied ? `${mixName} copied` : `Copy ${mixName.toLowerCase()}`}
              title={copied ? "Copied" : `Copy ${mixName.toLowerCase()}`}
              className={`grid h-[24px] w-[24px] place-items-center rounded-[6px] transition-colors hover:bg-raised ${
                copied ? "text-brand" : "text-faint hover:text-ink"
              }`}
            >
              {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="usage-mix-body"
              aria-label={open ? `Hide ${mixName.toLowerCase()} details` : `Show ${mixName.toLowerCase()} details`}
              title={open ? "Hide details" : "Show details"}
              onClick={() => setOpen((value) => !value)}
              className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] text-faint transition-colors hover:bg-raised hover:text-ink"
            >
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
                  open ? "" : "-rotate-90"
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {empty ? null : noteOpen ? (
        <div
          id="mix-note"
          ref={noteTextRef}
          className="mt-1.5 rounded-[8px] bg-panel px-2.5 py-2 text-[10.5px] leading-snug text-muted"
        >
          {MIX_NOTE}
        </div>
      ) : (
        <span id="mix-note" className="sr-only">
          {MIX_NOTE}
        </span>
      )}

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
              : "Run a Freebuff, Antigravity, Claude, Codex or OpenCode turn, then refresh."}
          </p>
        </div>
      ) : (
        <>
          {!open ? (
            <p className="mt-1.5 text-[10.5px] text-faint tnum">
              {mode === "tokens" ? `${formatTokens(viewTotal)} tokens` : formatUsd(viewTotal, period.costLowerBound)} ·{" "}
              {viewLegend.length} {unitName}
            </p>
          ) : null}
          <div id="usage-mix-body" hidden={!open}>
            <div className="mt-2 rounded-[12px] bg-panel px-3 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="group/total relative shrink-0"
                  onPointerLeave={() => setActive(null)}
                >
                  <Donut
                    slices={viewSlices}
                    total={viewTotal}
                    centerValue={shownValue}
                    centerLabel={shownLabel}
                    active={active}
                    activeValue={activeValue}
                    activeLabel={activeLabel}
                    onHover={setActive}
                    onHoleClick={
                      budgetOn ? () => setHole(hole === "budget" ? "total" : "budget") : undefined
                    }
                    holeHint={
                      budgetOn
                        ? hole === "budget"
                          ? "Show this period's usage total"
                          : "Show what is left of the monthly budget"
                        : undefined
                    }
                  />
                  {active === null ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-full left-0 z-30 mt-1 hidden w-[176px] rounded-[8px] border border-line bg-shell px-2.5 py-2 text-[10px] leading-snug text-muted shadow-popover group-hover/total:block"
                    >
                      {totalDetail}
                    </span>
                  ) : null}
                </div>
                <ul className="min-w-0 flex-1 space-y-[5px] pt-0.5">
                  {viewLegend.map((row, index) => {
                    // The tooltip leads with the name, so a truncated legend row still reads in full.
                    const detail = rowDetail(row, mode, viewTotal, true);
                    const rowActive = active === row.name;
                    // Half the rows open downward; the lower half opens upward so the tooltip
                    // never runs past the card.
                    const above = index >= viewLegend.length / 2;
                    return (
                      <li
                        key={row.name}
                        tabIndex={0}
                        onMouseEnter={() => setActive(row.name)}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive(row.name)}
                        onBlur={() => setActive(null)}
                        className={`group/row relative -mx-1 flex min-w-0 cursor-default items-center gap-2 rounded-[4px] px-1 py-[1px] transition-colors ${
                          rowActive ? "bg-shell/60" : ""
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] leading-tight font-semibold text-ink">
                            {row.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-tight text-muted tnum">
                            {rowText(row, mode)}
                          </span>
                        </span>
                        <span className="sr-only">{rowDetail(row, mode, viewTotal)}</span>
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute right-0 z-30 hidden w-[198px] rounded-[8px] border border-line bg-shell px-2.5 py-2 text-[10px] leading-snug text-muted shadow-popover group-hover/row:block group-focus-within/row:block ${
                            above ? "bottom-full mb-1" : "top-full mt-1"
                          }`}
                        >
                          {detail}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {sources.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line/70 pt-2 text-[10px]">
                  <span className="text-faint">By source</span>
                  {sources.map((source) => (
                    <span key={source.name} className="flex items-baseline gap-1 whitespace-nowrap">
                      <span className="text-muted">{source.name}</span>
                      <span className="font-medium text-ink tnum">{formatTokens(source.tokens)}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {totalCaption ? (
              <p className="mt-2.5 text-center text-[11.5px] text-muted tnum">{totalCaption}</p>
            ) : null}
            {history}
            {kindsView && cacheHit != null ? (
              <p className="mt-2 text-[10.5px] leading-snug text-faint">
                Cache hit {percent(cacheHit, 1)} · {formatTokens(kinds?.cacheRead ?? 0)} of{" "}
                {formatTokens((kinds?.cacheRead ?? 0) + (kinds?.input ?? 0))} prompt tokens were served from cache.
              </p>
            ) : null}
            {budget > 0 ? (
              <div className="mt-2 rounded-[10px] bg-panel px-3 py-2">
                <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
                  <button
                    type="button"
                    disabled={!budgetOn}
                    onClick={() => setHole(hole === "budget" ? "total" : "budget")}
                    title={
                      budgetOn
                        ? "Switch the ring between this period and budget remaining"
                        : "No priced 30-day usage yet"
                    }
                    className="font-medium text-muted transition-colors hover:text-ink disabled:hover:text-muted"
                  >
                    Monthly budget
                  </button>
                  {monthlyCost != null ? (
                    <span className="text-faint tnum">
                      {formatUsd(monthlyCost, monthlyCostLowerBound)} of {formatMoney(budget)} ·{" "}
                      <span className={`font-medium ${budgetOver ? "text-warn" : "text-ink"}`}>
                        {percent(monthlyCost, budget)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-faint">no priced usage yet</span>
                  )}
                </div>
                <div
                  role="img"
                  aria-label={
                    monthlyCost != null
                      ? `Monthly budget: ${formatUsd(monthlyCost, monthlyCostLowerBound)} of ${formatMoney(
                          budget,
                        )}, ${percent(monthlyCost, budget)}`
                      : "Monthly budget: no priced usage in the last 30 days"
                  }
                  className="mt-1.5 h-[4px] overflow-hidden rounded-full bg-track"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${share(monthlyCost ?? 0, budget) * 100}%`,
                      backgroundColor: budgetOver ? "var(--color-warn)" : "var(--color-brand)",
                    }}
                  />
                </div>
                {budgetOver ? (
                  <p className="mt-1 text-[10px] leading-snug text-warn">
                    Over by {formatMoney((monthlyCost ?? 0) - budget)} in the last 30 days.
                  </p>
                ) : null}
              </div>
            ) : null}
            {unpricedCount > 0 ? (
              <p className="mt-2 text-[10.5px] text-faint">
                {unpricedCount === 1 ? "One model has" : `${unpricedCount} models have`} no public price, so the cost
                total is a lower bound.
              </p>
            ) : null}
            <ModelBreakdown
              rows={rows}
              grouping={activeGrouping}
              mode={mode}
              total={total}
              showKinds={mode === "tokens" && period.kinds != null}
              periodLabel={period.label}
              unknownModels={period.unknownModels}
              unmatchedVendors={unmatchedVendors}
            />
          </div>
        </>
      )}
    </section>
  );
}
