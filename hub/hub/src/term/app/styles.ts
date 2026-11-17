// The class-style tables a mount draws with: a REQUIRED input of startTermHub, so every way in (the ship
// bundle, dev.ts, render.ts, goldens, shots, scenarios, tests) draws pages through the same CSS translation, or says
// on purpose that it does not. A missing value is a start error (TERM_STYLES_REQUIRED), never a quiet default.
//   ship         the bundle passes stylesFromBands(<its packed band tables>) (scripts/term/build/ship-entry.ts)
//   dev/goldens  scripts/term/style-table.ts builds each band's table from the stylesheets (cached) and passes the same shape
//   tests        a test that draws no class-styled page may pass UNSTYLED_FOR_TESTS by name
// The lifecycle installs the tables at start (jsx/style.ts setStyleTables at the terminal's width), re-selects the
// width band on every resize and pane change, and removes them on dispose (a next mount starts with none).
import type { Table } from '../../../scripts/term/css-translate/types';
import { resolverFor } from '../jsx/css-table';
import type { StyleResolver } from '../jsx/style';

export interface TermStyles {
  /** Says which source made these (a receipt and a golden name it): 'tables', 'unstyled-for-tests', or a builder's id. */
  readonly id: string;
  /** The name of the table for a terminal `cols` wide whose page pane is `paneCols` wide (a width band). */
  classFor(cols: number, paneCols: number): string;
  /** The resolver for a width band; null draws that band unstyled. Called once per band and kept. */
  resolver(band: string): StyleResolver | null;
}

/** Styles by width band (scripts/term/css-translate/breakpoints.ts): `keyFor` names the band of a terminal and its
 *  page pane, `tableOf` builds or reads that band's table on first use (scripts/term/style-table.ts bandTables). */
export function stylesFromBands(keyFor: (cols: number, paneCols: number) => string, tableOf: (key: string) => Table | null, id = 'tables'): TermStyles {
  const made = new Map<string, StyleResolver>();
  return {
    id,
    classFor: keyFor,
    resolver(key) {
      let r = made.get(key);
      if (!r) { const t = tableOf(key); if (!t) return null; r = resolverFor(t); made.set(key, r); }
      return r;
    },
  };
}

/** No class styles at all, by name: only for tests whose pages draw no CSS-module classes (the lifecycle's own). */
export const UNSTYLED_FOR_TESTS: TermStyles = Object.freeze({ id: 'unstyled-for-tests', classFor: () => 'none', resolver: () => null });

/** Refuses a missing or malformed styles value (the start error). */
export function assertStyles(s: unknown): asserts s is TermStyles {
  const v = s as Partial<TermStyles> | null | undefined;
  if (!v || typeof v.classFor !== 'function' || typeof v.resolver !== 'function' || typeof v.id !== 'string') {
    throw new Error('TERM_STYLES_REQUIRED: startTermHub needs `styles` (stylesFromBands(...), or UNSTYLED_FOR_TESTS in a test that draws no class styles)');
  }
}
