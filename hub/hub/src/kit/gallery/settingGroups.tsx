// Gallery: SettingGroup and SettingSwitch in every shape and surface. `?tab=groups` shows value and field
// groups framed on the page, a field row with two text actions (`field-actions`), bare in a Panel, a flush Panel and a
// Widget, and in a Drawer and a Dialog (`?open=sg-drawer`, `?open=sg-dialog`). `?layout=sg-pane&sel=a` puts groups in a
// ListDetailPage pane: directly in the pane, in a DetailBody and in a Tabs panel, so the pane's frame (desktop) and its
// frameless phone layout are both seen. forms/settinggroup.spec.ts measures these; data-sg-demo names each block for it.
// `code`: rows that show the setting as it is written under their help (SettingRow `code`).
// `fold`: a titled field group open in a section (with a ScheduleField row), one in a Disclosure's fold and EnvRows `titled`: at one width the
// groups take one layout (the fold judges its stack line on the width before its inset), each title a group title.
// `upkeep`: a reveal row whose Replace… opens its editor in place, a field with a warn
// Band attached under it, and the danger group last. forms/settingreveal.spec.ts reads it.
import { useState } from 'react';
import { Button, IconButton } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { Disclosure } from '../controls/Disclosure';
import { Tabs } from '../controls/Tabs';
import { EnvRows, type EnvRow } from '../forms/EnvRows';
import { ScheduleField } from '../forms/ScheduleField';
import { Switch, TextField } from '../forms/fields';
import { NumberField, Select } from '../forms/more';
import { SettingGroup, SettingSwitch } from '../forms/SettingGroup';
import { SettingRow } from '../forms/SettingRow';
import { Panel, Widget } from '../layouts/Layouts';
import { DetailBody, DetailHeader, ListDetailPage } from '../layouts/ListDetailPage';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Stack } from '../layouts/Stack';
import { Band } from '../states/Band';
import { useSearchParam } from '../nav';
import { Dialog } from '../overlays/Dialog';
import { Drawer } from '../overlays/Drawer';
import { useStrings } from '../strings';
import strings from './settingGroups.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

export function useSettingGroupsStrings() {
  return useStrings(strings);
}

function ValueGroup({ t, label }: { t: T; label?: string }) {
  const [on, setOn] = useState(true);
  return (
    <SettingGroup label={label}>
      <SettingSwitch label={t('link.on')} help={t('link.onHelp')} isSelected={on} onChange={setOn} />
      <SettingRow label={t('link.address')} actions={<Button size="sm">{t('link.repoint')}</Button>}>
        <code>{t('link.addressValue')}</code>
      </SettingRow>
      <SettingRow
        label={t('link.cors')}
        help={t('link.corsHelp')}
        actions={
          <>
            <Button size="sm">{t('link.edit')}</Button>
            <IconButton icon="dots" label={t('link.more')} size="sm" more />
          </>
        }
      >
        {t('link.corsValue')}
      </SettingRow>
      <SettingSwitch label={t('link.notes')} help={t('link.notesHelp')} isSelected={false} onChange={() => undefined} outcome="pending" onCheck={() => undefined} actions={<IconButton icon="reload" label={t('link.resetNamed')} size="sm" />} />
      <SettingRow label={t('link.plan')}>{t('link.planValue')}</SettingRow>
      <SettingSwitch label={t('link.pause')} isSelected={false} onChange={() => undefined} />
      <SettingRow
        label={t('link.revoke')}
        help={t('link.revokeHelp')}
        tone="danger"
        actions={
          <Button size="sm" tone="danger">
            {t('link.revokeAct')}
          </Button>
        }
      />
    </SettingGroup>
  );
}

function FieldGroup({ t }: { t: T }) {
  const [port, setPort] = useState(8080);
  const [expose, setExpose] = useState(true);
  const [region, setRegion] = useState<'sg' | 'de'>('sg');
  return (
    <SettingGroup variant="field" label={t('group.options')}>
      <SettingRow label={t('field.name')} help={t('field.nameHelp')}>
        {(ids) => <TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} defaultValue="Support Bot" />}
      </SettingRow>
      <SettingRow label={t('field.port')} help={t('field.portHelp')} actions={port !== 8080 ? <IconButton icon="reload" label={t('link.resetNamed')} size="sm" onPress={() => setPort(8080)} /> : undefined}>
        {(ids) => <NumberField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} value={port} onChange={setPort} />}
      </SettingRow>
      <SettingRow
        label={t('field.expose')}
        help={t('field.exposeHelp')}
        actions={
          expose ? undefined : (
            <Button size="sm" onPress={() => setExpose(true)}>
              {t('link.reset')}
            </Button>
          )
        }
      >
        {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={expose} onChange={setExpose} />}
      </SettingRow>
      <SettingRow label={t('field.region')} help={t('field.regionHelp')}>
        {(ids) => (
          <Select
            aria-label={t('field.region')}
            aria-describedby={ids.helpId}
            value={region}
            onChange={setRegion}
            options={[
              { value: 'sg', label: t('region.sg') },
              { value: 'de', label: t('region.de') },
            ]}
          />
        )}
      </SettingRow>
    </SettingGroup>
  );
}

