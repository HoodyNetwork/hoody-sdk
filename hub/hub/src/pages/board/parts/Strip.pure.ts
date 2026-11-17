// The board strip's note type and sizes (split out of Strip.tsx so the terminal build shares them; Strip.tsx re-exports
// every name).

/** A strip note: the whole sentence (step 0, and the short form's name and tip) and its short form (step 1 on). */
export interface StripNote {
  full: string;
  short: string;
}

/** The drop target id of New Board while a tile is dragged over it (no Board id is empty). */
export const NEW_BOARD_DROP = '';

/** The strip's tightest step (see the file head). */
export const STRIP_LAST_STEP = 4;

/** The share of the row the Boards keep before the tools step down (when the tabs need that much). */
export const STRIP_TABS_SHARE = 0.4;
