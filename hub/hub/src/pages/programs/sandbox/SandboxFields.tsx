// The sandbox form's fields (presets, files, network, advanced network, resources): one component the Sandbox editor
// and the New program drawer both render, so the fields, words and checks are never forked. The caller owns
// the form, its checks and what a change clears; this only draws and reports. Each part is a titled section:
// the presets are setting rows, the advanced network part is its own section (never a disclosure inside one), and the
// resource limits pair in two columns. `locked` (New program's) holds every control for a whole send.
import { Band, Checkbox, RadioGroup, Row, RowNote, SettingGroup, SettingRow, Switch, SubSection, TextButton, TextField, useStrings, type StringKey } from '@kit';
import type { ReactNode } from 'react';
import { presetBlocked, type Field, type Form, type Preset, type ProgramFacts } from './form';
import strings from './strings.en.json';
import s from './SandboxFields.module.css';

type Key = StringKey<typeof strings>;
export const PRESETS: readonly Preset[] = ['noNetwork', 'noOutgoingTcp', 'readOnly', 'limits'];

export interface SandboxFieldsProps {
  form: Form;
  /** What the program is known to declare (ports): presets that would break it are off. null: not known. */
  known: ProgramFacts | null;
  /** The preset last used (its "used" line); null: none since the last field edit. */
  used: Preset | null;
  busy: boolean;
  /** One field's setter; the caller decides what else a change clears. */
  set: <K extends keyof Form>(k: K) => (v: Form[K]) => void;
  /** A field's shown error, or undefined (the caller decides when errors show). */
  errOf: (f: Field) => string | undefined;
  onPreset: (p: Preset) => void;
  /** Holds every field and preset (a send in flight): what was sent is what stays shown. */
  locked?: boolean;
  /** A caution about the inbound limits (the Sandbox editor's degraded host firewall), shown in Advanced network above
   *  its fields: the one warning of that section. */
  inboundNote?: ReactNode;
}

