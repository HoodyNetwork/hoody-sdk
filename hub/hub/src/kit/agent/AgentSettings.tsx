// AgentSettings: one agent conversation's settings, the same everywhere a person talks to an agent (Ask first).
// Model, How hard it thinks (only for a model that takes it), Reply length and Auto-approve.
//
// Contract:
//   - Session scope only. Defaults for new conversations live on the AI page (`renderDefaults` links there).
//   - Without a conversation (`session` null) the values are a draft the caller holds (`draft`/`onDraft`) and sends
//     with the create (core agent createFields) and right after it, before the first turn.
//   - With a conversation, the model is fixed: picking another one offers "Start a new conversation with this model"
//     (`onNewConversation`); nothing rewrites the agent's model from here.
//   - Every other change is sent once and is "Saved" only when the conversation read back shows it; a lost answer
//     reads "may have gone through" with Check again, never a resend.
//   - The model rows are the computer's catalogue (ensembles only with `fusion`) plus, with `claudeCode`, Claude
//     Code's own set as the computer's agent reports it.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { agent, type Target } from '@core';
import { Button } from '../controls/Button';
import { Outcome } from '../forms/Outcome';
import { ConfirmDialog } from '../overlays/Overlays';
import { Switch } from '../forms/fields';
import { Select, type Option } from '../forms/more';
import { ModelPicker, type ModelChoice } from '../pickers/ModelPicker';
import { ErrorState } from '../states/States';
import { useStrings } from '../strings';
import { useAgentSettings, type AgentData, type FieldState } from './useAgentSettings';
import strings from './AgentSettings.strings.en.json';
import s from './AgentSettings.module.css';

/** A conversation's settings before it exists. model '' = this computer's default; effort '' = the model's own. */
export interface AgentDraft {
  model: string;
  effort: agent.Effort | '';
  verbosity: agent.Verbosity;
  yolo: boolean;
}

/**
 * A new conversation starts with Auto-approve On. It is applied right after the create, like the rest
 * of the draft, and the switch below says whether it is live. A caller creating under a Strict or locked approval policy,
 * which refuses it, starts from `{ ...NEW_DRAFT, yolo: false }`.
 */
export const NEW_DRAFT: AgentDraft = { model: '', effort: '', verbosity: 'normal', yolo: true };

export interface AgentSettingsProps {
  /** The computer whose agent runs the conversation; null shows nothing to pick from. */
  target: Target | null;
  /** The conversation, or null before it is created. */
  session: string | null;
  draft?: AgentDraft;
  onDraft?: (next: AgentDraft) => void;
  /** Ensembles run here. */
  fusion?: boolean;
  /** Claude Code models are offered here. */
  claudeCode?: boolean;
  /** A started conversation's model was changed: start a new conversation with it. */
  onNewConversation?: (spec: string) => void;
  /** A model whose provider (or Claude Code) needs setup was picked. */
  onSetup?: (model: ModelChoice) => void;
  /** Opens the place where a provider is set up (the line under the model list). */
  onProviders?: () => void;
  /** A link to the defaults for new conversations (the AI page). */
  renderDefaults?: () => ReactNode;
  isDisabled?: boolean;
}

type T = (k: string, v?: Record<string, string>) => string;

// `busy`: an operation of the hook runs (this field's own Check again or another change), so Check again waits, shown
// as checking; the hook would refuse the read meanwhile.
function fieldOutcome(t: T, f: FieldState, check: () => Promise<boolean>, busy: boolean) {
  if (!f || f.kind === 'running') return null;
  const detail = f.kind === 'failed' && (f.code === 'not_found' || f.code === 'session_not_found') ? t('as.notOpen')
    : f.kind === 'failed' && f.code?.startsWith('approval_policy_') ? t('as.locked') : undefined;
  return <Outcome outcome={{ kind: f.kind, code: f.code }} doneText={t('as.saved')} onCheck={check} checking={busy || undefined} detail={detail} />;
}

