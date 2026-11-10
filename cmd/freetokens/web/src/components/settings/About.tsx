import { bridge } from "../../lib/api";
import { versionLabel } from "../../lib/format";
import { CoinMark } from "../CoinMark";

const REPO = "https://github.com/tverma101/FreeTokens";
const ISSUES = `${REPO}/issues/new`;

function open(url: string) {
  if (bridge?.OpenLink) {
    void bridge.OpenLink(url).catch(() => {});
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function About({
  version,
  demo,
  onQuit,
}: {
  version?: string;
  demo: boolean;
  onQuit: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[9px] bg-brand text-white">
          <CoinMark className="h-[22px] w-[22px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">
            FreeTokens {versionLabel(version ?? "")}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
            Unofficial. Not affiliated with Freebuff or Codebuff.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => open(REPO)}
            className="text-[11.5px] font-medium text-brand-strong transition-colors hover:underline"
          >
            GitHub
          </button>
          <button
            type="button"
            onClick={() => open(ISSUES)}
            className="text-[11.5px] font-medium text-brand-strong transition-colors hover:underline"
          >
            Report an Issue
          </button>
        </div>
        {demo ? null : (
          <button
            type="button"
            onClick={onQuit}
            className="h-[26px] shrink-0 rounded-[7px] border border-line bg-raised px-2.5 text-[10.5px] font-medium text-danger transition-colors hover:bg-raised-hover"
          >
            Quit FreeTokens
          </button>
        )}
      </div>
    </>
  );
}
