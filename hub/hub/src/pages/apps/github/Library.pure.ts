// The GitHub library's read hook and words (split out of Library.tsx so the terminal build shares them; Library.tsx
// re-exports the public names; T is for Library.tsx).
import { useCallback, useEffect, useState } from 'react';
import type { useStrings } from '@kit';
import type strings from '../strings.en.json';
import { POPULAR, loadLibrary, type Library as Lib, type LibraryKind } from './library';

export type T = ReturnType<typeof useStrings<typeof strings>>;

/** Where the library stands: being loaded (its own chunk), loaded, or failed (Try again loads it again). */
export type LibraryState = { kind: 'loading' } | { kind: 'ready'; lib: Lib } | { kind: 'failed'; error: unknown };

/** The library, loaded when the pane first shows it. `retry` loads it again after a failure. */
export function useLibrary(): { state: LibraryState; retry: () => void } {
  const [state, setState] = useState<LibraryState>({ kind: 'loading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    loadLibrary().then(
      (lib) => live && setState({ kind: 'ready', lib }),
      (error: unknown) => live && setState({ kind: 'failed', error }),
    );
    return () => {
      live = false;
    };
  }, [round]);
  return { state, retry: useCallback(() => setRound((n) => n + 1), []) };
}

/** What the person has chosen in the library; the pane keeps it, so it outlives a pick. `view`: Start here ('popular'),
 *  All programs ('all') or a category id. */
export interface Browse {
  view: string;
  kind?: LibraryKind | undefined;
  stack?: string | undefined;
  tag?: string | undefined;
  /** How many of a long list are drawn (Show more adds a page). */
  shown: number;
}
export const PAGE = 60;
export const START: Browse = { view: POPULAR, shown: PAGE };

/** The licence as the card says it: the SPDX id as GitHub reports it, "own licence" when GitHub named none it knows. */
export const licenceWord = (t: T, id: string): string => (id === 'custom' ? t('gh.lib.ownLicence') : id);
