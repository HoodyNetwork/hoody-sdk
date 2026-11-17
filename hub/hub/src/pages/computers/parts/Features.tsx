// The Overview's Features section: every per-computer feature the Hoody API keeps, one row each, listed whether it is
// on or off, with one line that says what it does.
//   - The Hoody Kit and the developer kit are chosen when the computer is made: a row with On or Off, never a switch.
//   - Hoody AI, the RAM disk and Autostart are switches (features.ts): one change each, held when its
//     outcome is unknown; turning the RAM disk off is confirmed first.
//   - KVM is the VMs page's flow (its links: the same lock, proof and words as its "This computer" section). The row is
//     always shown. On a server that is not bare metal the switch still takes a press, and the press opens a dialog
//     that says why KVM is not offered there; nothing is sent. A server whose kind is not known is never called shared:
//     the row says it could not be checked and the API decides.
// A value the computer's row does not give is "Not known", never Off. `ramdisk_scope` is not offered here.
import {
  AnatomySection, Band, Button, ConfirmDialog, Dialog, HeldBand, SettingGroup, SettingRow, SettingSwitch, StatusPill, followPageLink, useGo, usePageLink,
  useStrings, type SectionState,
} from '@kit';
import { computersList, isFramed, useComputersAll, useCore } from '@core';
import { useCallback, useRef, useState } from 'react';
import { links as billingLinks } from '../../billing/links';
import { KvmDialog, KvmOutcome, kvmAction, kvmFactsOfRow, kvmHeldKey, kvmStrings, useKvmFlow, type KvmAction, type KvmFlow, type KvmTarget } from '../../vms/links';
import { useCaps, useComputers } from '../data';
import { useFeatureFlow, type FeatureFlow } from '../features';
import { expiredOf, featureValue, toggleBlock, type Toggle, type ToggleBlock } from '../features-logic';
import strings from '../strings.en.json';
import type { Computer, Project } from '../types';
import { sharedWithMe } from './projectPerms.logic';

const READY: SectionState = { kind: 'ready' };

type T = ReturnType<typeof useStrings<typeof strings>>;

export function Features({ c, projects }: { c: Computer; projects?: readonly Project[] | undefined }) {
  const t = useStrings(strings);
  const caps = useCaps();
  const account = useCore().account;
  const canWrite = caps === 'all' || caps.has('computers.update');
  // Only the project's owner may change a computer's settings. Blocked here only when the projects list proves the
  // project is someone else's; a project it does not hold, or one with no owner named, leaves the switches live.
  const project = projects?.find((p) => p.id === c.project_id);
  const notOwner = project ? sharedWithMe(project, account) : false;
  const kvmBlock = toggleBlock({ expired: expiredOf(c), canWrite, framed: isFramed() });
  const block = toggleBlock({ expired: expiredOf(c), canWrite, framed: isFramed(), notOwner });
  // The Overview's computer is a row of the page's own computers read (data.ts useComputers), a different cache from
  // core's list: both are read again after an answer, so the switch shows what the change left.
  const page = useComputers();
  const pageRead = useRef(page.refetch);
  pageRead.current = page.refetch;
  const reread = useCallback(() => {
    void computersList.invalidate();
    void pageRead.current();
  }, []);
  // The newest row of the computer shown: the confirm judges it again when pressed.
  const shown = useRef(c);
  shown.current = c;
  const flow = useFeatureFlow(reread, (id, feature) => (shown.current.id === id ? featureValue(shown.current, feature) : null), block !== null);
  const a = flow.ask;
  // KVM is the VMs page's change: its own refusals are the API's to give, so the owner rule is not applied to it here.
  const kvm = useKvm(c, reread);
  return (
    <AnatomySection id="features" title={t('feat.title')} description={t('feat.about')} state={READY}>
      <SettingGroup label={t('feat.title')}>
        <MadeWith c={c} id="hoody_kit" t={t} />
        <MadeWith c={c} id="dev_kit" t={t} />
        <FeatureSwitch c={c} feature="ai" block={block} flow={flow} t={t} />
        <FeatureSwitch c={c} feature="ramdisk" block={block} flow={flow} t={t} />
        <FeatureSwitch c={c} feature="autostart" block={block} flow={flow} t={t} />
        <KvmRow c={c} k={kvm} block={kvmBlock} t={t} />
      </SettingGroup>
      <KvmAfter c={c} k={kvm} block={kvmBlock} t={t} />
      <FeatureHeld c={c} feature="ai" flow={flow} t={t} overlayId="computers-feature-held-dismiss-ai" />
      <FeatureHeld c={c} feature="ramdisk" flow={flow} t={t} overlayId="computers-feature-held-dismiss-ramdisk" />
      <FeatureHeld c={c} feature="autostart" flow={flow} t={t} overlayId="computers-feature-held-dismiss-autostart" />
      <ConfirmDialog
        isOpen={a !== null}
        onOpenChange={(open) => { if (!open) flow.cancel(); }}
        overlayId="computers-feature-ask"
        title={a ? t('feat.ask.ramdiskOff.title', { name: a.name }) : ''}
        body={a ? t('feat.ask.ramdiskOff.body') : undefined}
        confirmLabel={t('feat.ask.ramdiskOff.go')}
        onConfirm={flow.confirm}
        busy={flow.confirming}
      />
    </AnatomySection>
  );
}

