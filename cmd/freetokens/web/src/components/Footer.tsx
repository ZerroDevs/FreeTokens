import { formatAgo } from "../lib/format";
import type { Snapshot } from "../lib/types";
import { GearIcon, RefreshIcon } from "./Icons";

type Props = {
  snapshot: Snapshot;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  onSettings: () => void;
  // Shown on hover: the brand line is the app, not the version.
  version?: string;
};

/**
 * The bottom bar: what the panel is and when it last read, with the two actions the popover needs
 * on every screen — refresh and settings.
 */
export function Footer({ snapshot, now, refreshing, onRefresh, onSettings, version }: Props) {
  const partial = (snapshot.periods ?? []).some((period) => period.hasData && period.partial);

  return (
    <footer className="shrink-0 border-t border-line/70 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0" title={version ? `FreeTokens ${version}` : undefined}>
          <p className="truncate text-[12.5px] font-semibold text-ink">FreeTokens</p>
          <p className="truncate text-[10.5px] text-faint">Updated {formatAgo(snapshot.refreshedAt, now)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={refreshing ? "Refreshing usage" : "Refresh usage"}
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={onRefresh}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-raised hover:text-ink disabled:text-faint"
          >
            <RefreshIcon className={`h-[17px] w-[17px] ${refreshing ? "motion-safe:animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={onSettings}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <GearIcon className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>
      {partial ? (
        <p className="mt-1 text-[10.5px] leading-snug text-warn">
          Some runs are missing token counts, so totals are lower bounds.
        </p>
      ) : null}
    </footer>
  );
}
