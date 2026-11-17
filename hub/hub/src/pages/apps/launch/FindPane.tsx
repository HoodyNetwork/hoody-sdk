// Launch an app, shared by Programs' drawer (variant 'table'), the Board's Add a program panel
// (variant 'list') and Files' Launch an app here (the Board panel with `cwd`). One subtitle says which computer and how
// a program opens; the mode is Find an app | From GitHub (From GitHub is the GitHubPane, unchanged). Find an app has one
// search and one Category filter (kit FilterChips). Below FIND_MIN letters it shows sections: what was opened recently on
// this computer, the coding agents, the ready-to-install apps by category, Install from GitHub, and where else a typed name is
// looked for. From FIND_MIN letters every source is searched and the results are grouped by where they come from.
// Each row has Open as its one inline action and Options in its ⋯ menu (std row actions); Open goes
// through the launcher's one send (useApps). The words typed are this pane's
// own (not the URL): the pane lives in places whose URLs it must not touch. The search (its pause after typing, the
// catalogue, the sources and their warming retries) is mounted only in Find an app; the words stay here, so the way
// back from From GitHub finds them.
// A host that draws the parts as section cards (`cards`, the Board's Add a program) chooses the mode itself and is
// search-first: with nothing typed it shows the coding agents and Install from GitHub only; the catalogue's entries
// show for typed words alone, and the sources' chips stand in a card after the results.
import { hostEnv, reachOf, type Target } from '@core';
import {
  ActionMenu,
  AnatomySection,
  Button,
  CardGrid,
  PickCard,
  ComputerMark,
  DataTable,
  EmptyState,
  ErrorState,
  FilterChips,
  SearchField,
  Switch,
  SectionGroup,
  SegmentedControl,
  Skeleton,
  StatusPill,
  UnreachableState,
  createColumnHelper,
  matchesSearch,
  useDataView,
  useStrings,
  type RowActionEntry,
  type TableGroup,
} from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AGENTS } from '../agents';
import { CATEGORIES, CATEGORY_OPTIONS, categoryKeeps, categoryOf, type CategoryOption } from '../categories';
import { useCatalog, useFind, useLaunchComputer } from '../data';
import { FIND_MIN, availability, type Item, findNote, findView } from '../logic';
import { SourceStrip } from '../parts/SourceStrip';
import s from '../parts/parts.module.css';
import { type T, opensWord, sourceWord } from '../parts/words';
import strings from '../strings.en.json';
import { GitHubPane } from '../github/GitHubPane';
import { PlainMarks } from '../github/marks';
import { AgentsPane } from './AgentsPane';
import { findOutcome } from './findOutcome';
import { RecentSection } from './RecentSection';
import type { Apps } from './useApps';
import type { LauncherCards } from './AppLauncher';
import l from './launch.module.css';

const findCol = createColumnHelper<Item>();
/** How long typing pauses before the catalogue and the sources are asked (the old server-mode debounce). */
export const FIND_DEBOUNCE_MS = 300;
/** Rows the compact list adds per "Show more". */
const LIST_STEP = 50;

export interface FindPaneProps {
  a: Apps;
  /** The computer searched (undefined: the current one). */
  target?: Target | null | undefined;
  /** The words typed in when the pane opens. */
  initialQ?: string;
  variant?: 'table' | 'list';
  /** The words as typed (the host may keep them, so Back from Options finds them again). */
  onQuery?: (q: string) => void;
  /** Find an app or From GitHub (the host keeps it, so Back from a launch finds the same mode). */
  view?: FindView;
  onView?: (v: FindView) => void;
  /** Launch an app here: the folder every Open runs in (the subtitle says so). */
  cwd?: string | undefined;
  /** From GitHub's Ready step (`gh=`, links.ts GH_PARAM), when the host keeps it in the URL: a key opens From GitHub on
   *  it; leaving From GitHub drops it. */
  gh?: string | undefined;
  onGh?: (key: string | undefined, o?: { replace?: boolean }) => void;
  /** False: the host draws the search field (the Board's Add a program step, one field over its own rows and the apps)
   *  and gives the words as `initialQ`; the pane draws none. */
  search?: boolean;
  cards?: LauncherCards | undefined;
  /** The tiles' "Choose options before opening", kept by the host (it outlives the pane while Options is shown). */
  optionsFirst?: boolean;
  onOptionsFirst?: (on: boolean) => void;
}