/** On, Off, or Not known, as a read-only value. */
function StateValue({ value, t }: { value: boolean | null; t: T }) {
  if (value === null) return <>{t('feat.unknown')}</>;
  return <StatusPill tone={value ? 'ok' : 'neutral'}>{t(value ? 'feat.on' : 'feat.off')}</StatusPill>;
}

/** A feature chosen when the computer is made. */
function MadeWith({ c, id, t }: { c: Computer; id: 'hoody_kit' | 'dev_kit'; t: T }) {
  return (
    <SettingRow label={t(`feat.${id}`)} help={`${t(`feat.${id}.help`)} ${t('feat.madeWith')}`}>
      <StateValue value={featureValue(c, id)} t={t} />
    </SettingRow>
  );
}

const helpWith = (help: string, block: ToggleBlock | null, t: T) => (block ? `${help} ${t(`feat.why.${block}`)}` : help);

function FeatureSwitch({ c, feature, block, flow, t }: { c: Computer; feature: Toggle; block: ToggleBlock | null; flow: FeatureFlow; t: T }) {
  const value = featureValue(c, feature);
  const label = t(`feat.${feature}`);
  const help = helpWith(t(`feat.${feature}.help`), block, t);
  if (value === null) {
    return (
      <SettingRow label={label} help={help}>
        <StateValue value={null} t={t} />
      </SettingRow>
    );
  }
  const held = flow.held(c.id, feature);
  const result = held ? null : flow.result(c.id, feature);
  return (
    <SettingSwitch
      label={label}
      help={help}
      isSelected={value}
      isDisabled={block !== null || held !== null || flow.sending(c.id, feature)}
      onChange={(on) => flow.press({ id: c.id, name: c.name }, feature, on)}
      outcome={result?.outcome}
      error={result?.error}
    />
  );
}

/** A switch's change whose outcome is not known yet: Check again or Stop tracking, under the group. Each feature names
 *  its own overlay (no two of the page share one). */
function FeatureHeld({ c, feature, flow, t, overlayId }: { c: Computer; feature: Toggle; flow: FeatureFlow; t: T; overlayId: string }) {
  const held = flow.held(c.id, feature);
  if (!held) return null;
  return (
    <HeldBand
      overlayId={overlayId}
      text={t(held.on ? 'feat.held.on' : 'feat.held.off', { what: t(`feat.${feature}`), name: c.name })}
      readOnly={!held.own}
      onCheck={() => flow.check(c.id, feature)}
      onDismiss={() => flow.dismiss(c.id, feature)}
    />
  );
}

/** The KVM flow of the VMs page for this computer, read by its row and by what follows the group. The facts come from
 *  core's computers list (the list its confirm reads again); null when the list does not show this computer, or not
 *  whether KVM is on. `why`: the computer the "needs a bare-metal server" dialog is open for. */
interface KvmParts {
  flow: KvmFlow;
  view: KvmView | null;
  why: string | null;
  setWhy: (id: string | null) => void;
}

interface KvmView {
  target: KvmTarget;
  /** Not a bare-metal server: the press opens the dialog; nothing is sent. */
  shared: boolean;
  /** Another refusal the VMs rules give before any request (expired, a server that allows no VMs). */
  refused: Exclude<Extract<KvmAction, { kind: 'blocked' }>['reason'], 'shared'> | null;
  /** KVM changes only while the computer is stopped or running. */
  waiting: boolean;
}

function useKvm(c: Computer, reread: () => void): KvmParts {
  const flow = useKvmFlow(reread);
  const all = useComputersAll();
  const [why, setWhy] = useState<string | null>(null);
  const listed = all.rows?.find((r) => r.id === c.id);
  const facts = listed ? kvmFactsOfRow(listed) : null;
  const action = facts ? kvmAction(facts) : null;
  const view: KvmView | null = !facts || !action || action.kind === 'none' ? null : {
    target: { id: facts.id, name: c.name, facts },
    shared: action.kind === 'blocked' && action.reason === 'shared',
    refused: action.kind === 'blocked' && action.reason !== 'shared' ? action.reason : null,
    waiting: action.kind === 'turn' && action.step === 'wait',
  };
  return { flow, view, why, setWhy };
}

