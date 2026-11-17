// The Apps section of Programs (?tab=apps): the apps opened on demand on this computer, with Details as the
// inspector, and "Launch an app" (Find, Options, one Open) in a drawer. The host gives the page header and the
// toolbar (its tab bar and the line that says what each tab is); this section owns the list below them.
//
// URL keys carry an "app" prefix (appq, appf, appsort, apppage, appsel) so they never mix with the Running
// programs tab's own keys; `launch=1` (+ `launchq`) is the drawer open with words typed in.
import type { Target } from '@core';
import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  ListDetailPage,
  StatusPill,
  createColumnHelper,
  useDataView,
  useSearchParam,
  useGo,
  usePageLink,
  useSelection,
  type MenuEntry,
  type PageHeaderProps,
} from '@kit';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LIVE, useFixtureBoard } from '../data';
import { GH_PARAM, LAUNCH_PARAM, LAUNCH_Q } from '../links';
import { type OpenApp, OPEN_FILTERS, heldOpen, marked, openMatches } from '../logic';
import { boardOffer } from '../parts/board';
import { Inspector, headHasAccent } from '../parts/Inspector';
import { isOpening, refresh } from '../parts/live';
import { ops } from '../parts/ops';
import s from '../parts/parts.module.css';
import { TONE, launchOf, opensWord, shortState } from '../parts/words';
import { AppsDialogs } from './Dialogs';
import { FindPane } from './FindPane';
import { useApps } from './useApps';

const openCol = createColumnHelper<OpenApp>();
/** The Action column's width until its controls are measured (useRowPrimaryWidth: null before the fonts are ready): the
 *  kit's default column floor. A first paint before the fonts load may cut a long action; a measured one never. */
const ACTION_FLOOR = 120;
/** URL key prefix of the section's list (see the file comment). */
const APP_PARAM = 'app';
const APP_SEL = `${APP_PARAM}sel`;

export interface AppsSectionProps {
  header: PageHeaderProps;
  /** The host's tab bar and explainer line, above the list. */
  toolbar?: ReactNode;
  /** The computer (undefined: the current one). */
  target?: Target | null | undefined;
}

import { hrefFor, RowPrimary, useRowPrimaryWidth } from './RowPrimary';

export { hrefFor };

