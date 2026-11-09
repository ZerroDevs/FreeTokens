// A categorical palette for measured rows. The colors encode identity, not
// brand: every legend row repeats the label so color is never the only signal.
// Each entry names a theme variable, so a row keeps its hue when the panel
// theme changes and the light palette stays readable on a pale background.
export const MODEL_COLORS = [
  "var(--color-model-1)",
  "var(--color-model-2)",
  "var(--color-model-3)",
  "var(--color-model-4)",
  "var(--color-model-5)",
  "var(--color-model-6)",
  "var(--color-model-7)",
  "var(--color-model-8)",
];
export const OTHER_COLOR = "var(--color-model-other)";

export function modelColor(index: number): string {
  return MODEL_COLORS[index] ?? OTHER_COLOR;
}
