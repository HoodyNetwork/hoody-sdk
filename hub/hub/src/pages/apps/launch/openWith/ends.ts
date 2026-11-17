// Open with: what a launch's end tells discovery (the probe cache), watched for the launch's whole life, not the
// drawer's. The drawer leaves when the launch lands on its Board, closes, or follows another launch; the end still
// counts: an exit 127 of a template drops that template's paths, a refused launcher lookup drops the launcher row.
// One watch per listed launch key, on the launches store (parts/ops), ended at the launch's end or when it leaves the
// store. Nothing is sent from here; an open chooser checks again by itself.
import type { Target } from '@core';
import { programBoard } from '../../parts/board';
import { merge, ops } from '../../parts/ops';
import { dropLauncherOn, reprobeOn } from './probes';
import { templateById, type TemplateId } from './templates';

/** Watches at most this many launches at once; the oldest watch goes first past it. */
export const ENDS_MAX = 32;
const ENDED = new Set(['stopped', 'exited', 'not_started']);
const watches = new Map<string, () => void>();

/** Watches the listed launch `key` on `t` until it ends; once per key (a retry is a new launch, a new key). */
export function watchEnd(key: string, t: Target): void {
  if (watches.has(key)) return;
  if (watches.size >= ENDS_MAX) {
    const [oldest] = watches.keys();
    if (oldest !== undefined) stop(oldest);
  }
  let seen = false;
  const look = () => {
    const row = merge(undefined, ops.get()).find((r) => r.key === key);
    if (!row) { if (seen) stop(key); return; }
    seen = true;
    if (row.code === 'resolve_failed') { stop(key); dropLauncherOn(t); return; }
    if (row.p === 'tpl' && row.exitCode === 127) {
      stop(key);
      const id = programBoard(row)?.k.replace(/^ow:/, '');
      if (id && templateById(id)) reprobeOn(t, id as TemplateId);
      return;
    }
    if (ENDED.has(row.state)) stop(key);
  };
  watches.set(key, ops.subscribe(look));
  look();
}

function stop(key: string): void {
  const off = watches.get(key);
  watches.delete(key);
  off?.();
}

/** Tests: the keys watched now. */
export function watchedForTests(): string[] {
  return [...watches.keys()];
}
/** Tests: stop every watch (module memory outlives a test). */
export function resetEndsForTests(): void {
  for (const k of [...watches.keys()]) stop(k);
}