export function AppsSection({ header, toolbar, target }: AppsSectionProps) {
  const [selected, select] = useSelection(APP_SEL);
  const [launchParam, setLaunch] = useSearchParam(LAUNCH_PARAM);
  // The words typed into Find live here, never in the URL (they can hold a secret). A link's launchq opens Find
  // with them (first render included) and is taken out of the address at once, in the same history entry.
  const [launchQ, setLaunchQ] = useSearchParam(LAUNCH_Q);
  const [findQ, setFindQ] = useState(launchQ === undefined ? '' : String(launchQ));
  useEffect(() => {
    if (!launchQ) return;
    setFindQ(String(launchQ));
    setLaunchQ(undefined, { replace: true });
  }, [launchQ, setLaunchQ]);
  const launching = launchParam === '1';
  // From GitHub's Ready step (`gh=`): a program or repository, never typed words (links.ts GH_PARAM).
  const [ghParam, setGh] = useSearchParam(GH_PARAM);
  const gh = ghParam === undefined || ghParam === '' ? undefined : String(ghParam);
  const go = useGo();
  const filesLink = usePageLink('files');
  const showFind = (q?: string) => {
    setFindQ(q ?? '');
    setLaunch('1');
  };
  const closeFind = () => {
    setLaunch(undefined, { replace: true });
    setGh(undefined, { replace: true });
    setFindQ('');
  };
  const a = useApps({
    target,
    nav: {
      selected,
      select,
      // A launch (or the row that holds it back) is selected in the list, and the drawer closes.
      onListed: (key) => {
        closeFind();
        select(key);
      },
      onHeld: (key) => {
        closeFind();
        select(key);
      },
      showFind,
      // Open again from Files: Files on this computer (the file's folder is never stored).
      openFiles: () => {
        if (filesLink) go(filesLink.href);
      },
    },
  });
  const { t, rows, snap, opened, live } = a;
  // Put on Board only where this Hub serves the Board itself (a classic Hub link cannot add a tile): kit
  // followPagePath's rule, and the add link is always a place under /board.
  const boardLink = usePageLink('board');
  /** Put on Board for a row (parts/board.ts): its Board link, the place the Board refuses, or null when it has no place. */
  const fxBoard = useFixtureBoard();
  const boardOf = (r: OpenApp) => (boardLink?.kind !== 'hub' ? null : LIVE ? boardOffer(r, snap.runs.get(r.key), live.target, isOpening(r.key)) : (fxBoard[r.key] ?? null));

  // A row's note shows in its inspector, which the action that set it selects; the row keeps its own action (RowPrimary),
  // so its recovery is never hidden and no sentence is cut to fit a cell.
  // The Action column is as wide as the widest action any row can show (every RowPrimary label in this language), as a
  // fixed px width, the column's kit floor: on the default 120 floor a 139 px "Open display" would
  // run past its cell under the row's ⋯ (axe target-size). Fixed from the words, never the
  // rows, so loaded data moves no drop or list switch. The width is the real controls' own:
  // kit Buttons drawn as RowPrimary draws them, in a probe beside the list, so the case, the
  // tracking and the face (a fallback face for another script, a font that loads late) are theirs, not a canvas guess.
  const { width: measured, probe } = useRowPrimaryWidth(t);
  const actionWidth = measured ?? ACTION_FLOOR;
  const columns = useMemo(
    () => [
      openCol.accessor((r) => r.name, {
        id: 'name',
        header: t('col.name'),
        // In the narrow list the name is line 1 (it truncates first), the state chip sits opposite it.
        meta: { pinned: true, list: 'primary' },
        cell: (c) => (
          <span className={s.nameCell}>
            <span>{c.row.original.name}</span>
            <span className={s.dim}>{c.row.original.source}</span>
          </span>
        ),
      }),
      openCol.accessor((r) => r.state, {
        id: 'state',
        header: t('col.state'),
        meta: { width: '160px', list: 'status' },
        cell: (c) => {
          const v = launchOf(c.row.original, rows);
          return (
            <StatusPill tone={TONE[v.tone]} dot>
              {shortState(t, v.key)}
            </StatusPill>
          );
        },
      }),
      openCol.accessor((r) => r.opensIn, { id: 'opens', header: t('col.opens'), meta: { width: '110px', priority: 2, list: 'meta' }, cell: (c) => opensWord(t, c.row.original.opensIn) }),
      // Priority 1: the row's own action is the last column to drop (Opens and State go first), so a table never draws
      // a row without its recovery. A list row (phones) shows it on line 2 after
      // Opens in: Opens is marked 'meta', so an unmarked column would never reach a list row (kit planList), and the row's
      // recovery would be only in its inspector.
      openCol.display({ id: 'action', header: t('col.action'), meta: { width: `${actionWidth}px`, priority: 1, list: 'meta' }, cell: (c) => <RowPrimary a={a} r={c.row.original} /> }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions go through a.latest
    [t, rows, snap.patches, actionWidth],
  );

  const filters = useMemo(
    () => [
      {
        id: 'f',
        label: t('filter.state'),
        value: (r: OpenApp) => OPEN_FILTERS.filter((f) => openMatches(r, f)),
        options: OPEN_FILTERS.map((f) => ({ value: f, label: t(`filter.${f}` as 'filter.running') })),
      },
    ],
    [t],
  );
  const view = useDataView<OpenApp>({
    rows,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [r.name, r.app ?? ''],
    filters,
    param: APP_PARAM,
    // 50 rows a page, like programs: an Open list seldom passes it, and a long one stays quick to scan.
    pageSize: 50,
    isLoading: opened.isPending && rows.length === 0,
    error: rows.length === 0 ? opened.error : undefined,
  });
  // Live: Stop and Restart need the core's handle (a launch not yet admitted has none)…
  const runningOf = (r: OpenApp): boolean =>
    (r.state === 'running' || r.state === 'ready' || r.state === 'started' || r.state === 'unknown') && (!LIVE || snap.runs.has(r.key)) && (snap.patches.get(r.key)?.busy ?? 'check') === 'check';
  // A record naming another launch is checked only, never stopped.
  const stoppableOf = (r: OpenApp): boolean => runningOf(r) && r.code !== 'foreign_record';
  const rowMenu = (r: OpenApp): MenuEntry[] => {
    // Live: Stop and Restart need the core's handle (a launch not yet admitted has none).
    // ... and not while another action of the row runs.
    const running = runningOf(r);
    const stoppable = stoppableOf(r);
    const board = boardOf(r);
    return [
      { id: 'details', label: t('act.details'), icon: 'info', onAction: () => select(r.key) },
      // Put on Board for every launch with a place; a place the Board refuses stays listed, disabled, with why.
      ...(board && 'refused' in board
        ? [{ id: 'board', label: t('act.board'), icon: 'board' as const, isDisabled: true, disabledReason: t('board.cantTile'), onAction: () => {} }]
        : board
          ? [{ id: 'board', label: t('act.board'), icon: 'board' as const, onAction: () => go(board.to) }]
          : []),
      ...(stoppable ? [{ id: 'stop', label: t('menu.stop'), icon: 'stop' as const, onAction: () => a.setStopping(r) }] : []),
      // Restart for every running app: the API restarts any app it started. Its words promise a new code only to an
      // app that asks for one. A Files launch restarts only through its plan and never while held; without its plan it
      // offers Open again from Files instead.
      ...(running && marked(r) && !r.planned
        ? filesLink ? [{ id: 'files', label: t('act.files'), icon: 'files' as const, onAction: () => a.act(r, 'files') }] : []
        : running && !(marked(r) && heldOpen(r)) ? [{ id: 'restart', label: r.asksCode ? t('act.restart') : t('menu.restart'), icon: 'reload' as const, onAction: () => void a.restart(r) }] : []),
      '-',
      // A leftover terminal's row: the entry is its Remove (it closes that terminal first, useApps).
      { id: 'forget', label: heldOpen(r) ? t('menu.dismiss') : LIVE && snap.runs.get(r.key)?.left ? t('act.remove') : t('menu.forget'), icon: 'trash', tone: 'danger', onAction: () => a.askForget(r) },
    ];
  };

  const launchButton = (
    <Button variant="primary" icon="plus" onPress={() => showFind()}>
      {t('launch.action')}
    </Button>
  );

  const list = (
    <DataTable
      label={t('tab.open')}
      view={view}
      search={t('search')}
      noMatch={t('nomatch.title')}
      columns={columns}
      error={rows.length === 0 ? opened.error : null}
      onRetry={() => void opened.refetch()}
      // Reload: live, every listed launch of this computer is read back; on fixtures the list is read again.
      onRefresh={() => (LIVE ? refresh(live, false) : void opened.refetch())}
      countLabel={(count) => t('count', { count })}
      onRowAction={(r) => select(r.key)}
      activeId={selected}
      actions={rowMenu}
      noViewMenu
      empty={<EmptyState icon="apps" title={t('empty.open.title')} body={t('empty.open.body')} size="sm" action={launchButton} />}
    />
  );

  const current = selected ? rows.find((r) => r.key === selected) : undefined;
  const patchOf = current ? snap.patches.get(current.key) : undefined;
  const cv = current ? launchOf(current, rows) : null;
  const note = current ? a.noteOf(current) : undefined;

  // One accent on the screen: the empty list offers Launch an app itself, so the header leaves it out; an open detail
  // with its own accent (Open) turns the header's into a plain button, still one press away.
  const emptyOffers = rows.length === 0 && !opened.isPending && !opened.error;
  const curHref = current && cv?.primary ? hrefFor(current, cv.primary) : undefined;
  const detailAccent = current !== undefined && cv !== null && headHasAccent(current, cv, curHref);
  const { primary: _hostPrimary, ...plainHeader } = header;
  const pageHeader: PageHeaderProps = emptyOffers
    ? plainHeader
    : detailAccent
      ? { ...plainHeader, actions: <>{header.actions}<Button icon="plus" onPress={() => showFind()}>{t('launch.action')}</Button></> }
      : { ...header, primary: { label: t('launch.action'), icon: 'plus', onPress: () => showFind() } };

  return (
    <>
      {/* The Action column's measure (useRowPrimaryWidth): hidden, inert, out of flow, in the page beside the list. */}
      {probe}
      <ListDetailPage
        mode="side"
        inspectorWidth={440}
        storageKey="apps"
        selectionParam={APP_SEL}
        header={pageHeader}
        toolbar={toolbar}
        list={list}
        detail={
          selected === undefined ? null : current && cv ? (
            <Inspector
              app={current}
              v={cv}
              accessCode={patchOf?.accessCode}
              busy={patchOf?.busy}
              note={note ? t(`note.${note}` as 'note.held') : undefined}
              href={curHref}
              board={boardOf(current)}
              onPrimary={() => cv.primary && a.act(current, cv.primary)}
              onCheck={() => void a.check(current)}
              onRestart={() => void a.restart(current)}
              held={heldOpen(current)}
              onForget={() => a.askForget(current)}
              onStop={stoppableOf(current) ? () => a.setStopping(current) : undefined}
              leftover={LIVE && snap.runs.get(current.key)?.left === true}
              onCodeGone={() => ops.unset(current.key, 'accessCode')}
            />
          ) : (
            <EmptyState icon="apps" title={t('detail.notFound')} size="sm" />
          )
        }
      />
      {/* One drawer at a time (kit): Options from Launch an app replaces it, and its Back returns to it. */}
      <Drawer overlayId="apps-launch" resizeKey="apps-launch" isOpen={launching && !a.options} onOpenChange={(o) => !o && closeFind()} title={t('launch.title')} size="lg">
        {launching && !a.options ? (
          <>
            <FindPane a={a} target={target} initialQ={findQ} onQuery={setFindQ} gh={gh} onGh={(k, o) => setGh(k, o)} />
          </>
        ) : null}
      </Drawer>
      <AppsDialogs a={a} {...(launching ? { optionsBack: () => a.setOptions(null) } : {})} />
    </>
  );
}
