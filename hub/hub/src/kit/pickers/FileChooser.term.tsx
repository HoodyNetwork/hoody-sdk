// FileChooser in the terminal (the web's FileChooser.tsx): the one dialog for choosing files or a folder on a
// computer. The reads, the place kept per computer, the modes, the chosen files and what a choice sends are the web
// file's own rules, kept line for line: a change to them there is made here too. Drawn as the web's phone layout:
//   Computer [shop-1 ▾]   Places ▾
//   ↑ Up  ← Back  ~ › src › app          View ▾
//   / Filter, or type a path             Find in subfolders
//    ..
//   ›  src
//      README.md                              2.1 KB · 3 days ago
//   2 files chosen  [~/a.txt ×] [~/b.txt ×]
// - Places and the recent places and files are one menu. The view menu holds hidden files and the sort.
// - Keys in the list: ↓/↑ move, Enter or Space opens or selects, Backspace goes up (or ends a search). Opening a folder
//   from the list (a folder row, a search match, Backspace) replaces the rows, so the row that had the focus is gone:
//   the focus comes back to the list once the new rows are drawn, unless the person has put it elsewhere meanwhile.
// - ↓ in the box moves into the list, as on the web.
// - No preview column: the selected file is named by its row.
// - Below the top folder the list starts with "..", the folder above (as Up and Backspace).
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type * as Web from './FileChooser';
import { Box, Pressable, Scroll, Text, useFocusControl, type Focusable, type FocusControl, type Key } from '../../term/prim';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { Tag } from '../data/Display';
import { SearchField } from '../forms/fields';
import { pathCrumbs, pathUp } from '../forms/pathPick';
import { formatBytes, formatRelative } from '../format';
import { Dialog } from '../overlays/Dialog';
import { ActionMenu, type MenuAction } from '../overlays/Menu';
import { Notice } from '../states/Band';
import { ErrorState } from '../states/States';
import { useStrings } from '../strings';
import { ComputerPicker } from './ComputerPicker';
import {
  chooserRows, expandHome, foldCrumbs, fullPathOf, hiddenCount, pushRecent, readChooserMemory, rememberChooser, samePlace, topPlaces, typedPlace,
  type ChooserEntry, type ChooserFindAsk, type ChooserMemory, type ChooserPlace, type ChooserPlaceLink, type ChooserReads, type ChooserResult, type ChooserSort, type ChooserView, type RecentItem,
} from './fileChooser';
import strings from './FileChooser.strings.en.json';

export type {
  ChooserEntry, ChooserFileRef, ChooserFind, ChooserFindAsk, ChooserFolder, ChooserFound, ChooserPlace, ChooserPlaceLink, ChooserPreview, ChooserPreviewState, ChooserReads, ChooserResult,
} from './fileChooser';

export type { FileChooserProps } from './FileChooser';
type FileChooserProps = Web.FileChooserProps;

type Mode = FileChooserProps['mode'];

/** A row of the list: an entry of the open folder, or a match of a search (in `dirIn`). */
interface Row {
  key: string;
  e: ChooserEntry;
  dirIn: string;
  /** Why it cannot be opened or chosen, when a reason is worth a line. */
  why: string | null;
  off: boolean;
}

// Mounted only while open: each opening starts from the caller's computer and folder.
export const FileChooser: typeof Web.FileChooser = (p) => (p.isOpen ? <Open {...p} /> : null);

const keyOf = (computer: string | null) => computer ?? '';

