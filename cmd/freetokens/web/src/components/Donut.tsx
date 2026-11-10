export type DonutSlice = { name: string; value: number; color: string };

type Props = {
  slices: DonutSlice[];
  total: number;
  centerValue: string;
  centerLabel: string;
  /** Slice the legend is pointing at; it lifts off the ring so one share is easy to follow. */
  active?: string | null;
  /** Shown in the hole instead of the total while a slice is active. */
  activeValue?: string | null;
  activeLabel?: string | null;
  /** Hovering a slice points the legend at it, so the ring and the list read as one control. */
  onHover?: (name: string | null) => void;
  /** Makes the hole a button: the mix switches between the total and the budget remaining. */
  onHoleClick?: () => void;
  /** Accessible name and tooltip for the hole button. */
  holeHint?: string;
};

const SIZE = 148;
const CENTER = SIZE / 2;
const OUTER = 69;
const INNER = 48;
const GROW = 1.05;
// Half the dark seam between neighbours, in degrees. Equal angles keep every seam the same width,
// which stroked dashes could not: their butt caps meet at radial edges and drift with rounding.
const SEAM = 1.1;
const MIN_SPAN = 0.5;
const HOLE = INNER * 2 - 8;

const point = (radius: number, degrees: number) => {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
};

function sectorPath(start: number, end: number): string {
  const mid = (start + end) / 2;
  const half = Math.max((end - start) / 2 - SEAM, MIN_SPAN / 2);
  const from = mid - half;
  const to = mid + half;
  const large = to - from > 180 ? 1 : 0;
  const [ix0, iy0] = point(INNER, from);
  const [ox0, oy0] = point(OUTER, from);
  const [ox1, oy1] = point(OUTER, to);
  const [ix1, iy1] = point(INNER, to);
  return [
    `M${ix0} ${iy0}`,
    `L${ox0} ${oy0}`,
    `A${OUTER} ${OUTER} 0 ${large} 1 ${ox1} ${oy1}`,
    `L${ix1} ${iy1}`,
    `A${INNER} ${INNER} 0 ${large} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
}

export function Donut({
  slices,
  total,
  centerValue,
  centerLabel,
  active = null,
  activeValue = null,
  activeLabel = null,
  onHover,
  onHoleClick,
  holeHint,
}: Props) {
  const visible = slices.filter((slice) => slice.value > 0 && Number.isFinite(slice.value));
  let cursor = 0;

  // Budget money reaches "$1,234.56", which a fixed 20px clips to "$244...." inside the ring.
  const value = activeValue ?? centerValue;
  const valueSize = value.length > 8 ? "text-[13px]" : value.length > 6 ? "text-[16px]" : "text-[20px]";
  const width = onHoleClick ? "max-w-[74px]" : "max-w-[92px]";

  const text = (
    <>
      <span className={`truncate leading-none font-semibold tracking-[-0.02em] text-ink tnum ${valueSize} ${width}`}>
        {value}
      </span>
      <span className={`mt-1 truncate text-[10px] text-faint ${width}`}>{activeLabel ?? centerLabel}</span>
    </>
  );

  return (
    <div className="relative grid h-[148px] w-[148px] shrink-0 place-items-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        focusable="false"
      >
        <circle cx={CENTER} cy={CENTER} r={(OUTER + INNER) / 2} fill="none" stroke="var(--color-track)" strokeWidth={OUTER - INNER} />
        {visible.map((slice) => {
          const start = cursor;
          cursor += total > 0 ? (slice.value / total) * 360 : 0;
          const focused = active !== null && slice.name === active;
          return (
            <path
              key={slice.name}
              d={sectorPath(start, cursor)}
              fill={slice.color}
              pointerEvents={onHover ? "auto" : "none"}
              onPointerEnter={() => onHover?.(slice.name)}
              style={{ transformOrigin: `${CENTER}px ${CENTER}px`, transform: focused ? `scale(${GROW})` : "scale(1)" }}
              className="transition-transform duration-150 motion-reduce:transition-none"
            />
          );
        })}
      </svg>
      {onHoleClick ? (
        <button
          type="button"
          onClick={onHoleClick}
          aria-label={holeHint ?? centerLabel}
          title={holeHint}
          className="absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-colors hover:bg-shell/70"
          style={{ width: HOLE, height: HOLE }}
        >
          <span className="flex flex-col items-center justify-center">{text}</span>
        </button>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {text}
        </div>
      )}
    </div>
  );
}
