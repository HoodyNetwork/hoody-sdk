// SessionTab: Details → Session. One started conversation's settings, split into live and fixed settings:
//   - "This chat": model, agent, how hard it thinks and reply length. Each changes only while the chat is idle. While
//     it works or waits for a person every control is disabled with the reason; a change the agent refuses as busy
//     (409 gate_parked / turn_in_flight) changed nothing and says so.
//   - "Fixed when it started": computer, realm, folder, what it runs with, folder access and tool mode, read-only.
// A model switch changes only this chat: the agent file is left alone. A picked model is
// never sent at once: the line under it says what it changes, and "Use this model" sends it. A Claude Code chat applies
// it from its next turn. An answer that says it also rewrote the agent's default (scope "agent") is said once, plainly.
// Every change is sent once and is "Saved" only when the conversation read back shows it; a lost answer reads "may
// have gone through" with Check again, never a resend (C9). The two hooks behind the tab (model/agent, effort/reply
// length) share one lock: while either sends, reads or holds an unsettled change, nothing else is sent or checked, and a
// catalogue Retry pressed meanwhile runs once the live hook is done. The lock is a synchronous claim taken before any
// write, Check again or catalogue Retry starts, so two started in one batch never both go.
// Approvals are ApprovalSection's, on a third hook under the same lock: while it
// sends, reads or holds an unsettled change the others wait, and it waits for them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { agent, type Target } from '@core';
import { Button } from '../controls/Button';
import { Facts } from '../data/Display';
import { Outcome } from '../forms/Outcome';
import { Select, type Option } from '../forms/more';
import { Section } from '../layouts/Layouts';
import type { FaqItem } from '../layouts/Faq';
import { ModelPicker, type ModelChoice } from '../pickers/ModelPicker';
import { usePickerFocus } from '../pickers/pickerFocus.web';
import { ErrorState } from '../states/States';
import { useStrings } from '../strings';
import { ApprovalSection } from './ApprovalSection';
import type { Action, Capability } from './capability';
import { useAgentSettings, type FieldState } from './useAgentSettings';
import { useApproval, type ApprovalData } from './useApproval';
import { useLiveSession, type LiveChangeState } from './useLiveSession';
import { useWhy } from './why';
import strings from './SessionTab.strings.en.json';
import s from './AgentSettings.module.css';

export interface SessionTabProps {
  /** The computer whose agent runs the chat. */
  target: Target | null;
  /** The started conversation. */
  session: string;
  /** The computer's name as the header shows it. */
  computer: string;
  /** The realm's name as the header shows it (default: the realm the agent reports). */
  realm?: string;
  /** The chat's realm as its link names it (the wire value): with the computer and the chat it names an unproven change, which a renamed realm label must not hide. */
  realmId: string;
  /** Ensembles run here. */
  fusion?: boolean;
  /** Claude Code models are offered here. */
  claudeCode?: boolean;
  /** A model whose provider needs setup was picked. */
  onSetup?: (model: ModelChoice) => void;
  /** Opens the place where a provider is set up (the line under the model list). */
  onProviders?: () => void;
  /**
   * The agents this chat may switch to, from the caller's own listAgents read of the chat's realm (core agent
   * agentNamesOf). null: that read failed; absent: not offered, so the agent shows but cannot be changed here.
   */
  agents?: readonly string[] | null;
  /** The page FAQ's question about Strict approvals: the approvals' Strict Why ends with its link. Absent: no Why. */
  strictFaq?: FaqItem;
  /** The open chat's capability table (its conversation source), when the page has one. Only its `asleep` answer is used: the agent
   *  refuses every live-only change of a chat asleep on the computer, so the live controls and Auto-approve are disabled with that
   *  reason (a message wakes the chat). Every other answer is the tab's own read (busy, policy), as without it. */
  chat?: { can(a: Action): Capability };
  /** The page's own approvals read of this chat (its useApproval), when it shows the approval mode elsewhere too: the tab then
   *  shows and changes that one, so both always show the same state. Absent: the tab reads its own. */
  approval?: ApprovalData;
  /** The host's switch of Auto-approve (the active source's setAutoApprove): a host that guards its sends puts back an On it did
   *  not make itself, so the switch goes through it when there is one. False: it sent nothing. */
  setYolo?: (want: boolean) => boolean;
}

