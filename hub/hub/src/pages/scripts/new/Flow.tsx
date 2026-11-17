// New script as steps: What it does → Where it answers → Build it / Fill it in / Write it →
// Check it → Make it live, on the kit WizardPage. One URL per step (/scripts/new/<draftId>?step=<id>, pushed, so Back
// walks the steps); the draft exists before the first step change (/scripts/new is replaced by its draft's URL).
//
// The draft is bound to the computer the Hub shows when it is made. When the Hub shows another computer the flow
// pauses (a band in place of the step body): Show <bound> or Use <shown> instead (a step-2 rebind). Nothing is sent to
// a computer the person did not choose.
import { minted, canTake, stepsOf } from './Flow.pure';
export { DRAFT_ID, newDraftId, draftHref, mintDraft, NewScriptEntry, canTake, stepsOf } from './Flow.pure';
import { Button, ComputerRequired, ConfirmDialog, EmptyState, ErrorState, LeaveGuard, DetailPage, ReasonButton, Skeleton, WizardFooter, WizardPage, useComputerChoice, useSearchParam, useStrings, useWizardStep, type WizardStep } from '@kit';
import { EXEC_DEFAULT, capture, chooseComputer, execRoot, keepsChanges, onBump, useComputersAll } from '@core';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { bindingOfRecord, compIdOf, ExecFolderProvider, useCommentsParse, useCommentsPrint, useCommentsSchema, useFolder, useResolve, useScriptsTarget, type Binding } from '../data';
import { clearDrafts, getDraft, keepOnly, newDraft, putDraft, type Draft, type StepId } from './draft';
import { parseSchema, type Draft as SettingsDraft, type Problem } from '../magic';
import { addressOk, createPreview, freeAddress, header, suggestAddress, template } from '../logic';
import strings from '../strings.en.json';
import type { CompScripts, ResolveAnswer } from '../types';
import { AgentSignIn, IdeaSignIn, rereadAgentStatus, useAgentSignIn, useAgentSignInOnly, type SignInComp } from '../parts/AgentSignIn';
import { writerNote } from '../parts/useAsk';
import { LinkNameField, useLinkName } from '../parts/LinkName';
import { StepFill, emptyFields } from './StepFill';
import { StepWhat } from './StepWhat';
import { pageFaq } from '../faq';
import type { Way } from './draft';
import { StepWhere, cronOk, type AddressCheck } from './StepWhere';
import { STARTER, StepWrite, wroteSomething } from './StepWrite';
import { StepSettings, putInCode, type PutNote } from './StepSettings';
import { StepBuild, forgetRepairs, useBuild } from './StepBuild';
import { StepCheck, useCheck, type Changed } from './StepCheck';
import { snapshotOf, type Snapshot } from './snapshot';
import { StepLive, useLive } from './StepLive';
import { ScriptCard, type CardState } from './ScriptCard';
import { NO_WRITER, useDraftRecord } from './record';
import { readDraftRecord } from './records';
import { guardBaseline, type Recover } from './recover';
import { containersOf, useRecover } from './useRecover';
import { draftLost, lossWords, useDraftSwitchGuard } from './leaveGuard';
import f from './Flow.module.css';

/**
 * The draft's final bytes on its computer and folder (snapshotOf; async, as it hashes them). null while they are being made,
 * without a computer, or when the schedule cannot be placed in the code's header (`bad`). A result for inputs that changed
 * meanwhile is never shown: only the newest inputs' answer counts.
 */
