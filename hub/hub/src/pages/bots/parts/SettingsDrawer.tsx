// Settings: an 880 drawer with a section rail (?settings=<section>, so it deep-links and Back
// closes it). Model has one control and saves on choice with an inline outcome; Behaviour and
// Guardrails have several fields and use the sticky footer save. The outcome is said in words
// ("May not have saved" asks to check, never to resend blindly). Each section's fields are kit
// setting groups: a row per field, its help (and what the field still needs) beside its name.
// Model is the kit chooser on the Bot's own computer: a pick is judged against the newest evidence
// and saves at once on this form's fence; the Agent's default saves ''. A trip to the AI page carries the text fields
// and the fence's revision; on return they seed the form (same Bot and uid only), so a Bot changed meanwhile shows the
// stale band.
import { type Handoff, providers } from '@core';
import { AnatomySection, Band, ComputerMark, ConfirmDialog, Facts, FormFooter, ModelChooser, Outcome, OutcomeBanner, PickerPanel, type PickerItem, SegmentedControl, SettingGroup, SettingRow, Switch, TextButton, TextField, useGo, usePageLink, useStrings, Why } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { links as aiLinks } from '../../ai/links';
import { routingSetOf, useClaudeSet, useHelperAgents, type BotView, type Change, type Computer, type GuardrailsResult, type ModelRow, type SavedSettings, type SettingsPatch, type Workers } from '../data';
import { agentsDirty, helpersOf, maskId, parseBotKey, routingBody, routingDirty, routingFormOf, routingProblem, routingRefusal, SETTINGS_SECTIONS, speechPatch, voiceDirty, voiceFormOf, voiceProblem, voiceRefusalKey, workersAfter, workersDirty, workersFormOf, type HelpersBase, workersPatch, workersProblem, workersRefusalKey, type SettingsSection, type VoiceForm, type WorkersForm } from '../logic';
import { links } from '../links';
import { labelOf, specOf, useBotChooser, useReturnTrip, whyText } from '../model-adapters';
import { helperOptions } from '../models.logic';
import { instructionsProblem, roleTooLong } from '../textRules';
import { pageFaq } from '../faq';
import strings from '../strings.en.json';
import { outcomeOf } from './Bits';
import { RoutingSettings } from './HelperModels';
import { RailDrawer } from './RailDrawer';
import { VoiceSettings } from './VoiceSettings';
import { WorkersSettings } from './WorkersSettings';
import s from './pane.module.css';

type Check = 'strict' | 'lenient' | 'off';
/** The save a Settings change went through: `save` (Model, Behaviour, Helpers, Voice) or `rules` (Guardrails). */
type LastSave = 'save' | 'rules';
/** The save started last, for one Bot (key and uid): the owner of a refusal the saves hold. Kept by whoever holds the saves, as long as their outcomes live. */
export interface SettingsLastSave {
  bot: string;
  hook: LastSave;
}

const active0 = (section: SettingsSection | undefined): SettingsSection => section ?? 'model';

const LABEL: Record<SettingsSection, 'model.title' | 'behaviour.title' | 'workers.title' | 'guard.title' | 'voice.title' | 'advanced.title'> = {
  model: 'model.title',
  behaviour: 'behaviour.title',
  workers: 'workers.title',
  guardrails: 'guard.title',
  voice: 'voice.title',
  advanced: 'advanced.title',
};

interface Props {
  section: SettingsSection | undefined;
  onSection: (s: SettingsSection) => void;
  onClose: () => void;
  bot: BotView;
  models: readonly ModelRow[];
  computers: readonly Computer[];
  save: Change<SavedSettings, { patch: SettingsPatch; uid?: string; revision?: number }>;
  saveRules: Change<GuardrailsResult, { patch: SettingsPatch; rules: string[]; uid?: string; revision?: number }>;
  /** Kept by the holder of `save` and `saveRules` (BotPane), so it lives as long as their outcomes; without it the drawer keeps its own. */
  lastSave?: SettingsLastSave | null;
  onSaveStart?: (last: SettingsLastSave) => void;
}

type Choice = providers.Choice;
type Why = Extract<providers.Verdict, { ok: false }>['why'];

/**
 * How often the person reloaded this Bot's Settings form while the drawer stays open ([count, reload]). Reload remounts
 * the form from what the Bot holds now; a new opening starts at 0 again (its trip may seed it), and so does another Bot:
 * the drawer stays mounted when Back or Forward moves ?sel= with ?settings= kept, so the count is each Bot's own, and a
 * reload of one Bot never drops another's trip draft (nor does coming back to a reloaded Bot seed its trip again).
 */
export function useReloadCount(botId: string, open: boolean): readonly [number, () => void] {
  const [revs, setRevs] = useState<Readonly<Record<string, number>>>({});
  useEffect(() => {
    if (!open) setRevs({});
  }, [open]);
  return [revs[botId] ?? 0, () => setRevs((r) => ({ ...r, [botId]: (r[botId] ?? 0) + 1 }))];
}

