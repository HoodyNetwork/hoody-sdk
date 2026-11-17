// The forms gallery tab (/_kit?tab=secure): every form state rendered at once (no clicks needed for
// shots), section outcomes, secrets, code entry, field errors and slots. view.tsx mounts it.
import { useState } from 'react';
import { Button, IconButton } from '../controls/Button';
import { CodeEditor } from '../forms/CodeEditor';
import { Facts } from '../data/Display';
import { Checkbox, CheckboxGroup, Fieldset, RuleChecklist, Switch, TextField } from '../forms/fields';
import { FormSection } from '../forms/FormSection';
import { Form, FormFooter, NumberField, SecretField, SecretInput, Select } from '../forms/more';
import { OtpField } from '../forms/OtpField';
import { OutcomeSlot } from '../forms/Outcome';
import { SettingGroup } from '../forms/SettingGroup';
import { SettingRow } from '../forms/SettingRow';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Panel } from '../layouts/Layouts';
import { Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import type { OutcomeInput } from '../outcome';
import { useStrings } from '../strings';
import strings from './hubforms.strings.en.json';
import s from './hubforms.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

// Made-up sample secrets (gallery only; never real credentials).
const SAMPLE_KEY = 'hk_3f9a7c2e5b8d1a0f4e6c9b2a7d5e8f1c';
const SAMPLE_CODES = ['4821-9930', '1174-5528', '6603-2817', '9045-7716', '3359-0482', '7712-6649', '2290-3185', '5536-8801'].join('\n');
const SAMPLE_TOTP = 'JBSW Y3DP EHPK 3PXP';
const NOOP = () => undefined;
const SAMPLE_SCRIPT = [
  'export default async function handler(req) {',
  "  const name = req.query.name ?? 'world';",
  '  const greeting = `Hello, ${name}`',
  '  return Response.json({ greeting, at: Date.now() );',
  '}',
  '',
].join('\n');

export function useHubFormsStrings(): T {
  return useStrings(strings);
}

// The rejection behind the "page words" specimen: a definite 409 whose mapped sentence the page's failedDetail replaces.
const CONFLICT = { status: 409, code: 'CONFLICT', kind: 'failed' };

function StateForm({ t, title, outcome, busy, refused }: { t: T; title: string; outcome?: OutcomeInput; busy?: boolean; refused?: boolean }) {
  const [name, setName] = useState(t('f.nameValue'));
  return (
    <div className={s.state} data-shot-state={title}>
      <span className={s.stateTitle}>{title}</span>
      <Form onSubmit={NOOP} outcome={outcome} busy={busy} onCheck={() => new Promise<void>((r) => window.setTimeout(r, 900))}>
        <TextField label={t('f.name')} value={name} onChange={setName} />
        <Switch label={t('f.history')} defaultSelected />
        <FormFooter
          dirty={outcome !== 'done'}
          doneFor={Infinity}
          onCancel={NOOP}
          pendingDetail={t('f.pendingDetail')}
          {...(outcome === 'failed'
            ? {
                outcome: { kind: 'failed' as const, message: t('f.failedMsg') },
              }
            : {})}
          {...(refused ? { outcome: { kind: 'failed' as const }, error: CONFLICT, failedDetail: t('f.failedDetail') } : {})}
        />
      </Form>
    </div>
  );
}

export function HubFormsSecure() {
  const t = useHubFormsStrings();
  const [saved, setSaved] = useState(false);
  const [entry, setEntry] = useState('');
  // The promise specimen keeps its own value: a token pasted there never shows in the other secret fields.
  const [token, setToken] = useState('');
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('correct horse 7');
  const [theme, setTheme] = useState<'dusk' | 'paper'>('dusk');
  const [font, setFont] = useState<'sans' | 'mono'>('sans');
  const [code, setCode] = useState(SAMPLE_SCRIPT);
  // `?part=` renders one section alone, so each shot frames it without scrolling.
  const [part] = useSearchParam('part');
  const on = (id: string) => !part || part === id;
  // `?state=` shows one form state alone (one primary per screen in its shot).
  const [only] = useSearchParam('state');
  const st = (id: string) => !only || only === id;
  return (
    <div className={s.page}>
      {on('states') && (
        <Panel title={t('sec.states')} description={t('sec.statesDesc')}>
          <div className={s.states}>
            {st('dirty') && <StateForm t={t} title={t('state.dirty')} />}
            {st('busy') && <StateForm t={t} title={t('state.busy')} busy />}
            {st('pending') && <StateForm t={t} title={t('state.pending')} outcome="pending" />}
            {st('failed') && <StateForm t={t} title={t('state.failed')} outcome="failed" />}
            {st('refused') && <StateForm t={t} title={t('state.refusedDetail')} refused />}
            {st('done') && <StateForm t={t} title={t('state.done')} outcome="done" />}
          </div>
        </Panel>
      )}

      {on('section') && (
        <Panel title={t('sec.section')} description={t('sec.sectionDesc')}>
          <div className={s.rows}>
            <SettingGroup>
              <SettingRow
                label={t('row.twofa')}
                help={t('row.twofaHelp')}
                outcome="pending"
                onCheck={NOOP}
                actions={
                  <>
                    <Button>{t('row.newCodes')}</Button>
                    <Button tone="danger">{t('row.turnOff')}</Button>
                  </>
                }
              />
              <SettingRow label={t('row.gate')} outcome="pending" onCheck={NOOP} onStop={NOOP}>
                <Switch label={t('row.on')} defaultSelected />
              </SettingRow>
              <SettingRow label={t('row.password')} help={t('row.passwordHelp')} actions={<Button>{t('row.change')}</Button>} />
            </SettingGroup>
            <div className={s.slotRow}>
              <span className={s.slotName}>{t('row.atlas')}</span>
              <OutcomeSlot outcome="pending" onCheck={NOOP} toastOnLeave={false}>
                <Button size="sm">{t('row.start')}</Button>
              </OutcomeSlot>
            </div>
            <div className={s.slotRow}>
              <span className={s.slotName}>{t('row.atlas')}</span>
              <OutcomeSlot outcome="failed" onRetry={NOOP}>
                <Button size="sm">{t('row.start')}</Button>
              </OutcomeSlot>
            </div>
          </div>
        </Panel>
      )}

      {on('secrets') && (
        <Panel title={t('sec.secrets')} description={t('sec.secretsDesc')}>
          <div className={s.grid}>
            <SecretField label={t('s.key')} value={SAMPLE_KEY} visiblePrefix={7} description={t('s.keyNote')} copyPrimary />
            <SecretField label={t('s.manual')} value={SAMPLE_TOTP} description={t('s.manualNote')} once={false} />
            <SecretField label={t('s.codes')} value={SAMPLE_CODES} format="lines" description={t('s.codesNote')} confirm={{ checked: saved, onChange: setSaved }} />
            <SecretField label={t('s.gone')} value={null} />
            <SecretInput label={t('s.entry')} description={t('s.entryHelp')} value={entry} onChange={setEntry} />
            <SecretInput label={t('s.provider')} description={t('s.providerHelp')} value={entry} onChange={setEntry} reveal={false} />
            {/* The reassurance as promises with a glyph each, not a grey caption. */}
            <SecretInput label={t('s.token')} promises={[t('s.promiseHere'), t('s.promiseStore')]} value={token} onChange={setToken} />
          </div>
        </Panel>
      )}

      {on('otp') && (
        <Panel title={t('sec.otp')} description={t('sec.otpDesc')}>
          <div className={s.grid}>
            <OtpField value={otp} onChange={setOtp} />
            <OtpField value="" onChange={NOOP} errorMessage={t('otp.wrong')} description={null} />
            <OtpField value="482" onChange={NOOP} isDisabled description={null} />
          </div>
        </Panel>
      )}

      {on('editor') && (
        <Panel title={t('sec.editor')} description={t('sec.editorDesc')}>
          <CodeEditor
            value={code}
            onChange={setCode}
            rows={8}
            lang="ts"
            problems={[
              { line: 3, message: t('ed.p1') },
              { line: 4, message: t('ed.p2') },
            ]}
            tools={
              <OutcomeSlot outcome="pending" onCheck={NOOP} toastOnLeave={false}>
                <Button size="sm">{t('ed.save')}</Button>
              </OutcomeSlot>
            }
          />
        </Panel>
      )}

      {on('fields') && (
        <Panel title={t('sec.fields')} description={t('sec.fieldsDesc')}>
          <div className={s.grid}>
            <div className={s.stack}>
              <TextField label={t('fe.current')} type="password" value="" errorMessage={t('fe.wrong')} />
              <TextField label={t('fe.new')} type="password" value={pw} onChange={setPw} reserveError />
              <RuleChecklist
                label={t('fe.rules')}
                rules={[
                  { id: 'len', label: t('fe.r1'), met: pw.length >= 12 },
                  { id: 'sym', label: t('fe.r2'), met: /[\d\W]/.test(pw) },
                  { id: 'same', label: t('fe.r3'), met: false },
                ]}
              />
            </div>
            <div className={s.stack}>
              <TextField
                label={t('fe.name')}
                defaultValue={t('f.nameValue')}
                mono
                suffix={
                  <>
                    <IconButton size="sm" icon="reload" label={t('fe.reroll')} />
                    <IconButton size="sm" icon="clock" label={t('fe.history')} />
                  </>
                }
              />
              <TextField label={t('fe.address')} prefix={t('fe.addressPrefix')} defaultValue="shop.example.com" />
              <div data-testid="field-action-wide">
                <TextField label={t('fe.code')} description={t('fe.codeHelp')} defaultValue="spring-friends" action={{ id: 'create', label: t('fe.create'), onPress: NOOP }} />
              </div>
              <div className={s.narrow} data-testid="field-action-narrow">
                <TextField label={t('fe.code')} defaultValue="spring-friends" action={{ id: 'create-narrow', label: t('fe.create'), onPress: NOOP }} />
              </div>
              <div className={s.narrow} data-testid="field-action-narrow-reason">
                <TextField label={t('fe.code')} action={{ id: 'create-reason', label: t('fe.create'), onPress: NOOP, disabledReason: t('fe.createWhy') }} />
              </div>
              <div data-testid="field-action-boxed">
                <TextField label={t('fe.address')} prefix={t('fe.addressPrefix')} defaultValue="shop.example.com" action={{ id: 'check-address', label: t('fe.check'), onPress: NOOP }} />
              </div>
              <div data-testid="field-action-lg">
                <TextField label={t('fe.code')} width="lg" action={{ id: 'create-lg', label: t('fe.create'), onPress: NOOP }} />
              </div>
              <div className={s.autoRow} data-testid="field-action-flex-auto">
                <TextField label={t('fe.code')} action={{ id: 'create-flex', label: t('fe.create'), onPress: NOOP }} />
              </div>
              <div className={s.autoGrid} data-testid="field-action-grid-auto">
                <TextField label={t('fe.code')} action={{ id: 'create-grid', label: t('fe.create'), onPress: NOOP }} />
              </div>
              <NumberField label={t('fe.memory')} defaultValue={4} unit={t('fe.memoryUnit')} />
              <Switch label={t('fe.switchLong')} />
              <Checkbox label={t('f.history')} defaultSelected />
              <CheckboxGroup label={t('fe.groupLabel')} description={t('fe.groupDesc')} defaultValue={['mail']}>
                <Checkbox value="mail" label={t('fe.groupMail')} />
                <Checkbox value="push" label={t('fe.groupPush')} />
              </CheckboxGroup>
              <Fieldset label={t('fe.setLabel')} description={t('fe.setDesc')}>
                <Switch label={t('fe.setSwitch')} defaultSelected />
                <Checkbox label={t('fe.setCheck')} />
              </Fieldset>
              <NumberField label={t('fe.columns')} placeholder={t('fe.columnsAuto')} />
              <Select
                label={t('fe.theme')}
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'dusk', label: t('fe.themeDusk'), swatch: ['var(--hx-ink)', 'var(--hx-acc)', 'var(--hx-card)'] },
                  { value: 'paper', label: t('fe.themePaper'), swatch: ['var(--hx-card)', 'var(--hx-link)', 'var(--hx-muted)'] },
                ]}
              />
              <Select
                label={t('fe.font')}
                value={font}
                onChange={setFont}
                options={[
                  { value: 'sans', label: t('fe.fontSans'), sample: { fontFamily: 'system-ui, sans-serif' } },
                  { value: 'mono', label: t('fe.fontMono'), sample: { fontFamily: 'ui-monospace, monospace' } },
                ]}
              />
              <SettingGroup>
                <SettingRow label={t('fe.clock')}>
                  <Switch label={t('fe.clock')} labelHidden defaultSelected />
                </SettingRow>
              </SettingGroup>
            </div>
          </div>
        </Panel>
      )}
      {on('fields') && (
        <AnatomySection id="form-sections" title={t('fs.title')} description={t('fs.desc')} state={{ kind: 'ready' }}>
          <div className={s.narrowForm} data-testid="form-sections">
            <Stack gap={3}>
              <FormSection label={t('fs.lead')}>
                <TextField label={t('fs.name')} defaultValue={t('fs.nameValue')} />
              </FormSection>
              <FormSection title={t('fs.access')} description={t('fs.accessDesc')}>
                <TextField label={t('fs.addresses')} description={t('fs.addressesHelp')} mono />
                <Checkbox label={t('fs.readOnly')} />
              </FormSection>
              <FormSection title={t('fs.notes')}>
                <TextField label={t('fs.note')} multiline rows={2} />
              </FormSection>
              <FormSection kind="summary" label={t('fs.sum')}>
                <Facts layout="spec" columns={1} label={t('fs.sum')} items={[{ label: t('fs.sumKeys'), value: t('fs.sumKeysValue') }]} />
              </FormSection>
            </Stack>
          </div>
        </AnatomySection>
      )}
    </div>
  );
}
