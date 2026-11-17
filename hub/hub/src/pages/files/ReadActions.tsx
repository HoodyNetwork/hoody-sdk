// The read-only actions of one pane's folder: what a row's menu offers beside
// the changes (Preview, Download or Download as .zip, Open in viewer, Open in editor, Find in this folder), the pane's
// Find button, Enter on a file, and the drawers they open. Reads only: a download, the viewer and the editor are plain
// links the browser opens in a new tab (ro.ts); the Hub sends nothing that changes the computer and holds nothing.
// Every action has a menu item or a button; a disabled one says why.
import { Button, IconButton, type RowActionEntry, showToast, useSearchParam, useStrings } from '@kit';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { OW_LABEL_UNITS, useOpenWithEntry, type OwBrowserAction, type OwFile } from '../apps/links';
import { openableArchive } from './archive';
import { Archive } from './Archive';
import archiveStrings from './Archive.strings.en.json';
import { stateOf, type FilesComputer } from './data';
import { ExtractDialog } from './Extract';
import { Find } from './Find';
import { LABEL_MAX, safeLabel } from './label';
import { ALIAS_FIRST, OPEN_KEY, blockedPath, entryOk, joinPath, paneOpenOf, partOk, partsOf, type Entry, type PaneKey, type PaneOpen } from './logic';
import { Preview, type PreviewFile } from './Preview';
import { fileLink, openLink, reservedWebdav, type LinkKind } from './ro';
import strings from './strings.en.json';

export interface ReadActions {
  /** The read-only items of a row's menu, in menu order. */
  rowActions(e: Entry): RowActionEntry[];
  /** Enter on a row: a file opens its preview (folders keep opening in the pane). */
  onFile(e: Entry): void;
  /** The pane bar's Find button; `compact`: its icon only, the label kept as its name and tooltip (a narrow bar). */
  findButton(compact: boolean): ReactNode;
  /** The pane bar's Run here items for the folder shown (Open terminal here, Launch an app here…), in the bar's More
   *  menu; none where nothing runs there. */
  runHereItems(): RowActionEntry[];
  /** The open drawer, if any. */
  overlay: ReactNode;
}

/** A link's one ask of a pane (`?aopen=preview|here`, startHref): the pane, its folder's rows once read, and whether the
 *  folder has answered (read, failed, or not readable at all), after which the ask is acted on or dropped. */
export interface PaneAsk {
  readonly pane: PaneKey;
  readonly entries: readonly Entry[] | undefined;
  readonly settled: boolean;
  /** Files can't prove which computer the link meant (its list is not whole, or names it zero or several times): the ask
   *  is dropped unacted, with one line saying so. */
  readonly unsure?: boolean;
  /** The pane is not drawn (another tab, pane B in one-pane view, the other side on a phone): the ask is dropped
   *  unacted, with one line saying so (after `unsure`'s, which wins). */
  readonly hidden?: boolean;
}