export function SettingsDrawer({ section, onSection, onClose, bot, models, computers, save, saveRules, lastSave, onSaveStart }: Props) {
  const t = useStrings(strings);
  // A trip back from the AI page for this Bot's computer: its draft seeds the form once (same Bot and uid only).
  const restore = useReturnTrip(section === undefined ? undefined : parseBotKey(bot.key)?.computerId, 'settings', bot.key);
  // Which of the two saves (save, saveRules) was started last, for this Bot (key and uid): held with the saves (BotPane), whose outcomes outlive the form and
  // this drawer, so a refusal they still hold keeps its owner when the drawer opens again.
  const botId = `${bot.key}:${bot.uid}`;
  const [rev, reloaded] = useReloadCount(botId, section !== undefined);
  const [ownLast, setOwnLast] = useState<SettingsLastSave | null>(null);
  const held = onSaveStart ? (lastSave ?? null) : ownLast;
  const started = onSaveStart ?? setOwnLast;
  // The form mounts when the drawer opens, so it always starts from what the Bot holds now.
  if (section === undefined) return null;
  return (
    <SettingsForm key={`${botId}:${rev}:${restore?.id ?? ''}`} section={section} onSection={onSection} onClose={onClose} bot={bot} models={models} computers={computers} save={save} saveRules={saveRules} restore={rev === 0 ? restore : null} onReload={() => { save.reset(); saveRules.reset(); reloaded(); }} title={t('settings.title', { name: bot.name })}
      lastSave={held?.bot === botId ? held.hook : null} onSaveStart={(hook) => started({ bot: botId, hook })} />
  );
}

