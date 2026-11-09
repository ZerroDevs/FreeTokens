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

export interface ModelRow {
  name: string;
  provider?: string;
  source?: string;
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
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
  hasData: boolean;
}

export interface Day {
  date: string;
  tokens: number;
  costUsd?: number;
  costComplete: boolean;
  partial: boolean;
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
  sourceNote?: string;
}

export type Theme = "dark" | "light" | "system";

/** Release-check policy: never contact GitHub, tell me, or install verified releases. */
export type AutoUpdate = "off" | "notify" | "auto";

export interface Preferences {
  refreshMinutes: number;
  startAtLogin: boolean;
  theme: Theme;
  /** False when the user turned session countdowns off. */
  showTimers: boolean;
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
