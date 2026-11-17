// The __ID__ page: a full-width table (layout `table`). Use it when a row needs no
// detail pane: edits open in a drawer (?edit=<id>), and links leave for the record's own page.
//
// The standard pieces, all from the kit:
//   useDataView   search, filter chips, sort and paging, kept in the URL (?q, ?status, ?sort,
//                 ?page), restored on reload, no-match + Clear filters
//   Drawer + Form + FormFooter   edits; the C9 outcome locks the form ("Check again" only reads)
import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  Form,
  FormFooter,
  StatStrip,
  StatusPill,
  TablePage,
  TextField,
  createColumnHelper,
  formatBytes,
  formatDateTime,
  useDataView,
  useDrawerParam,
  useStrings,
  type RowActionEntry,
  type Tone,
} from '@kit';
import { useMemo, useState } from 'react';
import { type Item, type ItemStatus, useItems, useSaveItem } from './data';
import { STATUSES, attentionRank, summarize } from './logic';
import strings from './strings.en.json';

const TONE: Record<ItemStatus, Tone> = { active: 'ok', paused: 'neutral', failed: 'danger' };
const col = createColumnHelper<Item>();

export default function __PASCAL__Page() {
  const t = useStrings(strings);
  const items = useItems();
  const [editing, openEdit, closeEdit] = useDrawerParam('edit');

  // Every column declares a priority: 1 always shows, 4 drops first as the table narrows.
  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('col.name'), meta: { pinned: true } }),
      col.accessor((r) => attentionRank(r.status), {
        id: 'status',
        header: t('col.status'),
        meta: { width: '120px', priority: 1, list: 'status' },
        cell: (c) => (
          <StatusPill tone={TONE[c.row.original.status]} dot>
            {t(`status.${c.row.original.status}`)}
          </StatusPill>
        ),
      }),
      col.accessor('owner', { header: t('col.owner'), meta: { width: '22%', priority: 2 } }),
      col.accessor('updatedAt', { header: t('col.updated'), cell: (c) => formatDateTime(c.getValue()), meta: { width: '200px', priority: 3 } }),
      col.accessor('sizeBytes', { id: 'size', header: t('col.size'), cell: (c) => formatBytes(c.getValue()), meta: { align: 'end', width: '104px', priority: 4 } }),
    ],
    [t],
  );

  const view = useDataView<Item>({
    rows: items.data,
    columns,
    getRowId: (r) => r.id,
    search: ['name', 'owner'],
    filters: [
      { id: 'status', label: t('filter.status'), value: (r) => r.status, options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
    ],
    sort: 'status',
    pageSize: 50,
    isLoading: items.isPending,
    error: items.error,
  });

  const totals = useMemo(() => summarize(items.data ?? []), [items.data]);
  const isEmpty = items.data?.length === 0;
  const actions = (r: Item): readonly RowActionEntry[] => [{ id: 'edit', label: t('action.editMenu'), icon: 'pen', onAction: () => openEdit(r.id) }];

  return (
    <>
      <TablePage
        header={{
          title: t('title'),
          subtitle: t('subtitle'),
          // One accent per screen: the EmptyState's own primary replaces this one while it shows.
          primary: isEmpty ? undefined : { label: t('action.new'), icon: 'plus', onPress: () => openEdit('new') },
        }}
        stats={
          items.data && !isEmpty ? (
            <StatStrip
              label={t('stats')}
              items={[
                { label: t('stat.total'), value: totals.count },
                { label: t('stat.failed'), value: totals.failed },
                { label: t('stat.size'), value: formatBytes(totals.sizeBytes) },
              ]}
            />
          ) : undefined
        }
      >
        <DataTable
          label={t('title')}
          columns={columns}
          view={view}
          onRetry={() => void items.refetch()}
          onRefresh={() => void items.refetch()}
          noMatch={t('noMatch')}
          countLabel={(n) => t('count', { count: n })}
          onRowAction={(r) => openEdit(r.id)}
          actions={actions}
          storageKey="__ID__"
          empty={
            <EmptyState
              icon="apps"
              title={t('empty.title')}
              body={t('empty.body')}
              action={
                <Button variant="primary" icon="plus" onPress={() => openEdit('new')}>
                  {t('action.new')}
                </Button>
              }
            />
          }
        />
      </TablePage>
      {editing !== undefined && items.data && (
        <EditDrawer key={editing} isNew={editing === 'new'} item={items.data.find((i) => i.id === editing)} onClose={closeEdit} readBack={async () => (await items.refetch()).data} />
      )}
    </>
  );
}

/**
 * Create or rename in a drawer. The outcome lives in the footer: "Saved", or the C9 lock. Check
 * again only READS: it refetches the rows and settles when the change shows up there (done), or
 * lifts the lock when it clearly did not happen, so the user can send it again. It never resends.
 */
function EditDrawer({ item, isNew, onClose, readBack }: { item: Item | undefined; isNew: boolean; onClose: () => void; readBack: () => Promise<Item[] | undefined> }) {
  const t = useStrings(strings);
  const save = useSaveItem();
  const [name, setName] = useState(item?.name ?? '');
  const [settled, setSettled] = useState<'done' | null>(null);
  const outcome = settled ?? save.data?.outcome ?? (save.isError ? 'failed' : undefined);
  const dirty = name.trim() !== '' && name.trim() !== (item?.name ?? '');
  const found = isNew || item !== undefined;
  const submit = () => {
    if (!dirty || !found) return;
    setSettled(null);
    save.mutate({ id: isNew ? 'new' : (item?.id ?? 'new'), name: name.trim() });
  };
  const check = async () => {
    const rows = await readBack();
    const sent = save.variables;
    if (!rows || !sent) return;
    if (rows.some((r) => r.name === sent.name && (sent.id === 'new' || r.id === sent.id))) setSettled('done');
    else save.reset();
  };
  return (
    <Drawer
      // The panel's remembered-width name, unique per page id; Drawer.resizekeys.test fails on a duplicate after scaffolding.
      resizeKey="__ID__-edit"
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={isNew ? t('edit.newTitle') : t('edit.title')}
      subtitle={item?.name}
      size="sm"
      dirty={dirty && outcome !== 'done'}
      busy={save.isPending}
      footer={found ? <FormFooter dirty={dirty} busy={save.isPending} outcome={outcome} onCheck={check} onSubmit={submit} submitLabel={t('edit.save')} /> : undefined}
    >
      {found ? (
        <Form onSubmit={submit} busy={save.isPending} outcome={outcome} onCheck={check}>
          <TextField label={t('edit.name')} value={name} onChange={setName} reserveError />
        </Form>
      ) : (
        <EmptyState icon="warn" title={t('edit.notFound')} size="sm" />
      )}
    </Drawer>
  );
}
