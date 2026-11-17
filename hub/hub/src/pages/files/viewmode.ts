// Files view modes: one pane or two. The address says it first (`panes=one`, or
// `panes=two` while pane B has no computer yet), so a shared link opens as it was seen; a link naming pane B (`b=`)
// opens two; otherwise the viewer's remembered choice, and one pane until a choice is made. One pane leaves pane B's address (b, bp, its search and page) untouched, so Two brings
// it back as it was.
import { localSetting, useLocalSetting, type LocalSetting } from '@core';

export type PanesMode = 'one' | 'two';

/** Remembered on this browser for the signed-in viewer's session (the registered hub.v3.pane. prefix: cleared at
 *  sign-out). */
export const PANES_KEY = 'hub.v3.pane.files.panes';

let setting: LocalSetting | null | undefined;
function panesSetting(): LocalSetting | null {
  if (setting === undefined) {
    try {
      setting = localSetting(PANES_KEY);
    } catch {
      setting = null;
    }
  }
  return setting;
}

const NONE: LocalSetting = Object.freeze({ key: PANES_KEY, get: () => null, set: () => false, subscribe: () => () => undefined });

/** The remembered choice (null until one is made) and its setter; without browser storage, nothing is kept. */
export function usePanesChoice(): [PanesMode | null, (m: PanesMode) => void] {
  const s = panesSetting() ?? NONE;
  const [raw, set] = useLocalSetting(s);
  const value = raw === 'one' || raw === 'two' ? raw : null;
  return [value, (m) => { try { set(m); } catch { /* not kept: the address still says it */ } }];
}

/** The mode for this address and remembered choice. */
export function panesMode(search: Readonly<Record<string, string>>, remembered: PanesMode | null): PanesMode {
  if (search.panes === 'one') return 'one';
  if (search.panes === 'two' || search.b) return 'two';
  return remembered ?? 'one';
}

/** The address for `mode`, keeping everything else (pane B's address included). */
export function panesHref(search: Readonly<Record<string, string>>, mode: PanesMode): string {
  const q = new URLSearchParams(search as Record<string, string>);
  if (mode === 'one') q.set('panes', 'one');
  else if (search.b) q.delete('panes');
  else q.set('panes', 'two');
  const str = q.toString();
  return '/files' + (str ? '?' + str : '');
}
