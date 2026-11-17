// The colour field's palette, shared by ColorPicker.tsx (web) and ColorPicker.term.tsx (terminal). No DOM.

/** The API's curated palette (its predefined colours), in its order. */
// Colour values the user picks and the API stores, not Hub colours.
export const PRESET_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471', '#F1948A', '#AED6F1', '#A9DFBF'] as const;

/** One preset, chosen by `random` (Math.random unless a test passes its own): the preselected colour of a new thing. */
export function randomPresetColor(random: () => number = Math.random): string {
  const i = Math.min(PRESET_COLORS.length - 1, Math.max(0, Math.floor(random() * PRESET_COLORS.length)));
  return PRESET_COLORS[i] ?? PRESET_COLORS[0];
}
