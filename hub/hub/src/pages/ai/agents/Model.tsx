// An agent's model on its page: the Overview's Model setting row, with Change model. Change opens the shared
// model chooser in a drawer (the same chooser as Settings → Default model, purpose default, never Hoody Decide); a pick
// is judged on the evidence the chooser showed, then sent once as PATCH /agents/<name>/model (flows-default setModel)
// and called saved only when the agents list, read back, shows it. The row keeps the old model until then: a lost
// answer reads "may have gone through" with Check again (a read, never a second send, confirmModel); a refusal says so.
// That unknown change is held by core (../modelHold.ts), keyed by the computer, the
// realm and the agent, so the row shows it again after leaving the page and coming back (or from Settings → Default
// model, which holds the same way), and Change model stays off while it is held; Stop tracking (a text button under the
// row's outcome, after a warning) lets it go. The reasoning effort is its own row below (Effort.tsx), held the same way
// under its own sender.
import { Button, ConfirmDialog, Drawer, ModelChooser, SettingRow, useModelCatalogue, useShellData, useStrings } from '@kit';
import { providers } from '@core';
import { useMemo, useState } from 'react';
import type { ModelApi } from '../flows-default';
import { DECIDE, idText } from '../logic';
import { checkHeld, sendHeld, stopHeld, useHeldModel, type ModelAt } from '../modelHold';
import { failedUi, pendingUi, type Ui } from '../parts/outcome';
import { routes } from '../routes';
import type { AgentRow } from './logic';
import { useToolsAt, type ToolsAt } from './toolsData';
import strings from './strings.en.json';
import aiStrings from '../strings.en.json';

/** The agent's two calls on this computer and realm, through core (admission, realm rules, C9 outcomes). */
function modelApi(at: ToolsAt): ModelApi {
  return {
    agentModel: (realm, agent, model) => providers.call(routes.agentModel, { target: at.target, realm, params: { name: agent }, body: { model } }, true),
    agents: (realm) => providers.call(routes.agents, { target: at.target, realm }, false),
  };
}

/** The chooser's rules: the default purpose, the current model usable after a settled catalogue failure, never Hoody
 *  Decide (the checker's, not a model to run). The save judges with the same object. */
function rulesOf(current: string): providers.JudgeRules {
  const r = providers.rulesFor('default', { fallback: current ? [current] : [] });
  return { ...r, eligible: (spec, ev) => spec !== DECIDE && r.eligible(spec, ev) };
}

/** The last change's outcome on the row, for the model it sent (or judged): saved, refused or not sent. A change whose
 *  outcome is unknown is never kept here: core holds it (useHeldModel). */
type RowUi = { spec: string; out: Ui; detail?: string };

export interface AgentModelProps {
  agent: AgentRow;
  /** Told once the list read back shows the new model: the host reads its list again (the row then shows it). */
  onSaved?: () => void;
}

