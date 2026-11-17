// One project's relation graph: the entities the agent pulled from what it saw (tools, files, people,
// projects…) and the relations between them, as a table and a detail pane, so a keyboard or a screen reader reads it
// whole (no drawing). The agent sends only the relations whose two ends are in the same read, so there is
// one read: the most-linked entities first, GRAPH_CHUNK of them (its default) until Read more asks for GRAPH_CHUNK more,
// up to GRAPH_MAX. The table pages through it PAGE_SIZE rows at a time in the kit's client mode, so rows and pager always
// come from one answer (chunked server paging would feed the kit's page back into the read). The type filter
// is the agent's ?node_type=. A graph with more entities than the read says the relations stop at the read.
// An empty read that carries the agent's warning is a graph that could not be read: the table's error state with Try
// again, in its own sentence (the kit's says the server could not be reached, and it was), and the banner names it,
// never "no relations".
import {
  AnatomySection, Band, DataTable, DetailBody, DetailHeader, Facts, ItemList, ListDetailPage, Tag, TextButton, createColumnHelper,
  formatDateTime, formatNumber, formatRelative, useDataView, useSearch, useStrings, type Fact, type ItemProps,
} from '@kit';
import { useMemo, useState, type ReactNode } from 'react';
import { GRAPH_CHUNK, GRAPH_MAX, PAGE_SIZE, type GraphAt, type MemoryAt, useGraph } from './data';
import { relationsOf, type GraphNodeRow, type GraphPage } from './logic';
import strings from './Memory.strings.en.json';

const col = createColumnHelper<GraphNodeRow>();

/** A read that answered without its entities: the table's error state, with the sentence that says so. */
class GraphUnread extends Error {}

/** The entities the graph holds for the type (or at all), never fewer than the read holds. */
function whole(g: GraphPage, type: string): number {
  return Math.max(type ? (g.nodesByType[type] ?? 0) : g.totalNodes, g.nodes.length);
}

export interface RelationsProps {
  at: MemoryAt;
  project: string;
  header: { title: string; subtitle: string; actions?: ReactNode };
  band: ReactNode;
  /** The store choice the records table shows too (the same URL key), with Relations among its options. */
  kindFilter: { label: string; options: readonly { value: string; label: string }[]; defaultValue: string };
}

/** What a read says beyond its rows: could not be read, may be incomplete, or an older saved copy. A read with no
 *  entities is unread when the agent warned, or when its counts say entities are there: never an empty graph. */
export function graphNote(g: GraphPage | undefined, type = ''): 'unread' | 'partial' | 'dirty' | null {
  if (!g) return null;
  if (g.nodes.length === 0 && (g.warning || whole(g, type) > 0)) return 'unread';
  if (g.warning) return 'partial';
  return g.dirty ? 'dirty' : null;
}

