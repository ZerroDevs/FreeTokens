import { formatTokens, formatUsd } from "../lib/format";
import type { Snapshot, ValueMode } from "../lib/types";
import { DailyHours } from "./DailyHours";
import { HistoryStrip, Movers, PeriodComparison } from "./History";
import { ChevronDownIcon } from "./Icons";
import { PeriodTabs, tabLabel } from "./PeriodTabs";
import { UsageSection } from "./UsageSection";
import { WeekHeatmap } from "./WeekHeatmap";

// The raw error says what failed; these say what to do about it.
const QUOTA_HINTS: Record<string, string> = {
  "signed-out": "Sign in to the Freebuff desktop app, then refresh.",
  expired: "The Freebuff sign-in expired. Sign in again in the desktop app, then refresh.",
  approval: "The system blocked the saved sign-in. Allow access, then refresh.",
  network: "Freebuff could not be reached. Check your connection, then refresh.",
};

export function UsageView({
  snapshot,
  now,
  sessions,
  showTimers,
  showHistory,
  showProjects,
  budgetUsd,
  mode,
  onMode,
  selection,
  onSelect,
  expanded,
  onExpanded,
}: {
  snapshot: Snapshot;
  now: number;
  /** Live countdowns the hours card draws, with the clock time each session ends. */
  sessions: { left: string; ends: string }[];
  showTimers: boolean;
  showHistory: boolean;
  showProjects: boolean;
  budgetUsd: number;
  mode: ValueMode;
  onMode: (mode: ValueMode) => void;
  /** The panel owns these, so they survive a trip into settings. */
  selection: number;
  onSelect: (index: number) => void;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
}) {
  const periods = snapshot.periods ?? [];
  const safeSelection = periods.length === 0 ? 0 : Math.min(selection, periods.length - 1);
  const period = periods[safeSelection];
  // The budget measures the rolling 30 days, not the selected tab, so it reads that period.
  const monthly = periods.find((item) => item.label === "Last 30 Days");

  return (
    <main className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-2">
      {snapshot.quota ? (
        <DailyHours quota={snapshot.quota} now={now} sessions={showTimers ? sessions : []} />
      ) : (
        // Hours are a hosted figure. Without a readable Freebuff login the section would vanish
        // and the panel would look like it lost a feature instead of a login.
        <section aria-labelledby="hours-heading" className="rounded-[12px] bg-panel px-3.5 py-3">
          <h2 id="hours-heading" className="text-[12px] font-medium text-muted">
            Daily Hours
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-ink">Hours unavailable</p>
          <p className="mt-1 text-[10.5px] leading-snug text-faint">
            {snapshot.quotaError || "Freebuff returned no usage session."}
          </p>
          {snapshot.quotaErrorCode && QUOTA_HINTS[snapshot.quotaErrorCode] ? (
            <p className="mt-1 text-[10.5px] leading-snug text-muted">
              {QUOTA_HINTS[snapshot.quotaErrorCode]}
            </p>
          ) : null}
        </section>
      )}

      {periods.length === 0 ? (
        <div className="mt-3 rounded-[12px] border border-dashed border-line px-4 py-7 text-center">
          <p className="text-[12px] font-medium text-muted">No token history yet</p>
          <p className="mt-1 text-[11px] leading-snug text-faint">
            FreeTokens reads measured Freebuff, Antigravity, Claude, Codex and OpenCode runs on this
            computer. Run a turn, then refresh.
          </p>
        </div>
      ) : expanded ? (
        <>
          <div className="mt-3">
            <PeriodTabs periods={periods} selected={safeSelection} onSelect={onSelect} />
          </div>
          {period ? (
            <UsageSection
              period={period}
              selected={safeSelection}
              mode={mode}
              onMode={onMode}
              budgetUsd={budgetUsd}
              monthlyCost={monthly?.costUsd}
              monthlyCostLowerBound={monthly?.costLowerBound ?? false}
              showProjects={showProjects}
              // The strip and the comparison stay opt-in, and they sit under the mix when enabled.
              history={
                showHistory ? (
                  <>
                    <HistoryStrip days={snapshot.days ?? []} mode={mode} now={now} />
                    <PeriodComparison
                      label={period.label}
                      days={snapshot.days ?? []}
                      now={now}
                      mode={mode}
                    />
                  </>
                ) : null
              }
            />
          ) : null}
          {period ? (
            <Movers label={period.label} days={snapshot.days ?? []} now={now} mode={mode} />
          ) : null}
          {/* The by-hour grid is a history view too, so it answers to the same switch as the
              strip and the comparison: off by default, all three appear together. */}
          {showHistory && snapshot.slots ? <WeekHeatmap slots={snapshot.slots} mode={mode} /> : null}
          <button
            type="button"
            aria-expanded={true}
            onClick={() => onExpanded(false)}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1 text-[10.5px] font-medium text-faint transition-colors hover:text-muted"
          >
            Show compact list
            <ChevronDownIcon className="h-3.5 w-3.5 rotate-180" />
          </button>
        </>
      ) : (
        <>
          <div className="mt-3 divide-y divide-line/60 overflow-hidden rounded-[12px] bg-panel">
            {periods.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={index === safeSelection}
                aria-label={`Show ${item.label} model breakdown`}
                onClick={() => {
                  onSelect(index);
                  onExpanded(true);
                }}
                className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-raised ${
                  index === safeSelection ? "bg-raised/60" : ""
                }`}
              >
                <span className="text-[12.5px] text-muted">{tabLabel(item.label)}</span>
                <span className="min-w-0 truncate text-right text-[12.5px] font-medium text-ink tnum">
                  {item.hasData ? (
                    <>
                      {item.costUsd != null ? formatUsd(item.costUsd, item.costLowerBound) : "unpriced"}
                      <span className="px-1 text-faint">·</span>
                      {formatTokens(item.tokens)} tokens
                    </>
                  ) : (
                    <span className="text-faint">no usage</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={false}
            onClick={() => onExpanded(true)}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1 text-[10.5px] font-medium text-faint transition-colors hover:text-muted"
          >
            Show full view
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </main>
  );
}