export function AgentSettings(p: AgentSettingsProps) {
  const t = useStrings(strings) as T;
  const data: AgentData = useAgentSettings(p.target, p.session, p.claudeCode === true);
  const names = useMemo<agent.AgentNames>(
    () => ({ model: t('as.word.model'), provider: t('as.word.provider'), claude: t('as.claude'), claudeDefault: t('as.claudeDefault') }),
    [t],
  );
  // A proposed model belongs to one computer and conversation: it is dropped the moment either changes, and in a
  // draft there is none (the pick is the draft's).
  const scope = `${p.target ? `${p.target.project.id}|${p.target.container.id}|${p.target.container.server_name ?? ''}` : ''}#${p.session ?? ''}`;
  const [proposal, setProposal] = useState<{ scope: string; spec: string } | null>(null);
  // Auto-approve Off to On by hand (a draft or a live conversation) only after its effect is named; Off is one press. The default On asks nothing.
  const [askOn, setAskOn] = useState(false);
  useEffect(() => {
    setProposal(null);
    setAskOn(false);
  }, [scope]);
  const draft = p.session ? null : (p.draft ?? NEW_DRAFT);
  const st = data.settings;

  // A Claude Code conversation chooses only among Claude Code models; a Hoody one among the catalogue.
  const fixedBackend = st ? st.backend : null;
  const choices = useMemo((): agent.AgentChoice[] | undefined => {
    if (data.phase === 'loading' && !data.cat) return undefined;
    const all = agent.agentChoices({ cat: data.cat, claude: data.claude, names, fusion: p.fusion === true && fixedBackend !== 'claude_code', claudeCode: p.claudeCode === true });
    return fixedBackend === 'claude_code' ? all.filter((c) => c.source === 'claude_code') : all;
  }, [data.phase, data.cat, data.claude, names, p.fusion, p.claudeCode, fixedBackend]);

  const model = draft ? draft.model : (st?.model ?? '');
  const choice = choices?.find((c) => c.spec === model);
  // Offered only while it is this conversation's, still one of the current rows, not waiting on setup, and not the
  // model in use.
  const offered = !draft && proposal && proposal.scope === scope ? choices?.find((c) => c.spec === proposal.spec) : undefined;
  const newSpec = offered && offered.ready !== 'needs_key' && offered.spec !== model ? offered.spec : null;
  const efforts: readonly agent.Effort[] = choice?.source === 'claude_code' ? (data.claude?.efforts ?? []) : agent.EFFORTS;
  const effortShown = agent.effortOffered(choice) && efforts.length > 0;

  const effortValue = draft ? draft.effort : st?.effort;
  const verbosityValue = draft ? draft.verbosity : st?.verbosity;
  const yoloValue = draft ? draft.yolo : st?.yolo;

  const set = (next: Partial<AgentDraft>) => draft && p.onDraft?.({ ...draft, ...next });
  const pickModel = (spec: string) => {
    if (draft) {
      // Effort levels differ between models: a new model starts from its own default.
      set({ model: spec, effort: '' });
      return;
    }
    setProposal(spec === model ? null : { scope, spec });
  };

  const effortOptions: Option<'' | agent.Effort>[] = [{ value: '', label: t('as.effort.default') }, ...efforts.map((e) => ({ value: e, label: t(`as.effort.${e}`) }))];
  const verbosityOptions: Option<agent.Verbosity>[] = agent.VERBOSITY.map((v) => ({ value: v, label: t(`as.verbosity.${v}`) }));
  // A conversation's control is changeable only while nothing runs, its live value is known and no change of it is
  // unsettled.
  const busy = (f: agent.Field) => !draft && (data.busy || data.fields[f]?.kind === 'pending' || st === null || st[f] === null);
  // The model and "Start a new conversation" send nothing here, but wait with the rest while a change runs.
  const running = !draft && data.busy;

  if (p.session && !st && data.settingsError) {
    return <ErrorState size="sm" title={t('as.readFailed')} error={data.settingsError === true ? undefined : data.settingsError} onRetry={data.retry} />;
  }

  return (
    <section className={s.stack} aria-label={t('as.title')}>
      <div className={s.field}>
        <ModelPicker
          label={t('as.model')}
          showLabel
          models={choices as ModelChoice[] | undefined}
          value={newSpec ?? model}
          current={model}
          onChange={pickModel}
          fusion={p.fusion === true && fixedBackend !== 'claude_code'}
          {...(p.onSetup ? { onSetup: p.onSetup } : {})}
          {...(p.onProviders ? { onProviders: p.onProviders } : {})}
          status={data.phase === 'failed' ? { error: data.catError, onRetry: data.retry } : undefined}
          isDisabled={p.isDisabled || running}
        />
        {draft && !draft.model ? <p className={s.help}>{t('as.modelDefault')}</p> : null}
        {!draft && st && st.model === null ? <p className={s.help}>{t('as.modelUnknown')}</p> : null}
        {!draft && newSpec ? (
          <div className={s.row}>
            <p className={s.help}>{t('as.modelFixed')}</p>
            {p.onNewConversation ? (
              <Button size="sm" variant="secondary" isDisabled={p.isDisabled || running} onPress={() => p.onNewConversation?.(newSpec)}>
                {t('as.modelNew')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {effortShown ? (
        <div className={s.field}>
          <Select
            label={t('as.effort')}
            options={effortOptions}
            value={effortValue === null ? undefined : effortValue}
            placeholder={t('as.unknown')}
            onChange={(v) => (draft ? set({ effort: v }) : data.save({ field: 'effort', value: v }))}
            isDisabled={p.isDisabled || busy('effort')}
          />
          {fieldOutcome(t, data.fields.effort, () => data.check('effort'), running)}
        </div>
      ) : null}

      <div className={s.field}>
        <Select
          label={t('as.verbosity')}
          options={verbosityOptions}
          value={verbosityValue ?? undefined}
          placeholder={t('as.unknown')}
          onChange={(v) => (draft ? set({ verbosity: v }) : data.save({ field: 'verbosity', value: v }))}
          isDisabled={p.isDisabled || busy('verbosity')}
        />
        {fieldOutcome(t, data.fields.verbosity, () => data.check('verbosity'), running)}
      </div>

      <div className={s.field}>
        <Switch
          label={t('as.yolo')}
          description={yoloValue === null || yoloValue === undefined ? t('as.unknown') : yoloValue ? t('as.yoloOn') : t('as.yoloOff')}
          isSelected={yoloValue === true}
          onChange={(on) => (on ? setAskOn(true) : draft ? set({ yolo: false }) : data.save({ field: 'yolo', value: false }))}
          isDisabled={p.isDisabled || busy('yolo')}
        />
        {fieldOutcome(t, data.fields.yolo, () => data.check('yolo'), running)}
      </div>

      {p.renderDefaults ? <div className={s.defaults}>{p.renderDefaults()}</div> : null}

      <ConfirmDialog
        isOpen={askOn}
        onOpenChange={setAskOn}
        title={t('as.yoloConfirmTitle')}
        body={t('as.yoloConfirmBody')}
        confirmLabel={t('as.yoloConfirmGo')}
        confirmDisabled={busy('yolo')}
        onConfirm={() => {
          setAskOn(false);
          if (draft) set({ yolo: true });
          else void data.save({ field: 'yolo', value: true });
        }}
      />
    </section>
  );
}
