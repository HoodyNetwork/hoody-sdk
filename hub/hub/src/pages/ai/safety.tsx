// Settings → Rules & hooks at /ai/rules: top to bottom, the place the page shows, the
// standing settings (the realm's rules and hooks, then the computer's files, folders & accounts switches, and the
// place's folder path rules), then the controls that act now, in one Emergency controls section:
// Pause all (process-wide, so one store per computer) and Stop everything in the realm shown. Inside
// the AI layout the pause is the layout's own store, the one the pane foot shows, so both say the same state and
// the same refusal; outside it the page keeps its own. With no computer shown nothing is read. Rules, hooks and Stop each
// need one realm (every hooks route and the settings chat take one realm; a stop names one): the page's (aiRealm.ts), so
// under All realms the computer's own (Global for a computer in no realm, its one realm). With none to tell (a computer in
// several realms) the top of the page asks for one, once: one press switches the shell's realm (its own switch, so its
// checks apply). Without a shell switch (a pinned session) it says where to pick one. Stop stays in its place, off, with
// the reason.
import { agent, isRealmOrGlobal, realmLabel, useCurrentComputer, useRealms, type Target } from '@core';
import {
  AnatomySection, Band, Button, createPauseStore, createStopRun, DetailPage, PauseControl, Row, SettingGroup, SettingRow, StopAllButton,
  StopAllResult, usePauseDescription, usePauseView, useShellData, useStrings, type PauseStore,
} from '@kit';
import { useEffect, useMemo } from 'react';
import { useAiRealm } from './aiRealm';
import { useAiPause } from './parts/Pane';
import AgentFeatures from './settings/rules/Features';
import { RulesAndHooks } from './settings/rules/Settings';
import strings from './strings.en.json';

export function SafetyView({ computer }: { computer: string }) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const header = { title: t('rules.title'), subtitle: t('rules.subtitle') };
  // No computer shown: the page's own state renderer draws the words where the body goes (notHere: nothing is read, no
  // count), the header stays.
  if (!target) return <DetailPage header={header} state={{ kind: 'notHere', icon: 'computer', title: t('rules.title'), body: t('rules.noComputer') }}>{null}</DetailPage>;
  return (
    <DetailPage header={header}>
      <Controls key={`${target.project.id}\u0000${target.container.id}`} target={target} computer={computer} />
    </DetailPage>
  );
}

function Controls({ target, computer }: { target: Target; computer: string }) {
  // The layout's store when there is one (the pane foot's); else one of its own, keyed by the computer above: a new
  // computer gets a new store, and the old one is reset as it goes. A shared store is the layout's to reset.
  const shared = useAiPause();
  const own = useMemo(() => (shared ? null : createPauseStore({ api: agent.pauseApi(target) })), [shared, target]);
  useEffect(() => (own ? () => own.reset() : undefined), [own]);
  const pause = shared ?? own!;
  const { realm, deciding } = useAiRealm();
  const one = isRealmOrGlobal(realm);
  return (
    <>
      {/* The place first: one realm's rules and hooks under their one scope bar, then its files, folders & accounts and folder path
          rules (Settings.tsx); or, under All realms, the one realm picker and the computer's switches alone (no place, so no
          folder path rules). Either way the switches render once, in the same place on the page. */}
      {one ? (
        <RulesAndHooks key={realm} computer={computer} target={target} realm={realm} />
      ) : deciding ? null : (
        // While the computer's realms are read (under All realms) the place waits: no question it may not need.
        <>
          <PickRealm />
          <AgentFeatures target={target} realm={realm} />
        </>
      )}
      <Emergency pause={pause} target={target} realm={realm} computer={computer} />
    </>
  );
}

/** Under All realms, at the top of the page: the one realm picker. The realms to pick from, one press each, when the shell
 *  can switch (the list known and not empty); else the words alone. Each button is named by the name it shows. */
