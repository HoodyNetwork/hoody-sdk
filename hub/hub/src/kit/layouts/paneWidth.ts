// A pane's remembered width (PaneSeparator.tsx and its terminal sibling): one key format, one clamp, one store (the
// host's local store: the browser's localStorage on the web, the session store in a terminal). Widths are web px in
// both, so a width means the same thing wherever it was set.
import { hostEnv } from '../../core/host-env';

export interface PaneRange {
  min: number;
  max: number;
  def: number;
}

/** The storage key of a pane width. */
export const paneWidthKey = (key: string, kind: string): string => `hub.v3.pane.${key}.${kind}`;

/** The stored width, or the default when there is none, it is outside the range, or the store refuses. */
export function readPaneWidth(key: string | undefined, kind: string, r: PaneRange): number {
  if (!key) return r.def;
  try {
    const raw = hostEnv().local?.getItem(paneWidthKey(key, kind));
    if (raw === null || raw === undefined) return r.def;
    const v = Number(raw);
    return Number.isFinite(v) && v >= r.min && v <= r.max ? v : r.def;
  } catch {
    return r.def;
  }
}

/** Stores a width (rounded); a refusing store just doesn't remember it. */
export function writePaneWidth(key: string | undefined, kind: string, w: number): void {
  if (!key) return;
  try {
    hostEnv().local?.setItem(paneWidthKey(key, kind), String(Math.round(w)));
  } catch {
    /* storage refused: the width just isn't remembered */
  }
}

/** A width kept in its range. */
export const clampPane = (r: Pick<PaneRange, 'min' | 'max'>, w: number): number => Math.min(r.max, Math.max(r.min, w));
