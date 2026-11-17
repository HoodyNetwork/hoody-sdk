// The demo page: a list/detail layout (shell mode `fill`). With nothing selected the
// list is a full-width table; a selection narrows it to a list pane and the detail fills the
// rest. For a light record (a notification, a program) use mode="side": the table stays whole
// and a 440 px inspector opens beside it.
//
// The standard pieces, all from the kit:
//   useDataView   search, filter chips, sort, paging and the open row, kept in the URL
//                 (?q, ?status, ?sort, ?page, ?sel), restored on reload, no-match + Clear filters
//   Drawer + Form + FormFooter   edits; the C9 outcome locks the form ("Check again" only reads)
import {
  Button,
  DataTable,
  DetailPage,
  Drawer,
  EmptyState,
  Facts,
  Form,
  FormFooter,
  ListDetailPage,
  Section,
  StatusPill,
  TextField,
  createColumnHelper,
  formatBytes,
  formatDateTime,
  useDataView,
  useDrawerParam,
  useSearchParam,
  useStrings,
  type RowActionEntry,
  type Tone,
} from '@kit';
import { useMemo, useState } from 'react';
import { type Item, type ItemStatus, useItems, useSaveItem } from './data';
import { STATUSES, attentionRank } from './logic';
import strings from './strings.en.json';

const TONE: Record<ItemStatus, Tone> = { active: 'ok', paused: 'neutral', failed: 'danger' };
const col = createColumnHelper<Item>();

export default function DemoPage() {
  const t = useStrings(strings);
  const items = useItems();
  const [editing, openEdit, closeEdit] = useDrawerParam('edit');
  // Demo only: ?mode=side shows the inspector mode on the same data.
  const [modeParam] = useSearchParam('mode');

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
      col.accessor('sizeBytes', { header: t('col.size'), cell: (c) => formatBytes(c.getValue()), meta: { align: 'end', width: '104px', priority: 4 } }),
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

  const current = items.data?.find((i) => i.id === view.activeId);
  const isEmpty = items.data?.length === 0;
  const actions = (r: Item): readonly RowActionEntry[] => [
    { id: 'open', label: t('action.open'), icon: 'arrow-right', onAction: () => view.open(r.id) },
    { id: 'edit', label: t('action.editMenu'), icon: 'pen', onAction: () => openEdit(r.id) },
  ];

  return (
    <>
      <ListDetailPage
        mode={modeParam === 'side' ? 'side' : 'fill'}
        storageKey="demo"
        header={{
          title: t('title'),
          subtitle: t('subtitle'),
          // One accent per screen: the EmptyState's own primary replaces this one while it shows.
          primary: isEmpty ? undefined : { label: t('action.new'), icon: 'plus', onPress: () => openEdit('new') },
        }}
        list={
          <DataTable
            label={t('title')}
            columns={columns}
            view={view}
            onRetry={() => void items.refetch()}
            onRefresh={() => void items.refetch()}
            noMatch={t('noMatch')}
            countLabel={(n) => t('count', { count: n })}
            onRowAction={(r) => view.open(r.id)}
            actions={actions}
            storageKey="demo"
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
        }
        detail={
          view.activeId === undefined ? null : current ? (
            <ItemDetail item={current} onEdit={() => openEdit(current.id)} />
          ) : items.data ? (
            <EmptyState icon="warn" title={t('detail.notFound')} action={<Button onPress={() => view.open(undefined)}>{t('detail.back')}</Button>} />
          ) : null
        }
      />
      {editing !== undefined && <EditDrawer key={editing} isNew={editing === 'new'} item={items.data?.find((i) => i.id === editing)} onClose={closeEdit} readBack={async () => (await items.refetch()).data} />}
    </>
  );
}

function ItemDetail({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const t = useStrings(strings);
  return (
    <DetailPage
      header={{
        title: item.name,
        meta: (
          <StatusPill tone={TONE[item.status]} dot>
            {t(`status.${item.status}`)}
          </StatusPill>
        ),
        subtitle: item.owner,
        actions: (
          <Button icon="pen" size="sm" onPress={onEdit}>
            {t('action.edit')}
          </Button>
        ),
      }}
      tabs={[
        {
          id: 'overview',
          label: t('tab.overview'),
          content: (
            <Section title={t('detail.facts')}>
              <Facts
                columns={2}
                items={[
                  { label: t('fact.owner'), value: item.owner },
                  { label: t('fact.updated'), value: formatDateTime(item.updatedAt) },
                  { label: t('fact.size'), value: formatBytes(item.sizeBytes) },
                ]}
              />
            </Section>
          ),
        },
        {
          id: 'activity',
          label: t('tab.activity'),
          content: (
            <Section title={t('detail.activity')}>
              <EmptyState icon="clock" title={t('detail.activityEmpty')} size="compact" />
            </Section>
          ),
        },
      ]}
    />
  );
}

/**
 * Create or rename in a drawer. The outcome lives in the footer: "Saved", or the C9 lock. Check
 * again only READS: it refetches the list and settles the outcome when the change shows up there
 * (done) or clearly did not happen (the lock lifts so the user can retry). It never resends.
 */
function EditDrawer({ item, isNew, onClose, readBack }: { item: Item | undefined; isNew: boolean; onClose: () => void; readBack: () => Promise<Item[] | undefined> }) {
  const t = useStrings(strings);
  const save = useSaveItem();
  const [name, setName] = useState(item?.name ?? '');
  const [settled, setSettled] = useState<'done' | null>(null);
  const sent = save.variables;
  const outcome = settled ?? save.data?.outcome ?? (save.isError ? 'failed' : undefined);
  const dirty = name.trim() !== '' && name.trim() !== (item?.name ?? '');
  const submit = () => {
    if (!dirty) return;
    setSettled(null);
    save.mutate({ id: isNew ? 'new' : (item?.id ?? 'new'), name: name.trim() });
  };
  const check = async () => {
    const rows = await readBack();
    if (!sent || !rows) return;
    const landed = rows.some((r) => r.name === sent.name && (sent.id === 'new' || r.id === sent.id));
    if (landed) setSettled('done');
    else save.reset(); // It did not go through: unlock so the user can send it again.
  };
  return (
    <Drawer resizeKey="demo-view"
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={isNew ? t('edit.newTitle') : t('edit.title')}
      size="sm"
      dirty={dirty && outcome !== 'done'}
      busy={save.isPending}
      footer={<FormFooter dirty={dirty} busy={save.isPending} outcome={outcome} onCheck={check} onSubmit={submit} submitLabel={t('edit.save')} />}
    >
      <Form onSubmit={submit} busy={save.isPending} outcome={outcome} onCheck={check}>
        <TextField label={t('edit.name')} value={name} onChange={setName} reserveError />
      </Form>
    </Drawer>
  );
}