export function SandboxFields({ form, known, used, busy, set, errOf, onPreset, locked, inboundNote }: SandboxFieldsProps) {
  const t = useStrings(strings);
  const connectOff = form.mode !== 'restricted' && form.connectPorts.trim() === '';
  const held = locked ? { isDisabled: true } : {};
  return (
    <>
      <SubSection title={t('sb.ed.presets')} state={{ kind: 'ready' }}>
        <SettingGroup label={t('sb.ed.presets')}>
          {PRESETS.map((pr) => {
            const why = presetBlocked(pr, known);
            return (
              <SettingRow
                key={pr}
                label={t(`sb.ed.preset.${pr}` as Key)}
                help={why ? t(`sb.ed.preset.${pr}.${why}` as Key) : t(`sb.ed.preset.${pr}.d` as Key)}
                actions={
                  <TextButton
                    isDisabled={!!why || busy || !!locked}
                    onPress={() => onPreset(pr)}
                    aria-label={t('sb.ed.applyPreset', { preset: t(`sb.ed.preset.${pr}` as Key) })}
                  >
                    {t('sb.ed.apply')}
                  </TextButton>
                }
              >
                <div role="status" data-sb-preset={pr} /* reason: a one-line Used hint; mounted empty before any Use so the live region exists before its message */>
                  {used === pr ? <RowNote>{t('sb.ed.used')}</RowNote> : null}
                </div>
              </SettingRow>
            );
          })}
        </SettingGroup>
      </SubSection>

      <SubSection title={t('sb.ed.files')}>
        <Switch label={t('sb.ed.readOnlyRoot')} isSelected={form.readOnlyRoot} onChange={set('readOnlyRoot')} {...held} />
        <TextField
          label={t('sb.ed.writable')}
          description={t('sb.ed.writable.d')}
          multiline
          rows={3}
          mono
          value={form.writable}
          onChange={set('writable')}
          errorMessage={errOf('writable')}
          {...held}
        />
        <TextField
          label={t('sb.ed.hidden')}
          description={t('sb.ed.hidden.d')}
          multiline
          rows={3}
          mono
          value={form.hidden}
          onChange={set('hidden')}
          errorMessage={errOf('hidden')}
          {...held}
        />
      </SubSection>

      <SubSection title={t('sb.ed.network')}>
        <RadioGroup
          label={t('sb.ed.mode')}
          value={form.mode}
          onChange={set('mode')}
          errorMessage={errOf('mode')}
          {...held}
          options={(['full', 'restricted', 'none'] as const).map((m) => ({
            value: m,
            label: t(`sb.ed.mode.${m}` as Key),
            description: t(`sb.ed.mode.${m}.d` as Key),
          }))}
        />
        <RadioGroup
          label={t('sb.ed.bindMode')}
          value={form.bindMode}
          onChange={set('bindMode')}
          orientation="horizontal"
          {...held}
          options={[
            { value: 'program', label: t('sb.ed.bindMode.program') },
            { value: 'list', label: t('sb.ed.bindMode.list') },
          ]}
        />
        {form.bindMode === 'list' && (
          <TextField
            label={t('sb.ed.bindPorts')}
            description={t('sb.ed.bindPorts.d')}
            mono
            value={form.bindPorts}
            onChange={set('bindPorts')}
            errorMessage={errOf('bindPorts')}
            {...held}
          />
        )}
        {form.bindMode === 'program' && errOf('bindPorts') && <Band tone="danger" /* noDetails: the Hub's own check of the field; nothing was sent */>{errOf('bindPorts')}</Band>}
        <TextField
          label={t('sb.ed.connectPorts')}
          description={connectOff ? t('sb.ed.connectPorts.off') : t('sb.ed.connectPorts.d')}
          mono
          value={form.connectPorts}
          onChange={set('connectPorts')}
          errorMessage={errOf('connectPorts')}
          isDisabled={connectOff || !!locked}
        />
      </SubSection>

      <SubSection title={t('sb.ed.advanced')}>
        {inboundNote}
        <TextField
          label={t('sb.ed.ingressFrom')}
          description={t('sb.ed.ingressFrom.d')}
          mono
          value={form.ingressFrom}
          onChange={set('ingressFrom')}
          errorMessage={errOf('ingressFrom')}
          {...held}
        />
        <TextField label={t('sb.ed.rate')} description={t('sb.ed.rate.d')} mono value={form.rate} onChange={set('rate')} errorMessage={errOf('rate')} {...held} />
        <Checkbox
          label={t('sb.ed.allowPlatform')}
          description={t('sb.ed.allowPlatform.d')}
          isSelected={form.allowPlatform}
          onChange={set('allowPlatform')}
          {...held}
        />
        <Checkbox label={t('sb.ed.udpDeny')} isSelected={form.udpDeny} onChange={set('udpDeny')} {...held} />
      </SubSection>

      <SubSection title={t('sb.ed.resources')} state={{ kind: 'ready' }}>
        <Row gap={3} align="start" wrap>
          {(['maxMemory', 'maxPids', 'maxOpenFiles', 'maxCpu', 'maxFileSize'] as const).map((k) => (
            <div key={k} className={s.half}>
              <TextField
                label={t(`sb.ed.${k}` as Key)}
                description={t(`sb.ed.${k}.d` as Key)}
                mono
                value={form[k]}
                onChange={set(k)}
                errorMessage={errOf(k)}
                {...held}
              />
            </div>
          ))}
        </Row>
        <Checkbox label={t('sb.ed.privateTmp')} isSelected={form.privateTmp} onChange={set('privateTmp')} {...held} />
        <TextField
          label={t('sb.ed.tmpSize')}
          description={t('sb.ed.tmpSize.d')}
          mono
          value={form.tmpSize}
          onChange={set('tmpSize')}
          errorMessage={errOf('tmpSize')}
          {...held}
        />
      </SubSection>
    </>
  );
}
