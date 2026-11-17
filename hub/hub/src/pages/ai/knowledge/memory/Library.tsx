// One project's memory: the project's counts, the four stores (Memories, Lessons, Slots, Observations) as one
// server-paged table (the agent pages at most 200), and the open record's detail beside it. Search is the agent's ranked
// search (searchMemory) of the store shown, in the two stores it indexes (memories, observations): its best matches in
// rank order, one page. It does not find every substring match: the agent matches whole words
// and word starts of 3 or more letters, so a part inside a word ("aging" in "staging") or a 1- or 2-letter start finds
// nothing. Rendered only under a status read that says a store resolved (Memory.tsx). The
// realm-wide scope (project '') holds only lessons and slots (the agent keeps memories and observations per project).
import {
  Band, Button, DataTable, EmptyState, ListDetailPage, Meter, StatStrip, Tag, When, createColumnHelper, formatNumber, formatPercent,
  formatRelative, useDataView, useLocationEntry, useSearch, useStrings, type RowActionEntry,
} from '@kit';
import { useHeldChangeOf, type SourceError } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNewMemory } from './Create';
import { useDeleteSelected } from './DeleteMany';
import { MEMORY_DELETE_LOCK, MEMORY_EDIT_LOCK, PAGE_SIZE, SEARCH_PAUSE_MS, type ItemsQuery, type MemoryAt, useItems, useRankedSearch, writable } from './data';
import { Detail } from './Detail';
import { Relations } from './Relations';
import { KINDS, deletesMany, searchable, type ItemRow, type Kind, type MemoryStatus, type ProjectRow } from './logic';
import strings from './Memory.strings.en.json';
import s from './Memory.module.css';

const col = createColumnHelper<ItemRow>();

export interface LibraryProps {
  at: MemoryAt;
  project: string;
  row: ProjectRow | null;
  status: MemoryStatus;
  header: { title: string; subtitle: string; actions?: ReactNode };
  band: ReactNode;
  realm: string;
  projectsError: SourceError | null;
  onRetryProjects: () => void;
  /** The realm-wide scope (project ''): lessons and slots kept for every project. */
  wide?: boolean;
}

/** The stores a scope lists, the first being the one shown by default. */
const WIDE_KINDS: readonly Kind[] = ['lesson', 'slot'];

/** A strength 1..10 as the kit's meter (always neutral: a strength is not a usage); unknown as a dash. */
export function StrengthBar({ n, label, unknown }: { n: number | null; label: string; unknown: string }) {
  if (n === null) return <span>{unknown}</span>;
  return <Meter value={n * 10} label={label} tone="neutral" />;
}

const when = (v: string, unknown: string) => (v ? <When at={v} /> : unknown);

/** The store choice's options: the record stores of the scope, and a project's relation graph (not the realm-wide scope:
 *  the agent keeps a graph per project). One URL key (`kind`) for both tables. */
function useStoreChoice(wide: boolean) {
  const t = useStrings(strings);
  const kinds = wide ? WIDE_KINDS : KINDS;
  return useMemo(() => ({
    label: t('kind'),
    defaultValue: kinds[0]!,
    options: [...kinds, ...(wide ? [] : ['relation' as const])].map((k) => ({ value: k, label: t(`kind.${k}`) })),
  }), [t, kinds, wide]);
}

/** A project's library: the record stores, or its relation graph when that is the store chosen (Relations.tsx). */
export function Library(props: LibraryProps) {
  const choice = useStoreChoice(props.wide ?? false);
  const kind = useSearch().kind;
  const relations = !props.wide && kind === 'relation';
  // The records' applied search, kept across a visit to Relations: Records unmounts there, and the kit keeps a search
  // across a store change only while its view stays mounted. In memory only, never the URL;
  // this project's only (Library is keyed by project).
  const [recordQ, setRecordQ] = useState('');
  // The history entries this library has shown. The store choice replaces the entry (a new key); Back or Forward lands on
  // one already shown, whose own search the kit brings back, an empty one included: the seed is for the store choice
  // only, never over a history entry's own search.
  const entry = useLocationEntry();
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (entry) setSeen((had) => (had.has(entry) ? had : new Set(had).add(entry)));
  }, [entry]);
  const fresh = entry !== '' && !seen.has(entry);
  return relations
    ? <Relations at={props.at} project={props.project} header={props.header} band={props.band} kindFilter={choice} />
    : <Records {...props} choice={choice} searchSeed={fresh ? recordQ : ''} onSearch={setRecordQ} />;
}

