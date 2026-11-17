// AI → Settings → Rules & hooks → Agent features:
// the agent's features on this computer, read with GET /settings/features. A feature the agent lets the Hub change is a
// switch: one PATCH of that feature alone, its outcome on the row (C9: an unknown outcome locks the switch until a fresh read
// shows the value sent, or the person stops tracking it after the kit's warning; a read still showing the old value proves
// nothing, since the agent's write may be waiting on the settings lock). The agent's value of CLAUDE.md / AGENTS.md is the
// Global realm's (a chat reads its own realm's settings for these), so in another realm those rows show neither a value nor
// a switch. Trusting the agent's own hooks is shown, never changed: on the Hooks card when one is drawn. A failed or
// malformed read shows no value at all.
//
// The rows are one kit SettingGroup in an AnatomySection, whose state draws loading, failure and an unreadable answer. An
// unknown outcome's banner (Check again, warned Stop tracking) shows under the group, not in the row's narrow control column:
// the switch keeps its runner and portals the banner into the slot below.
import { realmLabel, refusal, useRunner, type Target } from '@core';
import {
  AnatomySection, OutcomeBanner, SettingGroup, SettingRow, SettingSwitch, StatusPill, usePendingToast, useStrings, type OutcomeLike,
  type SectionState,
} from '@kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { portal as createPortal } from '../../parts/portal';
import { computerOf, FEATURES_LOCK, featuresSource, useFeatures, type SetFeature } from './features.data';
import { featureView, folderMayOverride, type FeatureRow } from './features.logic';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** `selfTrust` false: the Hooks card beside it shows that row (Settings.tsx, inside the place); under All realms there is no
 *  Hooks card, so the row stays here. */
export default function AgentFeatures({ target, realm, selfTrust = true }: { target: Target; realm: string; selfTrust?: boolean }) {
  const t = useStrings(strings);
  const q = useFeatures(target);
  const reload = () => void q.refetch();
  // The banner slot under the group: a switch whose outcome is unknown shows its banner there.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const state: SectionState = q.isError
    ? { kind: 'failed', error: q.error, onRetry: reload, busy: q.isFetching }
    : q.isPending
      ? { kind: 'loading', rows: 3 }
      : { kind: 'ready' };
  // Self-trust shows on the Hooks card, beside the hooks it is about, wherever that card is drawn.
  const rows = q.data?.filter((f) => selfTrust || f.name !== 'hooks_agent_self_trust') ?? [];
  return (
    <AnatomySection id="ai-features" title={t('features.title')} description={t('features.body')} state={state}>
      {rows.length > 0 && (
        <SettingGroup label={t('features.title')}>
          {rows.map((f) => <Feature key={f.name} f={f} target={target} realm={realm} readAt={q.dataUpdatedAt} slot={slot} t={t} />)}
        </SettingGroup>
      )}
      <div ref={setSlot} data-features-pending="" />
    </AnatomySection>
  );
}

function Feature({ f, target, realm, readAt, slot, t }: { f: FeatureRow; target: Target; realm: string; readAt: number; slot: HTMLDivElement | null; t: T }) {
  const view = featureView(f, realm);
  const label = t(`f.${f.name}`);
  const help = t(`f.${f.name}.help`);
  if (view === 'perRealm') {
    const n = realmLabel(realm);
    const name = n.kind === 'alias' || n.kind === 'short' ? n.text : null;
    return (
      <SettingRow label={label} help={`${help} ${name ? t('perRealm', { realm: name }) : t('perRealmAll')}`}>
        <StatusPill>{t('perRealm.pill')}</StatusPill>
      </SettingRow>
    );
  }
  if (view === 'value') {
    return (
      <SettingRow label={label} help={`${help} ${t('readOnly.help')}`}>
        <StatusPill tone={f.value ? 'ok' : 'neutral'}>{f.value ? t('on') : t('off')}</StatusPill>
      </SettingRow>
    );
  }
  return <FeatureSwitch f={f} target={target} label={label} help={realm === 'global' && folderMayOverride(f) ? `${help} ${t('folderMayOverride')}` : help} readAt={readAt} slot={slot} t={t} />;
}