/** A field row with two text actions (the field keeps 200 px by moving them under it: data-sg-drop), and a switch
 * without help. */
/** A field row with two actions. Where they would leave the label under 200 px but the label fits beside the field, they
 * go under the field and the group stays side by side; `crowded="stack"` shows the earlier arrangement (the group stacks). */
function HookGroup({ t, crowded }: { t: T; crowded?: 'under' | 'stack' }) {
  return (
    <SettingGroup variant="field" label={t('group.hook')} crowdedActions={crowded}>
      <SettingRow
        label={t('field.hook')}
        help={t('field.hookHelp')}
        actions={
          <>
            <Button size="sm">{t('field.hookTest')}</Button>
            <Button size="sm">{t('field.hookNew')}</Button>
          </>
        }
      >
        {(ids) => <TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} defaultValue="https://hooks.example/in/42" />}
      </SettingRow>
      <SettingSwitch label={t('field.retry')} isSelected onChange={() => undefined} />
    </SettingGroup>
  );
}

/** Settings that live as lines in a file: each row's `code` shows the line as written, one mono line under the plain
 * help, the same on a field, a switch and a list. */
function CodeGroup({ t }: { t: T }) {
  const [limit, setLimit] = useState('');
  const [keep, setKeep] = useState(true);
  const [detail, setDetail] = useState<'short' | 'full'>('short');
  return (
    <SettingGroup variant="field" title={t('code.title')}>
      <SettingRow label={t('code.limit')} help={t('code.limitHelp')} code={t('code.limitCode')}>
        {(ids) => <TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} value={limit} onChange={setLimit} mono />}
      </SettingRow>
      <SettingRow label={t('code.keep')} help={t('code.keepHelp')} code={t('code.keepCode')}>
        {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={keep} onChange={setKeep} />}
      </SettingRow>
      <SettingRow label={t('code.detail')} help={t('code.detailHelp')} code={t('code.detailCode')}>
        {(ids) => (
          <Select
            aria-label={t('code.detail')}
            aria-describedby={ids.helpId}
            value={detail}
            onChange={setDetail}
            options={[
              { value: 'short', label: t('code.detailShort') },
              { value: 'full', label: t('code.detailFull') },
            ]}
          />
        )}
      </SettingRow>
    </SettingGroup>
  );
}

/** Upkeep and danger: a reveal row, a field with an attached warn band, and the danger group last. */
function UpkeepGroups({ t }: { t: T }) {
  const [hook, setHook] = useState('https://hooks.example/in/42');
  const [draft, setDraft] = useState(hook);
  const [port, setPort] = useState(22);
  return (
    <Stack gap={4}>
      <SettingGroup title={t('upkeep.title')}>
        <SettingRow
          label={t('upkeep.hook')}
          help={t('upkeep.hookHelp')}
          reveal={{
            label: t('upkeep.replace'),
            canSave: draft.trim() !== '' && draft !== hook,
            onSave: () => setHook(draft.trim()),
            onCancel: () => setDraft(hook),
            editor: <TextField label={t('upkeep.newHook')} value={draft} onChange={setDraft} />,
          }}
        >
          <code>{hook}</code>
        </SettingRow>
        <SettingRow label={t('upkeep.plan')}>{t('link.planValue')}</SettingRow>
      </SettingGroup>
      <SettingGroup variant="field" label={t('upkeep.rule')}>
        <SettingRow label={t('upkeep.port')} help={t('upkeep.portHelp')}>
          {(ids) => (
            <Band
              tone={port === 22 ? 'warn' : 'neutral'}
              attach={<NumberField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} value={port} onChange={setPort} />}
              actions={<TextButton onPress={() => setPort(2222)}>{t('upkeep.portFix')}</TextButton>}
            >
              {port === 22 ? t('upkeep.portWarn') : t('upkeep.portOk')}
            </Band>
          )}
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={t('upkeep.danger')} tone="danger">
        <SettingRow
          label={t('upkeep.delete')}
          help={t('upkeep.deleteHelp')}
          actions={
            <Button size="sm" tone="danger">
              {t('upkeep.deleteAct')}
            </Button>
          }
        />
      </SettingGroup>
    </Stack>
  );
}

