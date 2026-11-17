// An agent's reasoning effort on its page: the Overview's Reasoning effort
// setting row, its value an inline Select of the levels the route takes (Model default removes the agent's line). A
// pick other than the current level is sent once (effortHold.ts: PATCH /agents/<name>/effort, then the agents list read
// back) and called saved only when the list shows it; the Select shows the pick while it is sent and the stored level
// after. An unknown outcome is held by core, keyed by the project, computer, realm and agent, so the row shows "may
// have gone through" with Check again (a read, never a second send) after leaving and coming back, and the Select stays
// off while it is held; Stop tracking (a text button under the row's outcome, after the page's own warning) lets it go.
// A refusal (the daemon wrote nothing) says which one in plain words. Product-owned agents (the Bot) keep the read-only
// fact: the route refuses them.
import { ConfirmDialog, Select, SettingRow, useStrings, type Option } from '@kit';
import { providers } from '@core';
import { useMemo, useState } from 'react';
import type { ModelAt } from '../modelHold';
import { failedUi, pendingUi, type Ui } from '../parts/outcome';
import { routes } from '../routes';
import { AGENT_EFFORTS, checkEffort, sendEffort, stopEffort, useHeldEffort, type AgentEffort, type EffortApi } from './effortHold';
import type { AgentRow } from './logic';
import { useToolsAt, type ToolsAt } from './toolsData';
import strings from './strings.en.json';
import aiStrings from '../strings.en.json';

/** The agent's two calls on this computer and realm, through core (admission, realm rules, C9 outcomes). */
function effortApi(at: ToolsAt): EffortApi {
  return {
    agentEffort: (realm, agent, effort) => providers.call(routes.agentEffort, { target: at.target, realm, params: { name: agent }, body: { effort } }, true),
    agents: (realm) => providers.call(routes.agents, { target: at.target, realm }, false),
  };
}

/** The value the select carries for Model default (a Select value cannot be ''). */
const UNSET = 'default';
type Choice = Exclude<AgentEffort, ''> | typeof UNSET;
const toChoice = (e: AgentEffort): Choice => (e === '' ? UNSET : e);
const fromChoice = (c: Choice): AgentEffort => (c === UNSET ? '' : c);
const known = (v: string): v is AgentEffort => (AGENT_EFFORTS as readonly string[]).includes(v);

/** The last change's outcome on the row: saved, refused or not sent. An unknown outcome is core's hold (useHeldEffort). */
type RowUi = { out: Ui; detail?: string };

export interface AgentEffortProps {
  agent: AgentRow;
  /** Told once the list read back shows the new level: the host reads its list again (the row then shows it). */
  onSaved?: () => void;
}

export function AgentEffortRow({ agent, onSaved }: AgentEffortProps) {
  const t = useStrings(strings);
  const ta = useStrings(aiStrings);
  const at = useToolsAt();
  // The level being sent: the Select shows it until the send settles.
  const [sending, setSending] = useState<Choice | null>(null);
  const busy = sending !== null;
  const [ui, setUi] = useState<RowUi | null>(null);
  const [still, setStill] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const holdAt = useMemo((): ModelAt | null => (at ? { project: at.target.project.id, computer: at.target.container.id, realm: at.realm } : null), [at]);
  const held = useHeldEffort(holdAt, agent.name);
  // While this mount's own send runs, the row shows it busy, not held.
  const shown = busy ? null : held;
  const heldId = shown?.id ?? null;
  const heldOut = useMemo(() => (heldId ? pendingUi() : undefined), [heldId]);
  const current: AgentEffort = known(agent.effort) ? agent.effort : '';
  // Each level's words (literal keys, one per level).
  const words = (e: AgentEffort): string => {
    switch (e) {
      case '': return t('ov.effortUnset');
      case 'adaptive': return t('effort.adaptive');
      case 'low': return t('effort.low');
      case 'medium': return t('effort.medium');
      case 'high': return t('effort.high');
      case 'xhigh': return t('effort.xhigh');
      case 'max': return t('effort.max');
    }
  };
  const options = useMemo(
    (): Option<Choice>[] => AGENT_EFFORTS.map((e) => ({ value: toChoice(e), label: words(e), ...(e === 'adaptive' ? { description: t('effort.adaptiveHint') } : {}) })),
    // `words` reads only `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  const canChange = at !== null && !busy && !held;

  const saved = (e: AgentEffort) => {
    setUi({ out: { kind: 'done' }, detail: t('effort.saved', { name: agent.name, effort: words(e) }) });
    onSaved?.();
  };

  const save = async (pick: Choice) => {
    const effort = fromChoice(pick);
    if (!at || !holdAt || !canChange || effort === current) return;
    setSending(pick);
    setUi(null);
    const r = await sendEffort(effortApi(at), holdAt, agent.name, effort);
    setSending(null);
    if (r.state === 'saved') return saved(effort);
    if (r.state === 'not_held') return setUi({ out: { kind: 'not_sent' }, detail: ta('def.notHeld') });
    if (r.state === 'failed') {
      const out = failedUi(r.err);
      if (out.kind === 'pending') return;
      // A 400 bad_request is the daemon's refusal, nothing written. The answer names no reason, and the daemon checks the
      // whole file's model settings with the new line (Extra high on a model that does not take it, thinking: disabled, or
      // any other invalid setting), so the page names the possible causes, never one as the cause.
      if (r.err.code === 'bad_request') return setUi({ out: { kind: 'failed' }, detail: t('effort.refused', { name: agent.name }) });
      setUi({ out });
    }
  };

  const check = async (): Promise<boolean> => {
    if (!shown || !at || !holdAt) return false;
    const h = shown;
    const r = await checkEffort(effortApi(at), holdAt, agent.name, h);
    if (r.state === 'saved') {
      if (h.effort !== null) saved(h.effort);
      return true;
    }
    if (r.state === 'not_confirmed') setStill(h.id);
    return false;
  };

  const stop = async () => {
    setAsked(false);
    if (shown) await stopEffort(shown);
  };

  if (agent.productOwned) return null;
  // Stop tracking (on the row's outcome line, after Check again) is offered only once no request of the change may still be
  // out (core refuses it before); the page asks first.
  const onStop = shown && !shown.inFlight ? () => setAsked(true) : undefined;
  const heldWords = shown ? (still === shown.id ? t('model.stillNot') : pendingUi().message) : null;
  return (
    <>
      <SettingRow
        label={t('ov.effort')}
        help={t('effort.help')}
        outcome={shown ? heldOut : ui?.out}
        // noDetails: the flow's answer is already in words (pendingUi, failedUi or the page's own sentence).
        detail={shown ? heldWords : (ui?.detail ?? ui?.out.message)}
        onCheck={shown ? check : undefined}
        onStop={onStop}
      >
        {({ helpId }) => (
          <Select
            aria-label={t('ov.effort')}
            {...(helpId ? { 'aria-describedby': helpId } : {})}
            options={options}
            value={sending ?? toChoice(current)}
            onChange={(c) => void save(c)}
            isDisabled={!canChange}
            descriptionSlots
          />
        )}
      </SettingRow>
      <ConfirmDialog
        overlayId="ai-agent-effort-stop"
        isOpen={asked}
        onOpenChange={setAsked}
        tone="danger"
        title={t('model.stop.title')}
        body={t('model.stop.body')}
        confirmLabel={t('model.stop.confirm')}
        onConfirm={() => void stop()}
      />
    </>
  );
}