function useSnapshot(code: string, schedule: string | null, b: Binding | null): { snap: Snapshot | null; bad: boolean } {
  const key = b ? JSON.stringify([code, schedule, b.target.project.id, b.target.container.id, b.exec]) : '';
  const [out, setOut] = useState<{ key: string; snap: Snapshot | null; bad: boolean }>({ key: '', snap: null, bad: false });
  useEffect(() => {
    if (!b) return;
    let live = true;
    void snapshotOf(code, schedule, { project: b.target.project.id, compId: b.target.container.id, exec: b.exec }).then(
      (r) => { if (live) setOut({ key, snap: r.ok ? r.snapshot : null, bad: !r.ok }); },
      () => { if (live) setOut({ key, snap: null, bad: false }); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs' key is the trigger
  }, [key]);
  return out.key === key ? { snap: out.snap, bad: out.bad } : { snap: null, bad: false };
}

// Draft memory follows the account and realm: an account change or sign-out drops every draft (the guard was answered
// first, or the teardown was forced); a realm switch keeps only the drafts of the account and realm shown after it.
onBump((reason) => {
  // Minted ids stay: one only ever opens an empty new draft, which holds nothing of any account.
  if (!keepsChanges(reason)) { clearDrafts(); forgetRepairs(() => false); return; }
  queueMicrotask(() => {
    const c = capture();
    keepOnly(c.account ?? '', c.realm ?? '');
    forgetRepairs((id) => !!getDraft(c.account ?? '', c.realm ?? '', id));
  });
});

/** The live address check: what answers the address on the bound computer now (250 ms after the last edit). */
function useAddressCheck(route: string, exec: number, taken: readonly string[], on: boolean): AddressCheck {
  const resolve = useResolve();
  const [check, setCheck] = useState<AddressCheck>({ state: 'idle' });
  useEffect(() => {
    if (!on || !addressOk(route)) { setCheck({ state: 'idle' }); return; }
    setCheck({ state: 'checking' });
    // An answer is of the address it was asked for: one that comes back after the address changed shows nothing.
    let current = true;
    const id = setTimeout(() => {
      void resolve.mutateAsync({ path: route, exec }).then(
        (r) => {
          if (!current) return;
          if (r.outcome !== 'done') { setCheck({ state: 'unknown' }); return; }
          const pv = createPreview((r.data as ResolveAnswer | undefined) ?? { matched: false }, exec);
          if (pv.state === 'free') setCheck({ state: 'free' });
          else if (pv.state === 'general') setCheck({ state: 'general' });
          else {
            const by = pv.answeredBy ? (pv.answeredBy.startsWith(execRoot(exec)) ? pv.answeredBy.slice(execRoot(exec).length) : pv.answeredBy) : null;
            setCheck({ state: 'taken', by, free: freeAddress(route, [...taken, route]) });
          }
        },
        () => { if (current) setCheck({ state: 'unknown' }); },
      );
    }, 250);
    return () => { current = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve.mutateAsync is stable; the address is the trigger
  }, [route, exec, on, taken.join('\u0000')]);
  return check;
}

/** A draft id this tab cannot restore: never "it does not exist". */
export function DraftGone({ onNew, onScripts }: { onNew: () => void; onScripts: () => void }) {
  return <FlowPageState state={{ k: 'gone', onNew, onScripts }} />;
}

export interface FlowProps {
  draftId: string;
  /** Every computer of the Hub's overview. */
  computers: CompScripts[];
  /** The overview's read while it has no data: loading, or failed with Retry. */
  read?: { state: 'loading' } | { state: 'failed'; error: unknown; retry: () => void };
  /** Addresses already used on the shown computer. */
  taken: string[];
  onCancel: () => void;
  /** Make another script (from Done). */
  onAnother: () => void;
  /** Open the new script in Scripts, on a tab: Try it is its Test tab, Open the script its Overview, Done the list. */
  onOpen: (handle: string, path: string, tab: 'test' | 'overview' | null) => void;
}

/** Where a draft comes from when its page opens: this tab's memory, a new id this tab minted (with no stored record), or its
 *  stored record (a reload, another tab's URL), which the restore predicate judges. `land`: the step a restore opens on. */
type Start = { k: 'memory'; d: Draft; land?: StepId } | { k: 'new' } | { k: 'stored' };

export function Flow(props: FlowProps) {
  const t = useStrings(strings);
  const { computers, read, onCancel } = props;
  // Decided once, before anything is shown: a reload never opens an old id as a fresh draft. A minted id that already has a
  // stored record (another tab used it) is that record's draft: the stored record wins.
  const [start] = useState((): Start => {
    const c = capture();
    const mem = getDraft(c.account ?? '', c.realm ?? '', props.draftId);
    if (mem) return { k: 'memory', d: mem };
    return minted.has(props.draftId) && readDraftRecord(props.draftId) === null ? { k: 'new' } : { k: 'stored' };
  });
  if (start.k === 'stored') return <FlowRestore {...props} />;
  // Only a draft not made yet waits for a computer that can take it (the overview holds the shown computer only). A draft that
  // exists keeps its computer whatever the Hub shows now: it pauses with a band instead.
  const c0 = capture();
  const made = start.k !== 'new' || !!getDraft(c0.account ?? '', c0.realm ?? '', props.draftId);
  if (!computers.some(canTake) && !made) {
    if (read) {
      return (
        <DetailPage header={{ title: t('new.title'), subtitle: t('flow.subtitle') }}>
          {read.state === 'failed' ? <ErrorState error={read.error} onRetry={read.retry} /> : <Skeleton rows={4} />}
        </DetailPage>
      );
    }
    return (
      <ComputerRequired
        state={computers.some((c) => c.state !== 'on') ? 'stopped' : 'none'}
        header={{ title: t('new.title'), subtitle: t('flow.subtitle') }}
        title={t('new.noComputer')}
        body={t('new.noComputerBody')}
        action={<Button chip={false} onPress={onCancel}>{t('new.back')}</Button>}
      />
    );
  }
  return <InFolder exec={start.k === 'memory' ? (start.d.binding?.exec ?? null) : null}>{(off) => <FlowIn {...props} start={start} folderOff={off} />}</InFolder>;
}

/**
 * A draft this tab does not hold: the restore predicate decides, once it can tell. yes or confirm rebuild the draft in
 * this tab's memory and open the flow on the record's step; no is DraftGone; can't tell yet holds the page with Check again,
 * and only a definite read (Check again, or a later read of the record, list or prompt) moves it.
 */
function FlowRestore(props: FlowProps) {
  const { r, recheck } = useRecover(props.draftId);
  const [decided, setDecided] = useState<Recover | null>(null);
  const now = decided ?? (r.k === 'unknown' ? null : r);
  useEffect(() => {
    if (decided || !now) return;
    if (now.k === 'yes' || now.k === 'confirm') { const c = capture(); putDraft(c.account ?? '', c.realm ?? '', now.draft); }
    setDecided(now);
  }, [decided, now]);
  if (now?.k === 'no') return <DraftGone onNew={props.onAnother} onScripts={props.onCancel} />;
  if (now && (now.k === 'yes' || now.k === 'confirm')) return <InFolder exec={now.draft.binding?.exec ?? null}>{(off) => <FlowIn {...props} start={{ k: 'memory', d: now.draft, land: now.land }} folderOff={off} />}</InFolder>;
  return <FlowPageState state={{ k: 'hold', recheck }} />;
}

/**
 * One folder source: a bound draft's folder is its binding's (the record's). Every folder read inside the flow
 * gets it (the folder context), and the page's ?exec follows it, so the overview, the taken addresses, the prompts, settings
 * and URLs all read the same folder. The flow stays mounted while the address catches up (its edits and pending settings are
 * kept): `off` withholds its body and holds the wizard, so no step judges a folder the page does not show.
 */
function InFolder({ exec, children }: { exec: number | null; children: (off: boolean) => ReactNode }) {
  const shown = useFolder();
  const [, setExec] = useSearchParam('exec');
  const off = exec !== null && exec !== shown;
  useEffect(() => { if (off && exec !== null) setExec(exec === EXEC_DEFAULT ? undefined : String(exec), { replace: true }); }, [off, exec, setExec]);
  return <ExecFolderProvider value={exec ?? shown}>{children(off)}</ExecFolderProvider>;
}

/** The flow's whole-page states (a draft gone, a restore that can't tell yet): one page shape, one place. Its buttons are written
 *  here, in the state's own action slots, so the anatomy check reads them. */
type FlowState = { k: 'gone'; onNew: () => void; onScripts: () => void } | { k: 'hold'; recheck: () => void };
function FlowPageState({ state }: { state: FlowState }) {
  const t = useStrings(strings);
  const gone = state.k === 'gone';
  return (
    <DetailPage header={{ title: t('new.title') }}>
      <EmptyState
        title={gone ? t('flow.gone.title') : t('flow.hold.title')}
        {...(gone ? { body: t('flow.gone.body') } : {})}
        action={gone ? <Button variant="primary" onPress={state.onNew}>{t('flow.gone.new')}</Button> : <Button onPress={state.recheck}>{t('flow.hold.check')}</Button>}
        secondary={gone ? <Button onPress={state.onScripts}>{t('flow.gone.scripts')}</Button> : null}
      />
    </DetailPage>
  );
}

function FlowIn({ draftId, computers, read, taken, onCancel, onAnother, onOpen, start, folderOff }: FlowProps & { start: Start; folderOff: boolean }) {
  const t = useStrings(strings);
  const exec = useFolder();
  const shownTarget = useScriptsTarget();
  const shownId = shownTarget?.container.id ?? '';
  const [ideaParam] = useSearchParam('idea');
  const ready = computers.filter(canTake);
  const all = useComputersAll();
  // The restore predicate (recover.ts): the one answer the leave guards and Make it live's recovery ask.
  const recover = useRecover(draftId).r;
  // The draft lives in this tab's draft map (draft.ts), per account and realm: leaving and coming back to its URL keeps it.
  const scope = useMemo(() => { const c = capture(); return { account: c.account ?? '', realm: c.realm ?? '' }; }, []);
  useEffect(() => { keepOnly(scope.account, scope.realm); forgetRepairs((id) => !!getDraft(scope.account, scope.realm, id)); }, [scope]);
  /** The binding of a computer, captured once: from the containers list, else the shown target when it is that one. */
  // The containers answer as bindingOfRecord reads it: a list that came whole proves a missing computer gone.
  const containersList = containersOf(all);
  const bindTo = (to: string): Binding | null => {
    const c = computers.find((x) => x.id === to);
    if (!c) return null;
    const rec = { compId: to, realm: c.agentRealm ?? 'global', owner: c.agent.writerOwner || NO_WRITER, exec };
    // The containers answer as bindingOfRecord reads it: a list that came whole proves a missing computer gone.
    const b = bindingOfRecord(rec, containersList);
    if (b && b !== 'unknown') return b;
    return to === shownId && shownTarget ? { target: shownTarget, realm: rec.realm, owner: rec.owner, exec } : null;
  };
  // The computer a new draft is for: the shown one when it can take a script, else the first that can.
  const firstPick = (ready.find((c) => c.id === shownId) ?? ready[0])?.id ?? '';
  const initial = (): Draft => {
    if (start.k === 'memory') return start.d;
    return { ...newDraft(draftId, template(ideaParam) ? 'idea' : 'ai'), idea: template(ideaParam)?.name ?? null, binding: bindTo(firstPick), code: STARTER };
  };
  const [d, setD] = useState<Draft>(initial);
  useEffect(() => { putDraft(scope.account, scope.realm, d); }, [d, scope]);
  // A draft whose computer could not be bound yet (the containers list was still coming in) binds once it can, still to the
  // computer it was opened for: never to whichever one the Hub shows by then.
  const [wanted, setWanted] = useState(() => (d.binding ? '' : firstPick));
  useEffect(() => {
    if (d.binding) return;
    const b = wanted ? bindTo(wanted) : null;
    if (b) { setWanted(''); patch({ binding: b }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the list coming in is the trigger
  }, [wanted, d.binding, all.rows, all.complete, computers]);
  const patch = (x: Partial<Draft>) => setD((p) => ({ ...p, ...x }));
  const compId = d.binding ? compIdOf(d.binding) : '';
  const comp = computers.find((c) => c.id === compId);
  // The AI build's attempts: each at its own place on the bound computer; a usable answer becomes the draft's code.
  const buildApi = useBuild({
    binding: d.binding,
    draftId,
    attempt: d.attempt,
    builtWith: d.builtWith,
    onBuiltWith: (w) => patch({ builtWith: w }),
    input: () => ({ description: d.description, block: { address: d.route, schedule: d.schedule, exec }, with: { description: d.description, route: d.route, schedule: d.schedule, compId } }),
    onAttempt: (n) => patch({ attempt: n }),
    onCode: (code, sum) => { setSummary(sum); patch({ code, codeEdited: false }); },
  });
  const [summary, setSummary] = useState('');
  // The account's computers come from the containers list; the overview holds the shown one only (its capabilities).
  const rowName = (id: string): string => { const r = all.rows?.find((x) => x.id === id); return typeof r?.name === 'string' ? r.name : ''; };
  const compName = comp?.name ?? rowName(compId);
  const recNow = useDraftRecord(draftId);
  const held = recNow !== 'unreadable' && recNow && recNow.state !== 'open' ? recNow : null;
  const recLocked = held !== null;
  // A binding made while the computer's agent reported no writer takes the writer's owner once it is reported (an AI ask must
  // carry the real one); a reserved draft keeps the binding it was reserved with.
  const writer = comp?.agent.writerOwner;
  useEffect(() => {
    if (writer && d.binding?.owner === NO_WRITER && !recLocked) { const b = bindTo(compId); if (b) patch({ binding: b }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the reported owner is the trigger
  }, [writer, recLocked]);
  // The target the page's reads and sends need shown: a draft past open, its reservation (the record's captured project and
  // computer, never the editable draft's); else the draft's binding. The band shows whenever the Hub does not show exactly that
  // project and computer, none selected included (the sends refuse a computer that isn't shown). A reservation never moves:
  // its band offers only to show it, and Where cannot rebind it.
  const resv = held ? { project: held.project, compId: held.compId } : d.binding ? { project: d.binding.target.project.id, compId } : null;
  const paused = !!resv && (!shownTarget || shownTarget.project.id !== resv.project || shownId !== resv.compId);
  const resvName = resv ? (resv.compId === compId && compName ? compName : rowName(resv.compId)) : '';
  // The row the band can show: only one listed under the reservation's own project (else Show could not act, so none is offered).
  const resvRow = resv ? all.rows?.find((x) => x.id === resv.compId && x.project_id === resv.project) : undefined;
  const shownComp = computers.find((c) => c.id === shownId);
  const shownName = shownComp?.name ?? rowName(shownId);
  const [missing, setMissing] = useState(false);
  const firstMount = useRef(true);
  useEffect(() => { firstMount.current = false; }, []);

  // The address follows the description until the person edits it.
  useEffect(() => {
    if (!d.routeTouched) setD((p) => ({ ...p, route: suggestAddress(p.description, taken) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the description and the taken list are the trigger
  }, [d.description, d.routeTouched, taken.join('\u0000')]);

  // A draft whose record is no longer open (being made live, held, made live, discarded) stays on Make it live: its outcome
  // and recovery never depend on the address or the code still passing (a made script takes its own address).
  const check = useAddressCheck(d.route, exec, taken, !paused && !recLocked && !!comp && canTake(comp));
  const link = useLinkName();
  // Build it signs the agent in first when it is ticked ("signs in, then builds"); the press then starts the build.
  const startBuild = useRef<() => void>(() => undefined);
  const signIn = useAgentSignIn(comp, () => startBuild.current());
  const aiOff = comp ? writerNote(comp.agent, { offered: signIn.offered, myself: true }) : 'new.noWriter';
  const ideasOff = !comp?.agent.templates ? 'new.ideasOffline' : comp.agentRealm === null ? 'new.ideasPickRealm' : null;
  // An idea is made by the agent (instantiate), which refuses while it is signed out: Where and Make it live offer the sign-in
  // (the shared box with its own button; nothing else is sent by it) and their press waits for it. Only a login the page's own
  // status read shows as out (writerWhy 'login'): an agent that does not report its login is sent to as before, and its
  // refusal says so (deploy.ts LOGIN_REFUSALS).
  const ideaLoginOut = comp?.agent.writerWhy === 'login';
  const ideaComp: SignInComp | undefined = comp
    ? { id: comp.id, name: comp.name, agentRealm: comp.agentRealm, agent: ideaLoginOut ? { writer: false, writerWhy: 'login', signIn: comp.agent.signIn ?? 'offer' } : { writer: true } }
    : undefined;
  const ideaSignIn = useAgentSignInOnly(ideaComp, 'idea');
  // The assistant can't be used here: the AI way is not the default.
  // A bound computer the Hub does not show (paused) has no capabilities read here: its way stays as chosen.
  const way: Way = comp && d.way === 'ai' && aiOff && aiOff !== 'new.writerShared' ? 'write' : d.way;

  const ids = stepsOf(way, d.idea);
  const steps: WizardStep[] = ids.map((id) => ({ id, label: t(`flow.step.${id}` as never) }));
  const whatDone = way === 'ai' ? !!d.description.trim() : way === 'idea' ? !!template(d.idea) && !ideasOff : true;
  const whereDone = !!comp && canTake(comp) && addressOk(d.route) && check.state !== 'taken' && (d.schedule === null || cronOk(d.schedule)) && (!d.link || link.valid);
  // The picked ready-made idea counts only on the idea way: another way keeps it in the draft (back on the grid it is still
  // picked) but never shows it beside a description or code (rail, Check).
  const idea = way === 'idea' ? template(d.idea) : null;
  const ideaSignedOut = way === 'idea' && ideaLoginOut;
  const ideaBox = way === 'idea' && (ideaLoginOut || ideaSignIn.shown !== null) ? <IdeaSignIn comp={ideaComp} state={ideaSignIn} /> : undefined;
  const thirdDone = ids[2] === 'fill' ? !!idea && emptyFields(idea, d.fields).length === 0 : ids[2] === 'write' ? wroteSomething(d.code) : ids[2] === 'build' ? buildApi.build.k === 'ready' : false;
  // Check passed for the current snapshot (set from the check below): Make it live is reachable only then.
  const [passed, setPassed] = useState(false);
  // Script settings not yet put in the code hold Write: no step past it is reachable (browser Forward included) until put.
  const [settings, setSettings] = useState<SettingsDraft>({});
  const settingsPending = Object.keys(settings).length > 0;
  const done: Record<string, boolean> = { what: whatDone, where: whereDone, fill: thirdDone, write: thirdDone && !settingsPending, build: thirdDone, check: way === 'idea' || passed, live: false };
  // A restored draft's link choice (never stored) and, when its prompt did not read back, its settings wait for the person on
  // Where: the step before Check is not done until then, so Check and Make it live stay out of reach.
  const confirmed = d.linkAcknowledged && d.settingsConfirmed;
  const preCheck = ids[ids.indexOf('check') - 1];
  if (preCheck && !confirmed) done[preCheck] = false;
  const firstOpen = ids.findIndex((x) => !done[x]);
  const reachable = recLocked || firstOpen < 0 ? ids.length - 1 : firstOpen;
  // A bound draft whose computer the overview does not hold yet (still loading, or the Hub shows another one: paused) cannot
  // judge Where: the wizard waits instead of clamping to it, and the step stays the one asked for until the computer is read.
  const waiting = folderOff || (d.binding !== null && !comp && (paused || !!read));
  const [index, go] = useWizardStep(steps, { reachable, ready: !waiting });
  // A restore opens on the record's step (Build while an attempt exists, Make it live past open) when no ?step names one, once
  // the wizard can judge it; the wizard then clamps it to what is reachable.
  const [stepParam, setStep] = useSearchParam('step');
  const land = start.k === 'memory' ? start.land : undefined;
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || waiting) return;
    landed.current = true;
    if (land && !stepParam && ids.indexOf(land) > 0) setStep(land, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the restored flow can first judge its steps
  }, [waiting]);
  const id = ids[index] ?? 'what';
  // Script settings of the write way: edits wait in their own draft until exec's print puts them in the code.
  const schemaQ = useCommentsSchema(way === 'write', exec);
  // One schema object per answer: StepSettings re-reads the header when it changes, so a new object every render (the parse
  // mutation's own state re-renders this) must not drop an answer, or the fields would stay loading forever.
  const schema = useMemo(() => parseSchema(schemaQ.data), [schemaQ.data]);
  const parseM = useCommentsParse();
  const printM = useCommentsPrint();
  const [putting, setPutting] = useState(false);
  const [putNote, setPutNote] = useState<{ note: PutNote; key: string | null } | null>(null);
  const [problems, setProblems] = useState<Record<string, Problem>>({});
  const codeNow = useRef(d.code);
  codeNow.current = d.code;
  const parseNow = useRef((text: string) => parseM.mutateAsync({ text, exec }));
  parseNow.current = (text: string) => parseM.mutateAsync({ text, exec });
  const parse = useCallback((text: string) => parseNow.current(text), []);
  /** The settings draft in the code: true when there is nothing left to put. */
  const put = async (): Promise<boolean> => {
    if (Object.keys(settings).length === 0) return true;
    if (!schema || putting) return false;
    const sent = d.code;
    setPutting(true);
    setPutNote(null);
    const r = await putInCode(sent, schema, settings, (text, set) => printM.mutateAsync({ text, set, exec }));
    setPutting(false);
    if ('problems' in r) { setProblems(r.problems); return false; }
    setProblems({});
    if ('note' in r) { setPutNote(r); return false; }
    // Typing while print was out: its edits were made for the old text, so they are not applied over the new one.
    if (codeNow.current !== sent) { setPutNote({ note: 'moved', key: null }); return false; }
    patch({ code: r.text });
    setSettings({});
    return true;
  };
  const next = () => {
    if (id === 'what' && !whatDone) { setMissing(true); return; }
    if (id === 'where' && !whereDone) { setMissing(true); return; }
    // The idea way waits for the agent's sign-in (the box on this step): nothing goes on to a send it would refuse.
    if (id === 'where' && ideaSignedOut) return;
    // Leaving Where forward confirms a restored draft's link choice and settings (shown there with the restored note).
    if (id === 'where' && !confirmed) patch({ linkAcknowledged: true, settingsConfirmed: true });
    // A restored draft not confirmed yet goes back to Where from the step before Check, never on to Check.
    if (id === preCheck && id !== 'where' && !confirmed) { setMissing(false); go(ids.indexOf('where')); return; }
    if ((id === 'fill' || id === 'write') && !thirdDone) { setMissing(true); return; }
    setMissing(false);
    if (id === 'write') { void put().then((done) => { if (done) go(index + 1); }); return; }
    // Build it starts attempt 1 on the way to the Build step, through the sign-in press; a draft that already has an attempt
    // keeps it (Check names what changed).
    if (id === 'where' && way === 'ai' && buildApi.build.k === 'idle') {
      if (!signIn.canPress) { setMissing(true); return; }
      void signIn.press();
      return;
    }
    go(index + 1);
  };
  useEffect(() => { setMissing(false); }, [index]);

  // Showing a computer in the Hub takes its row of the containers list (its project), as chooseComputer builds a target.
  const show = (cid: string, project?: string) => {
    const r = all.rows?.find((x) => x.id === cid && (project === undefined || x.project_id === project));
    if (!r || typeof r.id !== 'string') return;
    chooseComputer({ id: r.id, ...(typeof r.project_id === 'string' ? { project_id: r.project_id } : {}), ...(typeof r.server_name === 'string' ? { server_name: r.server_name } : {}) });
  };
  // Pause: show the target the page needs (the reservation's own project and computer when there is one).
  const showBound = () => { if (resv) show(resv.compId, resv.project); };
  const rebind = (to: string) => {
    if (recLocked) return;
    setWanted(to);
    patch({ binding: bindTo(to) });
    if (to !== shownId) show(to);
  };

  const choice = useComputerChoice();
  // Every computer of the account: one the Hub does not show is picked by showing it (it binds once the overview has it).
  const pickerRows = (all.rows ?? []).flatMap((r) => {
    if (typeof r.id !== 'string') return [];
    const c = computers.find((x) => x.id === r.id);
    // The colour goes through as the API keeps it: the kit draws a mark only for a hex value.
    const row = { id: r.id, name: typeof r.name === 'string' ? r.name : r.id, status: typeof r.status === 'string' ? r.status : 'stopped', ...(typeof r.server_name === 'string' ? { server_name: r.server_name } : {}), ...(typeof (r as { color?: unknown }).color === 'string' ? { color: (r as { color: string }).color } : {}) };
    return [choice(row, c && !canTake(c) ? { disabledReason: t('flow.where.cantTake') } : undefined)];
  });

  const [leaving, setLeaving] = useState<{ proceed: () => void; reset: () => void } | null>(null);

  // Check: the snapshot is built before the check, and only a verdict for these exact bytes unlocks Continue.
  const { snap, bad: snapBad } = useSnapshot(d.code, d.schedule, d.binding);
  const [typing, setTyping] = useState(false);
  // The verdict is needed on Check and on Make it live (it is what unlocks the send), so it lives while either is shown.
  const checker = useCheck(d.binding, snap, (id === 'check' || id === 'live') && way !== 'idea' && !paused, typing);
  const bw = buildApi.builtWith;
  const changed: Changed[] = !bw ? [] : [
    ...(bw.description !== d.description ? (['description'] as const) : []),
    ...(bw.route !== d.route ? (['route'] as const) : []),
    ...(bw.schedule !== d.schedule ? (['schedule'] as const) : []),
    ...(bw.compId !== compId ? (['computer'] as const) : []),
  ];
  const toBuild = () => go(ids.indexOf('build'));
  startBuild.current = () => { if (buildApi.build.k === 'idle') void buildApi.run(); toBuild(); };
  const passing = checker.holds && changed.length === 0;
  useEffect(() => { setPassed(passing); }, [passing]);
  // A discarded draft leaves the flow once the guard below is down (nothing is left to lose).
  const [discarded, setDiscarded] = useState(false);
  useEffect(() => { if (discarded) onCancel(); }, [discarded, onCancel]);
  const live = useLive({
    way, b: d.binding, draftId, computer: compName, compId, route: d.route, snap,
    verdict: checker.check.k === 'ready' ? checker.check.v : null, idea: d.idea, fields: d.fields, link: d.link && link.valid ? link.name : null, linkRows: comp?.aliases ?? [],
    attempt: d.attempt, recordBinding: recover.k === 'yes' || recover.k === 'confirm' ? recover.binding : recover.k === 'unknown' ? 'unknown' : null,
    onLoginRefused: () => { if (compId) rereadAgentStatus(compId); },
  });
  const liveDone = live.live.k === 'done' ? live.live : null;
  // Once live the draft is spent: whatever step the address names (the browser's Back, a typed ?step), the receipt is what
  // shows, and the address is put back on it (replace: Back then leaves the flow instead of walking into the made draft).
  // Make it live is every way's last step (stepsOf).
  const liveIndex = ids.length - 1;
  const at = liveDone ? 'live' : id;
  const atIndex = liveDone && liveIndex >= 0 ? liveIndex : index;
  useEffect(() => {
    if (liveDone && liveIndex >= 0 && index !== liveIndex) setStep('live', { replace: true });
  }, [liveDone, liveIndex, index, setStep]);
  // Leave guards: what a reload would not bring back, against the draft the restore predicate rebuilds (only a
  // definite restore of this attempt; otherwise everything typed counts as lost), plus Script settings not yet in the code.
  // The same list feeds the path/unload guard and the realm/account/sign-out guard.
  const baseline = guardBaseline(recover, d.attempt);
  const lostWhat = liveDone || discarded || live.live.k === 'discarded' ? null : draftLost(d, baseline, settingsPending ? ['settings'] : []);
  useDraftSwitchGuard(lostWhat ? d : null, baseline, settingsPending ? ['settings'] : []);
  const openLive = (tab: 'test' | 'overview' | null) => { if (comp && liveDone) onOpen(comp.handle, liveDone.path, tab); };
  let body: ReactNode = null;
  let primary: ReactNode = null;
  // The footer's one line: what the primary does next, or why it is closed. The primary points at it (aria-describedby).
  const noteId = useId();
  const cont = () => <Button variant="primary" aria-describedby={noteId} onPress={next}>{t('flow.continue')}</Button>;
  if (at === 'what') {
    body = (
      <StepWhat
        way={way}
        onWay={(w) => { patch({ way: w }); setMissing(false); if (w === 'write' && index === 0) go(1); }}
        description={d.description}
        onDescription={(v) => patch({ description: v })}
        aiOff={aiOff === 'new.writerShared' ? null : aiOff}
        ideasOff={ideasOff}
        computer={compName}
        idea={d.idea}
        onIdea={(n) => patch({ idea: n })}
        missing={missing}
        onSubmit={next}
        focusOnMount={firstMount.current}
      />
    );
    primary = cont();
  } else if (at === 'where') {
    body = (
      <StepWhere
        computers={recLocked ? [] : pickerRows}
        compId={recLocked && resv ? resv.compId : compId}
        computerName={recLocked ? resvName : compName}
        cantTake={!recLocked && !!comp && !canTake(comp)}
        onComputer={rebind}
        origin={comp?.origin ?? ''}
        route={d.route}
        onRoute={(v) => patch({ route: v, routeTouched: true })}
        check={check}
        onUseFree={(r) => patch({ route: r, routeTouched: true })}
        schedule={d.schedule}
        onSchedule={(v) => patch({ schedule: v })}
        {...(way === 'idea' ? { ideaSchedule: idea?.schedulable ? ('own' as const) : ('called' as const) } : {})}
        link={d.link}
        onLink={(v) => patch({ link: v })}
        restored={d.restored && !confirmed}
        missing={missing}
        linkField={<LinkNameField link={link} missing={missing} />}
        signIn={way === 'ai' ? <AgentSignIn comp={comp} state={signIn} button={t('flow.where.build')} myself blocked={!whereDone ? t('retryWhy.where') : buildApi.build.k !== 'idle' ? t('retryWhy.building') : ''} /> : ideaBox}
        onSubmit={next}
      />
    );
    primary = way === 'ai' ? <Button variant="primary" aria-describedby={noteId} onPress={next}>{t('flow.where.build')}</Button>
      : ideaSignedOut ? <ReasonButton variant="primary" reason={t('flow.idea.signInFirst')}>{t('flow.continue')}</ReasonButton> : cont();
  } else if (at === 'fill' && idea) {
    body = <StepFill idea={idea} values={d.fields} onValue={(n, v) => patch({ fields: { ...d.fields, [n]: v } })} missing={missing} onSubmit={next} />;
    primary = cont();
  } else if (at === 'write') {
    body = (
      <StepWrite
        code={d.code}
        onCode={(v) => patch({ code: v, codeEdited: true })}
        missing={missing}
        settings={
          <StepSettings
            schema={schema}
            schemaState={schemaQ.isPending ? 'pending' : schemaQ.isError ? 'error' : 'ready'}
            schemaError={schemaQ.error}
            onRetrySchema={() => void schemaQ.refetch()}
            code={d.code}
            draft={settings}
            onDraft={(x) => { setSettings(x); setPutNote(null); setProblems({}); }}
            parse={parse}
            onPut={() => void put()}
            putting={putting}
            problems={problems}
            note={putNote}
          />
        }
      />
    );
    primary = <Button variant="primary" aria-describedby={noteId} busy={putting} onPress={next}>{t('flow.continue')}</Button>;
  } else if (at === 'build') {
    body = (
      <StepBuild
        b={d.binding}
        draftId={draftId}
        computer={compName}
        description={d.description}
        api={buildApi}
        code={d.code}
        codeEdited={d.codeEdited && wroteSomething(d.code)}
        onWriteMyself={() => { patch({ way: 'write' }); go(2); }}
      />
    );
    primary = <Button variant="primary" aria-describedby={noteId} isDisabled={buildApi.build.k !== 'ready'} onPress={next}>{t('flow.built.checkIt')}</Button>;
  } else if (at === 'check') {
    body = (
      <StepCheck
        way={way}
        computer={compName}
        compId={compId}
        origin={comp?.origin ?? ''}
        linkName={d.link && link.valid ? link.name : null}
        description={d.description}
        summary={summary}
        route={d.route}
        schedule={d.schedule}
        link={d.link}
        taken={false}
        snap={snap}
        unplaceable={snapBad}
        check={checker}
        {...(idea ? { idea: { title: t(`idea.${idea.name}` as never), fields: idea.plain.map((k) => ({ label: t(`var.${k}` as never), value: d.fields[k] ?? '' })) } } : {})}
        changed={way === 'ai' ? changed : []}
        code={d.code}
        onCode={(v) => { setTyping(true); patch({ code: v, codeEdited: true }); }}
        onFix={(problems) => { void buildApi.run({ problems, code: d.code }); toBuild(); }}
        onBuildAgain={() => { void buildApi.run(); toBuild(); }}
        onKeep={() => buildApi.keep({ description: d.description, route: d.route, schedule: d.schedule, compId })}
        codeEdited={d.codeEdited}
      />
    );
    const checkShut = way !== 'idea' && (!checker.holds || changed.length > 0);
    primary = <Button variant="primary" aria-describedby={noteId} isDisabled={checkShut} onPress={next}>{t('flow.continue')}</Button>;
  } else {
    body = (
      <StepLive
        api={live}
        route={d.route}
        computer={compName}
        compId={compId}
        linkName={d.link && link.valid ? link.name : null}
        linkFaq={pageFaq(t).byId.publicLink}
        schedule={way === 'idea' ? null : d.schedule}
        ownSchedule={way === 'idea' && !!idea?.schedulable}
        off={way !== 'idea' && !!snap && header(snap.bytes).d.enabled === false}
        link={d.link}
        onAction={(a) => {
          if (a === 'changeAddress') { live.again(); go(ids.indexOf('where')); }
          else if (a === 'checkCode') { live.again(); checker.again(); go(ids.indexOf('check')); }
          else if (a === 'back') { live.again(); go(index - 1); }
          else if (a === 'openScripts') onCancel();
        }}
        onTry={() => openLive('test')}
        onOpen={() => openLive('overview')}
        onAnother={onAnother}
        onDiscarded={() => setDiscarded(true)}
        signIn={ideaBox}
      />
    );
    // Refused because of the address alone (taken, no longer routable): Change the address in the step is the way on, so
    // Make it live waits, with its reason, until the draft holds another address. Only the button: the send is unchanged.
    const lv = live.live;
    const needsAddress = lv.k === 'refused' && lv.e.actions.includes('changeAddress') && !lv.e.actions.includes('tryAgain') && lv.e.body.vars?.route === d.route;
    primary = liveDone
      ? <Button variant="primary" onPress={() => openLive(null)}>{t('flow.live.finish')}</Button>
      : needsAddress
        ? <ReasonButton variant="primary" reason={t('flow.live.pickAnother')}>{t('flow.live.go')}</ReasonButton>
        // The idea way's first send waits for the agent's sign-in (the box in the step): the agent would refuse it.
        : ideaSignedOut && live.canSend
        ? <ReasonButton variant="primary" reason={t('flow.idea.signInFirst')}>{t('flow.live.go')}</ReasonButton>
        : <Button variant="primary" aria-describedby={noteId} isDisabled={!live.canSend || (way !== 'idea' && !checker.holds)} onPress={() => void live.send()}>{t('flow.live.go')}</Button>;
  }

  // "Your script so far" beside the fill-in steps; Check and Make it live take the whole width (the card would repeat them).
  const bk = buildApi.build.k;
  const cardState: CardState = way !== 'ai' ? (way === 'write' && wroteSomething(d.code) ? 'ready' : 'draft')
    : bk === 'ready' ? 'ready' : bk === 'running' || bk === 'starting' || bk === 'stopping' ? 'building'
    : bk === 'failed' || bk === 'no_script' || bk === 'stopped' || bk === 'refused' || bk === 'not_sent' ? 'notBuilt' : 'draft';
  const codeShown = way === 'write' ? wroteSomething(d.code) : way === 'ai' && bk === 'ready';
  const rail = atIndex <= 2 ? (
    <ScriptCard
      state={cardState}
      step={atIndex}
      what={way === 'ai' ? (d.description.trim() || null) : idea ? t(`idea.${idea.name}` as never) : way === 'write' ? t('flow.what.writeCard') : null}
      route={d.route}
      routeOk={addressOk(d.route)}
      computer={compName}
      runs={way === 'idea' ? t(idea?.schedulable ? 'flow.rail.ideaOwn' : 'flow.where.onlyCalled') : d.schedule === null ? t('flow.where.onlyCalled') : `${d.schedule} UTC`}
      link={d.link}
      lines={codeShown ? d.code.split('\n').length : null}
      idea={way === 'idea'}
    />
  ) : undefined;

  // The footer's line for this step and its state (the primary points at it).
  const bNow = buildApi.build.k;
  const note = paused ? t('flow.note.paused', { name: resvName })
    : at === 'what' ? t('flow.note.what')
    : at === 'where' ? (way === 'ai' ? t('flow.note.whereAi') : t('flow.note.where'))
    : at === 'fill' || at === 'write' ? t('flow.note.write')
    : at === 'build' ? (bNow === 'ready' ? t('flow.note.write') : bNow === 'running' || bNow === 'starting' || bNow === 'stopping' || bNow === 'idle' || bNow === 'unknown' ? t('flow.note.building') : t('flow.note.buildEnded'))
    : at === 'check' ? (way !== 'idea' && (!checker.holds || changed.length > 0) ? t('flow.note.checkWait') : t('flow.note.checkOk'))
    : liveDone ? null
    : live.live.k === 'held' ? t('flow.note.held') : t('flow.note.live');
  if (folderOff) return null;
  return (
    <>
      <WizardPage
        variant="flow"
        header={{ title: t('new.title') }}
        steps={steps}
        current={atIndex}
        {...(liveDone ? {} : { onStep: go })}
        aside={rail}
        asideTitle={t('flow.rail.title')}
        // The scripts page's questions, under every step.
        faq={pageFaq(t)}
        footer={(
          <WizardFooter
            // Made live: the draft is spent, so nothing walks back into it (no Cancel, no Back, no strip step); Done leaves.
            back={index > 0 && !liveDone ? { onPress: () => go(index - 1) } : undefined}
            // Cancel leaves the wizard from the footer row, beside the step's main action; the header holds the title only.
            secondary={liveDone ? undefined : <Button chip={false} onPress={onCancel}>{t('new.cancel')}</Button>}
            primary={paused ? <Button variant="primary" aria-describedby={noteId} isDisabled>{t('flow.continue')}</Button> : primary}
            note={note}
            noteId={noteId}
          />
        )}
      >
        {paused ? (
          <section className={f.band} aria-labelledby={`${draftId}-pause`}>
            <h2 className={f.heading} id={`${draftId}-pause`}>{shownTarget && shownName ? t('flow.pause.title', { bound: resvName, shown: shownName }) : t('flow.pause.none', { bound: resvName })}</h2>
            <div className={f.bandActions}>
              {resvRow ? <Button variant="primary" onPress={showBound}>{t('flow.pause.show', { name: resvName })}</Button> : null}
              {shownComp && canTake(shownComp) && !recLocked ? <Button onPress={() => rebind(shownId)}>{t('flow.pause.use', { name: shownComp.name })}</Button> : null}
            </div>
          </section>
        ) : body}
      </WizardPage>
      {/* Made live, or discarded: nothing here is left to lose. */}
      <LeaveGuard active={lostWhat !== null} onBlock={(proceed, reset) => setLeaving({ proceed, reset })} />
      <ConfirmDialog
        overlayId="scripts-new-leave"
        isOpen={leaving !== null}
        onOpenChange={(o) => { if (!o && leaving) { leaving.reset(); setLeaving(null); } }}
        title={t('flow.leave.title')}
        body={t('flow.leave.body', { what: lossWords(t as never, lostWhat ?? []) })}
        confirmLabel={t('flow.leave.go')}
        cancelLabel={t('flow.leave.stay')}
        onConfirm={() => { leaving?.proceed(); setLeaving(null); }}
      />
    </>
  );
}