type T = (k: string, v?: Record<string, string>) => string;

const DIR_SCOPES = ['workspace', 'home', 'full'] as const as readonly string[];
const TOOL_MODES = ['standard', 'orchestrator'] as const as readonly string[];

// `other`: the other hook's operation runs, so Check again waits (shown as checking; it reads nothing meanwhile).
type Check = () => Promise<boolean> | undefined;

function fieldOutcome(t: T, f: FieldState, check: Check, other: boolean) {
  if (!f || f.kind === 'running') return null;
  return <Outcome outcome={{ kind: f.kind, code: f.code }} doneText={t('st.saved')} onCheck={check} checking={other || undefined} />;
}

function liveOutcome(t: T, c: LiveChangeState, field: agent.LiveChange['field'], check: Check, other: boolean, agentName: string) {
  if (!c || c.change.field !== field || c.kind === 'running') return null;
  if (c.kind === 'busy') {
    const words = c.code === 'gate_parked' && field === 'agent' ? t('st.deferred') : field === 'model' ? t('st.busyModel') : t('st.busyOther');
    return <Outcome outcome={{ kind: 'not_sent', code: c.code ?? 'turn_in_flight' }} detail={words} />;
  }
  // A saved switch whose answer said the agent's default was rewritten too (said once, plainly). Its persisted:false
  // means that default could not be written (the chat changed); with scope "session" it means the chat's own record
  // could not be saved, so the change may not last a restart.
  if (c.kind === 'done' && field === 'model' && (c.defaultChanged === true || c.persisted === false)) {
    const words = c.defaultChanged === true
      ? (c.persisted === false ? t('st.defaultNotSaved', { agent: agentName }) : t('st.defaultChanged', { agent: agentName }))
      : t('st.notPersisted');
    return <p className={s.help} role="status">{words}</p>;
  }
  return <Outcome outcome={{ kind: c.kind, code: c.code }} doneText={t('st.saved')} onCheck={check} checking={other || undefined} />;
}