interface RecordsProps extends LibraryProps {
  choice: ReturnType<typeof useStoreChoice>;
  /** The search applied when Records last showed (left for Relations), on a store-choice return only ('' on a history
   *  step): brought back on mount unless a link brings one. */
  searchSeed: string;
  onSearch: (q: string) => void;
}

function Records({ at, project, row, status, header, band, realm, projectsError, onRetryProjects, wide = false, choice, searchSeed, onSearch }: RecordsProps) {
  const t = useStrings(strings);
  const kinds = wide ? WIDE_KINDS : KINDS;
  const first = kinds[0]!;
  // The query the shown rows answer: set from the view's query once it is known, so rows never belong to another
  // kind, search or page than the one on screen.
  const [query, setQuery] = useState<ItemsQuery | null>(null);
  // Text in the box: the store's ranked search, never its listing (the listing is read without text).
  const ranked = query !== null && query.q !== '';
  const items = useItems(query && !ranked ? query : null, true);
  const found = useRankedSearch(ranked ? query : null);
  const shown = ranked ? found : items;
  // Which list the rows on screen came from. The table keeps the last rows of its context while a read loads (a page
  // step keeps the listing's), so rows of the other list are never offered to it: a search starts from none (its own
  // rows only), and the listing does too right after a search (until its own answer shows).
  const [rowsFrom, setRowsFrom] = useState<'list' | 'ranked' | null>(null);
  const rowsNow = ranked ? (found.data?.items ?? []) : (items.data?.items ?? (rowsFrom === 'list' ? undefined : []));
  const shownFrom = ranked ? (found.data ? 'ranked' : null) : (items.data ? 'list' : null);
  useEffect(() => {
    if (shownFrom) setRowsFrom(shownFrom);
  }, [shownFrom]);
  const kindOf = (v: string | undefined): Kind => ((kinds as readonly string[]).includes(v ?? '') ? (v as Kind) : first);
  // No column sorts: the agent's list takes no sort order (memories come newest first), so a sorted header would
  // change nothing it reads.
  const columnsFor = useCallback(
    (kind: Kind, byRank: boolean) => {
      // A search's rows come best first: their place is their rank (one page, so the row's index).
      const rank = col.display({ id: 'rank', header: t('col.rank'), meta: { width: '64px', align: 'end', priority: 1, listLabel: true }, cell: (c) => formatNumber(c.row.index + 1) });
      const updated = col.accessor('when', { enableSorting: false, header: t(kind === 'observation' ? 'col.when' : 'col.updated'), meta: { width: '130px', priority: 3 }, cell: (c) => when(c.getValue(), t('unknown')) });
      if (kind === 'memory') {
        return [
          ...(byRank ? [rank] : []),
          col.accessor('type', { enableSorting: false, header: t('col.type'), meta: { width: '140px', priority: 2 }, cell: (c) => (c.getValue() ? <Tag>{c.getValue()}</Tag> : t('unknown')) }),
          col.accessor('text', { enableSorting: false, id: 'text', header: t('col.memory'), meta: { pinned: true } }),
          col.accessor('strength', {
            enableSorting: false,
            header: t('col.strength'),
            meta: { width: '120px', priority: 2 },
            cell: (c) => <StrengthBar n={c.getValue()} label={t('strength', { n: c.getValue() ?? 0 })} unknown={t('unknown')} />,
          }),
          updated,
        ];
      }
      if (kind === 'lesson') {
        return [
          col.accessor('text', { enableSorting: false, id: 'text', header: t('col.lesson'), meta: { pinned: true } }),
          col.accessor('confidence', { enableSorting: false, header: t('col.confidence'), meta: { width: '120px', align: 'end', priority: 2 }, cell: (c) => (c.getValue() === null ? t('unknown') : formatPercent(c.getValue() as number)) }),
          updated,
        ];
      }
      if (kind === 'slot') {
        return [
          col.accessor('name', { enableSorting: false, header: t('col.slot'), meta: { width: '200px', mono: true, priority: 1 } }),
          col.accessor('text', { enableSorting: false, id: 'text', header: t('col.content'), meta: { pinned: true } }),
          updated,
        ];
      }
      // A search hit names no tool (the agent's hit carries the observation's own type, not the tool that made it).
      if (byRank) return [rank, col.accessor('text', { enableSorting: false, id: 'text', header: t('col.observation'), meta: { pinned: true } }), updated];
      return [
        col.accessor('text', { enableSorting: false, id: 'text', header: t('col.observation'), meta: { pinned: true } }),
        col.accessor('type', { enableSorting: false, header: t('col.tool'), meta: { width: '160px', mono: true, priority: 2 } }),
        updated,
      ];
    },
    [t],
  );
  // The store on screen, read from the URL (the kind filter's key, default memory) in the same render: the view's context
  // names it from the first render and on Back/Forward, so a remembered search is recalled under its own store's context
  // and never overwritten under another's. The columns and the rows follow it.
  const kindShown = kindOf(useSearch().kind);
  const columns = useMemo(() => columnsFor(kindShown, ranked), [columnsFor, kindShown, ranked]);
  const current = query && query.kind === kindShown ? query : null;
  const view = useDataView<ItemRow>({
    rows: current ? rowsNow : undefined,
    columns,
    getRowId: (r) => r.id,
    search: searchable(kindShown) ? ['text'] : false,
    filters: [
      {
        id: 'kind',
        label: choice.label,
        display: 'segmented',
        required: true,
        defaultValue: first,
        value: (r) => r.kind,
        options: choice.options,
      },
    ],
    pageSize: PAGE_SIZE,
    // Each search is a fused read on the agent: it is sent once typing pauses (SEARCH_PAUSE_MS), never per keystroke.
    server: { total: shown.data?.total, isLoading: !current || shown.isPending, error: shown.error, debounce: SEARCH_PAUSE_MS },
    // A kind change drops the rows and the open record (an id of one store means nothing in another).
    context: `${project}\u0000${kindShown}`,
  });
  // Back from Relations: the search Records had comes back, once, on mount (an empty box only: a link's ?q= wins);
  // after that every applied search is reported, so the next visit brings back the newest.
  const [seed] = useState(searchSeed);
  const seeded = useRef(seed === '');
  const applied = view.query.q;
  const { setQ } = view;
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      if (applied === '') {
        setQ(seed, { now: true });
        return;
      }
    }
    onSearch(applied);
  }, [applied, seed, setQ, onSearch]);
  const kind = kindOf(view.query.filters.kind);
  const q = searchable(kind) ? view.query.q.trim() : '';
  const page = view.query.page;
  // Another search (or none) picks other rows: a selection made on the rows shown before is dropped, never deleted unseen.
  const { setSelected } = view;
  useEffect(() => {
    setSelected(new Set());
  }, [q, setSelected]);
  useEffect(() => {
    // A search has one page: its page number is always 1.
    setQuery({ ...at, project, kind, q, page: q ? 1 : page });
  }, [at, project, kind, q, page]);
  // A held change's record, opened from the notice once its store is the one shown (after the kind change's reset).
  const [toOpen, setToOpen] = useState<{ kind: Kind; id: string } | null>(null);
  useEffect(() => {
    if (toOpen && toOpen.kind === kindShown) {
      view.open(toOpen.id);
      setToOpen(null);
    }
  }, [toOpen, kindShown, view]);

  const counts = wide
    ? [
      { label: t('tile.lessons'), value: row ? formatNumber(row.lessons) : t('unknown') },
      { label: t('tile.slots'), value: row ? formatNumber(row.slots) : t('unknown') },
    ]
    : [
      { label: t('tile.memories'), value: row ? formatNumber(row.memories) : t('unknown') },
      { label: t('tile.lessons'), value: row ? formatNumber(row.lessons) : t('unknown') },
      { label: t('tile.observations'), value: row ? formatNumber(row.observations) : t('unknown') },
    ];
  const tiles = [
    ...counts,
    {
      label: t('tile.tidy'),
      value:
        status.consolidated?.kind === 'recorded' ? formatRelative(status.consolidated.at)
          : status.consolidated?.kind === 'never' ? t('tile.tidy.never')
            : status.consolidated?.kind === 'unreadable' ? t('tile.tidy.unreadable')
              : t('unknown'),
      detail: status.consolidated?.kind === 'recorded' ? t('tile.tidy.consolidated') : undefined,
    },
  ];
  // New memory: a project's own store (the realm-wide scope keeps no memories), in a store the page writes to. A saved
  // or found memory opens in the Memories list.
  const canCreate = !wide && project !== '' && writable(at);
  const create = useNewMemory(at, project, canCreate, (id) => {
    view.setFilter('kind', first === 'memory' ? undefined : { kind: 'single', value: 'memory' });
    setToOpen({ kind: 'memory', id });
  });
  // Delete selected: the rows picked on the shown page of a store that deletes by id, in a store the page writes to.
  const canDeleteMany = writable(at) && deletesMany(kind) && current !== null;
  const deleteMany = useDeleteSelected(at, project, kind, canDeleteMany, () => view.setSelected(new Set()));
  const actions = (r: ItemRow): readonly RowActionEntry[] => [{ id: 'open', label: t('action.open'), icon: 'arrow-right', onAction: () => view.open(r.id) }];
  const open = view.activeId;
  return (
    <ListDetailPage
      mode="side"
      storageKey="ai-memory"
      header={canCreate ? { ...header, actions: <>{header.actions}{create.action}</> } : header}
      toolbar={
        <div className={s.toolbar}>
          {band}
          {projectsError && !row ? (
            <Band tone="warn" size="table" error={projectsError} actions={<Button size="sm" onPress={onRetryProjects}>{t('retry')}</Button>}>{t('p.error')}</Band>
          ) : null}
          <StatStrip items={tiles} label={header.title} />
          {canCreate && create.notice}
          {deleteMany.notice}
          <HeldNotice
            at={at}
            project={project}
            shown={kindShown}
            onOpen={(k, id) => { view.setFilter('kind', k === first ? undefined : { kind: 'single', value: k }); setToOpen({ kind: k, id }); }}
            onShow={(k) => view.setFilter('kind', k === first ? undefined : { kind: 'single', value: k })}
          />
        </div>
      }
      list={
        <DataTable
          label={t(`kind.${kind}`)}
          view={view}
          columns={columns}
          search={searchable(kind) ? t(kind === 'observation' ? 'search.observation' : 'search') : false}
          onRetry={() => void shown.refetch()}
          onRefresh={() => void shown.refetch()}
          onRowAction={(r) => view.open(r.id)}
          actions={actions}
          selectable={deleteMany.bulkActions !== undefined}
          bulkActions={deleteMany.bulkActions}
          noViewMenu
          countLabel={(n) => t(ranked ? 'count.ranked' : 'count', { count: n })}
          noMatch={t('noMatch')}
          empty={<EmptyState icon="database" size="sm" title={wide ? t(kind === 'slot' ? 'emptyWide.slot' : 'emptyWide.lesson') : t(`empty.${kind}`)} />}
        />
      }
      detail={open === undefined ? null : <Detail key={`${kind}\u0000${open}`} at={at} project={project} kind={kind} id={open} realm={realm} onGone={() => view.open(undefined)} onMoved={(to) => view.open(to)} />}
    />
  );
}