export function AgentModel({ agent, onSaved }: AgentModelProps) {
  const t = useStrings(strings);
  const ta = useStrings(aiStrings);
  const at = useToolsAt();
  const shell = useShellData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ui, setUi] = useState<RowUi | null>(null);
  // The held change of this agent here (any page's, any earlier mount's), and the one a Check again found not there yet.
  const holdAt = useMemo((): ModelAt | null => (at ? { project: at.target.project.id, computer: at.target.container.id, realm: at.realm } : null), [at]);
  const held = useHeldModel(holdAt, agent.name);
  const [still, setStill] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  // While this mount's own send runs, the row shows it busy, not held.
  const shown = busy ? null : held;
  // One outcome object per held change (the row's pending toast keys on it).
  const heldId = shown?.id ?? null;
  const heldOut = useMemo(() => (heldId ? pendingUi() : undefined), [heldId]);
  // Read only while the chooser is open: a closed chooser asks nothing.
  const wanted = useMemo(() => (agent.model ? [agent.model] : []), [agent.model]);
  const cat = useModelCatalogue(open && at ? at.target : null, { wanted });
  const rules = useMemo(() => rulesOf(agent.model), [agent.model]);
  const computerName = at ? (shell.computers.find((c) => c.id === at.target.container.id)?.name ?? '') : '';
  // The chooser's computer, built only while it is open (the chooser alone reads it).
  const chooserComputer = useMemo(() => {
    if (!open || !at) return null;
    const c = at.target.container;
    return { id: c.id, name: computerName, row: { id: c.id, project_id: at.target.project.id, ...(c.server_name !== undefined ? { server_name: c.server_name } : {}) } };
  }, [open, at, computerName]);
  // Product-owned agents keep their model editable (the daemon allows the pin); every agent may change it here, but never
  // over a held change (the row also takes its actions away while that change shows as pending).
  const canChange = at !== null && !busy && !held;

  // A pick whose readiness was unknown says so when saved, as Settings → Default model does (def.savedUnknown).
  const saved = (spec: string, unknown: boolean) => {
    setUi({ spec, out: { kind: 'done' }, detail: unknown ? ta('def.savedUnknown', { computer: computerName || ta('name.computer') }) : t('model.saved', { name: agent.name, model: idText(spec) }) });
    onSaved?.();
  };

  const choose = async (c: providers.Choice) => {
    if (c.kind !== 'model' || !at) return;
    const spec = c.spec;
    // The pick is judged on the evidence this render's chooser showed: nothing is sent unless it passes.
    const v = providers.judge(c, spec, cat.evidence, cat.scope, rules);
    setOpen(false);
    if (!v.ok) {
      setUi({ spec, out: { kind: 'not_sent' }, detail: v.why === 'unread' ? t('model.unread') : t('model.notSent', { model: idText(spec) }) });
      return;
    }
    const unknown = v.readiness === 'unknown';
    if (!holdAt) return;
    setBusy(true);
    setUi(null);
    const r = await sendHeld(modelApi(at), holdAt, agent.name, spec, unknown, { defaultAgent: '' });
    setBusy(false);
    if (r.state === 'saved') return saved(spec, unknown);
    if (r.state === 'not_held') return setUi({ spec, out: { kind: 'not_sent' }, detail: ta('def.notHeld') });
    // A refusal shows; an answer that may have applied is core's held change (the row reads it from there).
    if (r.state === 'failed') {
      const out = failedUi(r.err);
      if (out.kind !== 'pending') setUi({ spec, out });
    }
  };

  const check = async (): Promise<boolean> => {
    if (!shown || !at || !holdAt) return false;
    const h = shown;
    const r = await checkHeld(modelApi(at), holdAt, agent.name, h);
    if (r.state === 'saved') {
      saved(h.model, h.unknown);
      return true;
    }
    if (r.state === 'not_confirmed') setStill(h.id);
    return false;
  };

  const stop = async () => {
    setAsked(false);
    if (shown) await stopHeld(shown);
  };

  // Stop tracking (on the row's outcome line, after Check again) is offered only once no request of the change may still be
  // out (core refuses it before); the page asks first.
  const onStop = shown && !shown.inFlight ? () => setAsked(true) : undefined;
  const heldWords = shown ? (still === shown.id ? t('model.stillNot') : pendingUi().message) : null;
  return (
    <>
      <SettingRow
        label={t('ov.model')}
        outcome={shown ? heldOut : ui?.out}
        // noDetails: the flow's answer is already in words (failedUi, pendingUi or the page's own sentence); no rejection is kept.
        detail={shown ? heldWords : (ui?.detail ?? ui?.out.message)}
        onCheck={shown ? check : undefined}
        onStop={onStop}
        actions={
          <Button size="sm" variant="secondary" isDisabled={!canChange} busy={busy} onPress={() => setOpen(true)}>
            {t('model.change')}
          </Button>
        }
      >
        {/* The spec is an id, shown in code type as the overview showed it (a data leaf, never explanation text). */}
        {agent.model ? <code>{idText(agent.model)}</code> : t('ov.modelInherits')}
      </SettingRow>
      <Drawer
        resizeKey="ai-agent-model"
        overlayId="ai.agent.model"
        isOpen={open}
        onOpenChange={setOpen}
        title={t('model.pick', { name: agent.name })}
        {...(computerName ? { subtitle: t('model.pickOn', { computer: computerName }) } : {})}
        size="md"
      >
        {open && (
          <ModelChooser
            id="ai-agent-model"
            label={t('model.pick', { name: agent.name })}
            catalogue={at ? cat : null}
            computer={chooserComputer}
            value={agent.model}
            rules={rules}
            purpose="default"
            offer={{ endpoint: false, claude: false }}
            leave={null}
            onChoose={(c) => void choose(c)}
          />
        )}
      </Drawer>
      <ConfirmDialog
        overlayId="ai-agent-model-stop"
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