function Open({ onClose, overlayId, mode, title, primaryLabel, reads, computers, computersStatus, current, rootLabel, start: startNow = '', home, computerName, places, accept, limits, recents, onChoose, busy, problem, error }: FileChooserProps) {
  const t = useStrings(strings);
  const many = computers !== undefined;
  // Where this opening started: a host that follows the folder asked for (PathField) never moves it.
  const [start] = useState(startNow);
  const usable = (id: string | undefined) => (id !== undefined && computers?.some((c) => c.id === id && !c.disabledReason) ? id : null);
  const [picked, setPicked] = useState<string | null>(() => usable(current));
  // The caller's computer is opened once the list names it (the list may arrive after the dialog).
  const auto = useRef(picked !== null);
  useEffect(() => {
    if (auto.current || !many || computers === null) return;
    auto.current = true;
    const id = usable(current);
    if (id !== null) setPicked(id);
  }, [computers, current]); // eslint-disable-line react-hooks/exhaustive-deps -- `usable` reads the same list
  const computer = many ? picked : null;
  const choice = computer === null ? undefined : computers?.find((c) => c.id === computer);

  // The folder open on each computer, and the folders gone through there (Back).
  const [dirs, setDirs] = useState<Readonly<Record<string, string>>>({});
  const [trail, setTrail] = useState<Readonly<Record<string, readonly string[]>>>({});
  const dir = dirs[keyOf(computer)] ?? (!many || computer === current ? start : '');
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [tray, setTray] = useState<readonly ChooserResult[]>([]);
  const [full, setFull] = useState(false);
  const [memory, setMemory] = useState<ChooserMemory>(() => readChooserMemory(recents));
  const view = memory.view;
  const [ask, setAsk] = useState<ChooserFindAsk | null>(null);
  const rounds = useRef(0);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // The list's rows by key (the cursor moves among them), and the row the arrows left from.
  const stops = useRef(new Map<string, { current: Focusable | null }>());
  const [at, setAt] = useState<string | null>(null);
  // Set when a folder is opened from the list; the effect after `stop` gives the focus back to the new rows. The
  // dialog's own focus scope (its layer has its own FocusRoot) is read from inside it by DialogFocus.
  const backToList = useRef(false);
  const dialogFocus = useRef<FocusControl | null>(null);

  // What the box means: a filter of the open folder, or a path whose folder is listed while it is typed.
  const asTyped = expandHome(text, rootLabel, home);
  const typed = typedPlace(asTyped, rootLabel);
  const outside = typed === 'outside';
  const typedDir = typed === 'outside' || 'filter' in typed ? null : (asTyped.startsWith(rootLabel.endsWith('/') ? rootLabel : `${rootLabel}/`) ? typed.dir : dir + typed.dir);
  const filter = typed === 'outside' ? '' : 'filter' in typed ? typed.filter : typed.name;
  const shown = typedDir ?? dir;
  const place = useMemo<ChooserPlace | null>(() => (many && computer === null ? null : { computer, dir: shown }), [many, computer, shown]);

  const setView = (next: Partial<ChooserView>) => setMemory((m) => {
    const out = { ...m, view: { ...m.view, ...next } };
    rememberChooser(recents, out);
    return out;
  });

  // One folder is asked for at a time; leaving tells the host to stop.
  const want = reads.want;
  useEffect(() => { want(outside ? null : place); }, [want, place, outside]);
  useEffect(() => () => want(null), [want]);
  const wantFind = reads.find?.want;
  useEffect(() => { wantFind?.(ask); }, [wantFind, ask]);
  useEffect(() => () => wantFind?.(null), [wantFind]);

  const folder = reads.folder;
  const here = !outside && samePlace(folder.place, place) ? folder : null;
  const finding = ask !== null && reads.find !== undefined;
  const found = finding && reads.find!.of !== null && reads.find!.of.round === ask.round && reads.find!.of.query === ask.query ? reads.find! : null;

  const whyOf = (e: ChooserEntry): { why: string | null; off: boolean } => {
    if (e.off) return { why: e.off, off: true };
    if (e.dir) return { why: null, off: false };
    if (mode === 'folder') return { why: null, off: true };
    const no = accept?.(e) ?? null;
    return { why: no, off: no !== null };
  };
  const rows = useMemo<Row[]>(() => {
    if (finding) return (found?.items ?? []).map((e) => ({ key: e.dir_in + e.name, e, dirIn: e.dir_in, ...whyOf(e) }));
    return here ? chooserRows(here.entries, shown, view, filter).map((e) => ({ key: e.name, e, dirIn: shown, ...whyOf(e) })) : [];
  }, [finding, found, here, shown, view.sort, view.desc, view.hidden, filter, mode, accept]); // eslint-disable-line react-hooks/exhaustive-deps -- whyOf reads mode and accept
  const cursorRow = cursor === null ? undefined : rows.find((r) => r.key === cursor && !r.e.dir);

  const resultOf = (r: { dirIn: string; e: ChooserEntry } | null): ChooserResult => {
    const path = r === null ? shown : r.dirIn + r.e.name;
    return {
      computer: choice ? { id: choice.id, name: choice.name } : null,
      realm: choice?.realm?.name ?? null,
      path,
      fullPath: fullPathOf(rootLabel, path),
      name: r === null ? (pathCrumbs(shown).at(-1)?.[1] || rootLabel) : r.e.name,
      kind: r === null ? 'folder' : 'file',
      size: r === null ? null : r.e.size ?? null,
    };
  };
  const sameResult = (a: ChooserResult, b: ChooserResult) => a.path === b.path && (a.computer?.id ?? null) === (b.computer?.id ?? null);
  const inTray = (r: Row) => tray.some((x) => sameResult(x, resultOf(r)));

  /** Opens a folder on the computer shown: the box empties, the list starts at its top, a search ends. */
  const go = (to: string, select: string | null = null) => {
    const k = keyOf(computer);
    setTrail((tr) => (to === dir ? tr : { ...tr, [k]: [...(tr[k] ?? []), dir].slice(-50) }));
    setDirs((d) => ({ ...d, [k]: to }));
    setText('');
    setCursor(select);
    setAsk(null);
    setFailure(null);
  };
  const back = () => {
    const k = keyOf(computer);
    const before = trail[k] ?? [];
    const to = before.at(-1);
    if (to === undefined) return;
    setTrail((tr) => ({ ...tr, [k]: before.slice(0, -1) }));
    setDirs((d) => ({ ...d, [k]: to }));
    setText('');
    setCursor(null);
    setAsk(null);
  };
  const switchTo = (id: string) => {
    if (id === computer) return;
    // The folder typed so far is the place kept for the computer left.
    if (typedDir !== null) setDirs((d) => ({ ...d, [keyOf(computer)]: typedDir }));
    setPicked(id);
    setText('');
    setCursor(null);
    setAsk(null);
    setFailure(null);
  };

  const choose = (list: readonly ChooserResult[]) => {
    if (list.length === 0 || sending || busy) return;
    setFailure(null);
    const keep = (m: ChooserMemory): ChooserMemory => {
      let out = m;
      for (const x of [...list].reverse()) {
        const item: RecentItem = { computer: x.computer, path: x.path };
        const folderOfIt: RecentItem = { computer: x.computer, path: x.kind === 'folder' ? x.path : x.path.slice(0, x.path.lastIndexOf('/') + 1) };
        out = { ...out, places: pushRecent(out.places, folderOfIt), ...(x.kind === 'file' ? { files: pushRecent(out.files, item) } : {}) };
      }
      return out;
    };
    let done: void | Promise<void>;
    try { done = onChoose(list); } catch (err) { setFailure(err); return; }
    if (!done || typeof done.then !== 'function') { rememberChooser(recents, keep(memory)); return; }
    setSending(true);
    done.then(
      () => { rememberChooser(recents, keep(memory)); if (alive.current) setSending(false); },
      (err: unknown) => { if (alive.current) { setSending(false); setFailure(err ?? true); } },
    );
  };

  const act = (key: string) => {
    const r = rows.find((x) => x.key === key);
    if (!r || r.off) return;
    if (r.e.dir) { go(r.dirIn + r.e.name + '/'); return; }
    // A match of a search opens its folder with the file selected: it is chosen there, among its neighbours.
    if (finding) { go(r.dirIn, r.e.name); return; }
    if (mode === 'file' || mode === 'any') {
      if (cursor === key) choose([resultOf(r)]);
      else setCursor(key);
      return;
    }
    if (mode !== 'files') return;
    const picked1 = resultOf(r);
    setCursor(key);
    if (tray.some((x) => sameResult(x, picked1))) { setTray(tray.filter((x) => !sameResult(x, picked1))); setFull(false); return; }
    if (limits?.maxFiles !== undefined && tray.length >= limits.maxFiles) { setFull(true); return; }
    setTray([...tray, picked1]);
  };

  /** Enter in the box: a typed folder becomes the open one; one match (or the name typed in full) is opened or selected. */
  const submitBox = () => {
    if (outside) return;
    const exact = rows.find((r) => r.e.name === filter) ?? (rows.length === 1 ? rows[0] : undefined);
    if (exact && !exact.off) {
      if (exact.e.dir) { go(exact.dirIn + exact.e.name + '/'); return; }
      if (typedDir !== null) go(typedDir, exact.key);
      else setCursor(exact.key);
      return;
    }
    if (typedDir !== null && filter === '') go(typedDir);
    // A typed path whose last part names nothing listed: that folder is opened, and the list says when it cannot be.
    else if (typedDir !== null && rows.length === 0 && here !== null) go(`${typedDir}${filter}/`);
  };

  const findOff = reads.find && place ? (reads.find.off?.(place) ?? null) : null;
  const startFind = () => {
    if (!reads.find || !place || filter === '' || findOff) return;
    rounds.current += 1;
    setAsk({ computer, dir: shown, query: filter, round: rounds.current });
    setCursor(null);
  };

  const stopOf = (key: string) => {
    let h = stops.current.get(key);
    if (!h) { h = { current: null }; stops.current.set(key, h); }
    return h;
  };
  const onRowKey = (k: Key, key: string): boolean => {
    const i = rows.findIndex((r) => r.key === key);
    const to = (j: number) => { stops.current.get(rows[Math.max(0, Math.min(rows.length - 1, j))]?.key ?? '')?.current?.focus(); return true; };
    switch (k.name) {
      case 'down': return to(i + 1);
      case 'up': if (i === 0 && parentRow) { parentStop.current?.focus(); return true; } return to(i - 1);
      case 'home': return to(0);
      case 'end': return to(rows.length - 1);
      case 'pagedown': return to(i + 10);
      case 'pageup': return to(i - 10);
      case 'backspace':
        if (finding) { backToList.current = true; setAsk(null); }
        else if (shown !== '') { backToList.current = true; go(pathUp(shown)); }
        return true;
      default: return false;
    }
  };

  const crumbs = pathCrumbs(shown);
  const side = sideLinks({ t, places: places?.(computer) ?? [], memory, computer, rootLabel, home, many });
  const fold = foldCrumbs(crumbs.map(([path, part], i) => ({ path, label: i === 0 ? rootLabel : part, last: i === crumbs.length - 1 })));
  const onName = choice?.name ?? (many ? undefined : computerName);
  const upWhy = rootLabel === '/' ? t('fc.upTop') : t('fc.upRoot', { root: rootLabel });
  // "..": the folder above, first in the list while one is shown below the top folder (not over a search's matches).
  const parentRow = shown !== '' && place !== null && !finding && !outside;
  const parentStop = useRef<Focusable | null>(null);
  const openRecent = (item: RecentItem, file: boolean) => {
    const id = item.computer?.id ?? null;
    if (many && id !== computer) {
      if (usable(id ?? undefined) === null) return;
      setPicked(id);
    }
    const cut = item.path.lastIndexOf('/') + 1;
    const to = file ? item.path.slice(0, cut) : item.path;
    setDirs((d) => ({ ...d, [keyOf(many ? id : null)]: to }));
    setText('');
    setCursor(file ? item.path.slice(cut) : null);
    setAsk(null);
  };

  const sortBy = (col: ChooserSort) => setView(view.sort === col ? { desc: !view.desc } : { sort: col, desc: col !== 'name' });
  const viewItems: MenuAction[] = [
    { id: 'hidden', label: t('fc.hiddenShow'), checked: view.hidden, onAction: () => setView({ hidden: !view.hidden }) },
    ...(['name', 'size', 'modified'] as const).map((col): MenuAction => ({ id: `sort-${col}`, label: t('fc.sortBy', { column: t(`fc.col.${col}`) }), checked: view.sort === col, onAction: () => sortBy(col) })),
  ];

  const working = sending || busy === true;
  const fileReady = cursorRow !== undefined && !cursorRow.off;
  // The open folder is what the primary takes: always in `folder`, and in `any` while no file is selected.
  const takesFolder = mode === 'folder' || (mode === 'any' && !fileReady);
  const canFolder = place !== null && !outside && !folder.blocked && !finding;
  const primaryOff = takesFolder ? !canFolder : mode === 'files' ? tray.length === 0 : !fileReady;
  const onPrimary = () => {
    if (takesFolder) choose([resultOf(null)]);
    else if (mode === 'files') choose(tray);
    else if (cursorRow) choose([resultOf(cursorRow)]);
  };

  const max = limits?.maxFiles;
  const stop = at !== null && rows.some((r) => r.key === at) ? at : cursor !== null && rows.some((r) => r.key === cursor) ? cursor : rows[0]?.key;
  // Back to the list after a folder was opened from it (backToList): the row that had the focus unmounted, so nothing
  // has it; the list's stop (the file a search match selected, else the first row) takes it once rows are drawn.
  useEffect(() => {
    if (!backToList.current || rows.length === 0) return;
    backToList.current = false;
    const scope = dialogFocus.current;
    if (scope !== null && scope.current() === null && stop !== undefined) stops.current.get(stop)?.current?.focus();
  }, [rows, stop]);
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title ?? (onName ? t(`fc.titleOn.${mode}`, { computer: onName }) : t(`fc.title.${mode}`))}
      overlayId={overlayId}
      size="xl"
      primaryLabel={takesFolder ? t('fc.useFolder') : (primaryLabel ?? t('fc.choose'))}
      onPrimary={onPrimary}
      primaryDisabled={primaryOff}
      busy={working}
    >
      <Box dir="column" gap={1} shrink={0}>
        <DialogFocus into={dialogFocus} />
        <Box dir="row" wrap gapX={2} align="center" shrink={0}>
          {many && (
            <ComputerPicker
              label={t('fc.computer')}
              placeholder={t('fc.computerPick')}
              computers={computers ?? undefined}
              value={computer ?? undefined}
              status={computersStatus}
              isDisabled={working}
              onChange={switchTo}
            />
          )}
          <ActionMenu
            label={t('fc.places')}
            icon="home"
            placement="bottom start"
            items={side.flatMap((g) => g.links.map((l): MenuAction => ({ id: l.id, label: l.label, description: g.label, onAction: () => (l.recent ? openRecent(l.recent, l.file === true) : go(l.dir)) })))}
          />
        </Box>

        <Box dir="row" wrap gapX={2} align="center" shrink={0}>
          <Box dir="row" wrap gapX={1} align="center" shrink={1} sem={{ role: 'group', name: t('fc.where') }}>
            <Button variant="ghost" size="sm" isDisabled={shown === '' || place === null} {...(shown === '' && place !== null ? { disabledReason: upWhy } : {})} onPress={() => go(pathUp(shown))}>{t('fc.up')}</Button>
            <Button variant="ghost" size="sm" isDisabled={(trail[keyOf(computer)] ?? []).length === 0} disabledReason={t('fc.backNone')} onPress={back}>{t('fc.back')}</Button>
            {[...fold.head, ...(fold.folded.length ? [null] : []), ...fold.tail].map((c, i) => (
              <Box key={c ? c.path : 'fold'} dir="row" gap={1} shrink={0}>
                {i > 0 && <Text colour="faint" sem={{ hidden: true }}>›</Text>}
                {c === null ? (
                  <ActionMenu label={t('fc.crumbsMore')} items={fold.folded.map((x): MenuAction => ({ id: x.path, label: x.label, onAction: () => go(x.path) }))} />
                ) : c.last ? <Text bold sem={{ current: 'location' }}>{c.label}</Text> : <TextButton literal onPress={() => go(c.path)}>{c.label}</TextButton>}
              </Box>
            ))}
          </Box>
          <ActionMenu label={t('fc.view')} icon="sliders" items={viewItems} />
        </Box>

        <Box dir="row" wrap gapX={2} align="center" shrink={0}>
          <SearchField
            label={t('fc.box')}
            placeholder={t('fc.boxPlaceholder')}
            value={text}
            onChange={(v) => { setText(v); setAsk(null); setFull(false); }}
            onSubmit={submitBox}
            // ↓ moves from the box into the list, as on the web (FileChooser.tsx): onto the list's stop, the row Tab
            // reaches (the first match while a filter is typed).
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown') { e.continuePropagation(); return; }
              e.preventDefault();
              if (stop !== undefined) stops.current.get(stop)?.current?.focus();
            }}
          />
          {reads.find && (
            <TextButton icon="search" isDisabled={filter === '' || findOff !== null || place === null} disabledReason={findOff ?? t('fc.findNeedsWords')} onPress={startFind}>
              {t('fc.find')}
            </TextButton>
          )}
        </Box>

        {finding && (
          <Box dir="row" wrap gapX={2} shrink={0} sem={{ role: 'status' }}>
            <Text colour="muted">{t('fc.findResults', { query: ask.query, folder: fullPathOf(rootLabel, ask.dir) })}</Text>
            <TextButton onPress={() => setAsk(null)}>{t('fc.findBack')}</TextButton>
          </Box>
        )}

        {parentRow && (
          <Pressable
            dir="row"
            gap={1}
            shrink={0}
            handle={parentStop}
            tabStop={rows.length === 0}
            onPress={() => { backToList.current = true; go(pathUp(shown)); }}
            onKey={(k) => {
              if (k.name === 'down' && rows[0]) { stops.current.get(rows[0].key)?.current?.focus(); return true; }
              if (k.name === 'backspace') { backToList.current = true; go(pathUp(shown)); return true; }
              return false;
            }}
            sem={{ role: 'button', name: t('fc.parentRow') }}
          >
            <Text colour="ink" shrink={0} sem={{ hidden: true }}>{PARENT_MARK}</Text>
            <Text colour="ink" sem={{ hidden: true }}>{PARENT_NAME}</Text>
          </Pressable>
        )}
        {rows.length === 0 ? (
          <ListNote
            t={t}
            noComputer={place === null}
            outside={outside || folder.outside === true}
            rootLabel={rootLabel}
            at={fullPathOf(rootLabel, shown).replace(/(.)\/+$/u, '$1')}
            finding={finding}
            find={finding ? { reading: !found || found.reading === true, failed: found?.failed === true, error: found?.error } : null}
            folder={here}
            asked={folder}
            filter={filter}
            mode={mode}
            hidden={view.hidden}
          />
        ) : (
          <Scroll dir="column" maxHeight={LIST_ROWS} followFocus sem={{ role: 'listbox', name: t('fc.entries') }}>
            {rows.map((r) => {
              const current = cursor === r.key && !r.e.dir;
              const chosen = mode === 'files' && !r.e.dir && inTray(r);
              const size = r.e.dir || r.e.size === null || r.e.size === undefined ? '' : formatBytes(r.e.size);
              const when = r.e.modified === null || r.e.modified === undefined ? '' : formatRelative(r.e.modified);
              const name = r.e.name;
              const said = [r.e.dir ? t('fc.folderRow', { name }) : name, size, when, current ? t('fc.selected') : '', chosen ? t('fc.chosen') : '', r.why ?? ''].filter(Boolean).join(', ');
              const under = r.why ?? (finding ? t('fc.foundIn', { folder: fullPathOf(rootLabel, r.dirIn) }) : null);
              return (
                <Pressable
                  key={r.key}
                  dir="column"
                  shrink={0}
                  handle={stopOf(r.key)}
                  tabStop={r.key === stop}
                  onPress={() => { if (!r.off && (r.e.dir || finding)) backToList.current = true; act(r.key); }}
                  onKey={(k) => onRowKey(k, r.key)}
                  onFocusChange={(f) => { if (f) setAt(r.key); }}
                  sem={{ role: 'option', name: said, selected: current || chosen, ...(r.off ? { disabled: true } : {}) }}
                >
                  <Box dir="row" gap={1} shrink={0} sem={{ hidden: true }}>
                    <Text colour={r.off ? 'faint' : 'ink'} shrink={0}>{chosen ? '[x]' : current ? '(•)' : r.e.dir ? ' ▸ ' : '   '}</Text>
                    <Text truncate colour={r.off ? 'faint' : 'ink'} bold={current || chosen}>{name}{r.e.link ? ` (${t('fc.linkMark')})` : ''}</Text>
                    <Box dir="row" grow={1} justify="end" shrink={0}><Text colour="muted">{[size, when].filter(Boolean).join(' · ')}</Text></Box>
                  </Box>
                  {under ? <Box pad={{ left: 4 }} shrink={0} sem={{ hidden: true }}><Text colour="muted" truncate>{under}</Text></Box> : null}
                </Pressable>
              );
            })}
          </Scroll>
        )}
        {found?.capped && <Text colour="muted">{t('fc.findCapped')}</Text>}
        {!finding && here && (here.hidden ?? 0) > 0 && <Text colour="muted">{t('fc.unshown', { count: here.hidden ?? 0 })}</Text>}

        {mode === 'files' && (
          <Box dir="row" wrap gapX={1} align="center" shrink={0} sem={{ role: 'group', name: t('fc.tray') }}>
            <Text colour="muted" sem={{ role: 'status' }}>{max !== undefined ? t('fc.trayOf', { count: tray.length, max }) : t('fc.trayCount', { count: tray.length })}</Text>
            {tray.map((x) => (
              <Tag key={(x.computer?.id ?? '') + '\n' + x.path} onRemove={() => { setTray(tray.filter((y) => !sameResult(x, y))); setFull(false); }}>
                {x.computer && x.computer.id !== computer ? `${x.computer.name}: ${x.fullPath}` : x.fullPath}
              </Tag>
            ))}
          </Box>
        )}

        {full && max !== undefined && <Notice level="warn" inline>{t('fc.trayFull', { count: max })}</Notice>}
        {limits?.note && <Text colour="muted">{limits.note}</Text>}
        {problem && <Notice level="warn" inline>{problem}</Notice>}
        {(failure ?? error ?? null) !== null && <ErrorState size="compact" title={t('fc.chooseFailed')} error={failure === true ? undefined : (failure ?? error)} />}
      </Box>
    </Dialog>
  );
}

