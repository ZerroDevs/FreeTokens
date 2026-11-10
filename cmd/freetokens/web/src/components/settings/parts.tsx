import type { ReactNode } from "react";

/** One settings block: a heading with its controls in a card underneath. */
export function SettingsSection({
  id,
  title,
  hint,
  first,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  /** Kept for callers that used to sit flush under the header; spacing is uniform now. */
  first?: boolean;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={first ? "mt-3" : "mt-4"}>
      <h2 id={`${id}-heading`} className="px-1 text-[13.5px] font-semibold text-ink">
        {title}
      </h2>
      {hint ? <p className="mt-0.5 px-1 text-[10.5px] leading-snug text-faint">{hint}</p> : null}
      {children}
    </section>
  );
}

/** The rounded group every settings row lives in. Rows inside it are separated by a hairline. */
export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 divide-y divide-line/60 overflow-hidden rounded-[12px] bg-panel">{children}</div>
  );
}

/** A card row: a name and optional note on the left, its control on the right. */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-[12.5px] text-ink">
            {label}
          </label>
        ) : (
          <span className="block text-[12.5px] text-ink">{label}</span>
        )}
        {hint ? <span className="mt-0.5 block text-[10.5px] leading-snug text-faint">{hint}</span> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** The switch every boolean setting in this panel uses. */
export function SettingsSwitch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
        checked ? "bg-brand" : "bg-track"
      }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-shell shadow-sm transition-[left] motion-reduce:transition-none ${
          checked ? "left-[19px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

/** A native select, which is what the settings screen this follows uses for short option lists. */
export function SettingsSelect<T extends string | number>({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={String(value)}
      disabled={disabled}
      onChange={(event) => {
        const next = options.find((option) => String(option.value) === event.target.value);
        if (next) onChange(next.value);
      }}
      className="h-[26px] max-w-[150px] rounded-[6px] border border-line bg-raised px-1.5 text-[11.5px] text-ink disabled:opacity-60"
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Pick-one-of-N buttons, for settings whose options are too wide to read in a select. */
export function ChoiceGrid<T extends string | number>({
  label,
  options,
  value,
  columns,
  disabled,
  textClass = "text-[10.5px]",
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  columns: number;
  disabled: boolean;
  textClass?: string;
  onSelect: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="mt-2 grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`h-[30px] rounded-[8px] ${textClass} font-medium transition-colors ${
              active
                ? "bg-brand/20 text-ink ring-1 ring-brand"
                : "bg-raised text-muted hover:text-ink disabled:hover:text-muted"
            } disabled:opacity-60`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