/** The KVM row of the group. On shared hardware the switch takes the press and opens the dialog; nothing is sent. */
function KvmRow({ c, k, block, t }: { c: Computer; k: KvmParts; block: ToggleBlock | null; t: T }) {
  const v = k.view;
  if (!v) {
    // The list does not show this computer (or not whether KVM is on): its own row's value, read-only.
    return (
      <SettingRow label={t('feat.kvm')} help={t('feat.kvm.help')}>
        <StateValue value={featureValue(c, 'kvm')} t={t} />
      </SettingRow>
    );
  }
  const { target, shared, refused, waiting } = v;
  const busy = k.flow.sending(target.id) || k.flow.held(target.id) !== null;
  const base = t(target.facts.kvm ? 'feat.kvm.help.on' : 'feat.kvm.help');
  const help = shared ? t('feat.kvm.help.shared')
    : refused === 'notAllowed' ? `${base} ${t('feat.kvm.notAllowed')}`
    : refused === 'expired' ? `${base} ${t('feat.why.expired')}`
    : block ? `${base} ${t(`feat.why.${block}`)}`
    : waiting ? `${base} ${t('feat.kvm.wait')}`
    : target.facts.kind === null && !target.facts.kvm ? `${base} ${t('feat.kvm.kindUnknown')}`
    : base;
  return (
    <SettingSwitch
      label={t('feat.kvm')}
      help={help}
      isSelected={target.facts.kvm === true}
      isDisabled={shared ? false : block !== null || busy || refused !== null || waiting}
      onChange={() => (shared ? k.setWhy(c.id) : k.flow.press(target))}
    />
  );
}

/** What follows the group for KVM: its held band, last refusal, next step (KVM after a stop, or Start computer after
 *  KVM changed), the VMs page's confirm, and the dialog that says why KVM needs a bare-metal server. */
function KvmAfter({ c, k, block, t }: { c: Computer; k: KvmParts; block: ToggleBlock | null; t: T }) {
  const kt = useStrings(kvmStrings);
  const go = useGo();
  const billing = usePageLink('billing');
  const v = k.view;
  if (!v) return null;
  const { flow } = k;
  const { target, shared } = v;
  const facts = target.facts;
  const held = flow.held(target.id);
  const result = flow.result(target.id);
  const next: 'on' | 'off' | 'start' | null = held ? null
    : flow.startOffered(target) ? 'start'
    : result?.outcome === 'done' && result.what === 'stop' && facts.status === 'stopped' && facts.kvm !== result.want ? (result.want ? 'on' : 'off')
    : null;
  const whyOpen = k.why === c.id && shared;
  return (
    <>
      {held && (
        <HeldBand
          overlayId="computers-feature-held-dismiss-kvm"
          text={kt(kvmHeldKey(held.what, held.want), { name: target.name })}
          readOnly={!held.own}
          onCheck={() => flow.check(target.id)}
          onDismiss={() => flow.dismiss(target.id)}
        />
      )}
      {!held && result && result.outcome !== 'done' && <KvmOutcome flow={flow} id={target.id} name={target.name} />}
      {next && (
        <Band tone="neutral" actions={next === 'start' ? <Button size="sm" onPress={() => flow.start(target)} isDisabled={block !== null}>{kt('kvm.start')}</Button> : undefined}>
          {kt(next === 'start' ? (facts.kvm ? 'kvm.done.on' : 'kvm.done.off') : next === 'on' ? 'kvm.next.on' : 'kvm.next.off', { name: target.name })}
        </Band>
      )}
      <KvmDialog flow={flow} />
      <Dialog
        isOpen={whyOpen}
        onOpenChange={(open) => { if (!open) k.setWhy(null); }}
        overlayId="computers-feature-kvm-why"
        title={t('feat.kvm.why.title')}
        body={t('feat.kvm.why.body', { name: c.name })}
        primaryLabel={billing ? t('feat.kvm.why.go') : undefined}
        onPrimary={() => {
          k.setWhy(null);
          // The servers view of Billing where this page load serves it, else the page link as given.
          if (billing?.kind === 'hub') go(billingLinks.servers());
          else if (billing) followPageLink(billing, go);
        }}
        cancelLabel={t('feat.kvm.why.close')}
      />
    </>
  );
}