function SettingsForm({ section, onSection, onClose, bot, models, computers, save, saveRules, restore, onReload, title, lastSave, onSaveStart }: Omit<Props, 'lastSave' | 'onSaveStart'> & { restore: Handoff | null; onReload: () => void; title: string; lastSave: LastSave | null; onSaveStart: (hook: LastSave) => void }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  // A trip back seeds the text fields only for this same Bot (key and uid); its revision becomes the fence below.
  const [seed] = useState(() => (restore?.draft?.kind === 'settings' && restore.draft.botKey === bot.key && restore.draft.uid === bot.uid ? restore.draft : null));
  const [name, setName] = useState(seed ? seed.name : bot.name);
  const [role, setRole] = useState(seed ? seed.role : bot.role);
  const [instructions, setInstructions] = useState(seed ? seed.instructions : bot.instructions);
  const [model, setModel] = useState(bot.model);
  // The pick being saved or last saved, and why the last pick did not save (shown at the chooser).
  const [choice, setChoice] = useState<Choice | null>(null);
  const [savedAs, setSavedAs] = useState<'ready' | 'unknown' | 'inherited'>('ready');
  const [why, setWhy] = useState<{ why: Why; spec: string } | null>(null);
  const [yolo, setYolo] = useState(bot.yolo);
  // MCP hints: only for an agent whose read carries the setting (null: no switch, never sent).
  const [mcpHints, setMcpHints] = useState(bot.mcpHints ?? true);
  const mcpHintsEdited = typeof bot.mcpHints === 'boolean' && mcpHints !== bot.mcpHints;
  const [rules, setRules] = useState(seed ? seed.rules : bot.guardrails.join('\n'));
  const [check, setCheck] = useState<Check>(bot.guardrailCheck);
  const [anyComputer, setAnyComputer] = useState(bot.allowedComputers === null);
  const [allowed, setAllowed] = useState<string[]>(bot.allowedComputers ?? []);
  const [confirmOff, setConfirmOff] = useState(false);
  // Auto-approve Off to On names its effect first; Off is one press. Cancel leaves the form as it was.
  const [askYolo, setAskYolo] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [voiceForm, setVoiceForm] = useState<VoiceForm>(() => voiceFormOf(bot.speech.config));
  const [workersForm, setWorkersForm] = useState<WorkersForm>(() => workersFormOf(bot.workers));
  // Helpers > Hoody models: Routing and the agents a task may name. Their baseline is what the Bot held when the form opened, then what this form's own save left, and a newer
  // read of the Bot only while none of the section's fields is edited (with the worker policy below): an edit is never dropped from under the person, a saved value never reads as one.
  const [routingForm, setRoutingForm] = useState(() => routingFormOf(bot.routingSet));
  const [anyAgent, setAnyAgent] = useState(bot.allowedAgents === null);
  const [agents, setAgents] = useState<string[]>(bot.allowedAgents ?? []);
  const [helpersBase, setHelpersBase] = useState<HelpersBase>(() => helpersOf(bot));
  const helperReads = active0(section) === 'workers';
  const helperAgents = useHelperAgents(bot.key, helperReads);
  // Claude Code's models are read as soon as the form allows Claude Code (ticking it shows the picker before any save).
  const claudeSet = useClaudeSet(bot.key, helperReads && workersForm.acp);
  // The policy this form's edits are compared with: what the Bot held when the form opened, then what this form's own saves left (a second save before the Bot is read again).
  // Which section the last save came from: a refusal belongs to that one, not to whichever section is open when the shared outcome is shown.
  const [savedFrom, setSavedFrom] = useState<SettingsSection | undefined>();
  const [workersBase, setWorkersBase] = useState<Workers>(bot.workers);
  // The revision the baseline stands at: the Bot's when the form opened or adopted a policy, or what this form's own last save answered. A read of the Bot at an older revision is never adopted (a delayed refresh).
  const [workersRev, setWorkersRev] = useState(bot.guardrailRevision);
  // This form's own saves still running, each until its answer has moved the fence and the baseline: a refresh carrying the save's own write can arrive first.
  const [ownSaves, setOwnSaves] = useState(0);
  const own = (p: Promise<unknown>) => {
    setOwnSaves((n) => n + 1);
    void p.finally(() => setOwnSaves((n) => n - 1));
  };

  const editable = bot.caps.botExpect;
  const active: SettingsSection = active0(section);
  // The computers its tasks may use: those already allowed when it opened, in their order (running or not, listed or not, so each can be unticked), then the other running
  // ones, then any ticked since that stopped or left the list meanwhile (a ticked computer never vanishes from under its tick). Rows already shown never move while ticking.
  const [openAllowed] = useState<string[]>(bot.allowedComputers ?? []);
  const computerRow = (id: string): PickerItem => {
    const c = computers.find((x) => x.id === id);
    return { id, label: c ? `${c.flag} ${c.name}`.trim() : maskId(id), ...(c ? { lead: <ComputerMark color={c.color} /> } : {}) };
  };
  const runningNow = computers.filter((c) => c.state === 'running' && !openAllowed.includes(c.id));
  const computerItems: PickerItem[] = [
    ...openAllowed.map(computerRow),
    ...runningNow.map((c) => computerRow(c.id)),
    ...allowed.filter((id) => !openAllowed.includes(id) && !runningNow.some((c) => c.id === id)).map(computerRow),
  ];
  // Restricted with nothing ticked would send an empty list, which means any computer: not sendable.
  const noComputer = !anyComputer && allowed.length === 0;
  // The fence every save of this form sends (expect_uid + expect_revision): the Bot's uid and revision as this form read them, held here and never read from the live Bot per
  // save. It follows the Bot's own revision while the form agrees with it, and the revision a save of this form answered (so a second edit before the refresh, or the retry of a
  // half-saved section, is based on our own write). Another writer's change moves the revision on, so a save of these edits is refused (Discard shows the new list), never an
  // overwrite. It lives only in this form's state: a different Bot under the same address (deleted and created again) remounts the form (its key has the uid) and drops it,
  // and an answer arriving late from the earlier Bot lands on the form that no longer exists.
  const [fence, setFence] = useState({ uid: bot.uid, revision: seed ? seed.revision : bot.guardrailRevision });
  const computersBlocked = active === 'guardrails' && noComputer;
  // What a save sends for the rules: each line trimmed, blanks dropped (so the form agrees with the Bot once that is saved). The stored
  // list is read the same way: rules set through the API with padded or blank lines (the agent trims and drops them at use) are no edit.
  const linesOf = (lines: readonly string[]): string[] => lines.map((l) => l.trim()).filter((l) => l !== '');
  // Routing and the agents count only while Hoody models are allowed: their fields are not drawn otherwise, so an edit there is no edit.
  const routingEdited = workersForm.llm && routingDirty(routingForm, helpersBase.routingSet);
  const agentsEdited = workersForm.llm && agentsDirty(anyAgent, agents, helpersBase.allowedAgents);
  const helpersDirty = routingEdited || agentsEdited;
  // Restricted with no agent ticked would send an empty list, which means any agent: not sendable (as Guardrails' computers).
  const routingStop = routingEdited ? routingProblem(routingForm) : undefined;
  const agentsStop = agentsEdited && !anyAgent && agents.length === 0;
  const rulesList = linesOf(rules.split('\n'));
  const dirty =
    name !== bot.name ||
    role !== bot.role ||
    instructions !== bot.instructions ||
    yolo !== bot.yolo ||
    mcpHintsEdited ||
    rulesList.join('\n') !== linesOf(bot.guardrails).join('\n') ||
    check !== bot.guardrailCheck ||
    anyComputer !== (bot.allowedComputers === null) ||
    (!anyComputer && allowed.join(',') !== (bot.allowedComputers ?? []).join(',')) ||
    voiceDirty(voiceForm, bot.speech.config) ||
    workersDirty(workersForm, workersBase) ||
    helpersDirty;
  // A returned draft (a trip to the AI page and back) stands at the revision it left at, even where its text matches the Bot now: until this form's own save
  // answers, or Reload, the fence keeps that revision and a newer Bot shows Changed elsewhere, so nothing done meanwhile is overwritten unseen.
  const [draftHeld, setDraftHeld] = useState(seed !== null);
  useEffect(() => {
    // The revision only goes up (a different Bot remounts the form): a save of this form that answered a newer revision than the Bot has been read at yet is not rolled back by the clean form.
    if (!dirty && !draftHeld) setFence((f) => (bot.guardrailRevision <= f.revision ? f : { ...f, revision: bot.guardrailRevision }));
  }, [dirty, draftHeld, bot.guardrailRevision]);
  // The Bot's worker policy changed under a form with nothing to save in this section (another writer, or the refresh after this form's own save): the form and its baseline take it,
  // together with the revision the fence just followed. A form with edits keeps them and its older fence, so its save is refused as stale, never merged into another policy.
  const workersKey = JSON.stringify(bot.workers);
  const helpersKey = JSON.stringify(helpersOf(bot));
  // What was last looked at is the section's policy together with the revision it was read at: an older read judged and ignored does not hide a newer read of the same policy.
  const workersRead = `${bot.guardrailRevision}:${workersKey}:${helpersKey}`;
  const workersSeen = useRef(workersRead);
  const sectionEdited = workersDirty(workersForm, workersBase) || helpersDirty;
  useEffect(() => {
    if (workersSeen.current === workersRead) return;
    // A form with edits in the section has not taken this policy yet: it is tried again when the form is clean (the edits undone), so a baseline never stays behind a policy
    // the fence has moved past, and an edit to Routing or the agents is never hidden by a newer worker policy taken under it.
    if (sectionEdited) return;
    workersSeen.current = workersRead;
    if (bot.guardrailRevision <= workersRev) return;
    setWorkersRev(bot.guardrailRevision);
    if (JSON.stringify(workersBase) !== workersKey) {
      setWorkersBase(bot.workers);
      setWorkersForm(workersFormOf(bot.workers));
    }
    if (JSON.stringify(helpersBase) !== helpersKey) {
      const h = helpersOf(bot);
      setHelpersBase(h);
      setRoutingForm(routingFormOf(h.routingSet));
      setAnyAgent(h.allowedAgents === null);
      setAgents(h.allowedAgents ?? []);
    }
  }, [workersRead, workersKey, helpersKey, sectionEdited, workersBase, helpersBase, workersRev, bot]);
  // A save of this form answered a revision: the Bot holds our write at that revision, and it only ever goes up.
  const follow = (revision: number | undefined) => {
    if (revision === undefined) return;
    setFence((f) => (revision > f.revision ? { ...f, revision } : f));
    setDraftHeld(false);
  };
  const multi = active === 'behaviour' || active === 'workers' || active === 'guardrails' || active === 'voice';
  const voiceBlocked = active === 'voice' && voiceProblem(voiceForm) !== undefined;
  // Behaviour sends the role and the instructions with every save: what the Bot's agent would refuse in them (too long, a
  // control or invisible character) is said at its field, and Save waits on it.
  const roleLong = active === 'behaviour' && roleTooLong(role);
  const instrProblem = active === 'behaviour' ? instructionsProblem(instructions) : null;
  const behaviourBlocked = roleLong || instrProblem !== null;
  const workersBlocked = active === 'workers' && (workersProblem(workersForm) !== undefined || !bot.workers.known || routingStop !== undefined || agentsStop);
  // Changed elsewhere: a save was refused as stale, or a newer revision of the Bot arrived under unsaved edits (its save could only be refused, so the
  // band with Reload shows now, not after a Save; Reload takes the Bot as it is and drops the edits). A form with no edits follows the Bot on its own.
  // While this form's own save runs, the newer revision may be that save's own write, so only a refusal shows the band until it answers.
  // The agent's refusals of this form's fence are read by their code (never the message): 412 revision_mismatch is a write since this form's read
  // (Changed elsewhere: a Try again would send the same old revision and be refused again, so Reload is the way on); 412 bot_changed is another Bot
  // under this id (the Bot this form read is gone: back to the list). Guardrails' rules write reports them in its answer (its mode PATCH went through).
  type FenceRefusal = 'revision_mismatch' | 'bot_changed';
  const fenceCode = (code: string | undefined): FenceRefusal | undefined => (code === 'revision_mismatch' || code === 'bot_changed' ? code : undefined);
  const saveRefusal = save.outcome === 'failed' ? fenceCode(save.code) : undefined;
  const rulesAnswer = saveRules.outcome === 'done' ? saveRules.data?.rules : undefined;
  const rulesRefusal: FenceRefusal | undefined =
    saveRules.outcome === 'failed' ? fenceCode(saveRules.code) : rulesAnswer === 'stale' ? 'revision_mismatch' : rulesAnswer === 'gone' ? 'bot_changed' : undefined;
  // The two saves (save, saveRules) keep their outcomes side by side: a refusal belongs to the save that answered it, and only the save started last
  // (lastSave, held by SettingsDrawer) speaks for the form, so an older refusal of the other one never hides a later outcome (a failure, or one that may have gone through).
  const refusal = lastSave === 'rules' ? rulesRefusal : lastSave === 'save' ? saveRefusal : undefined;
  const gone = refusal === 'bot_changed';
  const stale = !gone && (save.outcome === 'stale' || refusal === 'revision_mismatch' || (ownSaves === 0 && (dirty || draftHeld) && bot.guardrailRevision > fence.revision));
  const go = useGo();

  // Behaviour saves its fields; Guardrails saves the mode and computers, then the rules (two routes). A save whose PATCH went through but whose rules did not leaves the Bot at
  // the revision that PATCH answered, which the fence follows: the retry (the same PATCH again, then the rules) is based on it, so another writer's change since is a refusal.
  const submit = () => {
    if (gone || computersBlocked || voiceBlocked || workersBlocked || behaviourBlocked) return;
    setSavedFrom(active);
    onSaveStart(active === 'guardrails' ? 'rules' : 'save');
    if (active === 'behaviour')
      own(save.run({ patch: { name, role, instructions, yolo, ...(typeof bot.mcpHints === 'boolean' ? { mcp_hints: mcpHints } : {}) }, uid: fence.uid, revision: fence.revision }).then((r) => follow(r.data?.revision)));
    else if (active === 'workers')
      own(save.run({ patch: { ...workersPatch(workersForm, workersBase), ...(routingEdited ? { routing: routingBody(routingForm) } : {}), ...(agentsEdited ? { allowed_agents: anyAgent ? [] : agents } : {}) }, uid: fence.uid, revision: fence.revision }).then((r) => {
        follow(r.data?.revision);
        // Saved: the Bot holds the policy the form stands for (the agent moves a Claude Code default itself when Claude Code is taken away), so the form and its baseline hold it too.
        if (r.outcome === 'done') {
          setWorkersBase(workersAfter(workersForm, workersBase));
          setWorkersRev((n) => Math.max(n, r.data?.revision ?? n));
          setWorkersForm((f) => workersFormOf(workersAfter(f, workersBase)));
          // What was sent is what the Bot holds (off drops the tiers): the edits read as saved, and going back to the earlier value is an edit again.
          setHelpersBase((h) => ({
            routingSet: routingEdited ? routingSetOf(routingBody(routingForm)) : h.routingSet,
            allowedAgents: agentsEdited ? (anyAgent ? null : [...agents]) : h.allowedAgents,
          }));
        }
      }));
    else if (active === 'voice') own(save.run({ patch: { speech: speechPatch(voiceForm, bot.speech.config) }, uid: fence.uid, revision: fence.revision }).then((r) => follow(r.data?.revision)));
    else
      own(
        saveRules
          .run({ patch: { guardrail_check: check, allowed_computers: anyComputer ? [] : allowed }, rules: rulesList, uid: fence.uid, revision: fence.revision })
          .then((r) => follow(r.data?.revision)),
      );
  };
  const shown: Pick<Change<unknown, never>, 'outcome' | 'code' | 'readBack'> = active === 'guardrails' && saveRules.outcome !== 'idle' ? saveRules : save;
  // The footer says the shown save's outcome, except a fence refusal (a band says it) and while a band stands; one that may have gone through always shows, with its check (C9).
  const shownOutcome = outcomeOf(shown);
  const shownRefused = shown === saveRules ? rulesRefusal !== undefined : saveRefusal !== undefined;
  const footerOutcome = shownOutcome?.kind === 'pending' || !(stale || gone || shownRefused) ? shownOutcome : undefined;
  // A Behaviour save the agent refused for its instructions (400 bad_request, details.field: a tag it does not take) names them.
  const behaviourRefusal = active === 'behaviour' && savedFrom === 'behaviour' && save.outcome === 'failed' && !saveRefusal && save.code === 'bad_request' && save.details?.field === 'instructions' ? t('behaviour.refusedInstructions') : undefined;
  // A refused voice save says which setting the agent did not take (from its code and details, never its text).
  const refusalKey = active === 'voice' && save.outcome === 'failed' && !saveRefusal ? voiceRefusalKey(save.code, save.details) : undefined;
  const voiceRefusal = active === 'voice' && save.outcome === 'failed' && !saveRefusal ? (refusalKey ? t(refusalKey as 'voice.refused.generic') : t('voice.refused.generic')) : undefined;
  // A refused Helpers save says which choice the agent did not take (from its code and details, never its text).
  const routingRefused = active === 'workers' && savedFrom === 'workers' && save.outcome === 'failed' && !saveRefusal ? routingRefusal(save.code, save.details) : undefined;
  const workersRefusal = active === 'workers' && savedFrom === 'workers' && save.outcome === 'failed' && !saveRefusal && !routingRefused ? t((workersRefusalKey(save.code, save.details) ?? 'workers.refused.generic') as 'workers.refused.generic') : undefined;
  const rulesState = active === 'guardrails' && saveRules.outcome === 'done' ? saveRules.data?.rules : undefined;

  const botComputer = parseBotKey(bot.key)?.computerId;
  const modelNames = { free: providers.FREE_NAME, any: t('model.anyName') };
  const mc = useBotChooser(botComputer, computers, models, model, modelNames);
  // The helper and tier lists offer what the Bot's computer can run now (its catalogue and readiness, as the Model section
  // judges), never the unscoped models read: a model that needs a key is not offered; a held one stays.
  const helperHeld = [workersForm.hModel, routingForm.light.model, routingForm.heavy.model];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the held specs are the deps
  const helperModels = useMemo(() => helperOptions(mc.catalogue.evidence, helperHeld, modelNames), [mc.catalogue.evidence, helperHeld.join('\n'), modelNames.any]);
  const aiPage = usePageLink('ai');
  const saveBusy = save.running || save.outcome === 'pending';
  // The trip to the AI page carries the text fields and the fence's revision; the other sections are asked about.
  const unsaved = (): string[] => [
    ...(yolo !== bot.yolo || mcpHintsEdited ? [t('behaviour.title')] : []),
    ...(voiceDirty(voiceForm, bot.speech.config) ? [t('voice.title')] : []),
    ...(workersDirty(workersForm, workersBase) || helpersDirty ? [t('workers.title')] : []),
    ...(check !== bot.guardrailCheck || anyComputer !== (bot.allowedComputers === null) || (!anyComputer && allowed.join(',') !== (bot.allowedComputers ?? []).join(',')) ? [t('guard.title')] : []),
  ];
  const leave =
    aiPage && botComputer
      ? {
          origin: { page: 'bots' as const, href: links.settings(bot.key, 'model'), label: title, focus: 'set-mc-h' },
          draft: () => ({ kind: 'settings' as const, botKey: bot.key, uid: fence.uid, revision: fence.revision, name, role, instructions, rules }),
          blocked: saveBusy || saveRules.running || saveRules.outcome === 'pending' ? t('model.wait') : null,
          unsaved,
          to: aiLinks.handoff,
        }
      : null;
  /** A pick: judged against the newest evidence for the Bot's computer, then saved at once; not ok saves nothing. */
  const pickModel = (c: Choice) => {
    const spec = specOf(c);
    if (gone || save.outcome === 'pending') return;
    const v = mc.judge(c, spec);
    if (!v.ok) return setWhy({ why: v.why, spec });
    setWhy(null);
    setChoice(c);
    if (spec === model) return;
    setModel(spec);
    setSavedAs(v.readiness);
    setSavedFrom('model');
    onSaveStart('save');
    setModelSaved(false);
    own(
      save.run({ patch: { model: spec }, uid: fence.uid, revision: fence.revision }).then((r) => {
        setModelSaved(r.outcome === 'done');
        follow(r.data?.revision);
      }),
    );
  };

  return (
    <RailDrawer overlayId="bots-settings-drawer" resizeKey="bots-settings"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={t('settings.desc')}
      dirty={multi && dirty}
      sections={SETTINGS_SECTIONS.map((x) => ({ id: x, label: t(LABEL[x]) }))}
      groups={[
        { label: t('settings.group.bot'), ids: ['model', 'behaviour', 'voice'] },
        { label: t('settings.group.helpers'), ids: ['workers', 'guardrails'] },
      ]}
      active={active}
      onSelect={onSection}
      railLabel={t('settings.rail')}
      footer={
        multi ? (
          <FormFooter
            dirty={dirty}
            submitDisabled={gone || computersBlocked || voiceBlocked || workersBlocked || behaviourBlocked}
            reason={behaviourBlocked ? t('behaviour.fix') : undefined}
            failedDetail={behaviourRefusal}
            busy={save.running || saveRules.running}
            outcome={footerOutcome}
            onCheck={() => shown.readBack()}
            onDiscard={onReload}
            onSubmit={submit}
          />
        ) : undefined
      }
    >
      <div className={s.settingsBody}>
        {(rulesState === 'failed' || rulesState === 'too_long' || rulesState === 'unknown') && <OutcomeBanner kind={rulesState === 'unknown' ? 'pending' : 'failed'} title={t(`settings.rules.${rulesState}.title`)} body={t(`settings.rules.${rulesState}.body`)} />}
        {(stale || gone) && (
          <OutcomeBanner
            /* noDetails: the agent's 412 bot_changed carries no details; its code is the whole fact */
            kind={gone ? 'failed' : 'stale'}
            title={gone ? t('bot.gone') : t('settings.stale')}
            body={gone ? <>{t('bot.goneBody')} <TextButton onPress={() => go(links.list)}>{t('bot.backToList')}</TextButton></> : <TextButton onPress={onReload}>{t('settings.reload')}</TextButton>}
          />
        )}

        {active === 'model' && (
          <AnatomySection
            id="bot-set-model"
            title={t('model.title')}
            description={t('model.desc')}
            actions={{ secondary: [{ id: 'model-helpers', label: t('model.helpersLink'), onPress: () => onSection('workers') }] }}
          >
            <ModelChooser
              id="set-mc"
              label={t('model.title')}
              catalogue={botComputer ? mc.catalogue : null}
              computer={mc.computer}
              value={model}
              choice={choice}
              onChoose={pickModel}
              rules={mc.rules}
              purpose="bot"
              fallback={mc.fallback}
              offer={{ endpoint: true }}
              leave={leave}
              restore={seed ? (restore ?? null) : null}
              isDisabled={save.running || gone}
            />
            {why && (
              <Band tone="warn" size="table" /* noDetails: the pick was judged here and not sent, so there is no rejection; the person must choose again */>
                {whyText(t, why.why, labelOf(why.spec, models, modelNames), mc.name)}
              </Band>
            )}
            <div className={s.inlineOutcome}>
              {modelSaved && save.outcome === 'done' && (
                <Outcome
                  outcome="done"
                  doneText={savedAs === 'inherited' ? t('model.saved.inherit') : savedAs === 'unknown' ? t('model.saved.unknown', { computer: mc.name }) : t('model.saved')}
                  detail={t('model.restartNote')}
                  variant="block"
                />
              )}
              {save.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('settings.maybe')} body={t('settings.maybeBody')} onCheck={() => save.readBack()} onDismiss={() => save.dismiss()} />}
              {save.outcome === 'failed' && !saveRefusal && <OutcomeBanner kind="failed" title={t('settings.failed')} />}
            </div>
            <Why question={t('model.whyQ')} faq={{ item: byId.models, label: t('model.more') }}>
              {t('model.whyA')}
            </Why>
          </AnatomySection>
        )}

        {active === 'behaviour' && (
          <AnatomySection id="bot-set-behaviour" title={t('behaviour.title')} description={t('behaviour.desc')}>
            <SettingGroup variant="field" label={t('behaviour.title')}>
              <SettingRow label={t('behaviour.name')}>
                <TextField aria-label={t('behaviour.name')} value={name} onChange={setName} />
              </SettingRow>
              <SettingRow label={t('behaviour.role')} help={t('behaviour.roleHelp')}>
                {(ids) => <TextField aria-label={t('behaviour.role')} aria-describedby={ids.helpId} value={role} onChange={setRole} errorMessage={roleLong ? t('behaviour.roleLong') : undefined} />}
              </SettingRow>
              <SettingRow label={t('behaviour.instructions')} help={t('behaviour.instructionsHelp')}>
                {(ids) => <TextField aria-label={t('behaviour.instructions')} aria-describedby={ids.helpId} multiline rows={5} value={instructions} onChange={setInstructions} errorMessage={instrProblem ? t(`behaviour.instr.${instrProblem}`) : undefined} />}
              </SettingRow>
              <SettingRow label={t('behaviour.yolo')} help={yolo ? t('behaviour.yoloOn') : t('behaviour.yoloOff')}>
                {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={yolo} onChange={(on) => (on ? setAskYolo(true) : setYolo(false))} />}
              </SettingRow>
              {typeof bot.mcpHints === 'boolean' && (
                <SettingRow label={t('behaviour.mcpHints')} help={mcpHints ? t('behaviour.mcpHintsOn') : t('behaviour.mcpHintsOff')}>
                  {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={mcpHints} onChange={setMcpHints} isDisabled={!editable} />}
                </SettingRow>
              )}
            </SettingGroup>
          </AnatomySection>
        )}

        {active === 'workers' && (
          <>
          <AnatomySection
            id="bot-set-workers"
            title={t('workers.who.title')}
            description={t('workers.desc')}
            notices={!bot.workers.known ? <Band size="table">{t('workers.needsUpdate')}</Band> : undefined}
          >
            <WorkersSettings
              known={bot.workers.known}
              base={workersBase}
              form={workersForm}
              onChange={setWorkersForm}
              disabled={!editable || !bot.workers.known}
              refusal={workersRefusal}
              refusedField={workersRefusal && typeof save.details?.field === 'string' ? save.details.field : undefined}
              hoody={{
                // A failed read names no model even when an earlier read succeeded (the query keeps its last data through a failed refetch).
                agents: helperAgents.isError ? null : helperAgents.data,
                models: helperModels,
                routing: routingForm,
                onRouting: setRoutingForm,
                routingProblem: routingRefused ?? (routingStop ? { tier: routingStop.tier, field: routingStop.why } : undefined),
                anyAgent,
                onAnyAgent: setAnyAgent,
                picked: agents,
                onPicked: setAgents,
                routingElsewhere: true,
              }}
              claudeModels={claudeSet.isError ? null : claudeSet.data?.models}
            />
          </AnatomySection>
          {workersForm.llm && (
            <AnatomySection id="bot-set-routing" title={t('workers.routing.title')} description={t('workers.routing.desc')}>
              <SettingGroup variant="field" label={t('workers.routing.title')}>
                <RoutingSettings
                  routing={routingForm}
                  onRouting={setRoutingForm}
                  routingProblem={routingRefused ?? (routingStop ? { tier: routingStop.tier, field: routingStop.why } : undefined)}
                  models={helperModels}
                  disabled={!editable || !bot.workers.known}
                />
              </SettingGroup>
            </AnatomySection>
          )}
          </>
        )}

        {active === 'guardrails' && (
          <AnatomySection
            id="bot-set-guard"
            title={t('guard.title')}
            description={t('guard.desc')}
            notices={!editable ? <Band size="table">{t('guard.needsUpdate')}</Band> : undefined}
          >
            <SettingGroup variant="field" label={t('guard.title')}>
              <SettingRow label={t('guard.rules')} help={t('guard.rulesHelp')}>
                {(ids) => <TextField aria-label={t('guard.rules')} aria-describedby={ids.helpId} multiline rows={4} value={rules} onChange={setRules} isDisabled={!editable} {...(rulesState === 'too_long' ? { errorMessage: t('guard.rulesTooLong') } : {})} />}
              </SettingRow>
              {/* The help says what the chosen check does; Off is asked about first. */}
              <SettingRow label={t('guard.mode')} help={t(`guard.mode.${check}.help`)}>
                {(ids) => (
                  <SegmentedControl<Check>
                    label={t('guard.mode')}
                    aria-describedby={ids.helpId}
                    isDisabled={!editable}
                    value={check}
                    onChange={(c) => (c === 'off' ? setConfirmOff(true) : setCheck(c))}
                    items={(['strict', 'lenient', 'off'] as const).map((c) => ({ id: c, label: t(`guard.mode.${c}`) }))}
                  />
                )}
              </SettingRow>
              <SettingRow label={t('guard.anyComputer')} help={t('guard.computersHelp')}>
                {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={anyComputer} onChange={setAnyComputer} />}
              </SettingRow>
              {!anyComputer && (
                <SettingRow label={t('guard.computersLabel')}>
                  <Band tone="warn" /* noDetails: nothing was sent; the list needs one pick before Save can send it */ attach={<PickerPanel label={t('guard.computersLabel')} mode="multi" items={computerItems} value={allowed} onChange={setAllowed} emptyText={t('guard.noComputers')} />}>
                    {allowed.length === 0 ? t('guard.pickOne') : undefined}
                  </Band>
                </SettingRow>
              )}
            </SettingGroup>
          </AnatomySection>
        )}

        {active === 'voice' && (
          <AnatomySection
            id="bot-set-voice"
            title={t('voice.title')}
            description={t('voice.desc')}
            notices={!editable ? <Band size="table">{t('voice.needsUpdate')}</Band> : undefined}
          >
            <VoiceSettings bot={bot} form={voiceForm} onChange={setVoiceForm} disabled={!editable} refusal={voiceRefusal} />
          </AnatomySection>
        )}

        {active === 'advanced' && (
          <AnatomySection
            id="bot-set-advanced"
            title={t('advanced.title')}
            description={t('advanced.desc')}
            actions={{ secondary: [{ id: 'advanced-helpers', label: t('advanced.routing.seeHelpers'), onPress: () => onSection('workers') }] }}
          >
            <Facts
              label={t('advanced.title')}
              columns={2}
              items={[
                {
                  label: t('advanced.routing'),
                  value: t(`advanced.routing.${bot.routing}`),
                },
                { label: t('advanced.async'), value: bot.async ? t('ui.on') : t('ui.off') },
                { label: t('advanced.wait'), value: t('advanced.seconds', { count: bot.waitSeconds }) },
                { label: t('advanced.items'), value: String(bot.realtimeMaxItems) },
              ]}
            />
          </AnatomySection>
        )}
      </div>

      <ConfirmDialog
        overlayId="bots-settings-autoapprove"
        isOpen={askYolo}
        onOpenChange={setAskYolo}
        title={t('autoapprove.confirmTitle')}
        body={t('autoapprove.confirmBody')}
        confirmLabel={t('autoapprove.confirmGo')}
        onConfirm={() => {
          setYolo(true);
          setAskYolo(false);
        }}
      />
      <ConfirmDialog
        overlayId="bots-settings-guard-off"
        isOpen={confirmOff}
        onOpenChange={setConfirmOff}
        title={t('guard.offTitle')}
        body={t('guard.offBody')}
        confirmLabel={t('guard.offConfirm')}
        tone="danger"
        onConfirm={() => {
          setCheck('off');
          setConfirmOff(false);
        }}
      />
    </RailDrawer>
  );
}
