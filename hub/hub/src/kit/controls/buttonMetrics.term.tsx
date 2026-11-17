// useButtonLabelsWidth in the terminal. The web measures hidden kit Buttons in the page's fonts (a probe in the DOM,
// ResizeObserver) to give a column its pixel width. A terminal has no fonts to wait for and no pixel boxes: nothing is
// measured, so the width stays null ("not measured yet": every caller keeps its own floor then) and the probe draws
// nothing. The web file's probe stopped the mount here (its selector and ResizeObserver are DOM-only).
import type * as Web from './buttonMetrics';

export type { ButtonLabel, ButtonLabelSpec, ButtonLabelsOptions, ButtonLabelsWidth } from './buttonMetrics';

const NOTHING: Web.ButtonLabelsWidth = { width: null, probe: <></> };

export const useButtonLabelsWidth: typeof Web.useButtonLabelsWidth = () => NOTHING;
