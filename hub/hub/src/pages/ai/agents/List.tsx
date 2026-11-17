// The Agents index: a DataTable of the computer's agents in groups (Core, Coding, Yours, Diagnostics,
// Memory, then other labels), searched by name and description and filtered by where an agent comes from. A lock marks
// a product-owned agent, the Tools column says its tool list in words, and the open agent is the selected row.
// A cell's words are plain row text: a click on them opens the agent. What a value means is on an info icon of its own
// beside it, a separate focus stop named for its cell; the table ignores a press on
// it (DataTable opens a row only for a click outside a button and a key on the row itself), so it opens only the tip.
// The icon is the kit InfoTip's icon form, its subject "<column>: <value>" (named "About Tools: All tools"); a table
// cell does not wrap, so the value and its icon stay on one line. The Default tag has no tip: its words open the agent
// like the rest of the row, and the agent's Overview says what Default means.
import { createColumnHelper, DataTable, EmptyState, Icon, InfoTip, Tag, useDataView, useStrings, type DataView } from '@kit';
import { useCallback, useMemo } from 'react';
import { groupAgents, groupOf, WHERE, whereOf, type AgentRow } from './logic';
import { groupWord, toolsCell, toolsCellTip, whereTip, whereWord } from './words';
import s from './agents.module.css';
import strings from './strings.en.json';

const col = createColumnHelper<AgentRow>();

export interface AgentListRead {
  /** undefined while the first read runs. */
  rows: readonly AgentRow[] | undefined;
  loading: boolean;
}

/** The list's view: search, the Where filter and the order (name; groups keep their own order). Called unconditionally. */
export function useAgentListView({ rows, loading }: AgentListRead): { view: DataView<AgentRow>; columns: ReturnType<typeof useColumns> } {
  const t = useStrings(strings);
  const columns = useColumns();
  const view = useDataView<AgentRow>({
    rows: rows as AgentRow[] | undefined,
    columns,
    getRowId: (r) => r.name,
    search: ['name', 'description'],
    filters: [
      {
        id: 'where',
        label: t('list.whereFilter'),
        value: (r) => whereOf(r) ?? '',
        options: WHERE.map((w) => ({ value: w, label: whereWord(t, w) })),
      },
    ],
    sort: 'name',
    isLoading: loading,
  });
  return { view, columns };
}

function useColumns() {
  const t = useStrings(strings);
  // What marks an agent: the lock of a product-owned one, with its tip, or the agent icon. In the name cell in a table, in the lead column in a list.
  const agentMark = useCallback((r: AgentRow) => (r.productOwned ? (
    <InfoTip text={t('list.lockedTip')} subject={t('list.locked')}>
      <Icon name="lock" size="sm" label={t('list.locked')} />
    </InfoTip>
  ) : (
    <Icon name="hoody-ai-agent" size="sm" />
  )), [t]);
  return useMemo(
    () => [
      col.display({
        id: 'lead',
        header: t('col.name'),
        enableSorting: false,
        meta: { list: 'lead', table: false },
        cell: (c) => agentMark(c.row.original),
      }),
      col.accessor('name', {
        header: t('col.name'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => {
          const r = c.row.original;
          return (
            <span className={s.nameCell}>
              <span data-lead-dup="">
                {agentMark(r)}
              </span>
              <bdi>{r.name}</bdi>
              {r.isDefault && <Tag>{t('list.default')}</Tag>}
            </span>
          );
        },
      }),
      col.display({
        id: 'tools',
        header: t('col.tools'),
        meta: { align: 'end', width: '150px', priority: 1, list: 'status' },
        cell: (c) => {
          const r = c.row.original;
          const tip = toolsCellTip(t, r);
          const word = toolsCell(t, r);
          return tip ? (
            <>
              {word}
              <InfoTip text={tip} subject={t('list.cellTip', { column: t('col.tools'), value: word })} />
            </>
          ) : (
            word
          );
        },
      }),
      col.accessor('model', {
        header: t('col.model'),
        meta: { width: '200px', priority: 3, list: false },
        cell: (c) =>
          c.getValue() ? (
            <bdi>{c.getValue()}</bdi>
          ) : (
            <>
              {t('list.sameModel')}
              <InfoTip text={t('list.sameModelTip')} subject={t('list.cellTip', { column: t('col.model'), value: t('list.sameModel') })} />
            </>
          ),
      }),
      col.accessor((r) => whereOf(r) ?? '', {
        id: 'where',
        header: t('col.where'),
        meta: { width: '180px', priority: 2, list: 'meta' },
        cell: (c) => {
          const r = c.row.original;
          const w = whereOf(r);
          if (!w) return <Tag>{t('prov.unknown')}</Tag>;
          return (
            <>
              <Tag>{whereWord(t, w)}</Tag>
              <InfoTip text={whereTip(t, w)} subject={t('list.cellTip', { column: t('col.where'), value: whereWord(t, w) })} />
            </>
          );
        },
      }),
      col.accessor('description', { header: t('col.what'), enableSorting: false, meta: { priority: 4, list: false } }),
    ],
    [t, agentMark],
  );
}

export interface AgentListProps {
  view: DataView<AgentRow>;
  columns: ReturnType<typeof useColumns>;
  rows: readonly AgentRow[];
  selected: string | null;
  onSelect: (name: string) => void;
  onRetry: () => void;
  onRefresh: () => void;
}

export function AgentList({ view, columns, rows, selected, onSelect, onRetry, onRefresh }: AgentListProps) {
  const t = useStrings(strings);
  // Groups in index order; a user-owned agent is under Yours whatever its first label (groupOf).
  const groups = useMemo(() => groupAgents(rows).map((g) => ({ id: g.group, label: groupWord(t, g.group) })), [rows, t]);
  return (
    <DataTable
      label={t('list.label')}
      view={view}
      columns={columns}
      search={t('list.search')}
      groupBy={groupOf}
      groups={groups}
      groupHeader="inline"
      activeId={selected ?? undefined}
      onRowAction={(r) => onSelect(r.name)}
      onRetry={onRetry}
      onRefresh={onRefresh}
      noViewMenu
      countLabel={(n) => t('list.count', { count: n })}
      noMatch={t('list.noMatch')}
      empty={<EmptyState icon="hoody-ai-agent" title={t('state.empty')} body={t('state.emptyBody')} />}
    />
  );
}