/** A held edit or delete of a record in this project (its answer was lost), wherever the person is in the list: it
 *  names the change and opens the record, where Check again and Stop waiting live. A held delete of several records of
 *  another store than the one shown names it and shows that store, where its own notice holds Check again. */
function HeldNotice({ at, project, shown, onOpen, onShow }: { at: MemoryAt; project: string; shown: Kind; onOpen: (kind: Kind, id: string) => void; onShow: (kind: Kind) => void }) {
  const t = useStrings(strings);
  const pick = useCallback((i: Record<string, unknown>) => i.computer === at.target.container.id && i.realm === at.realm && i.project === project, [at, project]);
  const edit = useHeldChangeOf(MEMORY_EDIT_LOCK, pick);
  // One lock holds both deletes: a record's names an id, a delete of several names ids.
  const pickOne = useCallback((i: Record<string, unknown>) => pick(i) && typeof i.id === 'string' && !Array.isArray(i.ids), [pick]);
  const del = useHeldChangeOf(MEMORY_DELETE_LOCK, pickOne);
  // Only another store's: this store's own notice holds its Check again (and with several stores held, the oldest of
  // the others is named).
  const pickOther = useCallback((i: Record<string, unknown>) => pick(i) && Array.isArray(i.ids) && kindIn(i) !== shown, [pick, shown]);
  const many = useHeldChangeOf(MEMORY_DELETE_LOCK, pickOther);
  const manyKind = many ? kindIn((many.identity ?? {}) as Record<string, unknown>) : null;
  const h = del ?? edit;
  const i = (h?.identity ?? {}) as Record<string, unknown>;
  const kind = kindIn(i);
  return (
    <>
      {h ? (
        <Band tone="warn" size="table" /* noDetails: an unknown outcome held elsewhere on the page; its record holds Check again */ actions={<Button size="sm" onPress={() => onOpen(kind, String(i.id ?? ''))}>{t('held.open')}</Button>}>
          {t(del ? 'held.notice.remove' : 'held.notice.edit')}
        </Band>
      ) : null}
      {manyKind ? (
        <Band tone="warn" size="table" /* noDetails: an unknown outcome held in another store of this project; that store's notice holds Check again */ actions={<Button size="sm" onPress={() => onShow(manyKind)}>{t('many.show')}</Button>}>
          {t('held.notice.removeMany')}
        </Band>
      ) : null}
    </>
  );
}

const kindIn = (i: Record<string, unknown>): Kind => ((KINDS as readonly unknown[]).includes(i.kind) ? (i.kind as Kind) : 'memory');