function PickRealm() {
  const t = useStrings(strings);
  const setRealm = useShellData().setRealm;
  const rows = useRealms().rows ?? [];
  const pick = setRealm && rows.length > 0;
  return (
    <AnatomySection
      id="ai-rules-realm"
      // The realms are the shell's own list, already read: the buttons, or the words alone.
      state={{ kind: 'ready' }}
      title={t('rules.checked.allRealms.title')}
      description={t(pick ? 'rules.checked.allRealms.bodyPick' : 'rules.checked.allRealms.body')}
    >
      {pick && (
        <div role="group" aria-label={t('rules.checked.allRealms.pick')}>
          <Row gap={2} wrap>
            {rows.map((r) => (
              <Button key={r.id} variant="secondary" size="sm" icon="realm" literal onPress={() => setRealm(r.id)}>
                {'text' in r.name ? r.name.text : r.id.slice(0, 8)}
              </Button>
            ))}
          </Row>
        </div>
      )}
    </AnatomySection>
  );
}

/** A refused Pause or Resume, under the control: the control keeps its action, so the person can try again. (The
 *  kit says it in the conversation's PauseBand; this page mounts the pane-foot control alone, which has no words for
 *  it.) Cleared by the next answered request. */
function PauseRefused({ store }: { store: PauseStore }) {
  const t = useStrings(strings);
  const error = usePauseView(store).error;
  if (error?.of !== 'set') return null;
  return (
    <Band tone="warn" icon="pause" size="table" error={error}>
      {error.code ? t('rules.pause.refused', { code: error.code }) : t('rules.pause.refusedNoCode')}
    </Band>
  );
}

/** Emergency controls, at the foot of the page: the two controls that act now, each
 *  with its words in view. Pause all holds every agent on the computer (the store above: the pane foot's, or the page's own);
 *  its description is the kit's one text, shown as the row's help and read as the button's description. Stop ends what runs
 *  in the realm shown (a run per realm: a new realm gets a new run, the old one is reset); under All realms it stays, off,
 *  with the reason. A refused pause and a stop's report follow the group. Both are in the rail's gear too. */
function Emergency({ pause, target, realm, computer }: { pause: PauseStore; target: Target; realm: string; computer: string }) {
  const t = useStrings(strings);
  const one = isRealmOrGlobal(realm);
  // One run per realm (the old one reset), and the button and its result keyed by the realm:
  // a confirm opened in realm A closes when the realm changes, so it never confirms realm B's run.
  const run = useMemo(() => (one ? createStopRun({ api: agent.stopApi(target), realm }) : null), [one, target, realm]);
  useEffect(() => (run ? () => run.reset() : undefined), [run]);
  const n = realmLabel(realm);
  const name = n.kind === 'alias' || n.kind === 'short' ? n.text : t('rules.global');
  // The top bar's name for the computer is '' while the shell's record has none: the row and its words then say
  // "this computer", never "on ," (the label and the kit's description are in view here). PauseControl keeps the name as
  // given: described by the row's help, it shows no text of its own that names the computer.
  const where = computer || t('rules.pause.thisComputer');
  const pauseHelp = usePauseDescription(where);
  return (
    <AnatomySection id="ai-emergency" title={t('rules.emergency.title')} description={t('rules.emergency.body')} state={{ kind: 'ready' }}>
      <SettingGroup label={t('rules.emergency.title')}>
        <SettingRow label={t('rules.pause.row', { computer: where })} help={pauseHelp}>
          {({ helpId }) => <PauseControl store={pause} computer={computer} {...(helpId ? { describedBy: helpId } : {})} />}
        </SettingRow>
        <SettingRow label={run ? t('rules.stop.row', { realm: name }) : t('rules.stop.rowAll')} help={t('rules.stop.help')}>
          {run ? (
            <StopAllButton key={realm} run={run} realm={name} computer={computer} />
          ) : (
            // Off, with the reason (the picker above): a stop names one realm.
            <Button tone="danger" icon="stop" isDisabled disabledReason={t('rules.stop.pickAbove')}>{t('rules.stop.open')}</Button>
          )}
        </SettingRow>
      </SettingGroup>
      <PauseRefused store={pause} />
      {run && <StopAllResult key={realm} run={run} realm={name} />}
    </AnatomySection>
  );
}
