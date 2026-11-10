import { useState } from "react";
import { formatAgo } from "../../lib/format";
import type { SourceHealth as Source } from "../../lib/types";
import { ChevronDownIcon } from "../Icons";
import { SettingsCard, SettingsSection } from "./parts";

const SOURCE_TINT: Record<string, string> = {
  ok: "bg-brand",
  partial: "bg-warn",
  cached: "bg-warn",
  error: "bg-danger",
  missing: "bg-track",
  "signed-out": "bg-track",
};

function coverage(source: Source): string {
  if (source.files > 0) return `${source.files} file${source.files === 1 ? "" : "s"}`;
  // A hosted reader owns no files, so "none found" would read as a failure when it is signed in.
  if (source.state === "signed-out") return "signed out";
  if (source.state === "ok" || source.state === "cached") return "signed in";
  return "none found";
}

function SourceRow({ source }: { source: Source }) {
  return (
    <li className="flex items-start gap-2 text-[10.5px]">
      <span
        aria-hidden="true"
        className={`mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full ${
          SOURCE_TINT[source.state] ?? "bg-track"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-muted">{source.name}</span>
          <span className="shrink-0 text-faint tnum">{coverage(source)}</span>
        </span>
        {source.detail ? (
          <span className="mt-0.5 block text-faint" title={source.detail}>
            {source.detail}
          </span>
        ) : null}
        {source.lastReadAt ? (
          <span className="mt-0.5 block text-[10px] text-faint">
            Last read {formatAgo(source.lastReadAt, Date.now())}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * One reader at a time: the list is long enough to push everything below it off the screen, and the
 * first row is the one a signed-in install answers with. The chevron opens the rest.
 */
export function SourceHealthSection({ sources }: { sources?: Source[] }) {
  const [open, setOpen] = useState(false);
  const list = sources ?? [];
  const shown = open ? list : list.slice(0, 1);

  return (
    <SettingsSection
      id="sources"
      title="Usage Sources"
      hint="What each reader found on the last refresh, so a missing total has an address."
    >
      <SettingsCard>
        {list.length > 0 ? (
          <>
            <ul className="space-y-2 px-3 py-2.5">
              {shown.map((source) => (
                <SourceRow key={source.name} source={source} />
              ))}
            </ul>
            {list.length > 1 ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={open ? "Hide other usage sources" : `Show all ${list.length} usage sources`}
                onClick={() => setOpen(!open)}
                className="flex h-8 w-full items-center justify-center gap-1 text-[10.5px] font-medium text-faint transition-colors hover:text-muted"
              >
                {open ? "Hide sources" : `Show all ${list.length} sources`}
                <ChevronDownIcon className={`h-3.5 w-3.5 ${open ? "rotate-180" : ""}`} />
              </button>
            ) : null}
          </>
        ) : (
          <p className="px-3 py-2.5 text-[10.5px] text-faint">Sources appear after the first refresh.</p>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