/** The pane's mode: find an app (search, sections, results), or install a GitHub repository. */
export type FindView = 'find' | 'github';

/** Where a row was found, for its chip ("Ready to install" for a starter). */
const whereOf = (t: T, i: Item): string => (i.type === 'starter' ? t('src.catalogue') : sourceWord(t, i.provider));

/** Whether a row can be opened from here (an app, sure of how it opens, and a starter that is available). */
const openable = (i: Item): boolean => i.runnable && !i.unsure && (i.type !== 'starter' || i.ready);

/** A result's group from FIND_MIN letters: on this computer, a Hoody app, or a source that downloads it first. */
type ResultGroup = 'installed' | 'hoody' | 'other';
const resultGroupOf = (i: Item): ResultGroup => {
  const v = availability(i);
  return v === 'installed' ? 'installed' : v === 'ready' || v === 'unavailable' ? 'hoody' : 'other';
};

/** The coding agents whose name or program the words name (the four agents are matched by name, never searched),
 *  with the kit's own word match (every word, any order, accents and case folded). */
const agentsNamed = (q: string): string[] => AGENTS.filter((x) => matchesSearch([x.name, x.exe], q)).map((x) => x.id);

export function FindPane({ a, target, initialQ = '', variant = 'table', onQuery, view: viewIn, onView, cwd, gh, onGh, search = true, cards, optionsFirst, onOptionsFirst }: FindPaneProps) {
  const t = useStrings(strings);
  const [viewOwn, setViewOwn] = useState<FindView>('find');
  // A host that shows the parts as cards chooses the mode itself (its own tabs).
  const shown: FindView = cards ? (cards.show === 'github' ? 'github' : 'find') : onGh && gh ? 'github' : (viewIn ?? viewOwn);
  const setShown = (v: FindView) => {
    setViewOwn(v);
    onView?.(v);
    if (v !== 'github' && onGh && gh) onGh(undefined);
  };
  // A key opened From GitHub: it stays the mode once the key is gone (Library takes the key out of the address).
  useEffect(() => {
    if (onGh && gh) setViewOwn('github');
  }, [gh, onGh]);
  const [q, setQState] = useState(initialQ);
  const setQ = (v: string) => {
    setQState(v);
    onQuery?.(v);
  };
  // Words given from outside while open ("Choose a version" searches the app's name) replace the typed ones.
  useEffect(() => {
    setQState(initialQ);
  }, [initialQ]);
  const [category, setCategory] = useState<CategoryOption>('all');
  const computer = useLaunchComputer(target).data ?? null;
  const name = computer?.name || t('launch.thisComputer');

  return (
    <div className={cards ? (shown === 'github' ? l.hosted : l.bare) : variant === 'list' ? `${l.find} ${l.findList}` : l.find}>
      {cards ? null : <p className={l.subtitle}>
        <ComputerMark color={computer?.color} />
        <span>
          {t('launch.subtitle', { computer: name })}
          {cwd ? ` ${t('launch.subtitleHere', { folder: cwd })}` : ''}
        </span>
      </p>}
      {cards ? null : <SegmentedControl<FindView>
        label={t('launch.mode')}
        items={[{ id: 'find', label: t('launch.mode.find') }, { id: 'github', label: t('gh.tab') }]}
        value={shown}
        onChange={setShown}
        fullWidth
      />}
      {shown === 'github' ? (
        <PlainMarks.Provider value={!!cards}>
          <GitHubPane a={a} target={target} {...(onGh ? { ready: gh, onReady: onGh } : {})} compact={!!cards} {...(cards?.onGhText ? { text: cards.ghText ?? '', onText: cards.onGhText, onLibraryCount: cards.onLibraryCount } : {})} />
        </PlainMarks.Provider>
      ) : (
        // A host that draws the field gives its words as they are now (never a render late): results are judged
        // against them (ReadyFind's `fresh`).
        <ReadyFind a={a} target={target} variant={variant} search={search} q={search ? q : initialQ} setQ={setQ} optionsFirst={optionsFirst} onOptionsFirst={onOptionsFirst} category={category} setCategory={setCategory} computer={name} onGitHub={() => (cards?.toGitHub ? cards.toGitHub() : setShown('github'))} cards={cards} />
      )}
    </div>
  );
}

