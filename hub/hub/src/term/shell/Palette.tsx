// Ctrl+K in the terminal: the web palette's sources and matcher (shell/CommandPalette.tsx, shell/search/match.ts).
// Empty field: Recent (what this session ran from here, newest first), This page (its usePageShortcuts rows meant for
// the palette), Pages (with their g-jump), Commands (Lock now while a passcode is set, Open or close Agent with its Alt+J, manifest commands). Typed text:
// one list, best match first: this page's keys, Lock now, pages, commands and, from two letters, the deep index when
// this build carries it. Enter runs the active row (the first match after each change), a click runs a row.
// Every list leaves out what a page's view does not draw now (its manifest searchHide, read by the web's own probes,
// shell/search/hide.tsx): a command that would open nothing (Turn on two-step sign-in while it is on) and a deep place
// the view does not draw. The probes read while the palette is open, the empty field too: its Commands and Recent are
// filtered as well, where the web filters typed results only. While a reader loads, fails or answers null, nothing of
// its page is left out.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { hidesTail, type PageManifest, type SearchHide } from '@kit/page';
import { makeT, useStrings } from '@kit/strings';
import { lockNow, lockSettings } from '@core/shell';
import { askOn } from '@kit/ask';
import { ASK_CHORD } from './keymap';
import { JUMPS } from '../../shell/keys.pure';
import { runPageShortcut, usePageShortcutGroups } from '../../shell/pageShortcuts';
import { servesPath } from '../../shell/pageLinks';
import { prepare, search, type Prepared, type SearchKind } from '../../shell/search/match';
import { loadDeep } from '../../shell/search/deep';
import { SearchHideProbes } from '../../shell/search/hide';
import type { DeepEntry } from '../../shell/search/types';
import shellStrings from '../../shell/strings.en.json';
import strings from './strings.en.json';
import { Text, useTerminalSize } from '../prim';
import { firstPickable, LineView, listMove, Modal, PickList, type PickItem, useLineEdit, MODAL_HEAD_ROWS } from './layer';
import type { HubKey } from './hubKey';

interface Entry {
  id: string;
  kind: SearchKind;
  label: string;
  to: string;
  keywords: string;
  jump?: readonly string[];
  where?: string;
  under?: string;
  body?: string;
  /** A manifest command's page id and command id, read against the page's searchHide `commands`. */
  cmd?: { page: string; id: string };
  /** A deep entry's page id and tail (after the page's path), read against the page's searchHide. */
  deep?: { page: string; tail: string };
}

const LOCK_NOW = 'lock:now';
const ASK_TOGGLE = 'shell:ask';
const RESULTS = 50;
const DEEP_FROM = 2;
const RECENT_MAX = 5;

/** What this session ran from the palette, newest first (ids; a palette per shell keeps its own). */
export interface Recents { ids: string[] }
/** The id prefix of a row in the Recent section (the entry's own id follows it). */
const RECENT = 'recent:';

export interface PaletteProps {
  pages: readonly PageManifest[];
  open: boolean;
  onClose: () => void;
  go: (to: string) => void;
  recents: Recents;
  /** Open or close Agent (the Ask dock); absent: no Agent row. */
  onAsk?: () => void;
}

