// The terminal's layout breakpoints, in columns of the box a layout is drawn in (measured with useBoxSize: a container
// query, as the web's are). The web's px thresholds read through media.term.ts (1 column = 8 px) are kept where they
// give a sensible terminal layout; where they do not (a terminal column carries more than 8 px of web layout: no
// padding inside controls, no 16 px gutters) the terminal value is set here and the web value noted.

/** Below this content width the web is "phone": breadcrumbs fold to "‹ Parent" (web XS 600 px = 75 columns). */
export const NARROW_COLS = 75;
/** Below this many rows a layout drops blank spacer rows (the header's bottom space, gaps between sections). */
export const SHORT_ROWS = 30;
/** List and detail side by side from here (web 846 px = 106 cols): list >= LIST_MIN_COLS, separator 1, detail >= 60. */
export const BOTH_PANES_COLS = 96;
/** The list's least width beside a detail (web 280 px). */
export const LIST_MIN_COLS = 35;
/** The detail's least width in fill mode (terminal; web 560 px = 70). */
export const DETAIL_MIN_COLS = 60;
/** A settings page's section menu beside its sections from here (web: the rail from 840 px = 105 cols). */
export const SETTINGS_RAIL_COLS = 100;
/** Width of that menu (web 200 px = 25 cols). */
export const SETTINGS_RAIL_W = 24;
/** A summary rail (settings, wizard) or a detail's facts rail beside the main column from here (web 1180 px = 147).
 * Raised with ASIDE_W so the main column keeps the room it had. */
export const ASIDE_COLS = 138;
/** Width of a summary or facts rail. The web's 280-300 px would be 35-37 cols, but a rail holds sentences (a security
 * check list) and a cell is wider than a letter: 36 wrapped every row into three or four lines. */
export const ASIDE_W = 44;
/** A wizard's step list beside its body from here (web 840 px). */
export const WIZARD_STEPS_COLS = 100;
/** A dashboard card's least width; tracks = how many fit (web track min 280 px = 35). */
export const DASH_CARD_MIN = 38;
/** Most dashboard tracks (web: 4 at >= 1560 px). */
export const DASH_TRACKS_MAX = 4;

/** Dashboard tracks for a content width. */
export function dashTracks(cols: number, gap = 1): number {
  return Math.max(1, Math.min(DASH_TRACKS_MAX, Math.floor((cols + gap) / (DASH_CARD_MIN + gap))));
}

/** px (web) to columns, as media.term.ts reads a px question. */
export const pxCols = (px: number): number => Math.round(px / 8);

/** The widest a capped page's content draws: the web's `.capped` (--content-max 1600 px). Dashboard, Detail and Settings
 * pages and a `capped` PageFrame stop here and stay at the start edge, as the web's do; a table page fills. */
export const CONTENT_MAX_COLS = 200; // = pxCols(1600), held equal by Layouts.wide.term.test (a kit module runs no call at load: kitpure)
/** A capped page's outer box: the content cap plus its one-column gutter each side. */
export const CAPPED_PAGE_COLS = 202; // = CONTENT_MAX_COLS + 2, same test
/** The widest a settings page's form column draws: the web's --form-max (720 px). */
export const FORM_MAX_COLS = 90; // = pxCols(720), same test
