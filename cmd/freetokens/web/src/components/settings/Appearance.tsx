import { useEffect, useState } from "react";
import { CUSTOM_FALLBACK, swatchColors, THEME_PRESETS } from "../../lib/themes";
import type { Theme, ThemeColors } from "../../lib/types";
import { useFeedback } from "./feedback";
import { SettingRow, SettingsCard, SettingsSection } from "./parts";

const FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "card", label: "Card" },
  { key: "text", label: "Text" },
];

/** A preset's preview: its background, a card, an accent bar and a line of text. */
function Swatch({ background, card, accent, text }: { background: string; card: string; accent: string; text: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative block h-[34px] w-full overflow-hidden rounded-[7px] border border-edge"
      style={{ backgroundColor: background }}
    >
      <span
        className="absolute inset-x-[3px] top-[3px] bottom-[3px] rounded-[4px]"
        style={{ backgroundColor: card }}
      />
      <span className="absolute top-[8px] left-[8px] h-[3px] w-[16px] rounded-full" style={{ backgroundColor: accent }} />
      <span className="absolute top-[15px] left-[8px] h-[2px] w-[24px] rounded-full" style={{ backgroundColor: text, opacity: 0.7 }} />
      <span className="absolute top-[20px] left-[8px] h-[2px] w-[14px] rounded-full" style={{ backgroundColor: text, opacity: 0.35 }} />
    </span>
  );
}

export function Appearance({
  theme,
  onTheme,
  colors,
  onColors,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => Promise<void>;
  colors: ThemeColors;
  onColors: (colors: ThemeColors) => Promise<void>;
}) {
  const { saving, run } = useFeedback();
  // The four fields are text-editable, so they hold a draft until the edit is finished.
  const [draft, setDraft] = useState<ThemeColors>({ ...CUSTOM_FALLBACK, ...colors });

  useEffect(() => {
    setDraft({ ...CUSTOM_FALLBACK, ...colors });
  }, [colors]);

  const pick = (next: Theme) => {
    if (next === theme || saving) return;
    void run(async () => {
      await onTheme(next);
      return next === "custom"
        ? "Custom theme selected. Pick its colours below."
        : `${THEME_PRESETS.find((preset) => preset.id === next)?.name ?? "Theme"} theme saved.`;
    });
  };

  // A commit is a colour the fields and the picker both agree on, so the whole custom palette
  // moves in one write instead of four.
  const commit = (patch: Partial<ThemeColors>) => {
    if (saving) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    void run(async () => {
      try {
        await onColors(next);
      } catch (error) {
        setDraft({ ...CUSTOM_FALLBACK, ...colors });
        throw error;
      }
      return "Custom colours saved.";
    });
  };

  return (
    <SettingsSection id="appearance" title="Appearance">
      <SettingsCard>
        <div className="px-3 py-2.5">
          <p className="text-[12.5px] text-ink">Theme</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {THEME_PRESETS.map((preset) => {
              const active = preset.id === theme;
              const preview = swatchColors(preset.id, draft);
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${preset.name} theme`}
                  title={preset.note}
                  disabled={saving}
                  onClick={() => pick(preset.id)}
                  className={`rounded-[9px] p-[3px] transition-colors disabled:opacity-60 ${
                    active ? "bg-brand/25 ring-1 ring-brand" : "hover:bg-raised"
                  }`}
                >
                  <Swatch {...preview} />
                  <span
                    className={`mt-1 block truncate text-[9.5px] ${active ? "font-medium text-ink" : "text-muted"}`}
                  >
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-faint">
            {THEME_PRESETS.find((preset) => preset.id === theme)?.note ??
              "Pick a preset, or build the panel from your own colours."}
          </p>
        </div>

        {theme === "custom" ? (
          <>
            {FIELDS.map((field) => (
              <SettingRow key={field.key} label={field.label} htmlFor={`theme-${field.key}`}>
                <span className="flex items-center gap-1.5">
                  <input
                    id={`theme-${field.key}`}
                    type="color"
                    aria-label={`${field.label} colour`}
                    value={draft[field.key] ?? ""}
                    disabled={saving}
                    onChange={(event) => commit({ [field.key]: event.target.value })}
                    className="h-[22px] w-[30px] cursor-pointer rounded-[5px] border border-line bg-transparent p-0 disabled:opacity-60"
                  />
                  <input
                    type="text"
                    aria-label={`${field.label} hex value`}
                    value={draft[field.key] ?? ""}
                    disabled={saving}
                    spellCheck={false}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) commit({ [field.key]: value });
                      else setDraft({ ...CUSTOM_FALLBACK, ...colors });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="h-[24px] w-[74px] rounded-[6px] border border-line bg-raised px-1.5 text-[11px] text-ink tnum uppercase"
                  />
                </span>
              </SettingRow>
            ))}
            <SettingRow label="Reset" hint="Back to the default custom colours.">
              <button
                type="button"
                disabled={saving}
                onClick={() => commit(CUSTOM_FALLBACK)}
                className="h-[26px] rounded-[6px] border border-line px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-60"
              >
                Reset colours
              </button>
            </SettingRow>
          </>
        ) : null}
      </SettingsCard>
      <p className="mt-1.5 px-1 text-[10.5px] leading-snug text-faint">
        Themes repaint this popover. The tray icon keeps the system appearance.
      </p>
    </SettingsSection>
  );
}
