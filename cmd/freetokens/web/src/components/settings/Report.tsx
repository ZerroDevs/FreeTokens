import { useState } from "react";
import { bridge, copyText } from "../../lib/api";
import { toCsv } from "../../lib/days";
import type { Day } from "../../lib/types";
import { useFeedback } from "./feedback";
import { SettingsSection } from "./parts";

const BUTTON =
  "h-[30px] rounded-[8px] bg-panel px-2.5 text-[10.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60";

export function Report({
  demo,
  days,
}: {
  demo: boolean;
  /** Retained daily rollups, so the CSV copy works without the engine (browser preview). */
  days?: Day[];
}) {
  const { run } = useFeedback();
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const copyStatus = () => {
    const api = bridge;
    if (!api) return;
    setCopying(true);
    void run(async () => {
      try {
        await copyText(await api.StatusText());
        return "Status copied to the clipboard.";
      } finally {
        setCopying(false);
      }
    });
  };

  const exportCsv = () => {
    setExporting(true);
    void run(async () => {
      try {
        await copyText(bridge ? await bridge.ExportCSV() : toCsv(days ?? []));
        return "Daily usage copied as CSV.";
      } finally {
        setExporting(false);
      }
    });
  };

  return (
    <SettingsSection
      id="report"
      title="Report"
      hint="Copies the same text `freetokens status` prints, for a bug report."
    >
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={demo || copying} onClick={copyStatus} className={BUTTON}>
          {copying ? "Copying…" : "Copy status"}
        </button>
        <button type="button" disabled={exporting} onClick={exportCsv} className={BUTTON}>
          {exporting ? "Copying…" : "Copy daily CSV"}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-faint">
        The CSV is one row per local day with tokens, estimated cost and whether either was complete.{" "}
        <code>freetokens export --csv</code> prints the same rows.
      </p>
    </SettingsSection>
  );
}
