import { useState } from "react";
import { bridge, copyText } from "../../lib/api";
import { toCsv } from "../../lib/days";
import type { Day } from "../../lib/types";
import { useFeedback } from "./feedback";
import { SettingsBand } from "./parts";

const BUTTON =
  "h-[28px] rounded-[7px] bg-raised px-2.5 text-[10.5px] font-medium text-ink transition-colors hover:bg-raised-hover disabled:opacity-60";

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
    <>
      <SettingsBand>Report</SettingsBand>
      <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
        <button type="button" disabled={demo || copying} onClick={copyStatus} className={BUTTON}>
          {copying ? "Copying…" : "Copy status"}
        </button>
        <button type="button" disabled={exporting} onClick={exportCsv} className={BUTTON}>
          {exporting ? "Copying…" : "Copy daily CSV"}
        </button>
      </div>
      <p className="px-3 pb-2.5 text-[10px] leading-snug text-faint">
        Copy status is what <code>freetokens status</code> prints. The CSV is one row per local day
        with tokens, estimated cost and whether either was complete, like{" "}
        <code>freetokens export --csv</code>.
      </p>
    </>
  );
}
