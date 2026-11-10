import type { ReactNode } from "react";

/** One settings block: heading, optional hint, content. The first one has no rule above it. */
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
  first?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={first ? "mt-3" : "mt-4 border-t border-line/70 pt-3"}
    >
      <h2 id={`${id}-heading`} className="text-[12px] font-medium text-muted">
        {title}
      </h2>
      {hint ? <p className="mt-0.5 text-[10.5px] leading-snug text-faint">{hint}</p> : null}
      {children}
    </section>
  );
}

/** A section whose whole body is a switch, so the heading itself labels the control. */
export function SwitchSection({
  id,
  title,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-4 border-t border-line/70 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-[12px] font-medium text-muted">
            {title}
          </h2>
          <p className="mt-0.5 text-[10.5px] leading-snug text-faint">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`${id}-heading`}
          disabled={disabled}
          onClick={onToggle}
          className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            checked ? "bg-brand" : "bg-track"
          }`}
        >
          <span
            className={`absolute top-[3px] h-4 w-4 rounded-full bg-shell transition-[left] motion-reduce:transition-none ${
              checked ? "left-[19px]" : "left-[3px]"
            }`}
          />
        </button>
      </div>
    </section>
  );
}

/** Pick-one-of-N buttons, the shape every enumerated setting in this panel uses. */
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
                ? "bg-raised text-ink"
                : "bg-panel text-muted hover:text-ink disabled:hover:text-muted"
            } disabled:opacity-60`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
