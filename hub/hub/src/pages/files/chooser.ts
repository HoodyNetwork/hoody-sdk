// The Files reads as the kit FileChooser takes them: the shown realm's computers (a computer that is not running is
// listed with the reason and cannot be opened), one folder at a time, the selected file's preview and a search below a
// folder. Reads only, all through the Files page's own reads (data.ts, ro.data.ts) and their bounds; the chooser's root is
// a computer's top folder, so a chooser path is the absolute path without its leading "/". Other pages reach this through
// links.ts.
import { useCallback, useMemo, useState } from 'react';
import {
  useComputerChoice, useShellData, useStrings,
  type ChooserEntry, type ChooserFileRef, type ChooserFindAsk, type ChooserPlace, type ChooserPlaceLink, type ChooserPreviewState, type ChooserReads, type ComputerChoice,
} from '@kit';
import { hasAddress, stateOf, useFilesComputers, useFolder, type FilesComputer } from './data';
import { previewLang } from './lang';
import { blockedPath, partsOf, type Entry } from './logic';
import { findQuery } from './ro';
import { useFind, usePreview } from './ro.data';
import pageStrings from './strings.en.json';
import strings from './chooser.strings.en.json';

/** The absolute path of a chooser path ('' is the top folder, "a/b/" a folder, "a/b/name" a file). */
export const chooserAbs = (path: string): string => '/' + path.replace(/\/+$/u, '');
/** An absolute folder as the chooser's `start` takes it: no leading slash, one trailing slash; the top folder is the empty string. */
export function chooserDir(abs: string): string {
  const parts = partsOf(abs);
  return parts.length ? `${parts.join('/')}/` : '';
}

export interface FileChooserHost {
  reads: ChooserReads;
  /** The shown realm's computers as the chooser lists them; null while the list is read. */
  computers: readonly ComputerChoice[] | null;
  computersStatus: { error?: unknown; onRetry?: () => void } | undefined;
  /** The Files computer of an id the chooser handed back (for the host's own read of a chosen file). */
  computerOf: (id: string) => FilesComputer | undefined;
  /** The places every computer has, for the chooser's side column. */
  places: readonly ChooserPlaceLink[];
}

const entryOf = (e: Entry, lossy: string): ChooserEntry => ({
  name: e.name, dir: e.dir, size: e.size, modified: e.modified,
  ...(e.type === 'symlink' ? { link: true } : {}),
  ...(e.lossy ? { off: lossy } : {}),
});