export function Relations({ at, project, header, band, kindFilter }: RelationsProps) {
  const t = useStrings(strings);
  // The type is read from the URL in the same render (the filter's own key), as Records reads its store: the read and the
  // table's context follow it from the first render, so another type's rows are never handed to the table.
  const search = useSearch() as Record<string, unknown>;
  const type = typeof search.etype === 'string' ? search.etype : '';
  const scope = `${project}\u0000relation\u0000${type}`;
  // How far Read more has gone, for this project and type only: another type starts over, and coming back does too. A
  // wider answer still cached shows at once and refreshes like any kept read (the kit's warning if that fails).
  const [more, setMore] = useState<{ scope: string; limit: number } | null>(null);
  if (more && more.scope !== scope) setMore(null);
  const limit = more?.scope === scope ? more.limit : GRAPH_CHUNK;
  const read = useMemo<GraphAt>(() => ({ ...at, project, type, limit }), [at, project, type, limit]);
  // Keyed by the read: a new read has no data until it answers (no placeholder).
  const graph = useGraph(read);
  const g = graph.data;
  const note = graphNote(g, type);
  const total = g ? whole(g, type) : undefined;
  const unread = useMemo(() => (note === 'unread' ? new GraphUnread() : null), [note]);
  const columns = useMemo(() => [
    col.accessor('name', { enableSorting: false, header: t('col.entity'), meta: { pinned: true }, cell: (c) => c.getValue() || t('unknown') }),
    col.accessor('type', { enableSorting: false, header: t('col.type'), meta: { width: '140px', priority: 2 }, cell: (c) => (c.getValue() ? <Tag>{c.getValue()}</Tag> : t('unknown')) }),
    col.accessor('degree', { enableSorting: false, header: t('col.links'), meta: { width: '96px', align: 'end', priority: 1, listLabel: true }, cell: (c) => formatNumber(c.getValue()) }),
    col.accessor('lastSeen', { enableSorting: false, header: t('col.lastSeen'), meta: { width: '130px', priority: 3 }, cell: (c) => (c.getValue() ? formatRelative(c.getValue()) : t('unknown')) }),
  ], [t]);
  const types = useMemo(() => Object.keys(g?.nodesByType ?? {}).sort().map((v) => ({ value: v, label: v })), [g?.nodesByType]);
  const view = useDataView<GraphNodeRow>({
    rows: g ? g.nodes : graph.error ? [] : undefined,
    columns,
    getRowId: (r) => r.id,
    search: false,
    filters: [
      { id: 'kind', label: kindFilter.label, display: 'segmented', apply: false, required: true, defaultValue: kindFilter.defaultValue, value: () => 'relation', options: kindFilter.options },
      { id: 'etype', label: t('col.type'), apply: false, value: (r) => r.type, options: types },
    ],
    pageSize: PAGE_SIZE,
    isLoading: graph.isPending,
    error: graph.error ?? unread,
    // A type is a context of its own for the kit. An entity named in the URL stays open if the new type holds it too.
    context: scope,
  });
  const open = view.activeId;
  // The open entity, if the read holds it: an entity the type or a refresh took away closes the pane.
  const node = open !== undefined && g && !unread ? g.nodes.find((n) => n.id === open) : undefined;
  const retry = () => void graph.refetch();
  // A short answer (a saved copy holds only the most-linked entities) has nothing more to give for a higher limit.
  const canReadMore = g !== undefined && g.nodes.length >= limit && limit < GRAPH_MAX;
  return (
    <ListDetailPage
      mode="side"
      storageKey="ai-memory"
      // Beside the title, not in the subtitle: a clamped subtitle cuts its end off on a phone.
      header={{ ...header, meta: g && !unread ? <Tag>{t('count.relations', { count: g.totalEdges, n: formatNumber(g.totalEdges) })}</Tag> : undefined }}
      toolbar={band}
      banner={
        <>
          {note === 'unread' && <Band tone="warn" size="table" /* noDetails: the agent answered without the relations */>{t('rel.unread')}</Band>}
          {note === 'partial' && <Band tone="warn" size="table" /* noDetails: the agent answered; its page may be short */>{t('rel.partial')}</Band>}
          {g && !unread && g.truncated && (
            <Band
              tone="neutral"
              size="table" /* noDetails: a fact of the read, not a failure */
              actions={canReadMore ? <TextButton onPress={() => setMore({ scope, limit: limit + GRAPH_CHUNK })}>{t('rel.readMore')}</TextButton> : undefined}
            >
              {t('rel.readSoFar', { shown: formatNumber(g.nodes.length), count: formatNumber(total ?? 0) })}
            </Band>
          )}
          {note === 'dirty' && <Band tone="neutral" size="table" /* noDetails: a fact of the read, not a failure */>{t('rel.dirty')}</Band>}
        </>
      }
      list={
        <DataTable
          label={t('kind.relation')}
          view={view}
          columns={columns}
          search={false}
          onRetry={retry}
          onRefresh={retry}
          onRowAction={(r) => view.open(r.id)}
          noViewMenu
          errorBody={unread && !graph.error ? t('rel.unreadBody') : undefined}
          countLabel={(n) => t('count.entities', { count: n, n: formatNumber(n) })}
          noMatch={t('noMatch')}
        />
      }
      detail={node && g ? <EntityDetail key={node.id} page={g} node={node} onOpen={(id) => view.open(id)} /> : null}
    />
  );
}

/** One entity: its facts and its relations within the read it came in, each other end opening in turn. */
function EntityDetail({ page, node, onOpen }: { /** The whole read, not the table page. */ page: GraphPage; node: GraphNodeRow; onOpen: (id: string) => void }) {
  const t = useStrings(strings);
  const rels = relationsOf(page, node.id);
  const facts: Fact[] = [
    { label: t('col.type'), value: node.type || t('unknown') },
    { label: t('col.links'), value: formatNumber(node.degree) },
    { label: t('col.lastSeen'), value: node.lastSeen ? formatDateTime(node.lastSeen) : t('unknown') },
  ];
  const items: ItemProps[] = rels.map(({ edge, other, outgoing }) => {
    const verb = edge.type || t('rel.related');
    return {
      id: edge.id,
      title: other.name || t('unknown'),
      mono: true,
      meta: [t(outgoing ? 'rel.outgoing' : 'rel.incoming', { type: verb })],
      onOpen: () => onOpen(other.id),
    };
  });
  const relNote = rels.length === 0
    ? t(node.degree > 0 ? 'rel.noneOnPage' : 'rel.none')
    : rels.length < node.degree ? t('rel.pageOnly', { shown: formatNumber(rels.length), count: formatNumber(node.degree) }) : undefined;
  return (
    <>
      <DetailHeader title={node.name || t('unknown')} meta={node.type || undefined} />
      <DetailBody>
        <AnatomySection id="mem-entity-facts" title={t('rel.about')} state={{ kind: 'ready' }}>
          <Facts columns={1} items={facts} />
        </AnatomySection>
        <AnatomySection id="mem-entity-rels" title={t('rel.title')} state={{ kind: 'ready' }} note={relNote}>
          {items.length > 0 && <ItemList label={t('rel.title')} items={items} />}
        </AnatomySection>
      </DetailBody>
    </>
  );
}
