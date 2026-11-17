// FileChooser: the one dialog for choosing files or a folder on a computer. The host reads (ChooserReads: one folder at a
// time, an optional preview and an optional search below a folder); the kit owns everything a person does here:
//   - the computer (the kit ComputerPicker, when the host lists computers): the folder open on each one is kept while
//     the dialog is open, so switching back returns to the same place; a computer that cannot be opened is listed with
//     its reason and cannot be picked;
//   - the place: Up, Back, the folders above as steps (each one opens; a deep path folds its middle steps into one menu),
//     and one box that filters the open folder as it is typed, or, typed with a "/" (or "~" on a host that names the home
//     folder), is a path (its folder is listed, its last part filters; Enter opens the one match, or the folder named);
//   - the side column: the host's places, and the recent places and files this device keeps (`recents`);
//   - the list: kind, name (cut in the middle, the whole name in its tip), size and time; sorted from the header;
//     hidden names on request; a file `accept` refuses is listed with the reason and cannot be chosen;
//   - the modes: `file` (press a file to select it, press it again or Choose to take it), `files` (each press adds to or
//     removes from the chosen files, kept across folders and computers, against the caller's `limits`), `folder` (files are
//     listed but cannot be chosen; Use this folder takes the open one), `any` (a selected file, else the open folder);
//   - keys: arrows move, Enter opens or selects, Backspace goes up, letters jump to a name, Escape closes.
// What is chosen goes to `onChoose` as ChooserResult rows; a promise it returns keeps the dialog busy, and its rejection
// stays in the dialog with its details.
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button as AriaButton, ListBox, ListBoxItem } from 'react-aria-components';
import { IconButton, cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { SrOnly, Tag } from '../data/Display';
import { CodeBlock, type CodeLang } from '../data/Ids';
import { SearchField } from '../forms/fields';
import { pathCrumbs, pathUp } from '../forms/pathPick';
import { formatBytes, formatRelative } from '../format';
import { Icon } from '../icons';
import { Dialog } from '../overlays/Dialog';
import { useInnerWheel } from '../overlays/innerWheel';
import { ActionMenu, type MenuAction } from '../overlays/Menu';
import { useIsPhone } from '../overlays/shared';
import { Notice } from '../states/Band';
import { ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';
import {
  chooserRows, entryIcon, expandHome, foldCrumbs, fullPathOf, hiddenCount, nameParts, pushRecent, readChooserMemory, rememberChooser, samePlace, topPlaces, typedPlace,
  type ChooserEntry, type ChooserFindAsk, type ChooserMemory, type ChooserPlace, type ChooserPlaceLink, type ChooserReads, type ChooserResult, type ChooserSort, type ChooserView, type RecentItem,
} from './fileChooser';
import strings from './FileChooser.strings.en.json';
import s from './FileChooser.module.css';

export type {
  ChooserEntry, ChooserFileRef, ChooserFind, ChooserFindAsk, ChooserFolder, ChooserFound, ChooserPlace, ChooserPlaceLink, ChooserPreview, ChooserPreviewState, ChooserReads, ChooserResult,
} from './fileChooser';

export interface FileChooserProps {
  isOpen: boolean;
  onClose: () => void;
  /** The overlay's name (`data-hub-overlay`), unique on its page. */
  overlayId: string;
  /** What is chosen: one file, several files, a folder, or (`any`) one file or the open folder. */
  mode: 'file' | 'files' | 'folder' | 'any';
  /** The dialog's title; by default "Choose a file", "Choose files" or "Choose a folder". */
  title?: string;
  /** The primary's words ("Attach"); by default "Choose", or "Use this folder". */
  primaryLabel?: string;
  /** The host's reads. Each `want` must keep one identity (useCallback). */
  reads: ChooserReads;
  /** The computers to choose among (the kit ComputerPicker's rows; null while the list is read). Absent: the host has one
   *  place, and the chooser shows no computer. */
  computers?: readonly ComputerChoice[] | null;
  /** The computer list could not be read. */
  computersStatus?: { error?: unknown; onRetry?: () => void };
  /** The computer opened first (the chat's, the page's). */
  current?: string;
  /** How the root reads on a computer ("/", "~", "/srv/shop"). */
  rootLabel: string;
  /** The folder opened first on `current` (or in the one place): '' the root, "a/b/" below it. */
  start?: string;
  /** The home folder under the root ("home/ada/"), when the host knows it: the side column offers it after the top folder,
   *  and "~" typed in the box names it. */
  home?: string;
  /** The computer's name, for a host with one place (no `computers`): the title says where the files are. With
   *  `computers`, the chosen computer's name is used. */
  computerName?: string;
  /** Places the side column offers for a computer, after the top folder. */
  places?: (computer: string | null) => readonly ChooserPlaceLink[];
  /** Why a file cannot be chosen, in words the row shows; null when it can. Asked for files only. */
  accept?: (entry: ChooserEntry) => string | null;
  /** `files` mode: the most files taken, and one line stating the caller's own rules (sizes, kinds). */
  limits?: { maxFiles?: number; note?: string };
  /** A short name (lowercase letters, digits, dashes): recent places and files, and the view, are kept on this device
   *  under it. Without it nothing is kept. */
  recents?: string;
  /** Takes the choice. A returned promise keeps the dialog busy; its rejection is shown here with its details. The host
   *  closes the dialog (onClose is not called for it). */
  onChoose: (picked: readonly ChooserResult[]) => void | Promise<void>;
  /** The host is working on the choice. */
  busy?: boolean;
  /** Why the last choice was refused, in the host's words (too large, not a text file). */
  problem?: string;
  /** The rejection of the host's own read of the choice, shown with its details. */
  error?: unknown;
}

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

export function FileChooser(p: FileChooserProps): ReactNode {
  // Mounted only while open: each opening starts from the caller's computer and folder.
  return p.isOpen ? <Open {...p} /> : null;
}

const keyOf = (computer: string | null) => computer ?? '';

function Open({ onClose, overlayId, mode, title, primaryLabel, reads, computers, computersStatus, current, rootLabel, start: startNow = '', home, computerName, places, accept, limits, recents, onChoose, busy, problem, error }: FileChooserProps) {
  const t = useStrings(strings);
  const phone = useIsPhone();
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
  const listRef = useRef<HTMLDivElement>(null);
  // The entry list takes the wheel while the pointer is on it, also mid-run of the dialog's scroll.
  useInnerWheel(listRef);

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

  const onListKey = (e: KeyboardEvent) => {
    if (e.key !== 'Backspace' || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    if (finding) setAsk(null);
    else if (shown !== '') go(pathUp(shown));
  };

  // The preview follows the selected file while the column shows.
  const previewOn = reads.preview !== undefined && view.preview && mode !== 'folder';
  const previewFile = useMemo(() => (previewOn && cursorRow ? { computer, path: cursorRow.dirIn + cursorRow.e.name, name: cursorRow.e.name } : null), [previewOn, computer, cursorRow?.dirIn, cursorRow?.e.name]); // eslint-disable-line react-hooks/exhaustive-deps -- the row's place and name are the file
  const wantPreview = reads.preview?.want;
  useEffect(() => { wantPreview?.(previewFile); }, [wantPreview, previewFile]);
  useEffect(() => () => wantPreview?.(null), [wantPreview]);

  const crumbs = pathCrumbs(shown);
  const side = sideLinks({ t, places: places?.(computer) ?? [], memory, computer, rootLabel, home, many });
  const fold = foldCrumbs(crumbs.map(([path, part], i) => ({ path, label: i === 0 ? rootLabel : part, last: i === crumbs.length - 1 })));
  const onName = choice?.name ?? (many ? undefined : computerName);
  const upWhy = rootLabel === '/' ? t('fc.upTop') : t('fc.upRoot', { root: rootLabel });
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
    ...(reads.preview && mode !== 'folder' ? [{ id: 'preview', label: t('fc.previewShow'), checked: view.preview, onAction: () => setView({ preview: !view.preview }) }] : []),
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
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title ?? (onName ? t(`fc.titleOn.${mode}`, { computer: onName }) : t(`fc.title.${mode}`))}
      overlayId={overlayId}
      size="xl"
      className={s.dialog}
      primaryLabel={takesFolder ? t('fc.useFolder') : (primaryLabel ?? t('fc.choose'))}
      onPrimary={onPrimary}
      primaryDisabled={primaryOff}
      busy={working}
    >
      {(many || phone) && (
        <div className={s.top}>
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
          {phone && (
            <ActionMenu
              label={t('fc.places')}
              icon="home"
              placement="bottom start"
              items={side.flatMap((g) => g.links.map((l): MenuAction => ({ id: l.id, label: l.label, ...(l.icon ? { icon: l.icon } : {}), description: g.label, onAction: () => (l.recent ? openRecent(l.recent, l.file === true) : go(l.dir)) })))}
            />
          )}
        </div>
      )}
      <div className={cx(s.grid, previewOn && s.withPreview)} data-chooser="">
        {!phone && (
          <div className={s.side} role="group" aria-label={t('fc.side')}>
            {side.map((g) => (
            <div key={g.id} className={s.sideGroup} role="group" aria-label={g.label}>
              <div className={s.sideLabel} aria-hidden="true">{g.label}</div>
              {g.links.map((l) => (
                <AriaButton key={l.id} className={s.sideLink} data-current={!l.recent && l.dir === shown ? '' : undefined} onPress={() => (l.recent ? openRecent(l.recent, l.file === true) : go(l.dir))}>
                  <Icon name={l.icon ?? 'files'} size="sm" />
                  <span className={s.sideText} title={l.title ?? l.label}>{l.label}</span>
                </AriaButton>
              ))}
            </div>
          ))}
          </div>
        )}

        <div className={s.main}>
          <div className={s.whereLine}>
          <div className={s.where} role="group" aria-label={t('fc.where')}>
            <IconButton icon="arrow-up" size="sm" variant="ghost" label={t('fc.up')} isDisabled={shown === '' || place === null} {...(shown === '' && place !== null ? { disabledReason: upWhy } : {})} onPress={() => go(pathUp(shown))} />
            <IconButton icon="arrow-left" size="sm" variant="ghost" label={t('fc.back')} isDisabled={(trail[keyOf(computer)] ?? []).length === 0} disabledReason={t('fc.backNone')} onPress={back} />
            <span className={s.crumbs}>
              {[...fold.head, ...(fold.folded.length ? [null] : []), ...fold.tail].map((c, i) => (
                <span key={c ? c.path : 'fold'} className={s.crumb}>
                  {i > 0 && <Icon name="chevron-right" size="sm" className={s.crumbSep} />}
                  {c === null ? (
                    <ActionMenu label={t('fc.crumbsMore')} items={fold.folded.map((x): MenuAction => ({ id: x.path, label: x.label, onAction: () => go(x.path) }))} />
                  ) : c.last ? <span className={s.mono} aria-current="location">{c.label}</span> : <TextButton literal onPress={() => go(c.path)}>{c.label}</TextButton>}
                </span>
              ))}
            </span>
          </div>
          <ActionMenu label={t('fc.view')} icon="sliders" items={viewItems} />
          </div>

          <div className={s.tools}>
            <SearchField
              label={t('fc.box')}
              placeholder={t('fc.boxPlaceholder')}
              value={text}
              onChange={(v) => { setText(v); setAsk(null); setFull(false); }}
              onSubmit={submitBox}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown') { e.continuePropagation(); return; }
                e.preventDefault();
                listRef.current?.focus();
              }}
              className={s.box}
            />
            {reads.find && (
              <TextButton icon="search" isDisabled={filter === '' || findOff !== null || place === null} disabledReason={findOff ?? t('fc.findNeedsWords')} onPress={startFind}>
                {t('fc.find')}
              </TextButton>
            )}
          </div>

          {finding && (
            <div className={s.findLine} role="status">
              <span className={s.findWords}>{t('fc.findResults', { query: ask.query, folder: fullPathOf(rootLabel, ask.dir) })}</span>
              <TextButton onPress={() => setAsk(null)}>{t('fc.findBack')}</TextButton>
            </div>
          )}

          <div className={s.table}>
          {!finding && (
            <div className={s.head} role="group" aria-label={t('fc.sort')}>
              {(['name', 'size', 'modified'] as const).map((col) => {
                const on = view.sort === col;
                const words = t(`fc.col.${col}`);
                return (
                  <AriaButton key={col} className={cx(s.headCell, col === 'size' && s.col_size, col === 'modified' && s.col_modified)} aria-label={on ? t(view.desc ? 'fc.sortedDown' : 'fc.sortedUp', { column: words }) : t('fc.sortBy', { column: words })} onPress={() => sortBy(col)}>
                    <span aria-hidden="true">{words}</span>
                    {on && <Icon name={view.desc ? 'arrow-down' : 'arrow-up'} size="sm" />}
                  </AriaButton>
                );
              })}
            </div>
          )}

          <div className={s.listWrap} role="presentation" onKeyDown={onListKey}>
            <ListBox
              ref={listRef}
              aria-label={t('fc.entries')}
              className={s.list}
              items={rows}
              dependencies={[cursor, tray, mode, finding]}
              disabledKeys={rows.filter((r) => r.off).map((r) => r.key)}
              onAction={(k) => act(String(k))}
              renderEmptyState={() => (
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
              )}
            >
              {(r: Row) => {
                const current = cursor === r.key && !r.e.dir;
                const chosen = mode === 'files' && !r.e.dir && inTray(r);
                const [head, tail] = nameParts(r.e.name);
                const size = r.e.dir || r.e.size === null || r.e.size === undefined ? '' : formatBytes(r.e.size);
                const when = r.e.modified === null || r.e.modified === undefined ? '' : formatRelative(r.e.modified);
                const said = [r.e.dir ? t('fc.folderRow', { name: r.e.name }) : r.e.name, size, when, current ? t('fc.selected') : '', chosen ? t('fc.chosen') : '', r.why ?? ''].filter(Boolean).join(', ');
                return (
                  <ListBoxItem id={r.key} textValue={r.e.name} aria-label={said} className={s.row} data-current={current ? '' : undefined} data-chosen={chosen ? '' : undefined}>
                    <span className={s.rowIcon}>
                      {chosen ? <Icon name="check" size="sm" /> : <Icon name={entryIcon(r.e)} size="sm" />}
                    </span>
                    <span className={s.rowMain}>
                      <span className={s.rowName} title={r.e.name}>
                        <span className={s.nameHead}>{head}</span>
                        {tail && <span className={s.nameTail}>{tail}</span>}
                        {r.e.link && <Icon name="link" size="sm" className={s.linkMark} label={t('fc.linkMark')} />}
                      </span>
                      {r.why ? <span className={s.rowWhy}>{r.why}</span> : finding && <span className={s.rowWhy}>{t('fc.foundIn', { folder: fullPathOf(rootLabel, r.dirIn) })}</span>}
                    </span>
                    <span className={cx(s.rowCell, s.col_size)}>{size}</span>
                    <span className={cx(s.rowCell, s.col_modified)}>{when}</span>
                  </ListBoxItem>
                );
              }}
            </ListBox>
          </div>
          </div>
          {found?.capped && <div className={s.under}>{t('fc.findCapped')}</div>}
          {!finding && here && (here.hidden ?? 0) > 0 && <div className={s.under}>{t('fc.unshown', { count: here.hidden ?? 0 })}</div>}
        </div>

        {previewOn && reads.preview && (
          <PreviewPane
            t={t}
            file={cursorRow ? { name: cursorRow.e.name, size: cursorRow.e.size ?? null, modified: cursorRow.e.modified ?? null, full: fullPathOf(rootLabel, cursorRow.dirIn + cursorRow.e.name) } : null}
            state={previewFile && reads.preview.of && reads.preview.of.path === previewFile.path && reads.preview.of.computer === previewFile.computer ? reads.preview.state : { kind: 'loading' }}
            onRetry={reads.preview.retry}
          />
        )}

        {mode === 'files' && (
          <div className={s.tray} role="group" aria-label={t('fc.tray')}>
            <span className={s.trayCount} role="status">{max !== undefined ? t('fc.trayOf', { count: tray.length, max }) : t('fc.trayCount', { count: tray.length })}</span>
            {tray.map((x) => (
              <Tag key={(x.computer?.id ?? '') + '\n' + x.path} onRemove={() => { setTray(tray.filter((y) => !sameResult(x, y))); setFull(false); }}>
                {x.computer && x.computer.id !== computer ? `${x.computer.name}: ${x.fullPath}` : x.fullPath}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {full && max !== undefined && <Notice level="warn" inline>{t('fc.trayFull', { count: max })}</Notice>}
      {limits?.note && <div className={s.under}>{limits.note}</div>}
      {problem && <Notice level="warn" inline><span role="alert">{problem}</span></Notice>}
      {(failure ?? error ?? null) !== null && <ErrorState size="compact" title={t('fc.chooseFailed')} error={failure === true ? undefined : (failure ?? error)} />}
    </Dialog>
  );
}

interface SideLink extends ChooserPlaceLink {
  title?: string;
  recent?: RecentItem;
  file?: boolean;
}
type T = ReturnType<typeof useStrings<typeof strings>>;

/** The side column's groups: places (the top folder, then the host's), recent places, recent files. On a host with
 *  computers a recent entry of another computer names it. */
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
  const line = (words: string) => <div className={s.note}>{words}</div>;
  if (noComputer) return line(t('fc.noComputer'));
  if (outside) return line(t('fc.outside', { root: rootLabel }));
  if (finding && find) {
    if (find.failed) return <div className={s.note}><ErrorState size="compact" title={t('fc.findFailed')} error={find.error} /></div>;
    return find.reading ? <div className={s.note} aria-busy="true">{t('fc.findReading')}</div> : line(t('fc.findNone'));
  }
  if (asked.blocked) return line(asked.blocked);
  if (asked.failed && !asked.reading) return <div className={s.note}><ErrorState size="sm" title={t('fc.failedAt', { path: at })} error={asked.error} onRetry={asked.retry} /></div>;
  if (folder === null) return <div className={s.note} aria-busy="true"><Skeleton rows={5} /><SrOnly>{t('fc.reading')}</SrOnly></div>;
  if (folder.entries.length === 0) return line(t('fc.empty'));
  if (filter !== '') return line(t('fc.noMatch', { filter }));
  if (!hidden && hiddenCount(folder.entries) === folder.entries.length) return line(t('fc.hiddenOnly'));
  return line(mode === 'folder' ? t('fc.noFolders') : t('fc.empty'));
}

/** The selected file: its name, size, time and whole path, then its first lines or its picture. */
function PreviewPane({ t, file, state, onRetry }: { t: T; file: { name: string; size: number | null; modified: number | null; full: string } | null; state: NonNullable<ChooserReads['preview']>['state']; onRetry?: () => void }): ReactNode {
  // A text file of no known kind shows as typed.
  const lang: CodeLang = state.kind === 'text' && state.lang ? state.lang : 'plain';
  return (
    <div className={s.preview} role="group" aria-label={t('fc.preview')}>
      <div className={s.sideLabel} aria-hidden="true">{t('fc.preview')}</div>
      {file === null ? <div className={s.note}>{t('fc.previewHint')}</div> : (
        <>
          <div className={s.previewName} data-literal="">{file.name}</div>
          <div className={s.previewMeta}>{[file.size === null ? t('fc.sizeUnknown') : formatBytes(file.size), file.modified === null ? '' : formatRelative(file.modified)].filter(Boolean).join(' · ')}</div>
          <div className={cx(s.previewPath, s.mono)} data-literal="">{file.full}</div>
          {state.kind === 'loading' ? <Skeleton rows={4} />
            : state.kind === 'image' ? <img className={s.previewImage} src={state.url} alt={t('fc.previewOf', { name: file.name })} />
              : state.kind === 'text' ? (
                <>
                  <CodeBlock code={state.text} label={t('fc.previewOf', { name: file.name })} lang={lang} wrap maxHeight="md" // reason: a file of no known kind shows as typed
                  />
                  {state.more && <div className={s.under}>{t('fc.previewMore')}</div>}
                </>
              ) : state.kind === 'none' ? <div className={s.note}>{state.why}</div>
                : <ErrorState size="compact" title={t('fc.previewFailed')} error={state.error} onRetry={onRetry} />}
        </>
      )}
    </div>
  );
}