/** `extra`: a computer the list may not hold yet (a chat's own, known before the list answers). */
export function useFileChooserHost(extra?: FilesComputer): FileChooserHost {
  const t = useStrings(strings);
  const tp = useStrings(pageStrings);
  const list = useFilesComputers();
  const realms = useShellData().realms;
  const choice = useComputerChoice();
  const rows = useMemo(() => {
    if (list.rows === null) return extra ? [extra] : null;
    return extra && !list.rows.some((c) => c.id === extra.id) ? [extra, ...list.rows] : list.rows;
  }, [list.rows, extra]);
  const computers = useMemo(() => rows?.map((c) => {
    const state = stateOf(c);
    // A computer handed in before the list answered has no state yet: it is the one the caller is already using.
    const off = c.status === '' ? undefined : state !== 'running' ? t(`chooser.off.${state}`) : !hasAddress(c) ? t('chooser.off.noAddress') : undefined;
    const realm = realms.find((r) => c.realm_ids?.includes(r.id));
    return choice(c, { ...(realm ? { realm: { name: realm.name, ...(realm.color ? { color: realm.color } : {}) } } : {}), ...(off ? { disabledReason: off } : {}) });
  }) ?? null, [rows, realms, choice, t]);
  const computerOf = useCallback((id: string) => rows?.find((c) => c.id === id), [rows]);

  // ── One folder ──
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const want = useCallback((p: ChooserPlace | null) => setPlace((was) => (was && p && was.computer === p.computer && was.dir === p.dir ? was : p)), []);
  const c = place?.computer ? computerOf(place.computer) : undefined;
  const path = chooserAbs(place?.dir ?? '');
  const blocked = place ? blockedPath(path) : null;
  const q = useFolder(c, path, place !== null && !!c);
  const listed = place !== null && c && q.data && q.data.path === path && q.data.computer === c.id ? q.data : null;
  const lossy = t('chooser.lossy');
  const { refetch } = q;
  const folder = useMemo(() => ({
    place: listed ? place : null,
    entries: listed ? listed.entries.map((e) => entryOf(e, lossy)) : [],
    reading: place !== null && !listed && !blocked && !q.isError && !!c,
    failed: place !== null && !listed && !blocked && (q.isError || !c),
    error: q.error,
    ...(blocked ? { blocked: tp(`blocked.${blocked}`) } : {}),
    ...(listed && (listed.hidden ?? 0) > 0 ? { hidden: listed.hidden } : {}),
    retry: () => { void refetch(); },
  }), [listed, place, blocked, q.isError, q.error, c, lossy, tp, refetch]);

  // ── The selected file's preview ──
  const [file, setFile] = useState<ChooserFileRef | null>(null);
  const wantPreview = useCallback((f: ChooserFileRef | null) => setFile((was) => (was && f && was.computer === f.computer && was.path === f.path ? was : f)), []);
  const pc = file?.computer ? computerOf(file.computer) : undefined;
  const pv = usePreview(pc, chooserAbs(file?.path ?? ''), file?.name ?? '', file !== null && !!pc);
  const preview = useMemo(() => {
    const st = pv.state;
    const state: ChooserPreviewState = st.kind === 'loading' ? { kind: 'loading' }
      : st.kind === 'image' ? { kind: 'image', url: st.url }
        : st.kind === 'text' ? (st.lines === 0 ? { kind: 'none', why: t('chooser.preview.empty') } : { kind: 'text', text: st.text, more: st.more, lang: previewLang(file?.name ?? '', st.text) })
          : st.kind === 'failed' ? { kind: 'failed', error: st.error }
            : { kind: 'none', why: t(`chooser.preview.${st.kind}`) };
    return { of: file, state, want: wantPreview, retry: pv.retry };
  }, [pv.state, pv.retry, file, wantPreview, t]);

  // ── A search below a folder ──
  const [ask, setAsk] = useState<ChooserFindAsk | null>(null);
  const wantFind = useCallback((a: ChooserFindAsk | null) => setAsk(a), []);
  const fc = ask?.computer ? computerOf(ask.computer) : undefined;
  const base = chooserAbs(ask?.dir ?? '');
  const words = ask ? findQuery(ask.query) : null;
  const fq = useFind(fc, base, words ?? '', ask?.round ?? 0, ask !== null && !!fc && words !== null);
  const found = ask !== null && fq.data && fq.data.base === base ? fq.data : null;
  const find = useMemo(() => ({
    of: ask,
    items: found ? found.items.map((e) => {
      const cut = e.path.lastIndexOf('/');
      return { ...entryOf({ ...e, name: e.path.slice(cut + 1) }, lossy), dir_in: chooserDir(e.path.slice(0, cut)) };
    }) : [],
    reading: ask !== null && !found && !fq.isError && words !== null && !!fc,
    failed: ask !== null && !found && (fq.isError || words === null || !fc),
    error: fq.error,
    capped: found?.capped === true,
    off: (p: ChooserPlace) => (partsOf(chooserAbs(p.dir)).length === 0 ? t('chooser.findTop') : blockedPath(chooserAbs(p.dir)) ? tp(`blocked.${blockedPath(chooserAbs(p.dir))!}`) : null),
    want: wantFind,
  }), [ask, found, fq.isError, fq.error, words, fc, lossy, wantFind, t, tp]);

  const reads = useMemo<ChooserReads>(() => ({ folder, want, preview, find }), [folder, want, preview, find]);
  const places = useMemo<ChooserPlaceLink[]>(() => [
    { id: 'home', label: t('chooser.place.home'), dir: 'home/', icon: 'home' },
    { id: 'root', label: t('chooser.place.root'), dir: 'root/', icon: 'account' },
    { id: 'tmp', label: t('chooser.place.tmp'), dir: 'tmp/', icon: 'clock' },
  ], [t]);
  const computersStatus = useMemo(() => (list.failed ? { error: list.error ?? true, onRetry: list.retry } : undefined), [list.failed, list.error, list.retry]);
  return { reads, computers, computersStatus, computerOf, places };
}