export function useReadActions({ c, path, canChange, onMove, taken = [], ask }: { c: FilesComputer; path: string; canChange: boolean; onMove: (path: string) => void; taken?: readonly string[]; ask?: PaneAsk }): ReadActions {
  const t = useStrings(strings);
  const ta = useStrings(archiveStrings);
  // A drawer belongs to the computer it opened on: another computer in this pane (a pick, a realm switch) shows none.
  type Open = { kind: 'preview'; file: PreviewFile; entry?: Pick<Entry, 'type' | 'exec'> } | { kind: 'find'; base: string } | { kind: 'archive' | 'extract'; file: PreviewFile };
  const [held, setHeld] = useState<(Open & { on: string }) | null>(null);
  const open = held && held.on === c.id ? held : null;
  const setOpen = (o: Open | null) => setHeld(o ? { ...o, on: c.id } : null);

  /** Why a link of this kind can't be built for this path, or null. */
  const whyNot = (p: string, kind: LinkKind): string | null => {
    if (fileLink(c, p, kind)) return null;
    const parts = partsOf(p);
    if (parts.some((x) => x.includes('�'))) return t('name.lossy');
    if (parts.length === 0) return t('ro.top');
    if ((kind === 'zip' || kind === 'download') && ALIAS_FIRST.has(parts[0]!)) return t('ro.alias');
    if (reservedWebdav(parts)) return t('ro.api');
    if (parts.some((x) => !partOk(x))) return t('blocked.name');
    return t('ro.noAddress');
  };
  const linkItem = (id: string, label: string, icon: 'download' | 'external', p: string, kind: LinkKind): RowActionEntry => {
    const why = kind === 'edit' && !canChange ? t('ro.editOff') : whyNot(p, kind);
    return { id, label, icon, isDisabled: !!why, ...(why ? { disabledReason: why } : {}), onAction: () => openLink(fileLink(c, p, kind)) };
  };
  const preview = (e: Entry) => setOpen({ kind: 'preview', file: { path: joinPath(path, e.name), name: e.name, size: e.size }, entry: { ...(e.type ? { type: e.type } : {}), ...(e.exec !== undefined ? { exec: e.exec } : {}) } });

  // Open with: the apps-owned drawer, for this computer while it runs.
  const ow = useOpenWithEntry({ target: { project: { id: c.project_id }, container: { id: c.id, server_name: c.server_name } }, running: stateOf(c) === 'running' });
  // The label is bounded so the launch's stored row name ("‹program› · ‹label›") is never cut later (OW_LABEL_UNITS).
  const owFile = (p: string, name: string, e: Pick<Entry, 'dir' | 'type' | 'exec'>): OwFile => ({ path: p, name, label: safeLabel(name, LABEL_MAX, OW_LABEL_UNITS), type: e.type ?? (e.dir ? 'dir' : 'file'), ...(e.type ? {} : { typeGuessed: true }), ...(e.exec !== undefined ? { exec: e.exec } : {}) });
  const owOpen = (a: Parameters<typeof ow.open>[0]) => { setOpen(null); ow.open(a); };
  const owOff = ow.can ? null : t('ow.off');
  const owItem = (id: string, label: string, icon: 'terminal' | 'apps' | 'play' | 'external', why: string | null, onAction: () => void): RowActionEntry =>
    ({ id, label, icon, opens: true, isDisabled: !!(why ?? owOff), ...(why ?? owOff ? { disabledReason: (why ?? owOff) as string } : {}), onAction });
  const browserOf = (e: Entry, p: string): OwBrowserAction[] => [
    // Preview from the drawer hands over: the drawer closes so the preview shows.
    { id: 'preview', label: t('action.preview'), onPress: () => { ow.close(); preview(e); } },
    ...(['download', 'view', ...(canChange ? ['edit' as const] : [])] as const).map((kind) => ({ id: kind, label: t(`action.${kind}`), isDisabled: !fileLink(c, p, kind), onPress: () => openLink(fileLink(c, p, kind)) })),
  ];
  const owRows = (e: Entry, p: string, why: string | null): RowActionEntry[] => {
    const f = owFile(p, e.name, e);
    if (e.dir) {
      return [
        owItem('ow-here', t('ow.here'), 'terminal', why, () => owOpen({ kind: 'here', dir: f })),
        owItem('ow-apphere', t('ow.appHere'), 'apps', why, () => owOpen({ kind: 'apphere', dir: f })),
        owItem('ow-with', t('ow.openWith'), 'external', why, () => owOpen({ kind: 'choose', file: f })),
      ];
    }
    const last = ow.lastFor(e.name, false);
    // A database's SQLite Studio is a link on this computer, not a launch: offered without the right to run programs.
    const studio = ow.studio(f);
    return [
      ...(studio ? [{ id: 'ow-sqlite', label: t('ow.sqlite'), icon: 'external' as const, isDisabled: !!why, ...(why ? { disabledReason: why } : {}), onAction: () => openLink(studio) }] : []),
      ...(last ? [owItem('ow-last', last.kind === 'tpl' ? t('ow.openIn', { p: last.name }) : t('ow.openInCmd'), 'terminal', why, () => owOpen({ kind: 'last', file: f }))] : []),
      owItem('ow-with', t('ow.openWith'), 'external', why, () => owOpen({ kind: 'choose', file: f, browser: browserOf(e, p) })),
      // A regular file with its execute bit only (a hint; the exec decides). A symlink is never run in v1.
      ...(e.type === 'file' && e.exec === true ? [owItem('ow-run', t('ow.run'), 'play', why, () => owOpen({ kind: 'run', file: f }))] : []),
    ];
  };

  // Archives: Look inside and Extract here… for what the files program opens (archive.ts). Whether
  // extract is on at the computer is read only once the drawer or the dialog opens (Archive.tsx, Extract.tsx), never
  // for every folder shown; here Extract is off only while changes are.
  const extractOff = !canChange ? ta('extract.changesOff') : null;
  const archiveFile = (e: Entry): PreviewFile => ({ path: joinPath(path, e.name), name: e.name, size: e.size });
  const archiveRows = (e: Entry, why: string | null): RowActionEntry[] => (!openableArchive(e.name) ? [] : [
    { id: 'look', label: ta('action.look'), icon: 'eye', opens: true, isDisabled: !!why, ...(why ? { disabledReason: why } : {}), onAction: () => setOpen({ kind: 'archive', file: archiveFile(e) }) },
    { id: 'extract', label: ta('action.extract'), icon: 'download', opens: true, isDisabled: !!(why ?? extractOff), ...(why ?? extractOff ? { disabledReason: (why ?? extractOff) as string } : {}), onAction: () => setOpen({ kind: 'extract', file: archiveFile(e) }) },
  ]);

  const whyClosed = (e: Entry, p: string): string | null => {
    const b = blockedPath(p);
    return !entryOk(e) ? t('name.lossy') : b ? t(`blocked.${b}`) : null;
  };
  const rowActions = (e: Entry): RowActionEntry[] => {
    const p = joinPath(path, e.name);
    if (e.dir) {
      const why = whyClosed(e, p);
      return [
        linkItem('zip', t('action.downloadZip'), 'download', p, 'zip'),
        { id: 'find-in', label: t('action.findBelow'), icon: 'search', opens: true, isDisabled: !!why, ...(why ? { disabledReason: why } : {}), onAction: () => setOpen({ kind: 'find', base: p }) },
        ...(ow.running ? ['-' as const, ...owRows(e, p, why)] : []),
      ];
    }
    const why = whyClosed(e, p);
    return [
      { id: 'preview', label: t('action.preview'), icon: 'eye', opens: true, isDisabled: !!why, ...(why ? { disabledReason: why } : {}), onAction: () => preview(e) },
      linkItem('download', t('action.download'), 'download', p, 'download'),
      linkItem('view', t('action.view'), 'external', p, 'view'),
      linkItem('edit', t('action.edit'), 'external', p, 'edit'),
      ...archiveRows(e, why),
      ...(ow.running ? ['-' as const, ...owRows(e, p, why)] : []),
    ];
  };

  const onFile = (e: Entry) => { if (!e.dir && entryOk(e) && !blockedPath(joinPath(path, e.name))) preview(e); };

  const findButton = (compact: boolean) => {
    const find = () => setOpen({ kind: 'find', base: path });
    return compact
      ? <IconButton size="toolbar" icon="search" label={t('action.find')} onPress={find} />
      : <Button size="toolbar" icon="search" onPress={find}>{t('action.find')}</Button>;
  };

  // The current folder as Open with takes it (the pane bar's Run here ▾).
  const here = (): OwFile => owFile(path, partsOf(path).at(-1) ?? c.name, { dir: true, type: 'dir' });
  const runHereItems = (): RowActionEntry[] => {
    if (!ow.running || blockedPath(path)) return [];
    return [
      { id: 'ow-here', label: t('ow.here'), icon: 'terminal' as const, opens: true, isDisabled: !ow.can, ...(owOff ? { disabledReason: owOff } : {}), onAction: () => owOpen({ kind: 'here', dir: here() }) },
      { id: 'ow-apphere', label: t('ow.appHere'), icon: 'apps' as const, opens: true, isDisabled: !ow.can, ...(owOff ? { disabledReason: owOff } : {}), onAction: () => owOpen({ kind: 'apphere', dir: here() }) },
    ];
  };

  // A link's ask (a chat's path link, startHref), run by PaneAskRun beside the overlay. Both act only on a folder that
  // was listed (`entries`): a folder that failed, is not readable or not running drops the ask unacted. Preview opens only
  // a listed, openable file named by the open row; "here" only opens Open with's Open terminal here, which the person
  // still confirms. Anything else is dropped without an action.
  const act = (what: PaneOpen | null, sel: string | undefined, entries: readonly Entry[] | undefined) => {
    if (!entries) return;
    if (what === 'here') {
      if (ow.running && ow.can && !blockedPath(path)) owOpen({ kind: 'here', dir: here() });
    } else if (what === 'preview') {
      const e = entries.find((x) => x.name === sel);
      if (e && !e.dir && entryOk(e) && !blockedPath(joinPath(path, e.name))) preview(e);
    }
  };

  const overlay = ow.overlay ?? (open?.kind === 'preview'
    ? (
      <Preview
        c={c}
        file={open.file}
        canChange={canChange}
        whyNot={(kind) => whyNot(open.file.path, kind)}
        onClose={() => setOpen(null)}
        {...(openableArchive(open.file.name) ? { archive: { look: () => setOpen({ kind: 'archive', file: open.file }), extract: () => setOpen({ kind: 'extract', file: open.file }), extractOff } } : {})}
        openWith={(decodedText) => {
          // A preview opened from Find has no listing entry: a file, kind unknown (no Run).
          const f = owFile(open.file.path, open.file.name, { dir: false, ...(open.entry?.type ? { type: open.entry.type } : {}), ...(open.entry?.exec !== undefined ? { exec: open.entry.exec } : {}) });
          const e: Entry = { name: open.file.name, dir: false, size: open.file.size, modified: null, lossy: false };
          if (!ow.running) return { top: null, choose: null };
          return { top: ow.top(f, decodedText), choose: ow.can ? () => owOpen({ kind: 'choose', file: f, decodedText, browser: browserOf(e, open.file.path).filter((b) => b.id !== 'preview') }) : null, ...(owOff ? { off: owOff } : {}) };
        }}
      />
    )
    : open?.kind === 'find'
      ? (
        <Find
          c={c}
          base={open.base}
          onOpen={(folder) => { setOpen(null); onMove(folder); }}
          onPreview={(f) => setOpen({ kind: 'preview', file: { path: f.path, name: f.path.slice(f.path.lastIndexOf('/') + 1), size: f.size } })}
          onClose={() => setOpen(null)}
        />
      )
      : open?.kind === 'archive'
        ? <Archive c={c} path={open.file.path} name={open.file.name} extractOff={extractOff} onExtract={() => setOpen({ kind: 'extract', file: open.file })} onClose={() => setOpen(null)} />
        : open?.kind === 'extract'
          ? <ExtractDialog c={c} path={open.file.path} taken={taken} onClose={() => setOpen(null)} />
          : null);

  // The ask's runner keeps the first place, so the overlay changing (the preview it opened) never remounts it.
  return { rowActions, onFile, findButton, runHereItems, overlay: ask ? <><PaneAskRun key="ask" at={`${c.id}|${path}`} ask={ask} act={act} />{overlay}</> : overlay };
}