interface ReadyFindProps {
  a: Apps;
  target: Target | null | undefined;
  variant: 'table' | 'list';
  /** Draw the search field (false: the host has it, FindPaneProps.search). */
  search: boolean;
  q: string;
  setQ: (v: string) => void;
  category: CategoryOption;
  setCategory: (c: CategoryOption) => void;
  /** The computer's name as the subtitle says it. */
  computer: string;
  onGitHub: () => void;
  cards?: LauncherCards | undefined;
  optionsFirst?: boolean | undefined;
  onOptionsFirst?: ((on: boolean) => void) | undefined;
}

/** Find an app: the search, the Category filter, then the sections (below FIND_MIN letters) or the grouped results. A
 *  row carries no "ready" chip: a Hoody app is listed, not installed, and its Found in chip already says where it comes
 *  from. */
function ReadyFind({ a: raw, target, variant, search, q, setQ, category, setCategory, computer, onGitHub, cards, optionsFirst, onOptionsFirst }: ReadyFindProps) {
  const t = useStrings(strings);
  const [showAll, setShowAll] = useState(false);
  // The tiles view: a press shows the app's Options before it opens (one switch for the whole kind, no control per
  // tile). The host keeps it (it outlives this part while Options is shown); without one it lasts as long as this part.
  const [optOwn, setOptOwn] = useState(false);
  const optFirst = optionsFirst ?? optOwn;
  const setOptFirst = onOptionsFirst ?? setOptOwn;
  // The sources and the catalogue are asked once typing pauses (the box follows each key); words kept from before
  // are asked at once.
  const [qSent, setQSent] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setQSent(q), FIND_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q]);
  // The results answer the words they were asked for: while the field holds other words (the pause before they are
  // asked), nothing on them opens. Every Open, Options and launch of this part goes through `a.latest` (the table's
  // row actions, the list's buttons and menus, the cards, the host's Enter), so the check sits there, read at the press.
  const asked = useRef(true);
  asked.current = qSent === q;
  const a = useMemo(() => ({ ...raw, latest: heldWhileStale(raw.latest, asked) }), [raw]);
  const catalog = useCatalog(qSent, target);
  const { find, retry } = useFind(qSent, target);
  const starters = useMemo(() => catalog.data ?? [], [catalog.data]);
  const fv = useMemo(() => findView(q, starters, find ?? {}, { all: showAll, pending: catalog.isPending }), [q, starters, find, showAll, catalog.isPending]);
  const list = useMemo(() => fv.list.filter((i) => categoryKeeps(category, i)), [fv.list, category]);
  const long = q.trim().length >= FIND_MIN;
  const note = find ? findNote(fv) : null;
  // The compact list shows LIST_STEP rows at a time; "Show more" reaches the rest. New words start over.
  const [cap, setCap] = useState(LIST_STEP);
  // The compact list's scroll cue (MoreBelow): drawn as this pane's last child, so it sticks to the bottom edge of
  // whatever scrolls the pane, wherever the list sits among the sections above it.
  const [below, setBelow] = useState(false);
  useEffect(() => {
    setCap(LIST_STEP);
  }, [q]);

  const columns = useMemo(
    () => [
      findCol.accessor((i) => i.name, {
        id: 'name',
        header: t('col.name'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => {
          const i = c.row.original;
          return (
            <span className={s.findName} title={[i.detail, i.also.length > 0 ? t('row.also', { source: i.also.map((k) => sourceWord(t, k as 'nix')).join(', ') }) : ''].filter(Boolean).join(' · ') || undefined}>
              <span className={s.findTitle}>{i.name}</span>
              {i.shares ? (
                <span title={t('chip.sharesTip')}>
                  <StatusPill tone="warn">{t('chip.shares')}</StatusPill>
                </span>
              ) : null}
              {i.description ? <span className={s.findDesc}>{i.description}</span> : null}
            </span>
          );
        },
      }),
      // Where each row was found, as a chip: its own column, so a phone row shows it on line 2 beside how it opens.
      findCol.accessor((i) => whereOf(t, i), {
        id: 'source',
        header: t('col.source'),
        meta: { width: '150px', priority: 2, list: 'meta' },
        cell: (c) => <StatusPill>{c.getValue()}</StatusPill>,
      }),
      findCol.accessor((i) => i.opensIn, {
        id: 'opens',
        header: t('col.opens'),
        meta: { width: '140px', priority: 2, list: 'meta' },
        cell: (c) => {
          const i = c.row.original;
          // A starter this Hub cannot launch says so here: the row has no actions to show it (std row actions).
          if (i.type === 'starter' && i.runnable && !i.unsure && !i.ready) return <span className={s.dim}>{t('row.unavailable')}</span>;
          return !i.runnable ? <span className={s.dim}>{t('row.notApp')}</span> : i.unsure ? <span className={s.dim}>{t('row.maybe')}</span> : opensWord(t, i.opensIn);
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions go through a.latest
    [t],
  );

  // The Find list is local (client mode), so the header sorts it. Its rows already answer `q` (the
  // sources searched for it, tags and paths included), so the view keeps every row. Its sort and page keys carry
  // a prefix: the place it is mounted in has its own.
  const view = useDataView<Item>({
    rows: list,
    columns,
    getRowId: (i) => `${i.type}:${i.id}`,
    param: 'find',
    isLoading: catalog.isPending && !find,
  });
  const resultGroups = useMemo<TableGroup[]>(
    () => [
      { id: 'installed', label: t('cat.installed') },
      { id: 'hoody', label: t('src.catalogue') },
      { id: 'other', label: t('launch.group.other') },
    ],
    [t],
  );

  // The catalogue is the computer's run kit: no answer at all is the shared not-reachable state; any other
  // failure is worded from its facts (never "the Hub couldn't reach the server"). Shown while the sources search too.
  const catalogFailed = (size: 'sm' | 'compact') =>
    reachOf(catalog.error) === 'unreachable' ? (
      <UnreachableState size={size} onRetry={() => void catalog.refetch()} retrying={catalog.isFetching} error={catalog.error} />
    ) : (
      <ErrorState title={t('error.catalog.title')} onRetry={() => void catalog.refetch()} error={catalog.error} size={size} />
    );

  const outcome = findOutcome({ q, sent: qSent, searched: !!find, catalog: { failed: !!catalog.error, pending: catalog.isPending }, sources: fv.statuses });
  const empty =
    outcome === 'looking' ? (
      <EmptyState icon="search" title={t('find.looking')} size="sm" />
    ) : outcome === 'none' || outcome === 'unanswered' || outcome === 'partial' ? (
      // A place that did not answer was not searched, and a partial one gave only some of its list: "nothing" is
      // scoped to the places that answered; only 'none' says every place was searched.
      <EmptyState
        icon="search"
        title={t(outcome === 'none' ? 'find.noneTitle' : 'find.noneTitleIncomplete', { q })}
        body={t(outcome === 'none' ? 'find.noneBody' : outcome === 'unanswered' ? 'find.noneSomeFailed' : 'find.nonePartial')}
        size="sm"
      />
    ) : outcome === 'short' ? (
      // Below FIND_MIN only the catalogue is asked: never say the other places were searched.
      <EmptyState icon="search" title={t('find.shortTitle', { q: q.trim() })} body={t('find.shortBody', { min: FIND_MIN })} size="sm" />
    ) : (
      <EmptyState icon="apps" title={t('empty.catalog.title')} body={t('empty.catalog.body')} size="sm" />
    );

  // The Board panel's compact list (variant 'list'): LIST_STEP rows at a time, then "Show more", with its scroll cue.
  const compact = (items: readonly Item[]) => (
    <div className={l.results}>
      <p className={l.total}>{t('find.total', { count: items.length })}</p>
      <ul className={l.list} aria-label={t('tab.find')}>
        {items.slice(0, cap).map((i) => (
          <li key={`${i.type}:${i.id}`} className={l.row}>
            <span className={l.rowText}>
              <span className={l.rowName}>{i.name}</span>
              <span className={l.rowMeta}>
                <StatusPill>{whereOf(t, i)}</StatusPill>
                {!i.runnable ? t('row.notApp') : i.unsure ? t('row.maybe') : i.type === 'starter' && !i.ready ? t('row.unavailable') : opensWord(t, i.opensIn)}
              </span>
            </span>
            <RowActions a={a} i={i} />
          </li>
        ))}
      </ul>
      {items.length > cap ? (
        <Button size="sm" variant="ghost" literal onPress={() => setCap(cap + LIST_STEP)}>
          {t('find.more', { count: Math.min(LIST_STEP, items.length - cap) })}
        </Button>
      ) : null}
      <MoreBelow onBelow={setBelow} />
    </div>
  );

  const chip = {
    id: 'category',
    label: t('cat.label'),
    required: true,
    value: category,
    onChange: (v: string | undefined) => setCategory((CATEGORY_OPTIONS as readonly string[]).includes(v ?? '') ? (v as CategoryOption) : 'all'),
    options: CATEGORY_OPTIONS.map((c) => ({ value: c, label: t(`cat.${c}`), description: t(`cat.${c}.desc`) })),
  };

  // The apps ready to install (the catalogue's starters the words and the category keep), by category.
  const starterGroups = useMemo<TableGroup[]>(() => CATEGORIES.map((c) => ({ id: c, label: t(`cat.${c}`) })), [t]);
  const byCategory = useMemo(() => CATEGORIES.flatMap((c) => list.filter((i) => categoryOf(i.id) === c)), [list]);
  const hoodyApps =
    catalog.error ? (
      catalogFailed('sm')
    ) : catalog.isPending ? null : list.length === 0 ? (
      empty
    ) : variant === 'list' ? (
      // The compact list keeps the category order; its group headings come with the list presentation.
      compact(byCategory)
    ) : (
      <DataTable
        label={t('tab.find')}
        // The same view as the results table, so the header sort (kept in the URL) orders the rows inside each group.
        view={view}
        search={false}
        noViewMenu
        columns={columns}
        bare
        fill={false}
        onRefresh={() => void catalog.refetch()}
        groupBy={(i) => categoryOf(i.id)}
        groups={starterGroups}
        onRowAction={(i) => (openable(i) ? a.latest.current.open(i) : undefined)}
        actions={(i) => findActions(t, a, i)}
      />
    );

  const agentsFor = long ? agentsNamed(q) : undefined;
  const showAgents = (category === 'all' || category === 'agents' || category === 'installed') && (agentsFor === undefined || agentsFor.length > 0);
  const agents = showAgents ? (
    <AnatomySection id="launch-agents" title={t('agents.tab')} info={t('agents.intro')}>
      <AgentsPane a={a} target={target} {...(agentsFor ? { only: agentsFor } : {})} {...(category === 'installed' ? { installedOnly: true } : {})} />
    </AnatomySection>
  ) : null;

  // The host's tabs show how many apps the words keep and how many were opened here.
  const agentN = agentsFor === undefined ? AGENTS.length : agentsFor.length;
  const countApps = (catalog.isPending ? 0 : list.length) + agentN;
  const countRecent = a.rows.length;
  // With nothing typed the list is the whole catalogue: what one press installs.
  const countReady = q.trim() || catalog.isPending || catalog.error ? null : starters.length;
  const onCounts = cards?.onCounts;
  useEffect(() => {
    onCounts?.({ apps: countApps, recent: countRecent, ready: countReady, outcome, q });
  }, [onCounts, countApps, countRecent, countReady, outcome, q]);

  if (cards) {
    const appCard = (i: Item) => (
      <PickCard
        title={i.name}
        mark={cards.letter(i.name)}
        end={!i.runnable ? undefined : <StatusPill>{i.unsure ? t('row.maybe') : i.type === 'starter' && !i.ready ? t('row.unavailable') : opensWord(t, i.opensIn)}</StatusPill>}
        note={i.description || whereOf(t, i)}
      />
    );
    const grid = (id: string, title: string, items: readonly Item[]) =>
      items.length === 0 ? null : (
        <AnatomySection key={id} id={id} title={t('cards.count', { title, count: items.length })}>
          <CardGrid className={cards.grid} label={title} items={items} keyOf={(i) => `${i.type}:${i.id}`} textOf={(i) => i.name} renderCard={appCard} onPick={(k) => { const i = items.find((x) => `${x.type}:${x.id}` === k); if (i && openable(i)) { if (optFirst) a.latest.current.setOptions(i); else a.latest.current.open(i); } }} />
        </AnatomySection>
      );
    const gh = [{ id: 'github' }];
    return (
      <>
        {cards.show !== 'apps' ? <RecentSection a={a} computer={computer} cards={cards} q={q} /> : null}
        {cards.show !== 'recent' ? (
          <>
            {agentN > 0 ? (
              <AnatomySection id="launch-agents" title={t('cards.count', { title: t('agents.tab'), count: agentN })}>
                <AgentsPane a={a} target={target} {...(agentsFor ? { only: agentsFor } : {})} cards={cards} />
              </AnatomySection>
            ) : null}
            {catalog.error ? catalogFailed('sm') : catalog.isPending && q.trim() ? <Skeleton rows={4} /> : null}
            {/* The catalogue is searched, never browsed here: its entries show only for typed words. */}
            {catalog.isPending || !q.trim() ? null : long
              ? resultGroups.map((g) => grid('launch-' + g.id, g.label, list.filter((i) => resultGroupOf(i) === g.id)))
              : grid('launch-hoody', t('launch.hoody'), list)}
            {/* Where the words were looked for, after what they found. */}
            {long && find ? (
              <AnatomySection id="launch-sources" title={t('src.strip')}>
                <div className={l.sources}><SourceStrip view={fv} showAll={showAll} onToggleAll={() => setShowAll(!showAll)} onRetry={(k) => retry(k)} /></div>
              </AnatomySection>
            ) : null}
            {catalog.isPending || !q.trim() || list.length === 0 ? null : (
              <AnatomySection id="launch-options" title={t('act.options')}>
                <Switch label={t('cards.optionsFirst')} description={t('cards.optionsFirst.hint')} isSelected={optFirst} onChange={setOptFirst} />
              </AnatomySection>
            )}
            {cards.show === 'apps' && !q.trim() ? (
              <AnatomySection id="launch-github" title={t('cards.other')}>
                <CardGrid className={cards.grid} label={t('cards.other')} items={gh} keyOf={(x) => x.id} textOf={() => t('cards.github.title')} onPick={onGitHub} renderCard={() => <PickCard title={t('cards.github.title')} mark={cards.mark('github')} note={t('launch.github.body', { computer })} />} />
              </AnatomySection>
            ) : null}
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      {search ? <SearchField label={t('launch.search')} placeholder={t('launch.search')} value={q} onChange={setQ} /> : null}
      <FilterChips filters={[chip]} />
      {!long ? (
        // GitHub never reports empty, so the group's first-use card is only its required fallback.
        <SectionGroup firstUse={{ title: t('launch.firstUse'), body: t('launch.footer'), action: 'none' }}>
          {category === 'all' || category === 'installed' ? <RecentSection a={a} computer={computer} /> : null}
          {agents}
          {category !== 'installed' && category !== 'agents' ? (
            <AnatomySection
              id="launch-hoody"
              title={t('launch.hoody')}
              info={t('avail.ready.tip')}
              // While the catalogue is read the section's own loading state shows; a failure keeps its worded state below.
              state={catalog.isPending && !catalog.error ? { kind: 'loading', rows: 4 } : { kind: 'ready' }}
            >
              {hoodyApps}
            </AnatomySection>
          ) : null}
          {category === 'all' ? (
            <AnatomySection
              id="launch-github"
              title={t('launch.github')}
              description={t('launch.github.body', { computer })}
              actions={{ primary: { id: 'launch-github-choose', label: t('launch.github.action'), onPress: onGitHub } }}
            />
          ) : null}
          {/* Where else a typed name is looked for (Installed: how many letters start that search). */}
          {category !== 'agents' ? (
            <AnatomySection
              id="launch-more"
              title={t('launch.more')}
              description={category === 'installed' ? t('launch.typeMore', { min: FIND_MIN, computer }) : t('launch.footer')}
            />
          ) : null}
        </SectionGroup>
      ) : (
        <>
          {agents}
          {category === 'agents' ? null : catalog.error && !find ? (
            catalogFailed('sm')
          ) : (
            <>
              {catalog.error ? catalogFailed('compact') : null}
              {find ? <SourceStrip view={fv} showAll={showAll} onToggleAll={() => setShowAll(!showAll)} onRetry={(k) => retry(k)} /> : null}
              {/* Nothing found is said by the empty list below, with where it looked; the line above would repeat it. */}
              {note && note.key !== 'none' ? (
                <p className={s.note} role="status" /* reason: a one-line search hint above the list; the sources' outcomes live in SourceStrip */>
                  {t(`find.${note.key}` as 'find.none', { name: q })}
                </p>
              ) : null}
              {variant === 'table' ? (
                <DataTable
                  label={t('tab.find')}
                  view={view}
                  // The words go to the sources through the field above; the table adds no second search.
                  search={false}
                  columns={columns}
                  onRetry={() => void catalog.refetch()}
                  onRefresh={() => (find ? retry() : void catalog.refetch())}
                  countLabel={(count) => t('count', { count })}
                  onRowAction={(i) => (openable(i) ? a.latest.current.open(i) : undefined)}
                  actions={(i) => findActions(t, a, i)}
                  groupBy={resultGroupOf}
                  groups={resultGroups}
                  noViewMenu
                  empty={empty}
                />
              ) : catalog.isPending && !find ? (
                <Skeleton rows={4} />
              ) : list.length === 0 ? (
                empty
              ) : (
                compact(list)
              )}
            </>
          )}
        </>
      )}
      {below ? <span className={l.fade} data-more-below aria-hidden /> : null}
    </>
  );
}

/** The compact list's scroll cue: it marks the list's end and reports whether that end is out of view of the box that
 *  scrolls the list (the Board picker's popover or sheet; the window when nothing inside scrolls), so ReadyFind draws a
 *  fade on that box's bottom edge while rows or "Show more" sit below. Without IntersectionObserver there is no cue,
 *  and nothing else changes. */
function MoreBelow({ onBelow }: { onBelow: (below: boolean) => void }) {
  const end = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = end.current;
    // A terminal has no IntersectionObserver, and even `typeof` of it is a trap there: no cue, as in a browser
    // without one.
    if (!el || hostEnv().browserPage !== true || typeof IntersectionObserver === 'undefined') return;
    let box: HTMLElement | null = el.parentElement;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    // The document's own scroller scrolls as the window does (its scroll events go to the document).
    const root = box && box !== document.scrollingElement && box !== document.body ? box : null;
    // Below only while the end is past the box's bottom edge: an end scrolled above its top (sections follow the list)
    // has nothing of the list left below. An end that moves from one side of the box to the other never intersects,
    // so the edge is read again on every scroll of the box and every size change of the box or of what holds the
    // list, not only when the observer sees it cross.
    const read = () => {
      // The box's scrollport: inside its border and any horizontal scrollbar, as the observer's root bounds.
      const bottom = root ? root.getBoundingClientRect().top + root.clientTop + root.clientHeight : window.innerHeight;
      onBelow(el.getBoundingClientRect().top >= bottom);
    };
    const io = new IntersectionObserver(read, { root });
    io.observe(el);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    if (ro && el.parentElement) ro.observe(el.parentElement);
    if (ro && root) ro.observe(root);
    const scroller: HTMLElement | Window = root ?? window;
    scroller.addEventListener('scroll', read, { passive: true });
    if (!root) window.addEventListener('resize', read);
    return () => {
      io.disconnect();
      ro?.disconnect();
      scroller.removeEventListener('scroll', read);
      if (!root) window.removeEventListener('resize', read);
      onBelow(false);
    };
  }, [onBelow]);
  return <span ref={end} className={l.end} data-list-end aria-hidden />;
}

/** The launcher's handlers as this part's results may use them: Open, Options and launch do nothing while `asked` is
 *  false (the words in the field are not the ones the results answer). Read at the press, never at render. */
function heldWhileStale(latest: Apps['latest'], asked: { readonly current: boolean }): Apps['latest'] {
  return {
    get current() {
      const l = latest.current;
      return {
        ...l,
        open: (...x: Parameters<typeof l.open>) => { if (asked.current) l.open(...x); },
        launch: async (...x: Parameters<typeof l.launch>) => { if (asked.current) await l.launch(...x); },
        setOptions: (...x: Parameters<typeof l.setOptions>) => { if (asked.current) l.setOptions(...x); },
      };
    },
  };
}

/** A Find row's actions (std row actions): Open inline, Options in the row's ⋯ menu; none for what cannot be opened
 *  from here (its Opens cell says why). */
function findActions(t: ReturnType<typeof useStrings<typeof strings>>, a: Apps, i: Item): RowActionEntry[] {
  if (!openable(i)) return [];
  return [
    { id: 'open', label: t('act.open'), inline: true, onAction: () => a.latest.current.open(i) },
    { id: 'options', label: t('act.options'), opens: true, onAction: () => a.latest.current.setOptions(i) },
  ];
}

/** A compact list row's actions: the same two as a table row's, Open as its button and Options in its ⋯ menu. */
function RowActions({ a, i }: { a: Apps; i: Item }) {
  const t = useStrings(strings);
  if (!openable(i)) return null;
  return (
    <span className={s.actions}>
      <Button size="sm" variant="row" onPress={() => a.latest.current.open(i)}>
        {t('act.open')}
      </Button>
      <ActionMenu label={t('act.menu', { name: i.name })} size="sm" items={[{ id: 'options', label: t('act.options'), opens: true, onAction: () => a.latest.current.setOptions(i) }]} />
    </span>
  );
}
