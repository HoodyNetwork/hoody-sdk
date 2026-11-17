// The computer's TODOs (Automations → TODOs), read only, as a list with the thread beside it. Tabs: Open, Waiting for you, Running, Snoozed, Done. The list and an open thread are read
// again when the agent's store cursor moves. Actions (proposals, run, cancel) are Actions.tsx. Self-contained:
// the host gives the computer's name. New TODO is in the header, on a computer and in one
// realm only (the page's, aiRealm.ts: under All realms the computer's own; with no one realm to tell, the page asks for a realm
// and offers nothing); `?new=1` opens it (New chat's link).
import { Band, DataTable, EmptyState, ErrorState, ListDetailPage, Stack, Tag, TextButton, When, createColumnHelper, useDataView, useSearchParam, useStrings } from '@kit';
import { isRealmOrGlobal, useCurrentComputer } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAiRealm } from '../../aiRealm';
import { useTodos } from './data';
import { TABS, type TodoRow, type TodoTab } from './logic';
import strings from './List.strings.en.json';
import { HeldTodoAction } from './Actions';
import { TodoStatePill, TodoThread } from './Thread';
import { NewTodoButton, NewTodoDrawer } from './New';
import s from './List.module.css';

export interface TodosListProps {
  /** The computer's name, as the top bar shows it. */
  computer: string;
}

const col = createColumnHelper<TodoRow>();

export function TodosList({ computer }: TodosListProps) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const { realm, deciding } = useAiRealm();
  const header = { title: t('title'), subtitle: t('desc', { computer }) };
  // TODOs belong to one realm (the page's: under All realms the computer's own). With no one realm to tell (a computer in
  // several realms under All realms) the list read would be refused before it is sent (AGENT_REALM_REQUIRED), so the page
  // asks for a realm and reads nothing; while the computer's realms are read it is loading.
  if (target && deciding) return <ListDetailPage mode="side" header={header} state={{ kind: 'loading' }} list={null} detail={null} />;
  if (target && !isRealmOrGlobal(realm)) {
    return <ListDetailPage mode="side" header={header} state={{ kind: 'notHere', icon: 'realm', title: t('allRealms.title'), body: t('allRealms.body') }} list={null} detail={null} />;
  }
  return <TodosIn computer={computer} realm={realm} canAdd={!!target} />;
}

function TodosIn({ computer, realm, canAdd }: TodosListProps & { realm: string; canAdd: boolean }) {
  const t = useStrings(strings);
  const q = useTodos();
  const rows = q.list?.rows;
  // New TODO: open from the header or from a link (?new=1, taken once and cleared). With no computer it is not offered.
  const [newParam, setNewParam] = useSearchParam('new');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    // The router reads `?new=1` as the number 1: compared as text.
    if (newParam === undefined || String(newParam) !== '1') return;
    if (canAdd) setAdding(true);
    setNewParam(undefined, { replace: true });
  }, [newParam, canAdd, setNewParam]);
  // A computer switch closes the drawer (a realm switch bumps the context, which closes every kit drawer); a
  // filing still out stays in the ledger of its own place (create.ts).
  const target = useCurrentComputer();
  const where = `${realm}\n${target?.container.id ?? ''}`;
  const shownAt = useRef(where);
  useEffect(() => {
    if (shownAt.current === where) return;
    shownAt.current = where;
    setAdding(false);
  }, [where]);
  // The TODO just added opens beside the list once the list holds it.
  const [added, setAdded] = useState<string | null>(null);

  const columns = useMemo(
    () => [
      col.accessor('title', {
        header: t('col.todo'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => (
          <span className={s.titleCell}>
            <span className={s.num}>{t('num', { n: c.row.original.num })}</span>
            <bdi className={s.one}>{c.getValue()}</bdi>
          </span>
        ),
      }),
      col.accessor('priority', { header: t('col.priority'), meta: { width: '96px', priority: 3 }, cell: (c) => <Tag>{t('prio', { n: c.getValue() })}</Tag> }),
      col.accessor('state', {
        header: t('col.state'),
        // 208 px: the longest state, "99 proposed runs waiting", whole in the mono capitals with the cell's padding.
        meta: { width: '208px', priority: 1 },
        cell: (c) => {
          const r = c.row.original;
          return <TodoStatePill tab={r.tab} needsHuman={r.needsHuman} pending={r.pendingProposals} state={r.state} />;
        },
      }),
      col.accessor((r) => Date.parse(r.lastActivity) || 0, {
        id: 'activity',
        header: t('col.activity'),
        meta: { width: '170px', priority: 2 },
        cell: (c) => {
          const v = c.getValue();
          return v ? <When at={v} /> : '';
        },
      }),
    ],
    [t],
  );

  const view = useDataView<TodoRow>({
    rows,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [r.title, `#${r.num}`, ...r.tags],
    filters: [
      {
        id: 'tab',
        label: t('tab'),
        display: 'segmented',
        required: true,
        defaultValue: 'open',
        value: (r) => r.tab,
        options: TABS.map((v) => ({ value: v, label: t(`tab.${v}`) })),
      },
    ],
    sort: 'priority',
    pageSize: 50,
    isLoading: q.isPending,
    error: q.error,
  });

  useEffect(() => {
    const row = added ? rows?.find((r) => r.id === added) : undefined;
    if (!row) return;
    view.open(row.key);
    setAdded(null);
    // view.open is the data view's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [added, rows]);
  const newTodo = canAdd ? (
    <>
      <NewTodoButton onPress={() => setAdding(true)} />
      <NewTodoDrawer computer={computer} realm={realm} isOpen={adding} onOpenChange={setAdding} onAdded={(id) => { setAdded(id); q.refetch(); }} />
    </>
  ) : undefined;
  const header = { title: t('title'), subtitle: t('desc', { computer }), ...(newTodo ? { actions: newTodo } : {}) };
  const tab = ((TABS as readonly string[]).includes(view.query.filters.tab ?? '') ? view.query.filters.tab : 'open') as TodoTab;
  const current = rows?.find((r) => r.key === view.activeId);
  if (q.error && !q.list) {
    return (
      <ListDetailPage
        mode="side"
        header={header}
        list={<ErrorState title={t('error.title')} body={t('error.body', { computer })} error={q.error} onRetry={q.refetch} />}
        detail={null}
      />
    );
  }
  return (
    <ListDetailPage
      mode="side"
      storageKey="ai-todos"
      header={header}
      list={
        <DataTable
          label={t('title')}
          view={view}
          columns={columns}
          search={t('search')}
          onRetry={q.refetch}
          onRefresh={q.refetch}
          toolbarNote={
            q.pollError && !q.error ? (
              <Band tone="warn" size="table" error={q.pollError} actions={<TextButton onPress={q.repoll}>{t('retry')}</TextButton>}>
                {t('pollFailed')}
              </Band>
            ) : undefined
          }
          onRowAction={(r) => view.open(r.key)}
          noViewMenu
          countLabel={(n) => t('count', { count: n })}
          noMatch={t('noMatch')}
          empty={<EmptyState icon="check" size="sm" title={t(`empty.${tab}`, { computer })} />}
        />
      }
      detail={
        view.activeId === undefined ? null : current ? (
          <TodoThread row={current} />
        ) : rows ? (
          <Stack gap={3}>
            <EmptyState icon="warn" size="sm" title={t('t.notFound')} />
            <HeldTodoAction todoKey={view.activeId} />
          </Stack>
        ) : null
      }
    />
  );
}