/** Acts on a link's ask once its pane has answered, then drops it from the address with a replace, so a reload, Back
 *  or a shared copy of the address never asks again. The drop clears only this pane's own parameter on the location as
 *  it is then (useSearchParam's update), so two panes answering together never put the other's ask back. Its own
 *  component: the router is read only where an ask can be. `at` names what was asked about (computer and folder). */
export function PaneAskRun({ at, ask, act }: { at: string; ask: PaneAsk; act?: (what: PaneOpen | null, sel: string | undefined, entries: readonly Entry[] | undefined) => void }) {
  const t = useStrings(strings);
  const [askRaw, setAsk] = useSearchParam(OPEN_KEY[ask.pane]);
  const [sel] = useSearchParam(ask.pane + 'sel');
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (askRaw === undefined) asked.current = null;
    if (askRaw === undefined || !ask.settled) return;
    const key = `${at}|${askRaw}|${sel ?? ''}`;
    if (asked.current === key) return;
    asked.current = key;
    if (ask.unsure) showToast({ id: 'files-ask-which', title: t('ask.whichComputer'), tone: 'warn' /* noDetails: nothing was asked of the API; the link named no computer Files can prove */ });
    else if (ask.hidden) showToast({ id: 'files-ask-hidden', title: t('ask.hidden'), tone: 'warn' /* noDetails: nothing was asked of the API; the pane is not drawn */ });
    else act?.(paneOpenOf(askRaw), sel, ask.entries);
    setAsk(undefined, { replace: true });
  });
  return null;
}
