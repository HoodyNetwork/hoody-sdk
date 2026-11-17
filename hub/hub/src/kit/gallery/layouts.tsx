// Whole-page layouts for the kit gallery: `/_kit?layout=settings|dashboard|wizard` renders the
// layout itself (not inside a gallery tab), so its frame, rails and breakpoints can be shot.
import { useState } from 'react';
import { Button } from '../controls/Button';
import { Facts } from '../data/Display';
import { Switch, TextField } from '../forms/fields';
import { Select, TimeField } from '../forms/more';
import { FaqLink, type FaqItem } from '../layouts/Faq';
import { DashboardPage, Section, SettingRow, SettingsPage, Widget, WizardFooter, WizardPage, useWizardStep } from '../layouts/Layouts';
import { SettingGroup } from '../forms/SettingGroup';
import { ConfirmDialog } from '../overlays/Dialog';
import { ItemList } from '../layouts/anatomy/ItemList';
import { ScrollRegion } from '../layouts/ScrollRegion';
import { Band } from '../states/Band';
import { Row } from '../layouts/Stack';
import { useStrings } from '../strings';
import strings from './layouts.strings.en.json';
import g from './gallery.module.css';

type Region = 'sin' | 'fra' | 'nyc';
const REGIONS: readonly Region[] = ['sin', 'fra', 'nyc'];

export function GallerySettings() {
  const t = useStrings(strings);
  const [name, setName] = useState('Ada Lovelace');
  const [digest, setDigest] = useState(true);
  const [when, setWhen] = useState('08:00');
  const [region, setRegion] = useState<Region>('sin');
  return (
    <SettingsPage
      header={{ title: t('settings.title'), subtitle: t('settings.subtitle') }}
      summary={
        <Section title={t('summary.title')}>
          <p>{t('summary.body')}</p>
        </Section>
      }
      sections={[
        {
          id: 'profile',
          title: t('settings.profile'),
          description: t('settings.profileDesc'),
          content: (
            <SettingGroup>
              <SettingRow label={t('field.name')} help={t('field.nameHelp')} htmlFor="kit-set-name">
                <TextField aria-label={t('field.name')} id="kit-set-name" value={name} onChange={setName} />
              </SettingRow>
              <SettingRow label={t('field.email')} help={t('field.emailHelp')}>
                <TextField aria-label={t('field.email')} value="ada@example.com" isReadOnly />
              </SettingRow>
              <SettingRow label={t('field.region')} help={t('field.regionHelp')}>
                <Select aria-label={t('field.region')} value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r, label: t(`region.${r}`) }))} />
              </SettingRow>
            </SettingGroup>
          ),
        },
        {
          id: 'notifications',
          title: t('settings.notifications'),
          description: t('settings.notificationsDesc'),
          content: (
            <SettingGroup>
              <SettingRow label={t('field.digest')} help={t('field.digestHelp')}>
                <Switch label={t('field.digest')} isSelected={digest} onChange={setDigest} />
              </SettingRow>
              <SettingRow label={t('field.when')} help={t('field.whenHelp')}>
                <TimeField label={t('field.when')} value={when} onChange={setWhen} isDisabled={!digest} />
              </SettingRow>
              <SettingRow label={t('field.alerts')} help={t('field.alertsHelp')}>
                <Switch label={t('field.alerts')} defaultSelected />
              </SettingRow>
            </SettingGroup>
          ),
        },
        {
          // A settings section with AnatomySection's slots: About, head actions, a notice and a note.
          id: 'keys',
          title: t('settings.keys'),
          description: t('settings.keysDesc'),
          info: t('settings.keysInfo'),
          actions: { primary: { id: 'key-add', label: t('settings.keysAdd'), onPress: () => undefined }, secondary: [{ id: 'key-import', label: t('settings.keysImport'), onPress: () => undefined }] },
          notices: <Band tone="warn">{t('settings.keysOld')}</Band>,
          state: { kind: 'ready' },
          note: t('settings.keysNote'),
          content: <ItemList label={t('settings.keys')} items={[{ id: 'k1', title: t('settings.keyLaptop') }, { id: 'k2', title: t('settings.keyDesk') }, { id: 'k3', title: t('settings.keyOld') }]} />,
        },
        {
          id: 'security',
          title: t('settings.security'),
          description: t('settings.securityDesc'),
          content: (
            <SettingGroup>
              <SettingRow label={t('field.otp')} help={t('field.otpHelp')}>
                <Switch label={t('field.otp')} defaultSelected />
              </SettingRow>
            </SettingGroup>
          ),
        },
        {
          id: 'danger',
          title: t('settings.danger'),
          description: t('settings.dangerDesc'),
          tone: 'danger',
          content: (
            <Row>
              <Button tone="danger">{t('action.delete')}</Button>
            </Row>
          ),
        },
      ]}
    />
  );
}

