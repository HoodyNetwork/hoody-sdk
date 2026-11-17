// The __ID__ page: settings (layout `settings`). Sections of SettingRows with a
// section nav kept in the URL (?section=), a summary rail, and one sticky save bar.
//
// The standard pieces, all from the kit:
//   SettingsPage + SettingRow   label and help on the start side, the control on the end side
//                               (the row's label names the control: aria-label, or htmlFor + id)
//   FormFooter as `footer`      only while the draft is dirty or a save's outcome is showing;
//                               Save is the page's one accent, so the header has no primary
//   Form                        wraps each section's fields: Enter saves, and the C9 outcome
//                               locks them ("Check again" only reads, never resends)
//   EmptyState size="compact"   inside a section; the page states only for the whole page
import {
  Button,
  DangerConfirm,
  EmptyState,
  ErrorState,
  Facts,
  Form,
  FormFooter,
  Section,
  Select,
  SettingRow,
  SettingsPage,
  Skeleton,
  Switch,
  TextField,
  toOutcome,
  useStrings,
} from '@kit';
import { useState } from 'react';
import { type Settings, type SettingsDraft, useDeleteAll, useSaveSettings, useSettings } from './data';
import { REGIONS, draftOf, isDirty } from './logic';
import strings from './strings.en.json';

export default function __PASCAL__Page() {
  const t = useStrings(strings);
  const settings = useSettings();
  const header = { title: t('title'), subtitle: t('subtitle') };

  if (settings.isPending) return <SettingsPage header={header} sections={[{ id: 'general', title: t('section.general'), content: <Skeleton variant="rows" rows={4} /> }]} />;
  if (!settings.data) {
    return (
      <SettingsPage
        header={header}
        sections={[
          {
            id: 'general',
            title: t('section.general'),
            content: <ErrorState title={t('error.title')} body={t('error.body')} onRetry={() => void settings.refetch()} retrying={settings.isFetching} />,
          },
        ]}
      />
    );
  }
  return <SettingsForm saved={settings.data} readBack={async () => (await settings.refetch()).data} />;
}

function SettingsForm({ saved, readBack }: { saved: Settings; readBack: () => Promise<Settings | undefined> }) {
  const t = useStrings(strings);
  const save = useSaveSettings();
  const del = useDeleteAll();
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft>(() => draftOf(saved));
  const [settled, setSettled] = useState<'done' | null>(null);
  const set = (patch: Partial<SettingsDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const outcome = settled ?? save.data?.outcome ?? (save.isError ? 'failed' : undefined);
  const dirty = isDirty(draftOf(saved), draft);
  const submit = () => {
    if (!dirty) return;
    setSettled(null);
    save.mutate({ ...draft, name: draft.name.trim() });
  };
  // Check again only READS: the save landed when the server's settings equal what was sent (done);
  // otherwise the lock lifts so the user can send it again. It never resends.
  const onCheck = async () => {
    const fresh = await readBack();
    const sent = save.variables;
    if (!fresh || !sent) return;
    if (!isDirty(draftOf(fresh), sent)) setSettled('done');
    else save.reset();
  };
  const discard = () => setDraft(draftOf(saved));
  const form = { onSubmit: submit, busy: save.isPending, outcome, onCheck };

  return (
    <SettingsPage
      header={{ title: t('title'), subtitle: t('subtitle') }}
      sections={[
        {
          id: 'general',
          title: t('section.general'),
          description: t('section.generalHelp'),
          content: (
            <Form {...form}>
              <SettingRow label={t('field.name')} help={t('field.nameHelp')} htmlFor="__ID__-name">
                <TextField aria-label={t('field.name')} id="__ID__-name" value={draft.name} onChange={(name) => set({ name })} reserveError />
              </SettingRow>
              <SettingRow label={t('field.region')} help={t('field.regionHelp')}>
                <Select aria-label={t('field.region')} options={REGIONS.map((r) => ({ value: r, label: t(`region.${r}`) }))} value={draft.region} onChange={(region) => set({ region })} />
              </SettingRow>
            </Form>
          ),
        },
        {
          id: 'notifications',
          title: t('section.notifications'),
          description: t('section.notificationsHelp'),
          content: (
            <>
              <Form {...form}>
                <SettingRow label={t('field.emailAlerts')} help={t('field.emailAlertsHelp')}>
                  <Switch label={t('field.emailAlerts')} isSelected={draft.emailAlerts} onChange={(emailAlerts) => set({ emailAlerts })} />
                </SettingRow>
              </Form>
              {saved.channels.length === 0 ? (
                <EmptyState icon="bell" title={t('channels.empty')} size="compact" />
              ) : (
                saved.channels.map((c) => (
                  <SettingRow key={c.id} label={c.name} help={t(`channel.${c.kind}`)} />
                ))
              )}
            </>
          ),
        },
        {
          id: 'danger',
          title: t('section.danger'),
          tone: 'danger',
          content: (
            <SettingRow label={t('danger.delete')} help={t('danger.deleteHelp')} tone="danger">
              <Button variant="danger" onPress={() => setConfirming(true)}>
                {t('danger.deleteAction')}
              </Button>
              <DangerConfirm
                isOpen={confirming}
                onOpenChange={setConfirming}
                title={t('danger.confirmTitle')}
                body={t('danger.deleteHelp')}
                confirmLabel={t('danger.deleteAction')}
                confirmText={saved.name}
                onConfirm={() => del.mutate()}
                busy={del.isPending}
                outcome={toOutcome(del.data?.outcome ?? (del.isError ? 'failed' : undefined)) ?? undefined}
                onCheck={() => void readBack()}
              />
            </SettingRow>
          ),
        },
      ]}
      summary={
        <Section title={t('summary.title')}>
          <Facts
            columns={1}
            items={[
              { label: t('summary.region'), value: t(`region.${saved.region}`) },
              { label: t('summary.channels'), value: saved.channels.length },
            ]}
          />
        </Section>
      }
      // The save bar exists only while there is something to save or an outcome to show.
      footer={
        dirty || outcome !== undefined ? (
          <FormFooter dirty={dirty} busy={save.isPending} outcome={outcome} onCheck={onCheck} onSubmit={submit} onDiscard={discard} submitLabel={t('save')} />
        ) : undefined
      }
    />
  );
}