/** Rows of the list shown at once; the rest scroll. */
const LIST_ROWS = 14;
/** The ".." row: the folder above, drawn as a path names it. */
const PARENT_MARK = ' ▴ ';
const PARENT_NAME = '..';

interface SideLink extends ChooserPlaceLink {
  title?: string;
  recent?: RecentItem;
  file?: boolean;
}
type T = ReturnType<typeof useStrings<typeof strings>>;

/** The side column's groups: places (the top folder, then the host's), recent places, recent files. On a host with
 *  computers a recent entry of another computer names it. */
/** Hands the dialog's focus scope out: the chooser's body is drawn inside the dialog's FocusRoot, its state outside. */
function DialogFocus({ into }: { into: { current: FocusControl | null } }): null {
  into.current = useFocusControl();
  return null;
}

function sideLinks({ t, places, memory, computer, rootLabel, home, many }: { t: T; places: readonly ChooserPlaceLink[]; memory: ChooserMemory; computer: string | null; rootLabel: string; home: string | undefined; many: boolean }): Array<{ id: string; label: string; links: SideLink[] }> {
  const recent = (list: readonly RecentItem[], file: boolean): SideLink[] => list.filter((x) => (many ? x.computer !== null : x.computer === null)).map((x, i) => {
    const full = fullPathOf(rootLabel, x.path);
    const short = file ? x.path.slice(x.path.lastIndexOf('/') + 1) : (x.path === '' ? rootLabel : x.path.replace(/\/$/u, '').split('/').pop() ?? x.path);
    const label = x.computer && x.computer.id !== computer ? t('fc.recentOn', { name: short, computer: x.computer.name }) : short;
    return { id: `${file ? 'rf' : 'rp'}${i}`, label, dir: x.path, icon: file ? 'file' : 'clock', title: x.computer ? `${x.computer.name}: ${full}` : full, recent: x, file };
  });
  const out = [{ id: 'places', label: t('fc.places'), links: [...topPlaces(rootLabel, home, (k, v) => t(k, v)), ...places] as SideLink[] }];
  const rp = recent(memory.places, false);
  const rf = recent(memory.files, true);
  if (rp.length) out.push({ id: 'recent-places', label: t('fc.recentPlaces'), links: rp });
  if (rf.length) out.push({ id: 'recent-files', label: t('fc.recentFiles'), links: rf });
  return out;
}

