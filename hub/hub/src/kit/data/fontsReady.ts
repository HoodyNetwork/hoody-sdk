// The page's web fonts have loaded: canvas text measures (DataTable 'fit' columns, the Logs list's tracks) run again with
// the real faces instead of a fallback's. One hook for both.
import { useEffect, useState } from 'react';
import { CELL_FONT } from './DataTableLayout';
import { statusPillMetrics } from './pillMetrics';
import { hostEnv } from '../../core/host-env';

/** The faces the kit measures text in: the cell fonts and the StatusPill's. A function, read when the hook runs, never at
 * module load (a kit module computes nothing on import). */
const measuredFaces = (): string[] => [CELL_FONT.sans, CELL_FONT.mono, statusPillMetrics().font];

/**
 * Turns true once the faces the kit measures in have loaded. True at once where there is no font loading API (tests, SSR)
 * or when every face already reads loaded. A cold load can report `document.fonts.status` 'loaded' before any face was
 * requested, so the hook asks for each face itself (`fonts.load`) and waits for those, then for
 * `fonts.ready`; a failed load still settles (the fallback's measure is the best there is).
 */
export function useFontsReady(): boolean {
  // The terminal has no font loading (a cell is a cell): ready at once, and `document` is never read off a browser page.
  const fonts = hostEnv().browserPage !== true || typeof document === 'undefined' ? undefined : (document as Document & { fonts?: FontFaceSet }).fonts;
  const [ready, setReady] = useState(() => !fonts || (fonts.status === 'loaded' && measuredFaces().every((f) => safeCheck(fonts, f))));
  useEffect(() => {
    if (ready || !fonts) return;
    let live = true;
    const done = () => {
      if (live) setReady(true);
    };
    // A partial font API (no load: an older engine, a test stub) waits for fonts.ready alone.
    const asked = typeof fonts.load === 'function' ? Promise.all(measuredFaces().map((f) => fonts.load(f).catch(() => []))) : Promise.resolve();
    asked
      .then(() => fonts.ready)
      .then(done, done);
    return () => {
      live = false;
    };
  }, [fonts, ready]);
  return ready;
}

/** FontFaceSet.check throws on a font string it cannot parse: read that as not loaded, so the hook waits for the load. */
function safeCheck(fonts: FontFaceSet, font: string): boolean {
  try {
    return fonts.check(font);
  } catch {
    return false;
  }
}