function FoldGroups({ t }: { t: T }) {
  const [env, setEnv] = useState<EnvRow[]>([{ id: 1, key: 'TOKEN', value: '' }]);
  const [sched, setSched] = useState<string | null>('0 8 * * 1,3');
  return (
    <AnatomySection id="sg-fold" title={t('sec.fold')} description={t('sec.foldDesc')}>
      <Stack gap={4}>
        <SettingGroup variant="field" title={t('fold.open')}>
          <SettingRow label={t('field.name')} help={t('field.nameHelp')}>
            {(ids) => <TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} defaultValue="Support Bot" />}
          </SettingRow>
          {/* ScheduleField: the kind select and its own fields as one field, named and described by the row. */}
          <SettingRow label={t('fold.sched')} help={t('fold.schedHelp')}>
            {(ids) => <ScheduleField label={t('fold.sched')} aria-labelledby={ids.nameId} aria-describedby={ids.helpId} value={sched} onChange={setSched} />}
          </SettingRow>
        </SettingGroup>
        <Disclosure title={t('fold.more')} defaultExpanded>
          <SettingGroup variant="field" title={t('fold.folded')}>
            <SettingRow label={t('fold.site')} help={t('fold.siteHelp')}>
              {(ids) => <TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} />}
            </SettingRow>
          </SettingGroup>
        </Disclosure>
        <EnvRows
          titled
          rows={env}
          label={t('env.label')}
          description={t('env.help')}
          labels={{ key: (n) => t('env.key', { n }), value: (n) => t('env.value', { n }), remove: (n) => t('env.remove', { n }), keyHint: t('env.keyHint'), valueHint: t('env.valueHint'), add: t('env.add') }}
          onEdit={(id, change) => setEnv((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)))}
          onRemove={(id) => setEnv((rows) => rows.filter((r) => r.id !== id))}
          onAdd={() => setEnv((rows) => [...rows, { id: Math.max(0, ...rows.map((r) => r.id)) + 1, key: '', value: '' }])}
        />
      </Stack>
    </AnatomySection>
  );
}

export function SettingGroupsTab() {
  const t = useSettingGroupsStrings();
  const [open, setOpen] = useSearchParam('open');
  const close = () => setOpen(undefined);
  return (
    <Stack gap={5}>
      <div data-sg-demo="value">
        <ValueGroup t={t} label={t('group.limits')} />
      </div>
      <div data-sg-demo="field">
        <FieldGroup t={t} />
      </div>
      <div data-sg-demo="field-actions">
        <HookGroup t={t} />
      </div>
      <div data-sg-demo="field-actions-stack">
        <HookGroup t={t} crowded="stack" />
      </div>
      <div data-sg-demo="code">
        <CodeGroup t={t} />
      </div>
      <div data-sg-demo="upkeep">
        <UpkeepGroups t={t} />
      </div>
      <div data-sg-demo="panel">
        <Panel title={t('sec.panel')} description={t('sec.panelDesc')}>
          <ValueGroup t={t} />
        </Panel>
      </div>
      <div data-sg-demo="fold">
        <FoldGroups t={t} />
      </div>
      <div data-sg-demo="flush">
        <Panel title={t('sec.flush')} description={t('sec.flushDesc')} flush>
          <ValueGroup t={t} />
        </Panel>
      </div>
      <div data-sg-demo="widget">
        <Widget title={t('sec.widget')} size="l">
          <ValueGroup t={t} />
        </Widget>
      </div>
      <Stack gap={2}>
        <Button onPress={() => setOpen('sg-drawer')}>{t('open.drawer')}</Button>
        <Button onPress={() => setOpen('sg-dialog')}>{t('open.dialog')}</Button>
      </Stack>
      <Drawer resizeKey="gallery-setting-groups" isOpen={open === 'sg-drawer'} onOpenChange={(o) => !o && close()} title={t('drawer.title')} size="sm">
        <div data-sg-demo="drawer">
          <FieldGroup t={t} />
        </div>
      </Drawer>
      <Dialog isOpen={open === 'sg-dialog'} onOpenChange={(o) => !o && close()} title={t('dialog.title')} size="lg" primaryLabel={t('dialog.done')} onPrimary={close}>
        <div data-sg-demo="dialog">
          <ValueGroup t={t} />
        </div>
      </Dialog>
    </Stack>
  );
}

export function GallerySettingPane() {
  const t = useSettingGroupsStrings();
  const [sel, setSel] = useState<string | undefined>(undefined);
  const [param] = useSearchParam('sel');
  const current = sel ?? param;
  return (
    <ListDetailPage
      header={{ title: t('pane.title') }}
      storageKey="kit-gallery-sg"
      selected={current}
      onClose={() => setSel(undefined)}
      list={<Button onPress={() => setSel('a')}>{t('pane.item')}</Button>}
      detail={
        current ? (
          <>
            <DetailHeader title={t('pane.detail')} />
            <div data-sg-demo="pane-direct">
              <ValueGroup t={t} label={t('pane.direct')} />
            </div>
            <DetailBody>
              <div data-sg-demo="pane-body">
                <ValueGroup t={t} label={t('pane.body')} />
              </div>
            </DetailBody>
            <Tabs
              label={t('pane.detail')}
              items={[
                {
                  id: 'one',
                  label: t('pane.tabOne'),
                  content: (
                    <div data-sg-demo="pane-tab">
                      <ValueGroup t={t} />
                    </div>
                  ),
                },
                { id: 'two', label: t('pane.tabTwo'), content: null },
              ]}
            />
          </>
        ) : null
      }
    />
  );
}
