// Download from a link: the folder's one notice for a computer's link downloads
// (how many run, need you or ended, linked to Transfers, where each download is a row with
// its fixed words and actions: never the link, never the program's error text), and the shared parts those rows use:
// useLinkLines (the reads, their 2 s / 10 s pace and the settling), the Check again notes and the warned Stop tracking.
import { Band, Dialog, TextButton, useSearchParam, useStrings } from '@kit';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { FilesComputer } from '../data';
import { displayName, partsOf } from '../logic';
import { forget, ownsHold, settle, stopTracking, useFollowed, useHeldLinks, useLinkEntries, type CheckResult, type HeldLink, type LinkEntry } from './data';
import type { LinkRecord } from './logic';
import strings from './link.strings.en.json';

export const folderName = (c: FilesComputer, folder: string) => (folder === '/' ? c.name : displayName(partsOf(folder).at(-1) ?? folder));
/** Followed downloads are read every 2 s for their first minute, then every 10 s. */
const FAST_MS = 60_000;

/** One computer's link-download lines, as data: this tab's own downloads (each with its record and, when the record
 *  cannot be read now, a re-read), then the held ones this tab is not sending now (from another tab, an earlier load,
 *  or one whose answer was lost here). The folder band (LinkBand) and Transfers' table both draw from it, so the reads,
 *  the 2 s / 10 s pace and the settling of an ended download run once per computer shown, whichever draws them. */
export interface LinkLines {
  readonly mine: readonly { readonly e: LinkEntry; readonly rec: LinkRecord | undefined; readonly retry: (() => void) | null }[];
  readonly held: readonly HeldLink[];
}

export function useLinkLines(c: FilesComputer): LinkLines {
  const mine = useLinkEntries(c.id);
  const held = useHeldLinks(c.id);
  const followed = mine.filter((e) => e.state === 'accepted');
  // Judged by the clock at each draw, so a download followed late (Check again) or left alone when a newer one ended is
  // slow as soon as its minute is past. A draw is due at the earliest minute still to come.
  const [, setTick] = useState(0);
  const now = Date.now();
  const fast = followed.some((e) => now - e.at < FAST_MS);
  const due = followed.reduce((n, e) => (e.at + FAST_MS > now ? Math.min(n, e.at + FAST_MS) : n), Infinity);
  // The timer is re-armed while the clock still reads before `due`: set back while it waited, the clock would otherwise
  // leave the band fast with nothing left to draw it at its minute (the redraw finds the same `due`).
  useEffect(() => {
    if (due === Infinity) return undefined;
    let id: ReturnType<typeof setTimeout>;
    const arm = () => {
      id = setTimeout(() => (Date.now() < due ? arm() : setTick((n) => n + 1)), Math.max(0, due - Date.now()));
    };
    arm();
    return () => clearTimeout(id);
  }, [due]);
  const reads = useFollowed(c, followed.map((e) => e.id), fast);
  const records = new Map<string, LinkRecord>();
  reads.forEach((q) => { if (q.data) records.set(q.data.id, q.data); });
  // A followed download whose record cannot be read now (by its index in `followed`): it stays running, never ended.
  const unread = new Map(followed.map((e, i) => [e.id, reads[i]?.isError ? () => void reads[i]?.refetch() : null] as const));
  const ended = [...records.values()].filter((r) => r.status !== 'downloading').map((r) => `${r.id}:${r.status}`).join(',');
  // An end status settles its line (completed is checked against a fresh listing of the folder).
  useEffect(() => { for (const r of records.values()) if (r.status !== 'downloading') void settle(c, r); }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    mine: mine.map((e) => ({ e, rec: records.get(e.id), retry: unread.get(e.id) ?? null })),
    // Held downloads this tab is not sending now: from another tab, an earlier load, or one whose answer was lost here.
    held: held.filter((h) => !h.meta || !ownsHold(h.meta.id)),
  };
}

/** The folder's one notice for this computer's link downloads: how many run, need you or
 *  ended, and a link to Transfers, where each is a row with its own words and actions. It also keeps the reads and the
 *  settling of useLinkLines running while the folder is shown. */
export function LinkBand({ c }: { c: FilesComputer }) {
  const t = useStrings(strings);
  const { mine, held } = useLinkLines(c);
  // The Files tabs' own parameter: See Transfers switches tabs as the tab bar does, keeping the panes.
  const [, setTab] = useSearchParam('tab');
  let running = 0, attention = 0, ended = 0;
  for (const { e } of mine) {
    if (e.state === 'sending' || e.state === 'waiting' || e.state === 'accepted') running += 1;
    else if (e.state === 'done' || e.state === 'cancelled') ended += 1;
    // 'unknown': its hold counts it below; without a hold it was settled elsewhere.
    else if (e.state !== 'unknown') attention += 1;
  }
  for (const h of held) {
    if (h.meta && h.hold.inFlight) running += 1;
    else attention += 1;
  }
  if (running + attention + ended === 0) return null;
  const words = [
    running ? t('notice.running', { count: running }) : '',
    attention ? t('notice.attention', { count: attention }) : '',
    ended ? t('notice.ended', { count: ended }) : '',
  ].filter(Boolean).join(' · ');
  // Only ended ones left: the notice can be dismissed here, as each ended line could; that clears them from Transfers too.
  const clear = running + attention === 0 ? () => { for (const { e } of mine) if (e.state === 'done' || e.state === 'cancelled') forget(e.id); } : undefined;
  return (
    <Band tone={attention ? 'warn' : 'neutral'} size="table" icon="download" onDismiss={clear} actions={<TextButton onPress={() => setTab('transfers')}>{t('notice.open')}</TextButton>} /* noDetails: counts only; each download's words are its Transfers row */>
      {words}
    </Band>
  );
}

export const CHECK_WORDS: Partial<Record<CheckResult, 'check.notFound' | 'check.tooOld' | 'check.failed' | 'check.resent'>> = {
  notFound: 'check.notFound', tooOld: 'check.tooOld', failed: 'check.failed', resent: 'check.resent',
};

/** The last Check again answer per hold, kept outside the line: a resend shows this tab's sending line meanwhile. */
const notes = new Map<string, CheckResult>();
const noteSubs = new Set<() => void>();
export const setNote = (id: string, r: CheckResult) => { notes.set(id, r); noteSubs.forEach((f) => f()); };
const subscribeNotes = (f: () => void) => { noteSubs.add(f); return () => { noteSubs.delete(f); }; };
export const useNote = (id: string): CheckResult | null => useSyncExternalStore(subscribeNotes, () => notes.get(id) ?? null, () => null);

/** The warned Stop tracking: frees the hold (only the version shown, never while a send is out). */
export function StopLink({ c, held, onClose }: { c: FilesComputer; held: HeldLink; onClose: () => void }) {
  const t = useStrings(strings);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const m = held.meta;
  const p = { name: m ? displayName(m.filename) : '?', folder: m ? folderName(c, m.folder) : '/', computer: c.name };
  return (
    <Dialog
      overlayId="files-link-stop"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t('stopTitle')}
      body={t('stopBody', p)}
      size="sm"
      primaryLabel={t('stop')}
      onPrimary={() => { setBusy(true); void stopTracking(held).then((ok) => { setBusy(false); if (ok) onClose(); else setFailed(true); }); }}
      busy={busy}
      outcome={failed ? { kind: 'failed', message: t('stopFailed') } : undefined}
    />
  );
}
