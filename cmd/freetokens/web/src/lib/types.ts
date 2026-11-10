export interface Meter {
  label: string;
  used: number;
  limit: number;
  unit: "hours" | "sessions" | "usd" | string;
  resetsAt?: string;
  periodMs?: number;
  detail?: string;
}

export interface Quota {
  status: string;
  plan?: string;
  meters: Meter[];
  hoursBalance?: number;
  monthlySpendUsd?: number;
  activeSessions: string[];
  warning?: string;
}

export interface Variant {
  name: string;
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
}

/** How a model spent its measured tokens. Reasoning is informational and sits inside output. */
export interface Kinds {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
}

export interface ModelRow {
  name: string;
  provider?: string;
  source?: string;
  /** Workspace the run belonged to, when its reader recorded one. */
  project?: string;
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
  kinds?: Kinds;
  variants?: Variant[];
}

export interface SourceRow {
  name: string;
  tokens: number;
}

export interface Period {
  label: string;
  tokens: number;
  costUsd?: number;
  costLowerBound: boolean;
  partial: boolean;
  unknownModels?: string[];
  models: ModelRow[];
  sources?: SourceRow[];
  /** Token kinds across the rows that reported them, absent when no source did. */
  kinds?: Kinds;
  hasData: boolean;
}

export interface Day {
  date: string;
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
  partial: boolean;
  /** The day's per-model rows, used for the period comparison's movers. */
  models?: ModelRow[];
}

/** One local hour-of-week bucket; the engine sends 168 of them, Sunday 00:00 first. */
export interface Slot {
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
}

/** One reader's coverage from the last refresh. */
export interface SourceHealth {
  name: string;
  files: number;
  unreadable: number;
  state: "ok" | "partial" | "error" | "missing" | "signed-out" | "cached" | string;
  detail?: string;
  lastReadAt?: string;
}

export interface Snapshot {
  refreshedAt: string;
  quota?: Quota;
  quotaError?: string;
  /** Machine-readable class for quotaError: signed-out, expired, approval, network or other. */
  quotaErrorCode?: string;
  historyWarning?: string;
  periods?: Period[];
  /** Per-day totals for the last 30 days, oldest first. */
  days?: Day[];
  /** Usage of the retained window by local weekday and hour, Sunday 00:00 first. */
  slots?: Slot[];
  /** What each local reader found, so a gap can be traced to one store. */
  sources?: SourceHealth[];
  sourceNote?: string;
}

export type Theme = "dark" | "light" | "system" | "sand" | "custom";

/** The four colours a custom theme is built from. */
export interface ThemeColors {
  accent?: string;
  background?: string;
  card?: string;
  text?: string;
}

/** Release-check policy: never contact GitHub, tell me, or install verified releases. */
export type AutoUpdate = "off" | "notify" | "auto";

export interface Preferences {
  refreshMinutes: number;
  startAtLogin: boolean;
  theme: Theme;
  /** The colours behind a custom theme; ignored by the presets. */
  themeColors?: ThemeColors;
  /** False when the user turned session countdowns off. */
  showTimers: boolean;
  showHistory: boolean;
  /** Monthly spending ceiling in dollars; 0 turns the budget line off. */
  budgetUsd: number;
  /** What the menu bar or tray tooltip shows. */
  trayTitle: TrayTitle;
  /** Reveals the project grouping in the model mix. */
  showProjects: boolean;
  autoUpdate: AutoUpdate;
  version: string;
  platform: string;
  /** True when the window cannot show a transparent margin around the shell. */
  opaqueWindow?: boolean;
}

export interface UpdateStatus {
  current: string;
  latest: string;
  available: boolean;
  devBuild: boolean;
  /** True when latest is the release the user asked not to be told about again. */
  skipped: boolean;
  /** Markdown release notes for latest, when the release published them. */
  notes?: string;
  url?: string;
}

export type ValueMode = "tokens" | "cost";

/** Menu bar / tray tooltip figure: the session countdown, hours, tokens, cost or nothing. */
export type TrayTitle = "session" | "hours" | "tokens" | "cost" | "none";
