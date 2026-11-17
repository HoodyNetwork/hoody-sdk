// The Settings tab of one VM: its size, how it starts and stops, its screen and its limits, in one form.
// The VM program changes these only while the VM is stopped: while it is not, the form is locked and one band says
// why, before the person tries. A save sends only the fields that changed (update-logic settingsBody), after the
// program's own bounds are checked here. A save whose answer is lost is held until a fresh read of the same VM shows
// every sent field, or the person stops tracking it; nothing is sent again by the page.
import { isFramed } from '@core';
import { AnatomySection, Band, Form, FormFooter, HeldBand, NumberField, Outcome, SettingGroup, SettingRow, Switch, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import type { Host } from '../data';
import { memoryUse, type VmReady } from '../logic';
import strings from '../strings.en.json';
import { editBlock, formOf, GRACE_DEFAULT, settingsBody, settingsProblems, type SettingsField, type SettingsForm } from '../update-logic';
import { useVmChanges } from '../update';
import { heldKey, heldReason, portsBlockKey, refusalKey, type Key } from './Ports';
import { isVmUnsure, useVmUnsure } from './unsure';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const NUM = { useGrouping: false, maximumFractionDigits: 0 } as const;
const DEC = { useGrouping: false, maximumFractionDigits: 2 } as const;

/** Free memory (MiB) in the field's own unit, GiB, rounded down to a tenth. */
const gibOf = (mib: number): string => String(Math.floor((mib / 1024) * 10) / 10);

/** A number field's value from a stored one in another unit: null shows empty. */
const shown = (v: number | null, unit = 1) => (v === null || !Number.isFinite(v) ? Number.NaN : v / unit);
/** A stored value from a typed one: empty stays empty (NaN), a number is rounded to the program's whole unit. */
const stored = (v: number, unit = 1) => (Number.isFinite(v) ? Math.round(v * unit) : Number.NaN);

/** The edits the read does not show yet (the same object when none left). */
function sameAsRead(e: Partial<SettingsForm>, read: SettingsForm): Partial<SettingsForm> {
  const keep = Object.entries(e).filter(([k, v]) => !Object.is(v, read[k as keyof SettingsForm]));
  return keep.length === Object.keys(e).length ? e : (Object.fromEntries(keep) as Partial<SettingsForm>);
}

export function Settings({ vm, host }: { vm: VmReady; host: Host }) {
  const t = useStrings(strings);
  const ch = useVmChanges(host.target, vm);
  // Only the fields the person changed are kept; every other field follows the VM's latest read, so a save never sends
  // back an older value of a field someone else changed meanwhile.
  const [edits, setEdits] = useState<Partial<SettingsForm>>({});
  const form: SettingsForm = { ...formOf(vm.spec), ...edits };
  const [tried, setTried] = useState(false);
  const set = (p: Partial<SettingsForm>) => { setEdits((e) => ({ ...e, ...p })); ch.clearResult(); };
  // A change the read now shows (saved, or made elsewhere) is no longer the person's: the field follows the read again.
  useEffect(() => { setEdits((e) => sameAsRead(e, formOf(vm.spec))); }, [vm.spec]);
  const framed = isFramed();
  // The reads on screen do not agree on which VM holds this name: no change is sent by name meanwhile.
  const unsure = useVmUnsure(vm.name);
  const why: Key | null = unsure ? 'power.why.unread' : portsBlockKey(vm, ch, framed);
  const stoppedOnly = editBlock(vm) === 'notStopped';
  const body = settingsBody(vm.spec, form);
  const dirty = Object.keys(body).length > 0;
  const problems = settingsProblems(vm.spec, form);
  const err = (f: SettingsField): string | undefined => {
    const p = problems.find((x) => x.field === f);
    if (!p || (!tried && f !== 'screen')) return undefined;
    return t(f === 'screen' ? 'settings.err.audio' : (`settings.err.${f}` as Key));
  };
  const free = host.state.kind === 'ready' ? memoryUse(host.state.caps).freeForNewVmMib : null;
  const overFree = free !== null && body.memory_mib !== undefined && body.memory_mib > free;
  const submit = () => {
    setTried(true);
    // Asked at the press: the VM's screen may have lost the name since the form was drawn. Nothing is sent.
    if (problems.length > 0 || !dirty || isVmUnsure(vm.name)) return;
    if (ch.update('settings', body)) setTried(false);
  };

  const held = ch.held;
  const result = ch.result && ch.result.op === 'settings' ? ch.result : null;
  const reason = held?.own && ch.heldError ? heldReason(ch.heldError) : null;
  const locked = why !== null;

  return (
    <AnatomySection
      id="vm-settings"
      title={t('settings.title')}
      description={t('settings.about')}
      state={{ kind: 'ready' }}
      notices={
        held ? (
          <HeldBand
            /* A newer hold in its place remounts the band: a Stop tracking question open for the older one closes. */
            key={held.hold ?? String(held.change.at)}
            overlayId="vms-settings-held-dismiss"
            text={held.gone ? t('settings.chg.held.gone', { vm: vm.name }) : `${t(heldKey(held.op), { vm: vm.name })}${reason ? ` ${t(reason)}` : ''}`}
            readOnly={!held.own}
            dismissBody={t('settings.chg.held.dismissBody')}
            onCheck={() => ch.check(held)}
            onDismiss={() => ch.dismiss(held)}
          />
        ) : result && result.outcome !== 'done' ? (
          <Outcome outcome={{ kind: result.outcome }} detail={result.outcome === 'failed' ? t(refusalKey(result.error)) : undefined} error={result.error} />
        ) : why && (stoppedOnly || framed || unsure) ? (
          <Band tone="neutral" /* noDetails: why the form is locked, before anything is sent */>{t(why)}</Band>
        ) : undefined
      }
    >
      <Form onSubmit={submit} busy={ch.sending === 'settings'} locked={locked}>
        <SettingGroup variant="field" title={t('settings.size')}>
          <SettingRow label={t('settings.memory')} help={free !== null ? (overFree ? t('settings.err.memoryFree', { free: gibOf(free) }) : t('settings.memory.help', { free: gibOf(free) })) : undefined}>
            {(ids) => (
              <NumberField
                aria-label={t('settings.memory')}
                aria-describedby={ids.helpId}
                value={shown(form.memoryMib, 1024)}
                onChange={(v) => set({ memoryMib: stored(v, 1024) })}
                formatOptions={DEC}
                step={0.5}
                errorMessage={err('memory')}
                width="sm"
              />
            )}
          </SettingRow>
          <SettingRow label={t('settings.cpus')}>
            <NumberField aria-label={t('settings.cpus')} value={form.vcpus} onChange={(v) => set({ vcpus: v })} formatOptions={NUM} errorMessage={err('vcpus')} width="sm" />
          </SettingRow>
        </SettingGroup>
        <SettingGroup variant="field" title={t('settings.startStop')}>
          <SettingRow label={t('settings.autostart')} help={t('settings.autostart.help')}>
            {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.autostart} onChange={(on) => set({ autostart: on })} />}
          </SettingRow>
          <SettingRow label={t('settings.grace')} help={t('settings.grace.help')}>
            {(ids) => (
              <NumberField
                aria-label={t('settings.grace')}
                aria-describedby={ids.helpId}
                value={shown(form.graceSeconds)}
                onChange={(v) => set({ graceSeconds: Number.isFinite(v) ? v : null })}
                formatOptions={NUM}
                placeholder={String(GRACE_DEFAULT)}
                errorMessage={err('grace')}
                width="sm"
              />
            )}
          </SettingRow>
        </SettingGroup>
        <SettingGroup variant="field" title={t('settings.screen')}>
          <SettingRow label={t('settings.screen.on')} help={t('settings.screen.help')}>
            {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.screen} onChange={(on) => set({ screen: on })} />}
          </SettingRow>
          {err('screen') && <Band tone="danger" /* noDetails: a check made before sending */>{err('screen')}</Band>}
        </SettingGroup>
        <SettingGroup variant="field" title={t('settings.limits')}>
          <SettingRow label={t('settings.diskBps')} help={t('settings.diskBps.help')}>
            {(ids) => (
              <NumberField
                aria-label={t('settings.diskBps')}
                aria-describedby={ids.helpId}
                value={shown(form.diskBps, MIB)}
                onChange={(v) => set({ diskBps: Number.isFinite(v) ? stored(v, MIB) : null })}
                formatOptions={{ useGrouping: false, maximumFractionDigits: 4 }}
                placeholder={t('settings.none')}
                errorMessage={err('diskBps')}
                width="sm"
              />
            )}
          </SettingRow>
          <SettingRow label={t('settings.diskIops')} help={t('settings.diskIops.help')}>
            {(ids) => (
              <NumberField
                aria-label={t('settings.diskIops')}
                aria-describedby={ids.helpId}
                value={shown(form.diskIops)}
                onChange={(v) => set({ diskIops: Number.isFinite(v) ? v : null })}
                formatOptions={NUM}
                placeholder={t('settings.none')}
                errorMessage={err('diskIops')}
                width="sm"
              />
            )}
          </SettingRow>
          {vm.spec.fileSharing && (
            <SettingRow label={t('settings.shareQuota')} help={t('settings.shareQuota.help')}>
              {(ids) => (
                <NumberField
                  aria-label={t('settings.shareQuota')}
                  aria-describedby={ids.helpId}
                  value={shown(form.shareQuotaBytes, GIB)}
                  onChange={(v) => set({ shareQuotaBytes: Number.isFinite(v) ? stored(v, GIB) : null })}
                  formatOptions={DEC}
                  placeholder={t('settings.none')}
                  errorMessage={err('shareQuota')}
                  width="sm"
                />
              )}
            </SettingRow>
          )}
        </SettingGroup>
        <FormFooter
          /* noDetails: refusals and unknown outcomes are the section's notices, in the page's words */
          dirty={dirty}
          busy={ch.sending === 'settings'}
          outcome={result?.outcome === 'done' ? 'done' : undefined}
          doneText={t('settings.saved')}
          doneFor={Infinity}
          submitLabel={t('settings.save')}
          submitDisabled={locked || (tried && problems.length > 0)}
          onDiscard={() => { setEdits({}); setTried(false); ch.clearResult(); }}
          toastOnLeave={false}
        />
      </Form>
    </AnatomySection>
  );
}