const useSet = () => featuresSource.useMutation<unknown, SetFeature>('setFeature');

function FeatureSwitch({ f, target, label, help, readAt, slot, t }: { f: FeatureRow; target: Target; label: string; help: string; readAt: number; slot: HTMLDivElement | null; t: T }) {
  const computer = computerOf(target);
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.name === f.name, [computer, f.name]);
  const heldBy = useCallback((h: Parameters<typeof featuresSource.heldBy>[1]) => featuresSource.heldBy('setFeature', h), []);
  const vars = useCallback((i: Record<string, unknown>): SetFeature => ({ target, name: f.name, value: i.value === true }), [target, f.name]);
  const run = useRunner(useSet(), { lock: FEATURES_LOCK, pick, vars, heldBy });
  // The value being sent shows on the switch until the next read answers (the read after a done change shows it).
  const [want, setWant] = useState<boolean | null>(null);
  useEffect(() => {
    if (!run.busy) setWant(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new read ends the shown send
  }, [readAt]);
  const unknown = run.outcome?.kind === 'pending';
  // The unknown outcome is the banner under the group (its Check again and its warned Stop tracking), not the row's
  // outcome line, which offers no Stop tracking; a row that goes away while it is unknown leaves the kit's toast.
  const pending = useMemo(() => (unknown ? { kind: 'pending' as const } : null), [unknown]);
  usePendingToast(pending, run.check);
  const [checking, setChecking] = useState(false);
  const check = () => {
    setChecking(true);
    void run.check().finally(() => setChecking(false));
  };
  const outcome: OutcomeLike | undefined = run.outcome && !unknown ? { kind: run.outcome.kind, ...(run.outcome.code ? { code: run.outcome.code } : {}) } : undefined;
  // The rejection rides the row as error=, so a refused change shows the kit's words for its code and Details. A
  // code this page words itself shows its own sentence in place of the kit's mapped words (detail=), Details kept.
  const error = outcome ? refusal(run.outcome) : undefined;
  const detail = outcome ? ownSentence(outcome, t) : undefined;
  // Another page's hold is that page's to stop tracking (the runner frees nothing here).
  const stop = run.elsewhere ? undefined : () => void run.dismiss();
  return (
    <>
      <SettingSwitch
        label={label}
        help={help}
        isSelected={unknown ? f.value : (want ?? f.value)}
        isDisabled={run.busy || unknown}
        outcome={outcome}
        error={error}
        detail={detail}
        onChange={(v) => {
          setWant(v);
          void run.run({ target, name: f.name, value: v }).then((r) => {
            if (r.outcome !== 'done') setWant(null);
          });
        }}
      />
      {unknown && slot && createPortal(
        <OutcomeBanner
          kind="pending" /* noDetails: an unknown outcome has no rejection to show; the lines say what is known and what each button does */
          known={t('pending.known', { name: label })}
          checkLine={t('pending.check')}
          stopLine={stop ? t('pending.stop') : undefined}
          onCheck={check}
          checking={checking}
          onDismiss={stop}
        />,
        slot,
      )}
    </>
  );
}

/** The agent's two refusals before writing get the page's own sentence; every other outcome keeps the kit's words.
 *  Codes compare case-insensitively, as own literals only: a code such as "constructor" reaches nothing inherited. */
function ownSentence(o: { kind: OutcomeLike['kind']; code?: string }, t: (k: 'set.admin' | 'set.protected') => string): string | undefined {
  if (o.kind !== 'failed') return undefined;
  const k = o.code?.toLowerCase();
  if (k === 'admin_unauthorized') return t('set.admin');
  if (k === 'settings_key_protected') return t('set.protected');
  return undefined;
}