export function Palette({ pages, open, onClose, go, recents, onAsk }: PaletteProps) {
  const t = useStrings(shellStrings);
  const { height } = useTerminalSize();
  const tt = useStrings(strings);
  const edit = useLineEdit();
  const [active, setActive] = useState(0);
  const [deep, setDeep] = useState<readonly DeepEntry[]>([]);
  // Each open starts on an empty field.
  useEffect(() => { if (!open) { edit.set(''); setActive(0); } }, [open]);
  useEffect(() => {
    if (!open || deep.length > 0) return;
    let live = true;
    loadDeep().then((d) => live && setDeep(d), () => {});
    return () => { live = false; };
  }, [open, deep.length]);
  // What each page's view leaves out now, by page id (shell/search/hide.tsx). The probes report while the palette is
  // open and take it back when it closes (their cleanup), so each open starts with nothing left out.
  const [hides, setHides] = useState<Readonly<Record<string, SearchHide>>>({});
  const onHide = useCallback((page: string, hide: SearchHide | null) => {
    setHides((prev) => {
      if (hide === null) {
        if (!(page in prev)) return prev;
        const next = { ...prev };
        delete next[page];
        return next;
      }
      return JSON.stringify(prev[page]) === JSON.stringify(hide) ? prev : { ...prev, [page]: hide };
    });
  }, []);

  const { pageEntries, commandEntries, prepared, deepPrepared } = useMemo(() => {
    const pageEntries: Entry[] = pages.filter((p) => p.nav).map((p) => {
      const pt = makeT(p.strings);
      const key = Object.keys(JUMPS).find((k) => JUMPS[k] === p.id);
      return { id: `page:${p.id}`, kind: 'page', label: pt(p.title), to: p.path, keywords: `${p.id} ${p.nav ? pt(p.nav.label) : ''}`, ...(key ? { jump: ['g', key] } : {}) };
    });
    const commandEntries: Entry[] = pages.flatMap((p) => {
      const pt = makeT(p.strings);
      return (p.commands ?? []).filter((c) => servesPath(pages, c.to ?? p.path)).map((c) => ({
        id: `cmd:${p.id}:${c.id}`, kind: 'command' as const, label: pt(c.label), to: c.to ?? p.path, keywords: [p.id, ...(c.keywords ?? [])].join(' '),
        cmd: { page: p.id, id: c.id },
      }));
    });
    const byId = new Map(pages.map((p) => [p.id, p]));
    const deepEntries: Entry[] = deep.flatMap((d, i) => {
      const p = byId.get(d.page);
      if (!p) return [];
      const to = `${p.path}${d.to}`;
      if (!servesPath(pages, to)) return [];
      const title = makeT(p.strings)(p.title);
      return [{ id: `deep:${i}`, kind: d.kind, label: d.label, to, keywords: '', ...(d.under ? { under: d.under } : {}), body: d.words, where: d.under ? `${title} · ${d.under}` : title, deep: { page: d.page, tail: d.to } }];
    });
    return { pageEntries, commandEntries, prepared: [...pageEntries, ...commandEntries].map(prepare), deepPrepared: deepEntries.map(prepare) };
  }, [pages, deep]);

  const pageKeys = usePageShortcutGroups().flatMap((g) => g.rows.filter((r) => r.palette));
  const lockable = open && lockSettings() !== null;
  const typed = edit.value.trim();
  const keyEntries: Entry[] = pageKeys.map((r) => ({ id: `key:${r.id}`, kind: 'command', label: r.label, to: '', keywords: '', jump: r.alts[0] }));
  const lockEntry: Entry = { id: LOCK_NOW, kind: 'command', label: t('lock.now'), to: '', keywords: 'passcode' };
  const askEntry: Entry | null = onAsk && askOn() ? { id: ASK_TOGGLE, kind: 'command', label: t('keys.ask'), to: '', keywords: 'agent ask chat', jump: [ASK_CHORD] } : null;
  const shellCmds = [...(lockable ? [lockEntry] : []), ...(askEntry ? [askEntry] : [])];
  // Not left out by its page's searchHide now (a manifest command or a deep place; every other row always shows).
  const shown = (e: Entry): boolean =>
    !(e.cmd && hides[e.cmd.page]?.commands?.includes(e.cmd.id)) && !(e.deep && hidesTail(hides[e.deep.page], e.deep.tail));
  const all = new Map<string, Entry>([...pageEntries, ...commandEntries, ...keyEntries, lockEntry, ...(askEntry ? [askEntry] : []), ...deepPrepared.map((p) => p.item)].map((e) => [e.id, e]));

  const items: PickItem[] = [];
  const add = (e: Entry, section?: string) => items.push({ id: e.id, label: e.label, ...(e.where ? { detail: e.where } : {}), ...(e.jump ? { keys: e.jump } : {}), ...(section ? { section } : {}) });
  if (typed === '') {
    const recent = recents.ids.map((id) => all.get(id)).filter((e): e is Entry => !!e && shown(e) && (e.id !== LOCK_NOW || lockable) && (e.id !== ASK_TOGGLE || !!askEntry));
    // A Recent row is its own row: the same entry is listed again below (Pages, Commands), and a list keys its rows
    // by id (two rows with one id is a React key clash, and one of them may be dropped).
    recent.forEach((e, i) => add({ ...e, id: RECENT + e.id }, i === 0 ? tt('palette.recent') : undefined));
    keyEntries.forEach((e, i) => add(e, i === 0 ? t('palette.page') : undefined));
    pageEntries.forEach((e, i) => add(e, i === 0 ? t('palette.pages') : undefined));
    const cmds = [...shellCmds, ...commandEntries.filter(shown)];
    cmds.forEach((e, i) => add(e, i === 0 ? t('palette.commands') : undefined));
  } else {
    const results = search(
      [
        ...keyEntries.map((e) => prepare(e)),
        ...shellCmds.map((e) => prepare(e)),
        ...prepared.filter((p) => shown(p.item)),
        // Before the limit, so a place the page does not draw takes no row a drawn one would get.
        ...(typed.length < DEEP_FROM ? [] : deepPrepared.filter((p) => shown(p.item))),
      ] satisfies Prepared<Entry>[],
      typed,
      RESULTS,
    );
    results.forEach((e, i) => add(e, i === 0 ? t('palette.results') : undefined));
  }
  // The active row: the first one after each text change (useEffect below), moved by the arrows.
  const at = active < items.length ? active : firstPickable(items);
  useEffect(() => { setActive(0); }, [typed]);

  const runAt = (i: number) => {
    const item = items[i];
    if (!item) return;
    const e = all.get(item.id.startsWith(RECENT) ? item.id.slice(RECENT.length) : item.id);
    if (!e) return;
    recents.ids = [e.id, ...recents.ids.filter((x) => x !== e.id)].slice(0, RECENT_MAX);
    onClose();
    if (e.id === LOCK_NOW) { lockNow(); return; }
    if (e.id === ASK_TOGGLE) { onAsk?.(); return; }
    // After the palette has closed, so the page's own overlay can open.
    if (e.id.startsWith('key:')) { setTimeout(() => runPageShortcut(e.id.slice(4)), 0); return; }
    go(e.to);
  };

  const onKey = (k: HubKey) => {
    if (k.key === 'Escape') { onClose(); return; }
    // Ctrl+K again closes it: the palette key toggles, as on the web (shell/AppShell.tsx).
    if (k.ctrlKey && !k.altKey && !k.metaKey && k.code === 'KeyK') { onClose(); return; }
    if (k.key === 'Enter') { runAt(at); return; }
    const moved = listMove(k, at, items);
    if (moved !== null) { setActive(moved); return; }
    edit.onKey(k);
  };

  if (!open) return null;
  return (
    <>
      {/* Draw nothing: they read what each page's view leaves out now. */}
      <SearchHideProbes pages={pages} onHide={onHide} />
      <Modal onKey={onKey} title={t('palette.label')} width={76} onClose={onClose} footer={tt('palette.hint')}>
        <LineView edit={edit} placeholder={t('palette.placeholder')} />
        {items.length === 0 ? <Text colour="muted">{'  ' + t('palette.empty')}</Text> : <PickList items={items} active={at} onPick={runAt} onHover={setActive} rows={Math.max(3, Math.min(16, height - 8 - MODAL_HEAD_ROWS))} />}
      </Modal>
    </>
  );
}
