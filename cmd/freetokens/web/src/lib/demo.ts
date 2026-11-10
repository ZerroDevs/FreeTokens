import type { Kinds, Snapshot } from "./types";

// Preview data for `npm run dev`. The UI labels it as preview data, and the
// desktop build always replaces it with measured usage from the Go tracker.
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3600000;

// A cache-heavy split, which is what agent runs actually report.
const kindsFor = (tokens: number): Kinds => {
  const cacheRead = Math.round(tokens * 0.78);
  const input = Math.round(tokens * 0.17);
  return { input, output: tokens - cacheRead - input, cacheRead, cacheWrite: 0 };
};

// Sixty days of history, oldest first, ending today: enough for the 30-day period to have a
// previous window to compare against. The last seven days add up to the Week period above so the
// comparison line and the donut agree in the preview.
const PRIOR_30 = Array.from({ length: 30 }, (_, i) => 320 + ((i * 53) % 60));
const MIDDLE_16 = Array.from({ length: 16 }, (_, i) => 440 + ((i * 37) % 70));
const LAST_14 = [420, 380, 460, 510, 440, 505, 505, 560, 560, 560, 560, 560, 911.2, 222.5];
const DAILY_MILLIONS = [...PRIOR_30, ...MIDDLE_16, ...LAST_14];
const MODEL_SPLIT = [
  { name: "DeepSeek V4.1 Flash", provider: "DeepSeek", share: 0.55 },
  { name: "Nemotron 3.5 Lightning", provider: "NVIDIA", share: 0.3 },
  { name: "MiMo V2 Pro", provider: "Xiaomi", share: 0.15 },
];
const days = DAILY_MILLIONS.map((millions, index) => {
  const date = new Date(now);
  date.setDate(date.getDate() - (DAILY_MILLIONS.length - 1 - index));
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const tokens = Math.round(millions * 1_000_000);
  const costUsd = Math.round((tokens / 150_000_000) * 100) / 100;
  return {
    date: key,
    tokens,
    costUsd,
    costComplete: true,
    partial: false,
    // Per-model day rows give the comparison line its movers in the preview.
    models: MODEL_SPLIT.map((model) => {
      const modelTokens = Math.round(tokens * model.share);
      return {
        name: model.name,
        provider: model.provider,
        source: "Freebuff",
        tokens: modelTokens,
        costUsd: Math.round(costUsd * model.share * 100) / 100,
        costComplete: true,
        kinds: kindsFor(modelTokens),
      };
    }),
  };
});

// A working week: quiet nights, a midday peak, and a lighter weekend.
const HOUR_WEIGHT = Array.from({ length: 24 }, (_, hour) =>
  hour < 7 ? 0 : hour < 9 ? 0.4 : hour < 17 ? 1 : hour < 20 ? 0.7 : 0.2,
);
const WEEKDAY_WEIGHT = [0.5, 1, 1.12, 1.1, 1.06, 0.92, 0.45];
const slotBase = 11_532_600_000 / 168;
const slots = Array.from({ length: 168 }, (_, index) => {
  const tokens = Math.round(
    slotBase * WEEKDAY_WEIGHT[Math.floor(index / 24)] * HOUR_WEIGHT[index % 24],
  );
  return { tokens, costUsd: Math.round((tokens / 150_000_000) * 100) / 100, costComplete: true };
});

