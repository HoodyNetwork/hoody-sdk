// The folder bar's widths (view.tsx Folder): when its actions drop their labels, and when they take a second line.

/** One icon-only action as the bar lays it out: its hit square (kit/tokens.css --icon-hit: 28px, 44px on a coarse
 *  pointer) and the bar's gap before it (files.module.css .bar: --sp-2, 8px). crumbs.spec.ts sets the real bar to each
 *  threshold and 1px under it, so a size or gap that outgrows these fails there. The bar's actions are 32
 *  (RAIL_ROOM below); this stays the size the MEASURED widths and the added action were counted at. */
const ICON_ACTION = { fine: 28 + 8, coarse: 44 + 8 } as const;

/** Measured with an earlier set of actions, all present (Put on Board included), and a deep trail of long
 *  names: below `labels` New folder and Find show their icon only (name and tooltip kept); Upload shows its label only
 *  from wider still; below `stack` (a phone) the actions take a second line under Up and the crumbs. Now
 *  Run here, Download from link and Put on Board sit in one More menu, so the bar holds less than it was measured with:
 *  the widths are a floor that still fits (crumbs.spec.ts), not a fresh measure. */
const MEASURED = {
  fine: { stack: 420, labels: 520, upload: 660 },
  coarse: { stack: 460, labels: 560, upload: 700 },
} as const;

/** Icon-only actions the bar gained after that measure: Download from link. */
const ADDED_ICON_ACTIONS = 1;

type Widths = { readonly [K in keyof typeof MEASURED.fine]: number };
const widen = (w: Widths, by: number): Widths => ({ stack: w.stack + by, labels: w.labels + by, upload: w.upload + by });

/** New folder and Upload are arrow-chip buttons: each is 16 px wider with its label than at the measure (measured:
 *  15.1 and 15.5 px), so the wider tiers move by that room. A fine pointer's `labels` keeps its width: there the crumbs'
 *  slack still holds New folder's label (crumbs.spec.ts at the threshold, and the 1440 split pane keeps its labels). */
const CHIP_ROOM = {
  fine: { labels: 0, upload: 32 },
  coarse: { labels: 16, upload: 32 },
} as const;
type Room = { readonly labels: number; readonly upload: number };
const chipped = (w: Widths, r: Room): Widths => ({ stack: w.stack, labels: w.labels + r.labels, upload: w.upload + r.upload });

/** The bar's actions are the 32 toolbar rail (44 on a coarse pointer), each wider than at the measure, so the tiers
 *  move by the room that takes. Measured on the real bar, 2px steps, each tier at its new threshold and all wider widths
 *  fitting (crumbs.spec.ts). `stack` keeps its width: the icon-only tier still fits down to it. */
const RAIL_ROOM = {
  fine: { labels: 4, upload: 18 },
  coarse: { labels: 6, upload: 18 },
} as const;

/** The computer picker is the path's root, in the bar after Up: it gives way down to its
 *  minimum (files.module.css .bar > .picker: 10rem) and the bar's gap before the crumbs, so every tier moves by that.
 *  Below `stack` the crumbs also take their own line when Up, the picker and the crumbs do not fit one. */
const PICKER_ROOM = 160 + 8;

/** Up and the actions never shrink, so each width leaves the crumbs room for every link: every threshold moves by the
 *  room the added actions and the picker take. */
export const BAR_WIDTHS = {
  fine: widen(chipped(chipped(widen(MEASURED.fine, ADDED_ICON_ACTIONS * ICON_ACTION.fine), CHIP_ROOM.fine), RAIL_ROOM.fine), PICKER_ROOM),
  coarse: widen(chipped(chipped(widen(MEASURED.coarse, ADDED_ICON_ACTIONS * ICON_ACTION.coarse), CHIP_ROOM.coarse), RAIL_ROOM.coarse), PICKER_ROOM),
} as const;