export function SessionTab(p: SessionTabProps) {
  const t = useStrings(strings) as T;
  const data = useAgentSettings(p.target, p.session, p.claudeCode === true);
  // A catalogue Retry that could not run when pressed (see settingsRetry), and the same for the approvals' Retry.
  const retryWanted = useRef(false);
  const apRetryWanted = useRef(false);
  // A model or agent change can move the effort and reply length: read them again once it is saved.
  // That read also answers a catalogue Retry still waiting. While the settings hook still runs it waits the same way.
  const lv = useLiveSession(p.target, p.session, () => {
    if (data.active()) retryWanted.current = true;
    else {
      retryWanted.current = false;
      data.retry();
    }
  }, data.busyNoCat, p.realmId);
  const live = lv.live;
  // The approvals are read and changed in the conversation's own realm, known once the conversation is read.
  const ownAp = useApproval(p.approval ? null : p.target, p.session, live?.fixed.realm ?? null, lv.running || data.busyNoCat);
  const ap = p.approval ?? ownAp;

  // One synchronous claim across the three hooks: their rendered flags lag a commit, so two writes started in one batch
  // would both pass them. Every write and Check again claims the tab first, and the claim is released once its hook
  // has rendered quiet. Taking it renders, so an operation its hook refused releases at once.
  type Who = 'live' | 'field' | 'ap';
  const claim = useRef<Who | null>(null);
  const [claims, bump] = useState(0);
  const quiet: Record<Who, boolean> = { live: !lv.running, field: !data.busyNoCat, ap: !ap.running };
  useEffect(() => {
    if (claim.current && quiet[claim.current]) claim.current = null;
  });
  const take = (who: Who): boolean => {
    if (claim.current && claim.current !== who) return false;
    if ((who !== 'live' && lv.active()) || (who !== 'ap' && ap.active())) return false;
    claim.current = who;
    bump((n) => n + 1);
    return true;
  };
  // The approvals' Retry claims too; refused, it is kept and runs once the others are done (below).
  const apRetry = () => {
    if (take('ap')) ap.retry();
    else apRetryWanted.current = true;
  };
  // Auto-approve goes through the host's switch when there is one (one shared attempt: its outcome shows here as any change's).
  const apSave = (c: agent.ApprovalChange) => { if (c.field === 'yolo' && p.setYolo) p.setYolo(c.value); else ap.save(c); };
  const apData = { ...ap, save: (c: agent.ApprovalChange) => void (take('ap') && apSave(c)), check: () => (take('ap') ? ap.check() : Promise.resolve(false)), retry: apRetry };
  const st = data.settings;
  const claude = live?.fixed.backend === 'claude_code';
  const agentName = live?.agent ?? t('st.thatAgent');

  const names = useMemo<agent.AgentNames>(
    () => ({ model: t('st.model'), provider: t('st.model'), claude: t('st.backend.claude_code'), claudeDefault: t('st.backend.claude_code') }),
    [t],
  );
  // Claude Code chats choose only among Claude Code models (never Claude's default: it is not a live switch); Hoody
  // chats among the catalogue.
  const choices = useMemo((): agent.AgentChoice[] | undefined => {
    // A Claude Code chat's models come from the computer's Claude read alone, whatever the Hoody catalogue does: until that read
    // answers there is nothing to show yet, and a slow or failed catalogue neither hides nor gates them.
    if (claude && p.claudeCode === true) {
      if (data.claude === null) return undefined;
    } else if (data.phase === 'loading' && !data.cat) return undefined;
    const all = agent.agentChoices({ cat: data.cat, claude: data.claude, names, fusion: p.fusion === true && !claude, claudeCode: p.claudeCode === true });
    return claude ? all.filter((c) => c.source === 'claude_code' && c.spec !== agent.CLAUDE) : all.filter((c) => c.source !== 'claude_code');
  }, [data.phase, data.cat, data.claude, names, p.fusion, p.claudeCode, claude]);

  // A Claude Code chat switches only among Claude Code models. Where the caller does not offer them (`claudeCode`), or the computer
  // lists none (no Claude Code routes, or the read failed), the section says so instead of a picker with nothing to pick, and a chat
  // that cannot use the Hoody catalogue is never offered it.
  // Three states of a Claude chat's list: unresolved (choices undefined: loading), listed, and empty. An empty one is confirmed
  // (the computer answered with no Claude Code model) or unreadable (the read failed): only the first says "lists none".
  const claudeNone = claude && p.claudeCode === true && data.claude !== null && (choices?.length ?? 0) === 0;
  const claudeUnread = claudeNone && data.claude?.state === 'unknown';
  const modelGated = claude && (p.claudeCode !== true || claudeNone);
  // Claude Code applies a changed model, effort or agent from the chat's next turn; one made while it works waits for the reply to end.
  // A change the read-back does not show yet may be that (the effort read does not say whether the chat is working), so its unsettled
  // outcome says so beside the usual "may have gone through" and Check again.
  // A busy model switch is refused outright (409), so only an effort or agent change can be held: a model's unsettled outcome keeps
  // the plain "may have gone through".
  const claudeNote = (kind: string | undefined, field: agent.LiveChange['field'] | 'effort') =>
    !claude ? null : kind === 'done' ? <p className={s.help} role="status">{t('st.nextTurn')}</p>
      : kind === 'pending' && field !== 'model' ? <p className={s.help} role="status">{t('st.heldClaude')}</p> : null;

  // A picked model waits for "Use this model"; it belongs to this conversation only, as do a waiting catalogue or approvals Retry.
  const [picked, setPicked] = useState<string | null>(null);
  // "Use this model" leaves with the pick it applies: focus goes back to the model picker, not to the page.
  const modelField = useRef<HTMLDivElement>(null);
  const refocusModel = useRef(false);
  // Where the focus is, asked of the host (the document on the web, the focus scope in the terminal).
  const focus = usePickerFocus(modelField);
  // The computer as the hooks identify it: an equal target object is the same computer.
  const where = p.target ? `${p.target.project.id}|${p.target.container.id}|${p.target.container.server_name ?? ''}` : '';
  useEffect(() => {
    setPicked(null);
    retryWanted.current = false;
    apRetryWanted.current = false;
  }, [p.session, where]);

  // Nothing changes while the chat works or waits, while anything is being sent or read, or while a change is unsettled.
  const busyNow = live?.busy === true;
  // Asleep on the computer: the reason in words ('' when awake or not known).
  const why = useWhy();
  const asleepOf = (a: Action): string => { const c = p.chat?.can(a); return c && !c.ok && c.reason === 'asleep' ? why(c) : ''; };
  const asleep = asleepOf('setModel');
  const yoloAsleep = asleepOf('setYolo');
  const fieldsPending = Object.values(data.fields).some((f) => f?.kind === 'pending');
  const apHeld = ap.running || ap.change?.kind === 'pending';
  // `locked` (the reply-length and other field controls) waits on the whole settings hook, a catalogue read included: the hook runs one
  // operation at a time, and a field write or Check again would drop the catalogue's late answer. Every other read/write below
  // (the model of a Claude Code chat, Check again of a live change, the approvals, the other hooks' refreshes) waits only on
  // `busyNoCat`: the Hoody catalogue is a read of its own that none of them races.
  const locked = asleep !== '' || busyNow || lv.running || data.busy || lv.change?.kind === 'pending' || fieldsPending || apHeld || live === null;
  // A Claude Code chat's model does not depend on the Hoody catalogue: a catalogue read that is the only thing still running (slow or hung)
  // does not hold it, while any other read (Claude Code's own among them), a change in flight or an unsettled one still do (`busyNoCat`).
  const modelLocked = asleep !== '' || busyNow || lv.running || (claude ? data.busyNoCat : data.busy) || lv.change?.kind === 'pending' || fieldsPending || apHeld || live === null;
  // The picker is disabled while the change is saving, so the focus waits for it to come back; a person who moved on keeps theirs.
  useEffect(() => {
    if (!refocusModel.current || picked !== null || modelLocked) return;
    refocusModel.current = false;
    if (!focus.fell()) return;
    modelField.current?.querySelector<HTMLElement>('button, input, [role="combobox"]')?.focus({ preventScroll: true });
  });
  const fieldLocked = (f: agent.Field) => locked || st === null || st[f] === null;
  // A Check again starts only while the other hook is quiet (a read racing a change could decide it on a stale read).
  const liveCheck: Check = () => (data.busyNoCat || ap.running || !take('live') ? undefined : lv.check());
  // A model or agent change's outcome line (C9) and its Claude Code note: the one source for the tab and for the failed read below.
  const liveLines = (field: agent.LiveChange['field']) => (
    <>
      {liveOutcome(t, lv.change, field, liveCheck, data.busyNoCat || ap.running, agentName)}
      {claudeNote(lv.change?.change.field === field ? lv.change.kind : undefined, field)}
    </>
  );
  // A field's Check again waits for the whole settings hook (a catalogue read still out holds it) and shows as checking meanwhile (the `other`
  // flag of fieldOutcome, the same `data.busy` that stops data.check); it reads nothing and the press is not queued.
  const fieldCheck = (f: agent.Field): Check => () => (lv.running || ap.running || !take('field') ? undefined : data.check(f));
  // The approvals wait while either other hook runs or holds an unsettled change.
  const apWaiting = lv.running || data.busyNoCat || lv.change?.kind === 'pending' || fieldsPending;
  // The catalogue's Retry reads the settings too, so it takes the claim as the settings hook: while the live hook, an
  // approvals operation or the settings hook itself runs it waits, and runs once afterwards; once it runs, a write pressed
  // in the same batch waits. The hooks' synchronous `active()`, not their rendered flags: a hook may have started an
  // operation in this same commit.
  const settingsRetry = () => {
    if (!data.active() && take('field')) data.retry();
    else retryWanted.current = true;
  };
  useEffect(() => {
    if (retryWanted.current && !data.active() && take('field')) {
      retryWanted.current = false;
      data.retry();
    }
    if (apRetryWanted.current && take('ap')) {
      apRetryWanted.current = false;
      ap.retry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data.retry and ap.retry are this render's; they run each time the other hooks are done
  }, [lv.running, lv.ops, ap.running, ap.ops, data.busy, data.busyNoCat, claims]);

  // The conversation could not be read. A change of it still unproven (sent from an earlier visit) keeps its line beside the
  // error, under the field it changes: its Check again reads it once (and fills the tab when it answers), Try again reads the
  // conversation; neither sends anything.
  if (!live && lv.phase === 'failed') {
    const changed = lv.change && lv.change.kind !== 'running' ? lv.change.change.field : null;
    return (
      <div className={s.stack}>
        <ErrorState size="sm" title={t('st.readFailed')} error={lv.liveError === true ? undefined : lv.liveError} onRetry={lv.retry} />
        {changed ? (
          <div className={s.field} role="group" aria-label={t(changed === 'model' ? 'st.model' : 'st.agent')}>
            <p className={s.help}>{t(changed === 'model' ? 'st.model' : 'st.agent')}</p>
            {liveLines(changed)}
          </div>
        ) : null}
      </div>
    );
  }

  const model = live?.model ?? null;
  const pickedChoice = picked && picked !== model ? choices?.find((c) => c.spec === picked && c.ready !== 'needs_key') : undefined;
  const choice = choices?.find((c) => c.spec === model);
  const efforts: readonly agent.Effort[] = claude ? (data.claude?.efforts ?? []) : agent.EFFORTS;
  const effortShown = agent.effortOffered(choice) && efforts.length > 0;
  const effortOptions: Option<'' | agent.Effort>[] = [{ value: '', label: t('st.effort.default') }, ...efforts.map((e) => ({ value: e, label: t(`st.effort.${e}`) }))];
  const verbosityOptions: Option<agent.Verbosity>[] = agent.VERBOSITY.map((v) => ({ value: v, label: t(`st.verbosity.${v}`) }));
  // The product's own agents are never offered, whatever the caller's list holds.
  const agentOptions: Option<string>[] = (p.agents ?? []).filter((n) => !agent.PRODUCT_AGENTS.includes(n)).map((n) => ({ value: n, label: n }));
  if (live?.agent && !agentOptions.some((o) => o.value === live.agent)) agentOptions.unshift({ value: live.agent, label: live.agent });

  const fx = live?.fixed;
  // A value outside the known words is shown as the agent reported it.
  const word = (k: string, known: readonly string[], v: string | null | undefined) => (!v ? t('st.unknown') : known.includes(v) ? t(`${k}.${v}`) : v);
  // A realm id is shown masked (never a 24-hex id as text); `global` and the caller's name as they are.
  const realmFact = p.realm ? { value: p.realm } : fx?.realm && fx.realm !== 'global' ? { id: fx.realm } : { value: fx?.realm ?? t('st.unknown') };

  return (
    <div className={s.stack} aria-label={t('st.title')} role="group">
      <Section title={t('st.live')} description={asleep || (busyNow ? t('st.liveBusy') : t('st.liveIdle'))}>
        <div className={s.stack}>
          <div className={s.field} ref={modelField} data-model-field="">
            {modelGated ? (
              <>
                <p className={s.help}>{claudeUnread ? t('st.modelClaudeUnread') : claudeNone ? t('st.modelClaudeNone') : t('st.modelClaudeGated')}</p>
                {claudeUnread ? <Button size="sm" variant="secondary" isDisabled={data.claudeReading} onPress={data.retryClaude}>{t('st.modelClaudeRetry')}</Button> : null}
              </>
            ) : (
              <ModelPicker
                label={t('st.model')}
                showLabel
                models={choices as ModelChoice[] | undefined}
                value={pickedChoice ? pickedChoice.spec : (model ?? '')}
                current={model ?? ''}
                onChange={(spec) => setPicked(spec === model ? null : spec)}
                fusion={p.fusion === true && !claude}
                {...(p.onSetup ? { onSetup: p.onSetup } : {})}
                {...(p.onProviders ? { onProviders: p.onProviders } : {})}
                status={data.phase === 'failed' && !claude ? { error: data.catError, onRetry: settingsRetry } : undefined}
                isDisabled={modelLocked}
                // The line under the list keeps its action reachable while locked, with the reason the field shows.
                disabledReason={asleep || (busyNow ? t('st.busyModel') : t('st.modelWait'))}
              />
            )}
            {live && model === null ? <p className={s.help}>{t('st.modelUnknown')}</p> : null}
            {busyNow && !modelGated ? <p className={s.help}>{t('st.busyModel')}</p> : null}
            {pickedChoice && !busyNow ? (
              <div className={s.row}>
                <p className={s.help}>{claude ? t('st.modelNextTurn') : t('st.modelThisChat')}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={modelLocked}
                  onPress={() => {
                    if (!take('live')) return;
                    refocusModel.current = true;
                    setPicked(null);
                    lv.save({ field: 'model', value: pickedChoice.spec });
                  }}
                >
                  {t('st.modelUse')}
                </Button>
              </div>
            ) : null}
            {liveLines('model')}
          </div>

          <div className={s.field}>
            <Select
              label={t('st.agent')}
              options={agentOptions}
              value={live?.agent ?? undefined}
              placeholder={t('st.agentUnknown')}
              onChange={(v) => v !== live?.agent && take('live') && lv.save({ field: 'agent', value: v })}
              isDisabled={locked || !p.agents}
            />
            {p.agents === null ? <p className={s.help}>{t('st.agentsFailed')}</p> : null}
            {liveLines('agent')}
          </div>

          {effortShown ? (
            <div className={s.field}>
              <Select
                label={t('st.effort')}
                options={effortOptions}
                value={st?.effort === null ? undefined : st?.effort}
                placeholder={t('st.unknown')}
                onChange={(v) => take('field') && data.save({ field: 'effort', value: v })}
                isDisabled={fieldLocked('effort')}
              />
              {fieldOutcome(t, data.fields.effort, fieldCheck('effort'), lv.running || ap.running || data.busy)}
              {claudeNote(data.fields.effort?.kind, 'effort')}
            </div>
          ) : null}

          <div className={s.field}>
            <Select
              label={t('st.verbosity')}
              options={verbosityOptions}
              value={st?.verbosity ?? undefined}
              placeholder={t('st.unknown')}
              onChange={(v) => take('field') && data.save({ field: 'verbosity', value: v })}
              isDisabled={fieldLocked('verbosity')}
            />
            {fieldOutcome(t, data.fields.verbosity, fieldCheck('verbosity'), lv.running || ap.running || data.busy)}
          </div>

          <ApprovalSection data={apData} computer={p.computer} busy={live ? live.busy : null} waiting={apWaiting} {...(yoloAsleep ? { yoloWhy: yoloAsleep } : {})} {...(p.strictFaq ? { strictFaq: p.strictFaq } : {})} />
        </div>
      </Section>

      <Section title={t('st.fixed')} description={t('st.fixedDesc')}>
        <Facts
          columns={1}
          label={t('st.fixed')}
          items={[
            { label: t('st.computer'), value: p.computer },
            { label: t('st.realm'), ...realmFact },
            { label: t('st.folder'), value: fx?.folder ?? t('st.unknown'), mono: true },
            { label: t('st.backend'), value: fx ? t(`st.backend.${fx.backend}`) : t('st.unknown') },
            { label: t('st.dirScope'), value: word('st.dirScope', DIR_SCOPES, fx?.dirScope) },
            { label: t('st.toolMode'), value: word('st.toolMode', TOOL_MODES, fx?.toolMode) },
          ]}
        />
      </Section>
    </div>
  );
}
