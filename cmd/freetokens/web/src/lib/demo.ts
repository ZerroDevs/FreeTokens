import type { Snapshot } from "./types";

// Preview data for `npm run dev`. The UI labels it as preview data, and the
// desktop build always replaces it with measured usage from the Go tracker.
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3600000;

export const demoSnapshot: Snapshot = {
  refreshedAt: iso(now - 42_000),
  quota: {
    status: "active",
    plan: "starter",
    meters: [
      {
        label: "Daily Hours",
        used: 0,
        limit: 53,
        unit: "hours",
        resetsAt: iso(now + 15 * HOUR + 32 * 60_000),
      },
    ],
    hoursBalance: 173,
    activeSessions: [],
    warning: "",
  },
  historyWarning: "",
  periods: [
    {
      label: "Today",
      tokens: 222_500_000,
      costUsd: 1.49,
      costLowerBound: false,
      partial: false,
      models: [
        { name: "DeepSeek V4.1 Flash", tokens: 148_000_000, costUsd: 0.92, costComplete: true },
        { name: "Nemotron 3.5 Lightning", tokens: 54_000_000, costUsd: 0.41, costComplete: true },
        { name: "MiMo V2 Pro", tokens: 20_500_000, costUsd: 0.16, costComplete: true },
      ],
      sources: [
        { name: "Freebuff", tokens: 92_500_000 },
        { name: "Antigravity app", tokens: 130_000_000 },
      ],
      hasData: true,
    },
    {
      label: "Yesterday",
      tokens: 911_200_000,
      costUsd: 6.25,
      costLowerBound: false,
      partial: false,
      models: [
        { name: "DeepSeek V4.1 Flash", tokens: 602_000_000, costUsd: 4.1, costComplete: true },
        { name: "Nemotron 3.5 Lightning", tokens: 241_200_000, costUsd: 1.62, costComplete: true },
        { name: "MiMo V2 Pro", tokens: 68_000_000, costUsd: 0.53, costComplete: true },
      ],
      sources: [
        { name: "Freebuff", tokens: 500_000_000 },
        { name: "Antigravity app", tokens: 300_000_000 },
        { name: "Antigravity IDE", tokens: 111_200_000 },
      ],
      hasData: true,
    },
    {
      label: "Last 30 Days",
      tokens: 10_900_000_000,
      costUsd: 109.6,
      costLowerBound: true,
      partial: false,
      unknownModels: ["Unattributed"],
      models: [
        { name: "DeepSeek V4.1 Flash", tokens: 6_500_000_000, costUsd: 61.2, costComplete: true },
        { name: "Nemotron 3.5 Lightning", tokens: 2_800_000_000, costUsd: 34.1, costComplete: true },
        { name: "MiMo V2 Pro", tokens: 1_200_000_000, costUsd: 14.3, costComplete: true },
        { name: "Unattributed", tokens: 312_000_000, costComplete: false },
        { name: "Older Freebuff Usage", tokens: 88_600_000, costComplete: false },
      ],
      sources: [
        { name: "Freebuff", tokens: 6_200_000_000 },
        { name: "Antigravity app", tokens: 3_100_000_000 },
        { name: "Antigravity IDE", tokens: 1_400_000_000 },
        { name: "Agy CLI", tokens: 200_000_000 },
      ],
      hasData: true,
    },
  ],
  sourceNote:
    "Measured Freebuff hosted runs and legacy Desktop tokens on this computer; dollars are estimated at public API rates, not Freebuff charges.",
};
