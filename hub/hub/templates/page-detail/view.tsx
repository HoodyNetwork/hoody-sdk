// The __ID__ page: one record (layout `detail`). The header names the record and
// carries its one primary (Edit); tabs split the body and stay in the URL (?tab=); the facts
// rail (aside) holds the id, owner and dates. Edits open in a drawer (?edit=1).
//
// The standard pieces, all from the kit:
//   DetailPage   header, tabs (?tab), aside facts, a sticky footer when actions must stay in reach
//   Drawer + Form + FormFooter   edits; the C9 outcome locks the form ("Check again" only reads)
//   EmptyState / ErrorState size="compact" inside a tab or section, the page states otherwise
import {
  DetailPage,
  Drawer,
  EmptyState,
  ErrorState,
  Facts,
  Form,
  FormFooter,
  Section,
  Skeleton,
  StatusPill,
  TextField,
  WidgetList,
  WidgetRow,
  formatBytes,
  formatDateTime,
  useDrawerParam,
  useStrings,
  type Tone,
} from '@kit';
import { useState } from 'react';
import { type RecordDetail, type RecordStatus, useRecord, useSaveRecord } from './data';
import { canRename } from './logic';
import strings from './strings.en.json';

const TONE: Record<RecordStatus, Tone> = { active: 'ok', paused: 'neutral', failed: 'danger' };

export default function __PASCAL__Page() {
  const t = useStrings(strings);
  const record = useRecord();
  const [editing, openEdit, closeEdit] = useDrawerParam('edit');

  if (record.isPending) {
    return (
      <DetailPage header={{ title: t('title') }}>
        <Skeleton variant="detail" />
      </DetailPage>
    );
  }
  if (!record.data) {
    return (
      <DetailPage header={{ title: t('title') }}>
        <ErrorState title={t('error.title')} body={t('error.body')} onRetry={() => void record.refetch()} retrying={record.isFetching} />
      </DetailPage>
    );
  }

  const r = record.data;
  return (
    <>
      <DetailPage
        header={{
          title: r.name,
          meta: (
            <StatusPill tone={TONE[r.status]} dot>
              {t(`status.${r.status}`)}
            </StatusPill>
          ),
          subtitle: r.realm,
          primary: { label: t('action.edit'), icon: 'pen', onPress: () => openEdit('1') },
        }}
        tabs={[
          {
            id: 'overview',
            label: t('tab.overview'),
            content: (
              <Section title={t('overview.title')} description={t('overview.body')}>
                <Facts
                  columns={2}
                  items={[
                    { label: t('fact.size'), value: formatBytes(r.sizeBytes) },
                    { label: t('fact.created'), value: formatDateTime(r.createdAt) },
                  ]}
                />
              </Section>
            ),
          },
          {
            id: 'activity',
            label: t('tab.activity'),
            badge: r.activity.length > 0 ? r.activity.length : undefined,
            content: (
              <Section title={t('activity.title')}>
                {r.activity.length === 0 ? (
                  <EmptyState icon="clock" title={t('activity.empty')} size="compact" />
                ) : (
                  <WidgetList label={t('activity.list')}>
                    {r.activity.map((a) => (
                      <WidgetRow key={a.id} label={a.text} meta={formatDateTime(a.at)} />
                    ))}
                  </WidgetList>
                )}
              </Section>
            ),
          },
        ]}
        aside={
          <Section title={t('aside.title')}>
            <Facts
              columns={1}
              items={[
                { label: t('fact.id'), id: r.id },
                { label: t('fact.owner'), value: r.owner },
                { label: t('fact.realm'), value: r.realm },
                { label: t('fact.created'), value: formatDateTime(r.createdAt) },
              ]}
            />
          </Section>
        }
      />
      {editing !== undefined && <EditDrawer record={r} onClose={closeEdit} readBack={async () => (await record.refetch()).data} />}
    </>
  );
}

/**
 * Rename in a drawer. The outcome lives in the footer: "Saved", or the C9 lock. Check again only
 * READS: it settles when the fresh record carries the new name (done), else lifts the lock.
 */
function EditDrawer({ record, onClose, readBack }: { record: RecordDetail; onClose: () => void; readBack: () => Promise<RecordDetail | undefined> }) {
  const t = useStrings(strings);
  const save = useSaveRecord();
  const [name, setName] = useState(record.name);
  const [settled, setSettled] = useState<'done' | null>(null);
  const outcome = settled ?? save.data?.outcome ?? (save.isError ? 'failed' : undefined);
  const dirty = canRename(record.name, name);
  const submit = () => {
    if (!dirty) return;
    setSettled(null);
    save.mutate({ id: record.id, name: name.trim() });
  };
  const onCheck = async () => {
    const fresh = await readBack();
    const sent = save.variables;
    if (!fresh || !sent) return;
    if (fresh.name === sent.name) setSettled('done');
    else save.reset();
  };
  return (
    <Drawer
      // The panel's remembered-width name, unique per page id; Drawer.resizekeys.test fails on a duplicate after scaffolding.
      resizeKey="__ID__-edit"
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('edit.title')}
      subtitle={record.name}
      size="sm"
      dirty={dirty}
      busy={save.isPending}
      footer={<FormFooter dirty={dirty} busy={save.isPending} outcome={outcome} onCheck={onCheck} onSubmit={submit} submitLabel={t('edit.save')} />}
    >
      <Form onSubmit={submit} busy={save.isPending} outcome={outcome} onCheck={onCheck}>
        <TextField label={t('edit.name')} value={name} onChange={setName} reserveError />
      </Form>
    </Drawer>
  );
}