/** The line the list shows instead of rows: why there is nothing to choose from. */
function ListNote({ t, noComputer, outside, rootLabel, at, finding, find, folder, asked, filter, mode, hidden }: {
  t: T; noComputer: boolean; outside: boolean; rootLabel: string; at: string; finding: boolean;
  find: { reading: boolean; failed: boolean; error: unknown } | null;
  /** The folder shown (its listing is in), and what the host says of the folder asked for. */
  folder: ChooserReads['folder'] | null; asked: ChooserReads['folder'];
  filter: string; mode: Mode; hidden: boolean;
}): ReactNode {
  const line = (words: string, busy = false) => <Text colour="muted" sem={busy ? { busy: true } : undefined}>{words}</Text>;
  if (noComputer) return line(t('fc.noComputer'));
  if (outside) return line(t('fc.outside', { root: rootLabel }));
  if (finding && find) {
    if (find.failed) return <ErrorState size="compact" title={t('fc.findFailed')} error={find.error} />;
    return find.reading ? line(t('fc.findReading'), true) : line(t('fc.findNone'));
  }
  if (asked.blocked) return line(asked.blocked);
  if (asked.failed && !asked.reading) return <ErrorState size="sm" title={t('fc.failedAt', { path: at })} error={asked.error} onRetry={asked.retry} />;
  if (folder === null) return line(t('fc.reading'), true);
  if (folder.entries.length === 0) return line(t('fc.empty'));
  if (filter !== '') return line(t('fc.noMatch', { filter }));
  if (!hidden && hiddenCount(folder.entries) === folder.entries.length) return line(t('fc.hiddenOnly'));
  return line(mode === 'folder' ? t('fc.noFolders') : t('fc.empty'));
}
