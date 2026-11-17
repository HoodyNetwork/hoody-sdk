// Copy and Move's pure part (split out of Transfer.tsx so the terminal build shares it; the design notes are at the top
// of Transfer.tsx): the skipped list, the verdict and part words, and the transfer check. Transfer.tsx re-exports the
// public names; reasonKey, walkRefusal, Result and Skipped are for Transfer.tsx.
import { useFilesChange, type ChangeIdentity, type Verdict } from './data';
import { displayName, parentOf } from './logic';
import { WALK_MAX_ENTRIES, WALK_MAX_FOLDERS, type Walk } from './tree';

export type TransferKind = 'copy' | 'move';
export type Result = { kind: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; code?: string; skipped?: Skipped } | null;
export interface Skipped { readonly list: readonly { path: string; reason: string }[]; readonly count: number }

export const SKIP_LIST_MAX = 20;
/** The `skipped` list of a done copy (as the files program sends it: only a folder copy leaves items out), or none. Paths only;
 *  reasons become fixed words. */
export function skippedOf(data: unknown): Skipped | undefined {
  const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const list = Array.isArray(o.skipped) ? o.skipped.flatMap((x) => {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    return typeof r.path === 'string' ? [{ path: r.path, reason: typeof r.reason === 'string' ? r.reason : '' }] : [];
  }) : [];
  const count = typeof o.skipped_count === 'number' && Number.isFinite(o.skipped_count) ? Math.max(o.skipped_count, list.length) : list.length;
  return count > 0 ? { list, count } : undefined;
}
export const reasonKey = (reason: string) => (reason.startsWith('not a regular file') ? 'skipped.notRegular' : reason === 'outside the serve root' ? 'skipped.outside' : 'skipped.other');

type VerdictKey = 'verdict.copyNone' | 'verdict.copyOther' | 'verdict.moveNone';
/** What a read proved a held copy or move did NOT do, in words: not copied (nothing there), another item at the
 *  name (never replaced), or not moved. */
export function verdictWords(t: (k: VerdictKey, v: Record<string, string>) => string, id: Pick<ChangeIdentity, 'kind' | 'path' | 'dest'>, v: Verdict): string {
  const dest = id.dest ?? '';
  const name = displayName(dest.split('/').at(-1) ?? '');
  if (id.kind === 'move') return t('verdict.moveNone', { name: displayName(id.path.split('/').at(-1) ?? ''), folder: displayName(parentOf(id.path)) });
  return v.there ? t('verdict.copyOther', { name, folder: displayName(parentOf(dest)) }) : t('verdict.copyNone', { folder: displayName(parentOf(dest)) });
}

/** A held folder copy found part made, in words: how many items were missing or different when last checked. It
 *  stays held: the copy may still be running. */
export function partWords(t: (k: 'held.copyPart' | 'held.copyPartOne', v: Record<string, string>) => string, dest: string, count: number): string {
  return t(count === 1 ? 'held.copyPartOne' : 'held.copyPart', { count: String(count), dest: displayName(dest) });
}

/** Why a walked folder cannot be copied from the Hub, in words, or null (done, or still reading). */
export function walkRefusal(t: (k: `walk.${'failed' | 'big' | 'deep' | 'names' | 'unreadable'}`, v: Record<string, string>) => string, w: Walk, name: string): string | null {
  if (w.state === 'failed') return t('walk.failed', { name });
  if (w.state !== 'refused') return null;
  return t(`walk.${w.why}`, { name, entries: WALK_MAX_ENTRIES.toLocaleString('en-US'), folders: String(WALK_MAX_FOLDERS) });
}

/** A held copy/move's Check again (reads only), for the held-changes band: it cannot send. */
export function useTransferCheck(kind: TransferKind): { readBack: (only?: { hold: string }) => Promise<boolean>; dismissOne: (identity: unknown, only?: { readonly hold?: string; readonly transition?: { own: boolean } }) => Promise<boolean> } {
  const ch = useFilesChange(kind);
  return { readBack: ch.readBack, dismissOne: ch.dismissOne };
}