export function GalleryDashboard() {
  const t = useStrings(strings);
  const menu = [{ id: 'hide', label: t('menu.hide'), onAction: () => undefined }];
  return (
    <DashboardPage header={{ title: t('dash.title'), subtitle: t('dash.subtitle') }}>
      <Widget title={t('w.computers')} size="m" viewAll={{ href: '/_kit', label: t('w.viewAll') }} menu={menu}>
        <p>{t('w.bodyLong')}</p>
      </Widget>
      <Widget title={t('w.bots')} size="s" menu={menu}>
        <p>{t('w.body')}</p>
      </Widget>
      <Widget title={t('w.spend')} size="s">
        <Facts items={[{ label: t('w.spend'), value: '$142.80' }]} />
      </Widget>
      <Widget title={t('w.activity')} size="m" viewAll={{ href: '/_kit' }}>
        <p>{t('w.body')}</p>
      </Widget>
      <Widget title={t('w.alerts')} size="s" tone="warn">
        <p>{t('w.body')}</p>
      </Widget>
      <Widget title={t('w.log')} size="m">
        <ScrollRegion label={t('w.log')} className={g.scrollSample}>
          <ItemList label={t('w.log')} items={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), title: t('w.logLine', { n: String(n) }) }))} />
        </ScrollRegion>
      </Widget>
      <Widget title={t('w.logFramed')} size="m">
        <ScrollRegion label={t('w.logFramed')} framed className={g.scrollSample}>
          <ItemList label={t('w.logFramed')} items={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), title: t('w.logLine', { n: String(n) }) }))} />
        </ScrollRegion>
      </Widget>
      {/* Nested rows: a branch's steps sit one or two levels in, under the step they follow. */}
      <Widget title={t('w.steps')} size="m">
        <ItemList
          label={t('w.steps')}
          items={[
            { id: 'check', title: 'run_checks', mark: '1', mono: true },
            { id: 'deploy', title: 'deploy', mark: '1a', mono: true, indent: 1, meta: [t('w.stepOk')] },
            { id: 'notify', title: 'notify_team', mark: '1a1', mono: true, indent: 2 },
            { id: 'rollback', title: 'rollback', mark: '1b', mono: true, indent: 1, meta: [t('w.stepFail')] },
            { id: 'report', title: 'write_report', mark: '2', mono: true },
          ]}
        />
      </Widget>
    </DashboardPage>
  );
}

export function GalleryWizard() {
  const t = useStrings(strings);
  const steps = [
    { id: 'plan', label: t('step.plan') },
    { id: 'region', label: t('step.region') },
    { id: 'name', label: t('step.name') },
    { id: 'review', label: t('step.review') },
  ];
  const [current, setStep] = useWizardStep(steps);
  const [region, setRegion] = useState<Region>('sin');
  return (
    <WizardPage
      header={{ title: t('wizard.title'), subtitle: t('wizard.subtitle') }}
      steps={steps}
      current={current}
      onStep={setStep}
      summary={
        <Section title={t('summary.title')}>
          <p>{t('summary.body')}</p>
        </Section>
      }
      footNote={current === steps.length - 1 ? <p>{t('wizard.note')}</p> : undefined}
      footer={
        <WizardFooter
          back={current > 0 ? { onPress: () => setStep(current - 1) } : undefined}
          secondary={<Button variant="ghost">{t('action.cancel')}</Button>}
          primary={
            <Button variant="primary" onPress={() => setStep(Math.min(steps.length - 1, current + 1))}>
              {t('action.next')}
            </Button>
          }
        />
      }
    >
      <Select label={t('field.region')} description={t('field.regionHelp')} value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r, label: t(`region.${r}`) }))} />
    </WizardPage>
  );
}

/** `/_kit?layout=faq`: a dashboard page with the FAQ section, a FaqLink on the page (it jumps to its question) and a FaqLink inside a ConfirmDialog (it peeks). */
export function GalleryFaq() {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const items: FaqItem[] = [
    { id: 'rate', q: t('gfaq.rate.q'), a: t('gfaq.rate.a') },
    { id: 'hold', q: t('gfaq.hold.q'), a: t('gfaq.hold.a'), action: { label: t('gfaq.hold.action'), href: '/_kit' } },
    { id: 'count', q: t('gfaq.count.q'), a: t('gfaq.count.a') },
  ];
  return (
    <DashboardPage
      header={{ title: t('gfaq.title'), subtitle: t('gfaq.subtitle'), primary: { label: t('gfaq.join'), onPress: () => setOpen(true) } }}
      faq={{ items }}
    >
      <Widget title={t('gfaq.lead')} size="m">
        <FaqLink item={items[0]!}>{t('gfaq.rate.link')}</FaqLink>
      </Widget>
      <ConfirmDialog
        overlayId="join"
        isOpen={open}
        onOpenChange={setOpen}
        title={t('gfaq.dialog.title')}
        body={t('gfaq.dialog.body')}
        confirmLabel={t('gfaq.join')}
        onConfirm={() => setOpen(false)}
        faq={{ item: items[1]!, label: t('gfaq.dialog.link') }}
      />
    </DashboardPage>
  );
}