export const demoSnapshot: Snapshot = {
  refreshedAt: iso(now - 42_000),
  quota: {
    status: "active",
    plan: "starter",
    meters: [
      {
        label: "Daily Hours",
        // A partly spent day gives the card a pace estimate in the preview.
        used: 44.2,
        limit: 53,
        unit: "hours",
        resetsAt: iso(now + 15 * HOUR + 32 * 60_000),
      },
    ],
    hoursBalance: 173,
    // A session nine minutes out keeps the countdown row visible in the browser preview.
    activeSessions: [new Date(Date.now() + 9 * 60_000).toISOString()],
    warning: "",
  },
  historyWarning: "",
  days,
  slots,
  sources: [
    { name: "Freebuff", files: 0, unreadable: 0, state: "ok", lastReadAt: iso(now - 42_000) },
    {
      name: "Freebuff Desktop",
      files: 3,
      unreadable: 1,
      state: "partial",
      detail: "1 input could not be read, so totals are missing their usage.",
      lastReadAt: iso(now - 42_000),
    },
    { name: "Antigravity", files: 12, unreadable: 0, state: "ok", lastReadAt: iso(now - 42_000) },
    { name: "Claude", files: 48, unreadable: 0, state: "ok", lastReadAt: iso(now - 42_000) },
    {
      name: "Codex",
      files: 0,
      unreadable: 0,
      state: "missing",
      detail: "No Codex sessions found.",
      lastReadAt: iso(now - 3 * HOUR),
    },
    { name: "OpenCode", files: 1, unreadable: 0, state: "ok", lastReadAt: iso(now - 42_000) },
  ],
  periods: [
    {
      label: "Today",
      tokens: 222_500_000,
      costUsd: 1.49,
      costLowerBound: false,
      partial: false,
      kinds: kindsFor(222_500_000),
      models: [
        {
          name: "DeepSeek V4.1 Flash",
          provider: "DeepSeek",
          tokens: 148_000_000,
          costUsd: 0.92,
          costComplete: true,
          kinds: kindsFor(148_000_000),
        },
        {
          name: "Nemotron 3.5 Lightning",
          provider: "NVIDIA",
          tokens: 54_000_000,
          costUsd: 0.41,
          costComplete: true,
          kinds: kindsFor(54_000_000),
        },
        {
          name: "MiMo V2 Pro",
          provider: "Xiaomi",
          tokens: 20_500_000,
          costUsd: 0.16,
          costComplete: true,
          kinds: kindsFor(20_500_000),
        },
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
      kinds: kindsFor(911_200_000),
      models: [
        {
          name: "DeepSeek V4.1 Flash",
          provider: "DeepSeek",
          tokens: 602_000_000,
          costUsd: 4.1,
          costComplete: true,
          kinds: kindsFor(602_000_000),
        },
        {
          name: "Nemotron 3.5 Lightning",
          provider: "NVIDIA",
          tokens: 241_200_000,
          costUsd: 1.62,
          costComplete: true,
          kinds: kindsFor(241_200_000),
        },
        {
          name: "MiMo V2 Pro",
          provider: "Xiaomi",
          tokens: 68_000_000,
          costUsd: 0.53,
          costComplete: true,
          kinds: kindsFor(68_000_000),
        },
      ],
      sources: [
        { name: "Freebuff", tokens: 500_000_000 },
        { name: "Antigravity app", tokens: 300_000_000 },
        { name: "Antigravity IDE", tokens: 111_200_000 },
      ],
      hasData: true,
    },
    {
      label: "Week",
      tokens: 3_940_000_000,
      costUsd: 27.4,
      costLowerBound: false,
      partial: false,
      kinds: kindsFor(3_940_000_000),
      models: [
        {
          name: "DeepSeek V4.1 Flash",
          provider: "DeepSeek",
          tokens: 2_100_000_000,
          costUsd: 19.6,
          costComplete: true,
          kinds: kindsFor(2_100_000_000),
        },
        {
          name: "Nemotron 3.5 Lightning",
          provider: "NVIDIA",
          tokens: 1_300_000_000,
          costUsd: 11.2,
          costComplete: true,
          kinds: kindsFor(1_300_000_000),
        },
        {
          name: "MiMo V2 Pro",
          provider: "Xiaomi",
          tokens: 540_000_000,
          costUsd: 4.2,
          costComplete: true,
          kinds: kindsFor(540_000_000),
        },
      ],
      sources: [
        { name: "Freebuff", tokens: 1_900_000_000 },
        { name: "Antigravity app", tokens: 1_200_000_000 },
        { name: "Antigravity IDE", tokens: 700_000_000 },
        { name: "Agy CLI", tokens: 140_000_000 },
        { name: "Claude", tokens: 96_000_000 },
        { name: "Codex", tokens: 64_000_000 },
      ],
      hasData: true,
    },
    {
      label: "Last 30 Days",
      tokens: 11_532_600_000,
      costUsd: 113.3,
      costLowerBound: true,
      partial: false,
      kinds: kindsFor(11_532_600_000),
      unknownModels: ["Unattributed"],
      models: [
        {
          name: "DeepSeek V4.1 Flash",
          provider: "DeepSeek",
          source: "Freebuff",
          tokens: 6_500_000_000,
          costUsd: 61.2,
          costComplete: true,
          kinds: kindsFor(6_500_000_000),
        },
        {
          name: "Nemotron 3.5 Lightning",
          provider: "NVIDIA",
          source: "Freebuff",
          tokens: 2_800_000_000,
          costUsd: 34.1,
          costComplete: true,
          kinds: kindsFor(2_800_000_000),
        },
        {
          name: "MiMo V2 Pro",
          provider: "Xiaomi",
          source: "Freebuff",
          tokens: 1_200_000_000,
          costUsd: 14.3,
          costComplete: true,
          kinds: kindsFor(1_200_000_000),
        },
        {
          name: "Antigravity · Gemini 3.8 Flash",
          provider: "Google",
          source: "Antigravity app",
          tokens: 420_000_000,
          costUsd: 0.9,
          costComplete: true,
          kinds: kindsFor(420_000_000),
        },
        {
          name: "Claude · Sonnet 4.6",
          provider: "Anthropic",
          source: "Claude",
          project: "freetokens",
          tokens: 168_000_000,
          costUsd: 2.4,
          costComplete: true,
          kinds: kindsFor(168_000_000),
        },
        {
          name: "Claude · deepseek-v4.1-flash",
          provider: "DeepSeek",
          source: "Claude",
          project: "webapp",
          tokens: 44_000_000,
          costUsd: 0.4,
          costComplete: true,
          kinds: kindsFor(44_000_000),
        },
        {
          name: "Unattributed",
          provider: "Other",
          source: "Freebuff",
          tokens: 312_000_000,
          costComplete: false,
        },
        {
          name: "Older Freebuff Usage",
          provider: "Other",
          source: "Freebuff",
          tokens: 88_600_000,
          costComplete: false,
        },
      ],
      sources: [
        { name: "Freebuff", tokens: 6_200_000_000 },
        { name: "Antigravity app", tokens: 3_100_000_000 },
        { name: "Antigravity IDE", tokens: 1_400_000_000 },
        { name: "Agy CLI", tokens: 200_000_000 },
        { name: "Claude", tokens: 410_000_000 },
        { name: "Codex", tokens: 320_000_000 },
      ],
      hasData: true,
    },
  ],
  sourceNote:
    "Measured Freebuff hosted runs and legacy Desktop tokens on this computer; dollars are estimated at public API rates, not Freebuff charges.",
};
