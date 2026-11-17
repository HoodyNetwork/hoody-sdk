// Who can open a computer's programs, as the first part of its Permissions tab (parts/Permissions.tsx): anyone with the
// address, only my IP, only these IPs (a typed list of IPv4 addresses and ranges), chosen people or keys, or private
// (nobody by address). It reads the computer's own access rules
// and, for "Only my IP", the address the Hoody API sees. Rules the Hub did not write (other groups, hooks, the addresses
// switched off, any rule on the project) are shown and never changed here, so nothing set elsewhere is lost.
//
// A visit to the tab is one "opening": the part mounts with the tab (a tab that is not shown is not mounted) and once
// per computer (the tab keys it by the computer), and only answers that arrived since then count.
//
// Saving (C9): the whole document is PUT with If-Match, the version this opening read, so it applies at
// most once. 412 means the rules changed elsewhere since: nothing changed here, and the part reads them again.
// A lost answer is held by core (lock 'computer.access'): Check again runs the write's read-back and frees it only on
// a fresh proof (access.logic.ts writeVerdict); it never sends again. Every save asks first, saying what it means
// for someone holding a program's address; "Only my IP" and "Private" say how the person can be locked out.
//
// "Only these IPs" opens on the ranges the rules hold now (a list made elsewhere included: its groups keep their names),
// so none is lost unless the person deletes it. Its Save reads the caller's own address first, only to say in the
// confirm whether the list leaves it out; a read that fails says it can't tell. The held write names the ranges sent,
// and only a newer read holding exactly that set proves it.
//
// "Tell the Agent what you want" changes nothing here: it starts an Agent conversation whose own tools ask the
// person to approve each write. Once that request may have reached the Agent, the part reads the rules again
// (useChangeWatch) and says when they moved.
//
// `AccessDrawer` (end of this file) is only a way in from a place that holds a computer but may not be on its page:
// it lands on the computer's Permissions tab when this page lists it, and shows this same part in a drawer only for a
// computer the page cannot show (an expired one, or one outside the realm in view: a project's Computers tab lists both).
//
// "Use only the project's rules" (AccessProject.tsx): when the project's own document has rules and the computer
// keeps a document of its own (its container state), a press reads the computer's rules, its state and the project's
// rules again (any failure: no confirm; a project document that changed since shown: shown again, a second press
// needed), asks, then DELETEs the computer's document with If-Match. Only a fresh read of the state as 'missing' says
// it follows the project alone; a lost answer is held like a save (clearVerdict, order-free).
import { capture, computerState, hostEnv, pickComputer, useCan, useCore } from '@core';
import { type ActionSpec, type AgentReadPart, AnatomySection, askStartRoom, type AskAgent, AskAgentDrawer, resetAskAgentForTests, type AskStartOutcome, Band, Button, ConfirmDialog, ErrorState, Facts, FormFooter, IpAllowlistField, IpInfo, Link, RadioGroup, readIpFrom, type SectionState, Skeleton, startAgentConversation, useAskAgent, useAskDock, useStrings, Verdict, Why, withAskAgent, Drawer, useGo, type IpDetails } from '@kit';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { EXPLAIN_ALL_MAX, refreshAccess, useAccessMany, useAccessOwn, useComputers, useAccessRules, useAccessScope, useClearAccess, useMyIp, useProjectRules, useProjects, useSetAccess } from '../data';
import { pageFaq } from '../faq';
import { links } from '../links';
import { access as accessOf, bucket, handleOf, maskUrl, PROGRAMS, type ProgramLink, SLUG } from '../logic';
import pageStrings from '../strings.en.json';
import type { Computer, Project } from '../types';
import { type AccessMode, type AccessRules, type AdvancedWhy, type AccessWrite, type AgentQuestion, askNote, bodyFor, CHANGE_MAX, changeProblem, changeStart, type ClearWrite, clearHeldLine, coversIp, heldRanges, IPS_MAX, ipsText, parseIps, readsAs, sameRanges, shownRange, V4, type OwnState, EXPLAIN_ALL_QUESTION, EXPLAIN_QUESTION, explainAllStart, explainProjectStart, explainStart, maskSeenIds, realmSnapshotParts, snapshotParts, type RealmItem, type Grant, modeOf, type ProjectSnapshotComputer, projectRulesOf, type ProjectRules, summaryOf, type Want } from './access.logic';
import { AccessProject } from './AccessProject';
import { AccessPeople, useStepHold } from './AccessPeople';
import { DOCS_PERMISSIONS } from './Bits';
import { type IpsConfirm, projectFact, rulesReadProblem } from './projectPerms.logic';
import { refusal, useRunner } from './runner';
import strings from './AccessDrawer.strings.en.json';

type Choice = 'anyone' | 'myIp' | 'ips' | 'people' | 'private';
/** The ranges the rules let in when they read as one of the two address choices; none otherwise. */
const rangesOf = (m: AccessMode | null): string[] => (m?.kind === 'ips' ? m.entries.map((e) => e.range) : m?.kind === 'myIp' ? [`${m.ip}/32`] : []);
// The variables that name a held write again (Dismiss): core matches it by the computer alone (lockKey).
const heldVars = (i: Record<string, unknown>): AccessWrite => ({ id: String(i.computer ?? ''), want: { kind: 'anyone' }, from: Number(i.from ?? 0), body: {} });
const clearVars = (i: Record<string, unknown>): ClearWrite => ({ id: String(i.computer ?? ''), from: Number(i.from ?? 0) });
const PRECONDITION = 412;
/** The same project document: version and content (what the person was shown is what they confirm). */
const sameDoc = (a: AccessRules, b: AccessRules) => JSON.stringify(a) === JSON.stringify(b);

/** Why the computer's access rules can't be changed (the API refuses the write), or undefined when they can: its
 *  server was reinstalled, or its time on the server ended. The rules still show. */
export function permissionsFrozen(c: Pick<Computer, 'status' | 'server_expired'>): 'reinstalled' | 'expired' | undefined {
  if (bucket(c.status) === 'reinstalled') return 'reinstalled';
  return c.server_expired === true ? 'expired' : undefined;
}

/** `onGuard`: told whether a change is out (`busy`) or something unsaved would be lost (`dirty`), for a frame that can
 *  hold its own closing (the drawer of a computer this page cannot show). */
export function AccessPanel({ c, onGuard }: { c: Computer; onGuard?: (g: { busy: boolean; dirty: boolean }) => void }) {
  const t = useStrings(strings);
  const frozenAs = permissionsFrozen(c);
  const readOnly = frozenAs === 'reinstalled' ? t('perm.reinstalled', { name: c.name }) : frozenAs === 'expired' ? t('perm.expired', { name: c.name }) : undefined;
  const tp = useStrings(pageStrings);
  // The part is mounted exactly while its tab shows: every mount is an opening.
  const isOpen = true;
  const q = useAccessRules(c.id, isOpen);
  // The project's scope is read again with the rules: the list row may be older than a project rule.
  const scope = useAccessScope(c.id, isOpen);
  // Only answers that arrived during this opening count: a cached answer, a failed re-read keeping old data or
  // a re-read paused offline never shows as the current rule.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new mark per opening
  const since = useMemo(() => Date.now(), [isOpen]);
  const cached = q.data !== undefined || scope.data !== undefined;
  useEffect(() => {
    if (isOpen && cached) void refreshAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [isOpen]);
  const rulesFailed = q.isError || q.fetchStatus === 'paused';
  const rules = !rulesFailed && q.dataUpdatedAt >= since ? q.data : undefined;
  // GET /computers/:id answers 'unknown' when its own lookup failed, so a project rule the list row saw still counts.
  const listed = projectRulesOf(c.proxy_permissions_scope);
  const project: ProjectRules | undefined = scope.isError || scope.fetchStatus === 'paused' ? 'unknown'
    : scope.dataUpdatedAt < since || scope.data === undefined ? undefined
    : listed === 'yes' ? 'yes' : scope.data;
  // After a save answered done, or once a held one is proved: the drawer says what a read of the rules AND the
  // project's scope newer than the send shows, never from the answer alone. `done` keeps whether the API answered
  // that it took this write: only then can rules that read differently be "saved, then changed since".
  const [sent, setSent] = useState<{ want: Want; from: number; at: number; done: boolean } | null>(null);
  // After a save answered done, the rules may come back before the project's scope: until the scope read is newer
  // than the send too, nothing says what applies (a project rule added meanwhile would make it Advanced).
  const scopeBehind = !!sent?.done && scope.dataUpdatedAt <= sent.at && !scope.isError && scope.fetchStatus !== 'paused';
  // Memoized: `kept` below stores it, and a new object every render would store it again on every render.
  const mode = useMemo(() => (rules && project && !scopeBehind ? modeOf(rules, project) : null), [rules, project, scopeBehind]);
  // The last rules and mode this opening read, for a people-or-keys panel to stay on through a failed re-read.
  const [kept, setKept] = useState<{ rules: AccessRules; mode: AccessMode } | null>(null);
  useEffect(() => { if (rules && mode) setKept({ rules, mode }); else if (!isOpen) setKept(null); }, [rules, mode, isOpen]);
  const [choice, setChoice] = useState<Choice | undefined>(undefined);
  const modeKind = mode?.kind;
  // A people-or-keys change in flight (or a secret not yet taken) keeps its panel: the rules may read as another
  // choice partway (Advanced included), and its next step or its shown secret must not go with the panel.
  const [peopleBusy, setPeopleBusy] = useState(false);
  // Steps on their way, apart from a form or a secret merely open: only these make a surrounding drawer wait.
  const [peopleSending, setPeopleSending] = useState(false);
  const onPeople = useCallback((waiting: boolean, sending: boolean) => { setPeopleBusy(waiting); setPeopleSending(sending); }, []);
  const [secretOpen, setSecretOpen] = useState(false);
  const peopleHold = useRef(false);
  useEffect(() => { peopleHold.current = peopleBusy; }, [peopleBusy]);
  useEffect(() => {
    if (!isOpen || peopleHold.current) return;
    setChoice(modeKind === 'anyone' || modeKind === 'myIp' || modeKind === 'ips' || modeKind === 'private' || modeKind === 'people' ? modeKind : undefined);
  }, [isOpen, modeKind]);
  const me = useMyIp(isOpen && choice === 'myIp');
  // A whole-document write and a people-or-keys step share the lock: each band shows its own kind of hold.
  const set = useRunner(useSetAccess(), { lock: 'computer.access', change: 'access', pick: (i) => i.computer === c.id && typeof i.op !== 'string' && i.clear !== true, vars: heldVars });
  const step = useStepHold(c.id);
  const clear = useRunner(useClearAccess(), { lock: 'computer.access', change: 'accessClear', pick: (i) => i.computer === c.id && i.clear === true, vars: clearVars });
  // The computer's own document state and its project's document, read in this opening only. The project
  // read is base-host and refused to realm-limited keys (core, routePerms): it is sent only when a key could hold it.
  const own = useAccessOwn(c.id, isOpen);
  const ownNow = own.isError || own.fetchStatus === 'paused' || own.dataUpdatedAt < since ? undefined : own.data;
  // The offer keeps the last state this opening read through a failed re-read (a press reads it again anyway), so a
  // press whose reads failed still shows why nothing was asked.
  const ownSeen = own.dataUpdatedAt < since ? undefined : own.data;
  const account = useCan('account');
  const mayChange = useCan('resources.proxy_aliases');
  const mayProject = account || mayChange;
  const pqOn = isOpen && mayProject && project === 'yes';
  const pq = useProjectRules(c.project_id ? { id: c.project_id } : undefined, pqOn);
  // Only answers from this opening count, and a cached one is still fresh for core (it would not be read again): each
  // opening reads the state and the project's document again once their reads are allowed.
  useEffect(() => {
    if (pqOn && pq.dataUpdatedAt < since && pq.fetchStatus === 'idle') void pq.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening, when the read is allowed
  }, [pqOn, since]);
  useEffect(() => {
    if (isOpen && own.dataUpdatedAt < since && own.fetchStatus === 'idle') void own.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [isOpen, since]);
  const pdoc = pq.isError || pq.fetchStatus === 'paused' || pq.dataUpdatedAt < since ? undefined : pq.data;
  // The project's name only: what the page already holds, read again only while this drawer is open.
  const projects = useProjects(isOpen);
  const projectRow = projects.data?.find((p) => p.id === c.project_id) ?? null;
  // The project document as the person was shown it: kept through re-reads until a press shows them a newer one.
  const [shownDoc, setShownDoc] = useState<AccessRules | null>(null);
  useEffect(() => { if (!isOpen) setShownDoc(null); else if (pdoc && !shownDoc) setShownDoc(pdoc); }, [isOpen, pdoc, shownDoc]);
  const [useNote, setUseNote] = useState<'readFailed' | 'parentChanged' | null>(null);
  const [useReading, setUseReading] = useState(false);
  const [useAsk, setUseAsk] = useState<{ from: number; doc: AccessRules } | null>(null);
  // After a clear answered done, or once a held one is proved: what a read of the state newer than the send shows.
  const [cleared, setCleared] = useState<{ from: number; at: number; done: boolean } | null>(null);
  // Every async step of the section (the press's reads, a held clear's Check again, the clear itself) belongs to the
  // opening, the send and the hold it started under: `stepCapture` takes all three when the step starts, and its completion
  // writes only through what it returns, which writes nothing once any of them moved (closing, reopening or another
  // computer; Dismiss or a new send; the hold freed or replaced).
  const opening = useRef(0);
  const sends = useRef(0);
  const holdNow = useRef(clear.hold);
  useEffect(() => { holdNow.current = clear.hold; });
  function stepCapture(): (write: () => void) => void {
    // The opening check is implied by the send check (opening and closing bump both, below); it stays as a guard.
    const at = { opening: opening.current, send: sends.current, hold: clear.hold };
    return (write) => {
      if (at.opening === opening.current && at.send === sends.current && at.hold === holdNow.current) write();
    };
  }
  // When the held clear's own Check again started: its line ("still there" / "newer") reads only answers to reads made
  // after that, never the reads from before the lost answer. Set only through that check's stepCapture.
  const [heldReadAt, setHeldReadAt] = useState<number | null>(null);
  const watch = useChangeWatch(c.id, isOpen);
  const moved = !!watch && !!rules && rules.version > watch.from;
  // Each Stop tracking question holds the token of the hold it was asked about (null: not asked).
  const [dismissingStep, setDismissingStep] = useState<string | null>(null);
  const [dismissingClear, setDismissingClear] = useState<string | null>(null);
  const anyHeld = set.held !== null || step.held !== null || clear.held !== null;
  // After a request may have reached the Agent: the watch line, and what a fresh read shows, among the section's
  // notices and under the Agent drawer's own actions.
  const follow = moved || watch ? { id: c.id, version: rules?.version ?? null, moved, watching: !!watch } : null;
  const agentAsk = useAccessAsk(c, isOpen ? rules : undefined, project ?? 'unknown', follow ? <AgentFollow id={follow.id} version={follow.version} moved={follow.moved} watching={follow.watching} /> : undefined, readOnly ?? (anyHeld || set.busy || peopleBusy ? t('acc.change.busy') : undefined));
  // Showing another computer closes the Agent drawer. A question that may have reached the Agent stays held by the kit.
  const closeAsk = agentAsk.close;
  const askFor = useRef(c.id);
  useEffect(() => {
    if (!isOpen || askFor.current !== c.id) closeAsk();
    askFor.current = c.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeAsk only sets the step's own state
  }, [isOpen, c.id]);
  // The Save question: the choice, and the version of the rules it was asked over.
  const [asking, setAsking] = useState<{ want: Want; from: number; ips?: IpsConfirm } | null>(null);
  // Only these IPs: the list as typed, or (null) the ranges the rules hold now.
  const [typed, setTyped] = useState<string | null>(null);
  // Its Save reads the caller's address before asking: only the latest press, in this mount, may open the question.
  const ipsPress = useRef(0);
  const [ipsReading, setIpsReading] = useState(false);
  // The address read on a Save press of Only my IP was not the one shown: nothing was asked.
  // 'same': that address is the one the stored rules already allow, so nothing is left to save.
  const [ipMoved, setIpMoved] = useState<false | 'changed' | 'same'>(false);
  useEffect(() => () => { ipsPress.current++; }, []);
  const [dismissing, setDismissing] = useState<string | null>(null);
  // The runner's Dismiss frees only the send the band shows (its vars and hold token), as Held's onDismiss does.
  const dismissShown = set.dismiss;
  // Only the latest press clears the busy flag: an earlier press settling late never ends a later press's reading.
  const usePress = useRef(0);
  useEffect(() => {
    opening.current++;
    sends.current++;
    if (!isOpen) return;
    setAsking(null);
    setDismissing(null);
    setDismissingStep(null);
    setDismissingClear(null);
    // A write still held keeps its tracking across closing, so its result shows once it is proved.
    if (!set.held) setSent(null);
    set.reset();
    if (!clear.held) setCleared(null);
    clear.reset();
    setUseNote(null);
    setUseAsk(null);
    setHeldReadAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [isOpen, c.id]);
  const stale = set.outcome?.kind === 'failed' && (set.outcome.facts?.status === PRECONDITION || set.outcome.code === 'PRECONDITION_FAILED');
  const clearStale = clear.outcome?.kind === 'failed' && (clear.outcome.facts?.status === PRECONDITION || clear.outcome.code === 'PRECONDITION_FAILED');
  const clearFailed = clear.outcome?.kind === 'failed' && !clearStale && !clear.held;
  // Refused before it was sent (core's own refusal, e.g. the session could not be renewed): known not to have run.
  const clearNotSent = clear.outcome?.kind === 'not_sent' && !clear.held;
  // What a read of the state newer than the clear shows: only 'missing' says it follows the project alone.
  const clearShown = cleared && !clear.held && own.dataUpdatedAt > cleared.at
    ? ownNow === 'missing' ? 'done' : (ownNow === 'default' || ownNow === 'applied') && cleared.done ? 'again' : cleared.done ? 'unproved' : null
    : cleared?.done && !clear.held && (own.isError || own.fetchStatus === 'paused') ? 'unproved' : null;
  const clearHeldKey = clear.held ? JSON.stringify(clear.held) : null;
  useEffect(() => {
    const h = clear.held;
    if (h && typeof h.from === 'number') setCleared((p) => (p && p.from === h.from ? p : { from: h.from as number, at: Date.now(), done: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the held identity's value
  }, [clearHeldKey]);
  // Offered only on a document of the project's own that has rules, read in this opening, over a computer that keeps
  // rules of its own (default/applied, read in this opening), on a session that may change them.
  const projectSet = !!shownDoc && projectFact(shownDoc) === 'pp.fact.rules.set';
  const offerUse = projectSet && (ownSeen === 'default' || ownSeen === 'applied') && mayChange;
  async function pressUse() {
    const done = stepCapture();
    const press = ++usePress.current;
    setUseNote(null);
    setUseReading(true);
    try {
      const [r, o, p] = await Promise.all([q.refetch(), own.refetch(), pq.refetch()]);
      done(() => {
        const rd = r.isError ? undefined : r.data?.[c.id];
        const od = o.isError ? undefined : o.data?.[c.id];
        const pd = p.isError || !c.project_id ? undefined : p.data?.[c.project_id];
        if (!rd || !od || !pd || !shownDoc) { setUseNote('readFailed'); return; }
        // Nothing of its own any more, or the project's rules gone: the section stops offering it on these reads.
        if (od !== 'default' && od !== 'applied') return;
        if (!sameDoc(pd, shownDoc)) { setShownDoc(pd); setUseNote('parentChanged'); return; }
        setUseAsk({ from: rd.version, doc: pd });
      });
    } finally {
      if (press === usePress.current) setUseReading(false);
    }
  }
  // Yes on the question: the project's document is read once more, and the clear goes only while it is still the
  // one the question showed. Rules changed since are shown instead and nothing is sent; so is a read that failed.
  async function confirmUse(ask: { from: number; doc: AccessRules }) {
    setUseAsk(null);
    if (readOnly !== undefined) return;
    const done = stepCapture();
    const press = ++usePress.current;
    setUseNote(null);
    setUseReading(true);
    let same = false;
    try {
      const p = await pq.refetch();
      done(() => {
        const pd = p.isError || !c.project_id ? undefined : p.data?.[c.project_id];
        if (!pd) { setUseNote('readFailed'); return; }
        if (!sameDoc(pd, ask.doc)) { setShownDoc(pd); setUseNote('parentChanged'); return; }
        same = true;
      });
    } finally {
      if (press === usePress.current) setUseReading(false);
    }
    if (same) await runClear(ask.from);
  }
  async function checkClear() {
    const done = stepCapture();
    const at = Date.now();
    await clear.check();
    done(() => setHeldReadAt(at));
  }
  async function runClear(from: number) {
    setUseAsk(null);
    setCleared(null);
    sends.current++;
    setHeldReadAt(null);
    const done = stepCapture();
    const res = await clear.run({ id: c.id, from });
    done(() => {
      if (res.outcome !== 'done') return;
      setCleared({ from, at: Date.now(), done: true });
      void refreshAccess();
    });
  }
  // What a save would write: a choice of the drawer's own, other than the current one, over a document it reads whole.
  // The address in use now: only a read that answered and is not failing or waiting (a failed re-read keeps the
  // earlier answer cached; that address may be one the person no longer uses). Nothing is saved over an unread one.
  const ipFailed = me.isError || me.fetchStatus === 'paused';
  const ip = !ipFailed && me.data?.version === 4 ? me.data.ip : null;
  // Only my IP over a stored address that is not the one in use now is a change (the person moved).
  // Only these IPs is a change when the list is not exactly the ranges the rules let in now; an entry the Hub can't
  // take, an empty list or one too long leaves nothing to save.
  const holdsNow = rangesOf(mode);
  // People and keys the stored rules hold: a change to addresses removes them, and its confirm says so.
  const endedNow = mode?.kind === 'people' ? mode.entries.length : 0;
  const listText = typed ?? ipsText(holdsNow);
  const list = parseIps(listText);
  const listOk = list.errors.length === 0 && !list.tooMany && list.ranges.length > 0;
  const same = !!mode && (choice === 'ips' ? sameRanges(list.ranges, holdsNow) : choice === mode.kind && (mode.kind !== 'myIp' || mode.ip === ip || ip === null));
  const want: Want | null = !mode || mode.kind === 'advanced' || !choice || choice === 'people' || same ? null
    : choice === 'ips' ? (listOk ? { kind: 'ips', ranges: list.ranges } : null)
    : choice === 'myIp' ? (ip ? { kind: 'myIp', ip } : null) : { kind: choice };
  const doc = rules && mode && want ? bodyFor(rules, mode, want, c.id) : null;
  // The Save question belongs to the choice and the rules it was asked over: once nothing may be written here (a
  // change is held, the computer turned read-only), the rules read since are a newer version than the one the
  // person was asked over, or they leave nothing to write (rules the Hub can't change), it closes unanswered.
  // A question about a list is about that list: once the list under the choice is another one, it closes too.
  const askListMoved = asking?.want.kind === 'ips' && (want?.kind !== 'ips' || !sameRanges(want.ranges, asking.want.ranges));
  const askOver = asking !== null && (anyHeld || readOnly !== undefined || doc === null || rules?.version !== asking.from || askListMoved);
  useEffect(() => {
    if (askOver) setAsking(null);
  }, [askOver]);
  // The Use project rules question belongs to the project document it showed: once nothing may be written here, or
  // a read shows another document, it closes unanswered and the section shows the document as it reads now.
  const useAskMoved = useAsk !== null && !!pdoc && !sameDoc(pdoc, useAsk.doc);
  const useAskOver = useAsk !== null && (anyHeld || readOnly !== undefined || useAskMoved);
  useEffect(() => {
    if (!useAskOver) return;
    setUseAsk(null);
    if (useAskMoved && pdoc) { setShownDoc(pdoc); setUseNote('parentChanged'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pdoc is read at the moment the question ends
  }, [useAskOver, useAskMoved]);
  const guardBusy = set.busy || clear.busy || peopleSending;
  const guardDirty = (want !== null && !set.held) || peopleBusy;
  useEffect(() => onGuard?.({ busy: guardBusy, dirty: guardDirty }), [onGuard, guardBusy, guardDirty]);
  const shown = sent && rules && mode && !set.held && q.dataUpdatedAt > sent.at && scope.dataUpdatedAt > sent.at
    ? reads(mode, sent.want) ? 'saved' : sent.done ? 'moved' : 'movedUnknown'
    : null;
  // A held write is proved by its change's read-back (core's automatic one after the lost answer, or Check again):
  // whichever frees it, the drawer then says what the rules show. Dismiss proves nothing, so says nothing.
  const heldKey = set.held ? JSON.stringify(set.held) : null;
  useEffect(() => {
    const w = set.held ? wantOf(set.held) : null;
    if (w) setSent((p) => (p && p.from === w.from && p.want.kind === w.want.kind && (p.want.kind !== 'ips' || w.want.kind !== 'ips' || sameRanges(p.want.ranges, w.want.ranges)) ? p : { ...w, at: Date.now(), done: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the held identity's value
  }, [heldKey]);
  async function checkAgain() {
    await set.check();
  }
  // A Stop tracking question belongs to the one hold it was asked about (its token): once that hold is freed,
  // replaced (even by a send of the same change over the same version) or taken up by another tab, the question is
  // over; a later hold never opens it unasked, and Yes never frees a hold other than the one asked about.
  const setHold = set.hold ?? null;
  const clearHold = clear.hold ?? null;
  const askSet = dismissing !== null && dismissing === setHold && !set.elsewhere;
  const askClear = dismissingClear !== null && dismissingClear === clearHold && !clear.elsewhere;
  const askStep = dismissingStep !== null && dismissingStep === step.hold && !step.elsewhere;
  useEffect(() => { if (dismissing !== null && !askSet) setDismissing(null); }, [dismissing, askSet]);
  useEffect(() => { if (dismissingClear !== null && !askClear) setDismissingClear(null); }, [dismissingClear, askClear]);
  useEffect(() => { if (dismissingStep !== null && !askStep) setDismissingStep(null); }, [dismissingStep, askStep]);
  // A read of the rules now, for a people-or-keys run (null when it fails: a failed re-read keeps old data).
  async function readRules(): Promise<AccessRules | null> {
    const x = await q.refetch();
    return x.isError || !x.data ? null : (x.data[c.id] ?? null);
  }

  // Only these IPs: the Save press reads the caller's address, then asks. A newer press, a change of the list or the
  // part going makes this read open nothing; the question itself ends when the rules or the list move (askOver).
  async function askIps(w: Extract<Want, { kind: 'ips' }>, from: number) {
    const at = ++ipsPress.current;
    const ended = endedNow;
    setIpsReading(true);
    const r = await me.refetch().catch(() => null);
    if (at !== ipsPress.current) return;
    setIpsReading(false);
    const d = r && !r.isError && r.fetchStatus !== 'paused' ? r.data : null;
    setAsking({
      want: w,
      from,
      ips: {
        removed: holdsNow.filter((x) => !w.ranges.includes(x)),
        ended,
        me: d?.version === 4 && V4.test(d.ip) ? { ip: d.ip, inside: coversIp(w.ranges, d.ip) } : d?.version === 6 ? 'v6' : 'unknown',
      },
    });
  }

  // Only my IP: the Save press reads the caller's address again, then asks about that read. A failed or non-IPv4 read
  // shows as such under the choice and asks nothing; an address other than the one shown asks nothing either and says
  // so (the choice then shows the address in use now).
  async function askMyIp(w: Extract<Want, { kind: 'myIp' }>, from: number) {
    const at = ++ipsPress.current;
    const removed = holdsNow.filter((x) => x !== `${w.ip}/32`);
    const ended = endedNow;
    const stored = mode?.kind === 'myIp' ? mode.ip : null;
    setIpMoved(false);
    setIpsReading(true);
    const r = await me.refetch().catch(() => null);
    if (at !== ipsPress.current) return;
    setIpsReading(false);
    if (!r || r.isError || r.fetchStatus === 'paused' || r.data?.version !== 4) return;
    if (r.data.ip !== w.ip) return setIpMoved(r.data.ip === stored ? 'same' : 'changed');
    setAsking({ want: w, from, ips: { removed, ended, me: { ip: w.ip, inside: true } } });
  }

  async function save(w: Want, from: number) {
    setAsking(null);
    // Only over the version the person was asked about: a newer read ends the question instead (askOver).
    if (!rules || !mode || rules.version !== from) return;
    const b = bodyFor(rules, mode, w, c.id);
    if (!b) return;
    setSent(null);
    const res = await set.run({ id: c.id, want: w, from: rules.version, body: b });
    if (res.outcome === 'done') {
      setSent({ want: w, from: rules.version, at: Date.now(), done: true });
      // The list follows the rules again (the read after this shows what was saved).
      setTyped(null);
      void refreshAccess();
    }
  }

  // The server's own refusal of the read (403: a member below Full control), never a framed page's unsent one.
  const refused = q.isError && rulesReadProblem(q.error) === 'level';
  const failed = rulesFailed || (rules === null && !q.isFetching);
  const frozen = readOnly !== undefined;
  const who: SectionState = refused
    // Refused: the band says so (below); the body stays empty.
    ? { kind: 'ready' }
    : failed
      // The failed read keeps its own words and Try again in the body (below).
      ? { kind: 'ready' }
      : !rules || !mode
        ? { kind: 'loading', rows: 4 }
        : { kind: 'ready' };

  // The held step's band. While the new secret's drawer is open it shows there (the section is behind the drawer,
  // and Check again must stay in reach with the secret still on screen).
  const stepBand = step.held ? (
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome; Check again runs the held step's read-back, which alone can prove it */
          actions={step.elsewhere ? undefined : (
            <>
              <Button size="sm" onPress={() => void step.check()}>{t('acc.held.check')}</Button>
              <Button size="sm" variant="ghost" onPress={() => setDismissingStep(step.hold)}>{t('acc.held.dismiss')}</Button>
            </>
          )}
        >
          {t('acc.held.step')}
        </Band>
  ) : null;
  // The people panel has one place, after the choice, so it is never remounted (its run and secret live in it). It
  // shows for the people choice; while a change runs or its secret shows it stays when the rules read as Advanced
  // partway, or on the last rules read when a re-read fails (it sends nothing on them: an unread step waits for a
  // newer read).
  const panelOn = choice === 'people' ? (rules && mode && (mode.kind !== 'advanced' || peopleBusy) ? { rules, mode } : peopleBusy && !(rules && mode) ? kept : null) : null;
  const panel = panelOn ? <AccessPeople c={c} rules={panelOn.rules} mode={panelOn.mode} held={anyHeld} read={readRules} onBusy={onPeople} onSecret={setSecretOpen} heldBand={stepBand} {...(frozen ? { readOnly } : {})} /> : null;

  // The people choice saves through its own buttons (each add or removal asks first): no Save for it.
  const writable = !!mode && mode.kind !== 'advanced' && choice !== 'people' && !frozen;
  // What holds now, in one sentence, then where it comes from. While the rules are refused to this session the list
  // row's word stands in, said as the list's.
  const row = accessOf(c);
  const verdict = rules && mode ? (
    <Verdict label={t('acc.verdict')} next={t(whyKey(mode, ownNow), { name: c.name })} {...(mode.kind === 'advanced' ? { facts: <RulesFacts rules={rules} /> } : {})}>
      {nowLine(mode, t)}
    </Verdict>
  ) : refused ? (
    <Verdict label={t('acc.verdict')} next={t('perm.why.listed')}>
      {listedWord(row.state, tp, t)}
    </Verdict>
  ) : null;
  // Only the bands that show: an empty fragment is truthy and would draw an empty notices box.
  const bands = (
    <>
      {set.held ? (
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome has no rejection to show; Check again reads the rules back */
          actions={set.elsewhere ? undefined : (
            <>
              <Button size="sm" onPress={() => void checkAgain()}>{t('acc.held.check')}</Button>
              <Button size="sm" variant="ghost" onPress={() => setDismissing(set.hold ?? null)}>{t('acc.held.dismiss')}</Button>
            </>
          )}
        >
          {t(`acc.held.${heldKind(set.held)}`)}
        </Band>
      ) : null}
      {secretOpen ? null : stepBand}
      {clear.held ? (
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome; Check again runs the clear's read-back (only a missing document proves it) */
          actions={clear.elsewhere ? undefined : (
            <>
              <Button size="sm" onPress={() => void checkClear()}>{t('acc.held.check')}</Button>
              <Button size="sm" variant="ghost" onPress={() => setDismissingClear(clear.hold ?? null)}>{t('acc.held.dismiss')}</Button>
            </>
          )}
        >
          {t('acc.proj.use.held')}
          {(() => {
            const fresh = heldReadAt !== null && q.dataUpdatedAt >= heldReadAt && own.dataUpdatedAt >= heldReadAt;
            const line = fresh && typeof clear.held.from === 'number' ? clearHeldLine(clear.held.from, rules?.version, ownNow) : null;
            return line ? <> {t(`acc.proj.use.${line}`)}</> : null;
          })()}
        </Band>
      ) : null}
      {clearStale ? (
        <Band tone="warn" size="table" error={refusal(clear.outcome)} actions={<Button size="sm" onPress={() => { clear.reset(); void refreshAccess(); }}>{t('acc.stale.reload')}</Button>}>
          {t('acc.stale')}
        </Band>
      ) : null}
      {clearFailed ? <Band tone="danger" size="table" error={refusal(clear.outcome)}>{t('acc.proj.use.failed')}</Band> : null}
      {clearNotSent ? <Band tone="danger" size="table" error={refusal(clear.outcome)}>{t('acc.proj.use.notSent')}</Band> : null}
      {clearShown ? (
        <Band
          tone={clearShown === 'done' ? 'neutral' : 'warn'}
          size="table"
          /* noDetails: what a fresh read of the computer's state shows; unproved: Check again only reads the state again */
          actions={clearShown === 'unproved' ? <Button size="sm" onPress={() => void own.refetch()}>{t('acc.held.check')}</Button> : undefined}
        >
          {t(`acc.proj.use.${clearShown}`, { name: c.name, project: projectRow?.name ?? t('acc.proj.itsProject') })}
        </Band>
      ) : null}
      {stale ? (
        <Band tone="warn" size="table" error={refusal(set.outcome)} actions={<Button size="sm" onPress={() => { set.reset(); void refreshAccess(); }}>{t('acc.stale.reload')}</Button>}>
          {t('acc.stale')}
        </Band>
      ) : null}
      {ipMoved ? <Band tone="warn" size="table" /* noDetails: why nothing was asked, not a rejection */>{t(ipMoved === 'same' ? 'acc.ipChangedSame' : 'acc.ipChanged')}</Band> : null}
      {shown ? <Band tone={shown === 'saved' ? 'neutral' : 'warn'} size="table" /* noDetails: what a fresh read of the rules shows, not a rejection */>{t(`acc.${shown}`)}</Band> : null}
      {follow ? <AgentFollow id={follow.id} version={follow.version} moved={follow.moved} watching={follow.watching} /> : null}
    </>
  );
  const anyBand = set.held || step.held || clear.held || clearStale || clearFailed || clearNotSent || clearShown || stale || ipMoved || shown || follow || frozen;
  return (
    <>
      {verdict}
      <AnatomySection
        id="perm-who"
        title={t('perm.who.title')}
        state={who}
        {...(rules && mode ? { actions: withAskAgent({}, agentAsk.action) } : {})}
        {...(anyBand || refused ? { notices: <>{refused ? <Band size="table" /* noDetails: who may read these rules, said once; the refusal itself carries nothing more */>{t('perm.refused', { name: c.name })}</Band> : null}{frozen ? <Band size="table" /* noDetails: why the rules can't be changed here, not a rejection */>{readOnly}</Band> : null}{bands}</> } : {})}
      >
        {failed && !refused ? (
          <ErrorState size="compact" title={t('acc.error')} error={q.error} onRetry={() => void refreshAccess()} />
        ) : !rules || !mode ? null : mode.kind === 'advanced' ? (
          <Advanced rules={rules} project={project ?? 'unknown'} />
        ) : (
          <>
            <RadioGroup<Choice>
              aria-label={t('acc.choice')}
              description={t('acc.lede')}
              value={choice}
              onChange={(v) => { setChoice(v); setSent(null); setIpMoved(false); }}
              isDisabled={anyHeld || set.busy || peopleBusy || frozen || ipsReading}
              options={[
                { value: 'anyone', label: t('acc.anyone'), description: t('acc.anyoneHelp') },
                // The address and how this choice can lock the person out sit under it while it is picked.
                { value: 'myIp', label: t('acc.myIp'), description: t('acc.myIpHelp'), reveal: <MyIp q={me} /> },
                // The list sits under its choice while it is picked; nothing is sent until Save and its confirm.
                {
                  value: 'ips',
                  label: t('acc.ips'),
                  description: t('acc.ipsHelp'),
                  reveal: <IpsList value={listText} isDisabled={anyHeld || set.busy || peopleBusy || frozen || ipsReading} onChange={(up) => { ipsPress.current++; setIpsReading(false); setTyped((cur) => up(cur ?? ipsText(holdsNow))); setSent(null); }} />,
                },
                { value: 'people', label: t('acc.people'), description: t('acc.peopleHelp') },
                { value: 'private', label: t('acc.private'), description: t('acc.privateHelp') },
              ]}
            />
            {writable ? (
              <FormFooter
                dirty={want !== null && !set.held}
                submitDisabled={anyHeld || doc === null}
                busy={set.busy || ipsReading}
                outcome={set.held || stale ? undefined : set.outcome}
                error={stale ? undefined : refusal(set.outcome)}
                onCheck={checkAgain}
                submitLabel={t('acc.save')}
                onSubmit={() => {
                  if (!want || !doc || !rules) return;
                  if (want.kind === 'ips') void askIps(want, rules.version);
                  // Only my IP over other addresses: the confirm names the ones that go.
                  else if (want.kind === 'myIp') void askMyIp(want, rules.version);
                  else setAsking({ want, from: rules.version });
                }}
              />
            ) : null}
          </>
        )}
      </AnatomySection>
      {panel}
      {rules && mode?.kind === 'advanced' && projectSet && shownDoc ? (
        <AccessProject
          doc={shownDoc}
          project={projectRow}
          own={ownNow}
          offer={offerUse && !frozen}
          note={useNote}
          busy={useReading || clear.busy}
          isDisabled={anyHeld || set.busy || clear.busy || peopleBusy || useReading}
          onUse={() => void pressUse()}
        />
      ) : null}
      <AskAgentDrawer ask={agentAsk} />
      <ConfirmDialog overlayId="computers-access-confirm"
        isOpen={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={t('acc.confirm.title', { name: c.name })}
        body={!asking ? '' : asking.want.kind === 'ips' ? t('acc.confirm.ips', { ips: asking.want.ranges.map(shownRange).join(', ') }) : asking.want.kind === 'myIp' ? t('acc.confirm.myIp', { ip: asking.want.ip }) : asking.want.kind === 'private' ? t('acc.confirm.private') : t('acc.confirm.anyone')}
        // What else the change does, one row each: the addresses and the people or keys that go, and the caller's own
        // address when the list leaves it out (or it can't be told).
        consequences={asking?.ips ? [
          ...(asking.ips.removed.length ? [t('acc.confirm.ips.removed', { ips: asking.ips.removed.map(shownRange).join(', ') })] : []),
          ...(asking.ips.ended ? [t('acc.confirm.ips.ended', { n: asking.ips.ended })] : []),
          ...(asking.ips.me === 'v6' ? [t('acc.confirm.ips.v6')] : []),
          ...(asking.ips.me === 'unknown' ? [t('acc.confirm.ips.unknown')] : []),
          ...(typeof asking.ips.me === 'object' && !asking.ips.me.inside ? [t('acc.confirm.ips.out', { ip: asking.ips.me.ip })] : []),
        ] : undefined}
        confirmLabel={t('acc.confirm.go')}
        onConfirm={() => { if (asking) void save(asking.want, asking.from); }}
      />
      <ConfirmDialog overlayId="computers-access-held-dismiss-1"
        isOpen={askSet}
        onOpenChange={(o) => !o && setDismissing(null)}
        title={t('acc.held.dismissTitle')}
        body={t('acc.held.dismissBodyOn', { name: c.name })}
        confirmLabel={t('acc.held.dismissGo')}
        onConfirm={() => { if (!askSet) return; setDismissing(null); setSent(null); void dismissShown(); }}
      />
      <ConfirmDialog overlayId="computers-access-project-use"
        isOpen={useAsk !== null}
        onOpenChange={(o) => !o && setUseAsk(null)}
        title={t('acc.proj.use.confirm.title')}
        body={useAsk ? t('acc.proj.use.confirm.body', { name: c.name, project: projectRow?.name ?? t('acc.proj.itsProject'), summary: summaryText(useAsk.doc, t) }) : ''}
        confirmLabel={t('acc.proj.use.confirm.go')}
        onConfirm={() => { if (useAsk) void confirmUse(useAsk); }}
      />
      <ConfirmDialog overlayId="computers-access-held-dismiss-2"
        isOpen={askClear}
        onOpenChange={(o) => !o && setDismissingClear(null)}
        title={t('acc.held.dismissTitle')}
        body={t('acc.held.dismissBodyOn', { name: c.name })}
        confirmLabel={t('acc.held.dismissGo')}
        onConfirm={() => { if (!askClear) return; setDismissingClear(null); setCleared(null); sends.current++; setHeldReadAt(null); void clear.dismiss(); }}
      />
      <ConfirmDialog overlayId="computers-access-held-dismiss-3"
        isOpen={askStep}
        onOpenChange={(o) => !o && setDismissingStep(null)}
        title={t('acc.held.dismissTitle')}
        body={t('acc.held.dismissBodyOn', { name: c.name })}
        confirmLabel={t('acc.held.dismissGo')}
        onConfirm={() => { if (!askStep) return; setDismissingStep(null); void step.dismissShown(); }}
      />
    </>
  );
}

/** The rules read as the choice that was sent (Only these IPs: exactly the ranges sent). */
function reads(mode: AccessMode, want: Want): boolean {
  return readsAs(mode, { kind: want.kind, ...(want.kind === 'myIp' ? { ip: want.ip } : {}), ...(want.kind === 'ips' ? { ips: want.ranges } : {}) });
}

/** The choice and version a held write was sent with (its identity), or null for one recorded without them. */
function wantOf(i: Record<string, unknown>): { want: Want; from: number } | null {
  const from = typeof i.from === 'number' ? i.from : null;
  if (from === null) return null;
  if (i.want === 'anyone' || i.want === 'private') return { want: { kind: i.want }, from };
  if (i.want === 'myIp' && typeof i.ip === 'string') return { want: { kind: 'myIp', ip: i.ip }, from };
  const ranges = i.want === 'ips' ? heldRanges(i.ips) : null;
  if (ranges) return { want: { kind: 'ips', ranges }, from };
  return null;
}

/** Which held write the band names (its identity's `want`); 'other' for one recorded without it. */
function heldKind(i: Record<string, unknown>): 'anyone' | 'myIp' | 'ips' | 'private' | 'other' {
  return i.want === 'anyone' || i.want === 'myIp' || i.want === 'ips' || i.want === 'private' ? i.want : 'other';
}

type T = ReturnType<typeof useStrings<typeof strings>>;

// Agent starts by question (a computer's id, or 'all' with the account and realm), kept outside any drawer or button so closing and reopening
// never forgets one: while a start is out, or may have reached the Agent (unknown), no second one goes for the same
// question. The kit holds only a start its panel has not taken yet.
interface AskState { busy: boolean; outcome: AskStartOutcome | null }
const IDLE: AskState = { busy: false, outcome: null };
const asks = new Map<string, AskState>();
// Change requests that may have reached the Agent, by computer (useChangeWatch below).
const watches = new Map<string, { from: number; until: number }>();
const askWatchers = new Set<() => void>();
function setAsk(key: string, v: AskState) {
  asks.set(key, v);
  for (const w of askWatchers) w();
}
const watchAsks = (w: () => void) => {
  askWatchers.add(w);
  return () => { askWatchers.delete(w); };
};
/** Tests only: forget every start and every watch after a change request. */
export function resetAccessAsks(): void {
  asks.clear();
  watches.clear();
  resetAskAgentForTests();
  for (const w of askWatchers) w();
}


/** One Agent start per question through the kit's startAgentConversation (a NEW conversation), with its C9 line. A start that may
 *  have reached the Agent says so, never "not sent"; pressing again then opens the Agent panel instead of asking twice. */
function useAskStart(key: string, source: string) {
  const dock = useAskDock();
  const state = useSyncExternalStore(watchAsks, () => asks.get(key) ?? IDLE, () => IDLE);
  // False when no new start may go: one may have reached the Agent (its panel opens instead) or one is still out.
  // A button that reads before it starts asks this first, so that read never stands between the press and the panel.
  const ready = () => {
    const now = asks.get(key) ?? IDLE;
    if (now.outcome === 'unknown') {
      dock.open();
      return false;
    }
    return !now.busy;
  };
  // Each start names its computer (the conversation's tools act on the computer it is bound to, so never the one
  // shown elsewhere) and may watch its outcome: onOut runs when it was sent or may have been.
  const start = (q: AgentQuestion, o: { computer?: Computer; onOut?: () => void } = {}) => {
    if (!ready()) return;
    setAsk(key, { busy: true, outcome: null });
    // 'unknown' may later become 'sent' (the kit tells each change); it is never sent again either way.
    startAgentConversation({
      ...q,
      ...(o.computer ? { computer: o.computer } : {}),
      source,
      onStart: (out) => {
        setAsk(key, { busy: out === 'unknown', outcome: out === 'sent' ? null : out });
        if (out !== 'notSent') o.onOut?.();
      },
    });
  };
  return { ready, start, outcome: state.outcome };
}

/** After a request may have reached the Agent: what a fresh read shows, and the watch line with Check now. */
function AgentFollow({ id, version, moved, watching }: { id: string; version: number | null; moved: boolean; watching: boolean }) {
  const t = useStrings(strings);
  return (
    <>
      {moved && version !== null ? (
        <Band tone="neutral" size="table" /* noDetails: what a fresh read of the rules shows after an Agent request */ actions={<Button size="sm" variant="ghost" onPress={() => seenChange(id, version)}>{t('acc.change.seen')}</Button>}>
          {t('acc.change.moved')}
        </Band>
      ) : null}
      {watching ? (
        <Band tone="neutral" size="table" /* noDetails: says the drawer reads the rules again, no rejection */ actions={<Button size="sm" variant="ghost" onPress={() => void refreshAccess()}>{t('acc.change.check')}</Button>}>
          {t('acc.change.watching')}
        </Band>
      ) : null}
    </>
  );
}

/** "Explain with the Agent" on a project's Permissions: a NEW conversation started with the project document
 *  as read and each computer shown with whether it has rules of its own (access.logic.ts projectSnapshotOf), every
 *  credential left out and every id masked. Bound to no computer. */
export function useExplainProject(project: Project | null, rules: AccessRules | undefined, computers: readonly ProjectSnapshotComputer[]): { action?: ActionSpec; notice: ReactNode } {
  const t = useStrings(pageStrings);
  const ta = useStrings(strings);
  const ask = useAskStart(`p:${project?.id ?? ''}`, t('pp.ov.explainSource'));
  const note = askNote(ask.outcome, false);
  return {
    // Offered once the project's rules are read: the Agent is started with them, never with a guess.
    ...(project && rules ? { action: { id: 'explain', label: t('pp.ov.explain'), icon: 'sparkle', onPress: () => { const names = { title: ta('acc.agent.projectTitle', { name: maskSeenIds(project.name) }), contextLabel: ta('acc.agent.projectContext', { count: computers.length }) }; ask.start({ ...explainProjectStart(project.name, rules, computers, askStartRoom(names)), ...names }); } } } : {}),
    // How the Agent start went (C9), only once there is something to say.
    notice: note ? <Band tone={note === 'unknown' ? 'warn' : 'neutral'} size="table" /* noDetails: how a start went, not a rejection */>{ta(`acc.explain.${note}`)}</Band> : null,
  };
}

// After a change request may have reached the Agent (sent, or unknown: either may lead to writes), the drawer reads
// the rules again every few seconds while it is open, and when the window comes back, for a while. `from` is the
// version the request was made on; the band says when the rules read newer. Module level, so closing and reopening
// the drawer keeps watching.
const WATCH_EVERY_MS = 4000;
const WATCH_FOR_MS = 15 * 60_000;
function setWatch(id: string, v: { from: number; until: number }) {
  watches.set(id, v);
  for (const w of askWatchers) w();
}
/** The band's OK: the rules as now read are seen; watching goes on (the Agent may write again). */
/** A watch's time is up: it goes (only that watch, not a newer one), so nothing reads or says it any more. */
function endWatch(id: string, until: number) {
  if (watches.get(id)?.until !== until) return;
  watches.delete(id);
  for (const w of askWatchers) w();
}
function seenChange(id: string, version: number) {
  const w = watches.get(id);
  if (w) setWatch(id, { ...w, from: Math.max(w.from, version) });
}
function useChangeWatch(id: string, isOpen: boolean) {
  const w = useSyncExternalStore(watchAsks, () => watches.get(id), () => undefined);
  const live = !!w && isOpen;
  const until = w?.until ?? 0;
  useEffect(() => {
    if (!live) return;
    const left = until - Date.now();
    if (left <= 0) {
      endWatch(id, until);
      return;
    }
    const read = () => void refreshAccess();
    const every = setInterval(read, WATCH_EVERY_MS);
    const offFocus = hostEnv().onLifecycle('focus', read);
    // The effect re-runs once the watch goes, and its cleanup stops the reads.
    const end = setTimeout(() => endWatch(id, until), left);
    return () => {
      clearInterval(every);
      clearTimeout(end);
      offFocus();
    };
  }, [id, live, until]);
  return w;
}

/** The list-wide start's key: one per account and realm. */
function useExplainAllKey(): string {
  const core = useCore();
  return `all:${core.account ?? ''}\n${core.realm}`;
}

/** The computer the list-wide Explain names. It needs a computer to ask on: with "All computers" in the top bar none is
 *  current, and the kit would refuse at once ("didn't reach the Agent"). Then the first running
 *  computer listed asks (any agent answers from the snapshot alone; only a running one can), and the kit shows it
 *  everywhere, as a computer's own Explain does. A current computer: null (the kit asks on it). None running: null,
 *  and the kit's honest refusal stands. */
export function explainAllComputer<T extends Computer>(computers: readonly T[], hasCurrent: boolean): T | null {
  if (hasCurrent) return null;
  return pickComputer(computers.filter((c) => computerState(c.status) === 'running'), { remembered: null });
}

/** Ask the Agent in the access drawer, a step of the drawer: Explain (the rules as read, every
 *  credential left out and every id masked, access.logic.ts explainStart; the Agent answers only from them and the rules
 *  shown here win) and "Tell the Agent what you want" (changeStart; a request that is too long, or holds what looks
 *  like a password or key, is never sent). The Agent changes the rules only through its own tools, each write approved
 *  by the person in the Agent panel; after a request may have reached it, the drawer reads the rules again
 *  (useChangeWatch). Asked on this computer. */
function useAccessAsk(c: Computer, rules: AccessRules | null | undefined, project: ProjectRules, after: ReactNode, busy: string | undefined) {
  const t = useStrings(strings);
  const x = rules ? { name: c.name, rules, project } : null;
  // How the question names itself in the Agent panel: its one-line request, and what its context is. Sent with it, so the
  // name is masked as the snapshot masks it (a name may hold a 24-hex id).
  const shownName = maskSeenIds(c.name);
  const names = { title: t('acc.agent.oneTitle', { name: shownName }), contextLabel: t('acc.agent.oneContext', { name: shownName }) };
  const room = askStartRoom(names);
  return useAskAgent({
    askKey: `access:${c.id}`,
    subject: t('acc.agent.subject', { name: c.name }),
    source: t('acc.explainSource'),
    computer: c,
    request: { title: names.title, summary: t('acc.agent.oneSummary'), text: EXPLAIN_QUESTION, textKind: 'prose' },
    // What the Agent reads, in the parts a person reads it in: how the rules combine (sentences), then the documents (a
    // listing). Display only: Explain sends the snapshot itself.
    ...(x
      ? {
          reads: snapshotParts(explainStart(x, room).context).map((part): AgentReadPart =>
            part.k === 'how'
              ? { id: 'how', title: t('acc.agent.partHow'), text: part.text, kind: 'prose' }
              : { id: 'rules', title: t('acc.agent.partRules', { name: shownName }), text: part.text, kind: 'data' },
          ),
          readsNote: t('acc.agent.left'),
        }
      : { disabledReason: t('acc.explain.unread') }),
    explain: { run: (send) => send(x ? { ...explainStart(x, room), ...names } : null) },
    tell: {
      label: t('acc.change'),
      description: t('acc.changeHelp'),
      ...(busy ? { disabledReason: busy } : {}),
      check: (text) => {
        const problem = changeProblem(text);
        if (problem === 'empty') return null;
        if (problem === 'long' || problem === 'secret') return { problem: t(`acc.change.${problem}`, { max: CHANGE_MAX }) };
        // The Agent panel shows the person's words as the request when they are one line of at most ASK_LABEL_MAX
        // characters (else no title); the snapshot is its context.
        const tell = { contextLabel: names.contextLabel };
        const q = x ? changeStart(text, x, askStartRoom(tell)) : null;
        return q ? { q: { ...q, ...tell } } : null;
      },
    },
    // The outcome callback is the press's (its rules): the watch starts from the version the request was made on.
    onOutcome: (o, kind) => {
      if (kind !== 'tell' || o === 'notSent' || !rules) return;
      const was = watches.get(c.id);
      setWatch(c.id, { from: Math.max(rules.version, was?.from ?? rules.version), until: Date.now() + WATCH_FOR_MS });
    },
    after,
  });
}

/** Ask the Agent on the Computers list: its own drawer, Explain first. Explain reads the first
 *  EXPLAIN_ALL_MAX computers' rules fresh and starts one Agent conversation with all of them (access.logic.ts
 *  realmSnapshotOf, bounded); the snapshot says how many computers were not read, and a computer whose rules could not
 *  be read is named as such, never guessed. Asked on the current computer, else the first running one listed
 *  (explainAllComputer). */
export function useExplainAll(computers: readonly Computer[]): AskAgent {
  const t = useStrings(strings);
  const key = useExplainAllKey();
  const shown = computers.slice(0, EXPLAIN_ALL_MAX);
  // The press pins its list: the question describes the computers the press saw, under the key and fallback it sent with.
  const [pending, setPending] = useState<{ at: number; key: string; send: (q: AgentQuestion | null) => void; list: readonly Computer[]; skipped: number } | null>(null);
  // Whether the drawer shows now, as this render sees it: the read's end checks it (and the key) before it sends, so a
  // read that ends in the same commit as the close or the key change sends nothing.
  const openNow = useRef(false);
  // While the drawer shows, the rules are read so it can list what the Agent will read, part by part; the press still
  // reads them again and sends what they say then.
  const [open, setOpen] = useState(false);
  const many = useAccessMany((pending?.list ?? shown).map((c) => c.id), pending !== null || open);
  const skippedNow = computers.length - shown.length;
  // How the question names itself in the Agent panel (sent with it), for the list a press or the drawer reads.
  const namesFor = (count: number) => ({ title: t('acc.agent.allTitle'), contextLabel: t('acc.agent.allContext', { count }) });
  const itemsOf = (list: readonly Computer[]): RealmItem[] => list.map((c, n) => {
    const rq = many.rules[n];
    const sq = many.scope[n];
    const rules = rq && !rq.isError && rq.fetchStatus !== 'paused' ? (rq.data?.[c.id] ?? null) : null;
    const sv = sq && !sq.isError && sq.fetchStatus !== 'paused' ? sq.data?.[c.id] : undefined;
    const project: ProjectRules = projectRulesOf(c.proxy_permissions_scope) === 'yes' ? 'yes' : (sv ?? 'unknown');
    return { name: c.name, rules, project };
  });
  useEffect(() => {
    if (!pending) return;
    const done = (x: { isError: boolean; fetchStatus: string; dataUpdatedAt: number }) => x.isError || x.fetchStatus === 'paused' || x.dataUpdatedAt >= pending.at;
    if (!openNow.current || pending.key !== key) {
      setPending(null);
      return;
    }
    if (!many.rules.every(done) || !many.scope.every(done)) return;
    const names = namesFor(pending.list.length);
    const items = itemsOf(pending.list);
    setPending(null);
    pending.send({ ...explainAllStart(items, pending.skipped, askStartRoom(names)), ...names });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesFor and itemsOf read this render's strings and reads
  }, [pending, many, key]);
  // What the drawer lists while it shows: the snapshot as the rules read now, in the parts a person reads it in. Until
  // every rule is read the list says so, in one row, and never shows a part of a snapshot.
  // A read still running (a reopen refetching an earlier answer) is not settled: the list never says "Read just now" over it.
  const settled = (x: { isError: boolean; fetchStatus: string; isPending?: boolean; data?: unknown }) =>
    x.isError || x.fetchStatus === 'paused' || (x.fetchStatus === 'idle' && x.data !== undefined);
  const readNow = open && !pending && shown.length > 0 && many.rules.every(settled) && many.scope.every(settled);
  const reads: AgentReadPart[] = readNow
    ? realmSnapshotParts(explainAllStart(itemsOf(shown), skippedNow, askStartRoom(namesFor(shown.length))).context).map((part, n) => ({
        id: `${part.k}:${n}`,
        title: part.k === 'how' ? t('acc.agent.partHow') : part.k === 'left' ? t('acc.agent.partLeft') : t('acc.agent.partRules', { name: part.name ?? '' }),
        text: part.text,
        // How the rules combine and what was left out are sentences; a computer's rules are a listing.
        kind: part.k === 'computer' ? 'data' : 'prose',
      }))
    : [{ id: 'reading', title: t('acc.agent.allContextRow', { count: shown.length }), note: shown.length > 0 ? t('acc.agent.reading') : undefined }];
  const on = explainAllComputer(computers, !!capture().target);
  const ask = useAskAgent({
    askKey: key,
    subject: t('acc.agent.allSubject'),
    source: t('acc.explainAllSource'),
    ...(on ? { computer: on } : {}),
    request: { title: t('acc.agent.allTitle'), summary: t('acc.agent.allSummary'), text: EXPLAIN_ALL_QUESTION, textKind: 'prose' },
    reads,
    readsNote: skippedNow > 0 ? `${t('acc.agent.allReads')} ${t('acc.agent.allSkipped', { count: shown.length, skipped: skippedNow })}` : t('acc.agent.allReads'),
    ...(shown.length === 0 ? { disabledReason: t('acc.agent.none') } : {}),
    explain: {
      busy: pending !== null,
      run: (send) => {
        if (pending || shown.length === 0) return;
        setPending({ at: Date.now(), key, send, list: shown, skipped: computers.length - shown.length });
        void refreshAccess();
      },
    },
  });
  // Layout effects run before the passive ones of the same commit: the read's end above sees this commit's open state.
  useLayoutEffect(() => {
    openNow.current = ask.isOpen;
    setOpen(ask.isOpen);
  }, [ask.isOpen]);
  // A pending read ends with its drawer or its key: it never starts a conversation the user has left.
  useEffect(() => {
    if (!ask.isOpen) setPending(null);
  }, [ask.isOpen]);
  useEffect(() => {
    setPending(null);
  }, [key]);
  return ask;
}

/** The verdict's sentence: what holds now, from the rules as read. */
export function nowLine(mode: AccessMode, t: (k: 'acc.now.anyone' | 'acc.now.myIp' | 'acc.now.ips' | 'acc.now.ipsMany' | 'acc.now.private' | 'acc.now.cut' | 'acc.now.cutMyIp' | 'acc.now.cutIps' | 'acc.now.peopleMyIp' | 'acc.now.peopleIps' | 'acc.now.people' | 'acc.now.advanced', v?: Record<string, string>) => string): string {
  if (mode.kind === 'anyone') return t('acc.now.anyone');
  if (mode.kind === 'myIp') return t('acc.now.myIp', { ip: mode.ip });
  // A short list is named; a longer one is counted (the list itself is under the choice).
  if (mode.kind === 'ips') return mode.entries.length <= NOW_IPS_NAMED ? t('acc.now.ips', { ips: mode.entries.map((e) => shownRange(e.range)).join(', ') }) : t('acc.now.ipsMany', { n: String(mode.entries.length) });
  if (mode.kind === 'private') return t('acc.now.private');
  // A cut add may leave everyone else still let in: then the line says so (the band below says why).
  if (mode.kind === 'people') {
    if (mode.unfinished && mode.open) return t('acc.now.anyone');
    // An entry a cut add left with nothing to open is listed, and opens nothing: the line never says it can.
    const list = mode.listLeft === true;
    if (mode.entries.some((e) => e.programs.length === 0)) return t(list ? 'acc.now.cutIps' : mode.myIp ? 'acc.now.cutMyIp' : 'acc.now.cut');
    return t(list ? 'acc.now.peopleIps' : mode.myIp ? 'acc.now.peopleMyIp' : 'acc.now.people');
  }
  return t('acc.now.advanced');
}

/** How many addresses the verdict names before it counts them instead. */
const NOW_IPS_NAMED = 3;

/** Add my IP's read (kit IpAllowlistField): GET /ip through the page's myIp query, only when pressed. */
function useReadIp(): () => Promise<IpDetails | null> {
  return readIpFrom(useMyIp(false));
}

/** The list of Only these IPs (the computer's choice and the project rules tab's): the kit's one IPv4 list field, with
 *  Add my IP, every refused entry named with why, and what the choice can do to the person. Nothing is sent from here. */
export function IpsList({ value, onChange, isDisabled }: {
  value: string;
  onChange: (next: (cur: string) => string) => void;
  isDisabled: boolean;
}) {
  const t = useStrings(strings);
  const p = parseIps(value);
  // The caller's address is read only on a press of Add my IP (the page's one GET /ip read).
  const readIp = useReadIp();
  const problems = [...p.errors.map((e) => t(`acc.ips.err.${e.code}`, { entry: e.entry })), ...(p.tooMany ? [t('acc.ips.tooMany', { max: IPS_MAX })] : [])];
  return (
    <>
      <IpAllowlistField
        label={t('acc.ips.label')}
        description={t('acc.ips.help', { max: IPS_MAX })}
        multiline
        value={value}
        onChange={onChange}
        readIp={readIp}
        errorMessage={problems.length > 0 ? problems.join(' ') : undefined}
        isDisabled={isDisabled}
      />
      <Band tone="warn" size="table" /* noDetails: a warning about the list, not a rejection */>
        {t('acc.ips.lockout')}
      </Band>
    </>
  );
}

/** The address the Hoody API sees, with what Only my IP can and can't do from it (the project rules tab shows it too). */
export function MyIp({ q }: { q: ReturnType<typeof useMyIp> }) {
  const t = useStrings(strings);
  const d = q.data;
  if (q.isPending && d === undefined) return <Skeleton rows={2} variant="text" />;
  // A failed or waiting re-read keeps the earlier answer cached: it is not shown as the address in use now.
  if (!d || q.isError || q.fetchStatus === 'paused') return <ErrorState size="compact" title={t('acc.ipError')} error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <IpInfo details={d} />
      {/* One band under the address. The IPv4-only rule is in it, not left in the details popover: it decides whether
          Only my IP can work at all (the IPv6 sentence says it itself). */}
      <Band tone="warn" size="table" /* noDetails: a warning about the address, not a rejection */>
        {d.version === 4 ? `${t('acc.ipNote')} ${t('acc.lockout')}` : d.version === 6 ? t('acc.ipv6', { ip: d.ip }) : `${t('acc.ipOdd', { ip: d.ip })} ${t('acc.ipNote')}`}
      </Band>
    </>
  );
}

/** Rules the Hub did not write, under the verdict that holds their groups: the plain summary, why the Hub leaves them
 *  alone, and where to change them. */
function Advanced({ rules, project }: { rules: AccessRules; project: ProjectRules }) {
  const t = useStrings(strings);
  const tp = useStrings(pageStrings);
  return (
    <>
      {/* The plain summary, read straight from the rules (no AI): it wins over any Agent answer. */}
      <RulesSummary rules={rules} project={project} />
      <Why question={t('acc.adv.why')} faq={{ item: pageFaq(tp).byId.whoCanOpen, label: t('acc.adv.more') }}>{t('acc.adv.lede')} {t('acc.adv.cantChange')}</Why>
      <Link href={DOCS_PERMISSIONS}>{t('acc.adv.how')}</Link>
    </>
  );
}

/** The computers list's own word for a computer's access, as a sentence: what the tab says when the rules themselves
 *  can't be read with this sign-in. */
export function listedWord(state: ReturnType<typeof accessOf>['state'], tp: ReturnType<typeof useStrings<typeof pageStrings>>, t: T): string {
  const word = state === 'set' ? tp('access.word.set') : state === 'open' ? tp('access.word.open') : state === 'unchecked' ? tp('access.word.unchecked') : tp('access.word.unknown');
  return t('perm.listed', { word });
}

// Which reason the verdict gives when several hold: the one that decides most comes first.
const WHY_ORDER: readonly AdvancedWhy[] = ['proxyOff', 'project', 'rules', 'hooks', 'projectUnknown'];

/** Where the verdict's sentence comes from, one line. "Anyone" is either no rules at all or the computer's own stored
 *  choice; an add that stopped partway says so, never "chosen here". */
export function whyKey(mode: AccessMode, own: OwnState | undefined): 'perm.why.none' | 'perm.why.here' | 'perm.why.hereAnyone' | 'perm.why.unfinished' | `perm.why.${AdvancedWhy}` {
  if (mode.kind === 'anyone') return own === 'default' || own === 'applied' ? 'perm.why.hereAnyone' : 'perm.why.none';
  if (mode.kind === 'people' && mode.unfinished) return 'perm.why.unfinished';
  if (mode.kind !== 'advanced') return 'perm.why.here';
  return `perm.why.${WHY_ORDER.find((w) => mode.why.includes(w)) ?? 'rules'}`;
}

/** A project document's plain sentences as one line of text (the clear's confirm quotes them). */
function summaryText(rules: AccessRules, t: T): string {
  return summaryOf(rules, 'no', 'project').map((l) => t(l.key, l.vars)).join(' ');
}

/** The plain sentences of a document (summaryOf), the address switch as a warning band. A project's own document says them as a project: no own-rules lead, no project or hooks line. */
export function RulesSummary({ rules, project, subject = 'computer' }: { rules: AccessRules; project: ProjectRules; subject?: 'computer' | 'project' }) {
  const t = useStrings(strings);
  return (
    <>
      {summaryOf(rules, project, subject).map((l) =>
        l.key === 'sum.off' || l.key === 'sum.offProject'
          ? <Band key={l.key} tone="warn" size="table">{t(l.key)}</Band>
          : <p key={l.key}>{t(l.key, l.vars)}</p>)}
    </>
  );
}

/** The same summary as one line of text (a fact's value): its sentences, the "off" warnings included, joined. */
export function RulesSummaryText({ rules, project, subject = 'computer' }: { rules: AccessRules; project: ProjectRules; subject?: 'computer' | 'project' }) {
  const t = useStrings(strings);
  return <>{summaryOf(rules, project, subject).map((l) => t(l.key, l.vars)).join(' ')}</>;
}

// A program's slug in a rule ("display") as the program's word ("Desktop"); any other name as written.
const LINK_OF: Partial<Record<string, ProgramLink>> = Object.fromEntries(PROGRAMS.map((p) => [SLUG[p], p]));

/** A document's groups, what each may open and what happens to everyone else (no credential: AccessRules keeps none). */
export function RulesFacts({ rules, label }: { rules: AccessRules; label?: string }) {
  const t = useStrings(strings);
  const kind = (g: AccessRules['groups'][number]) =>
    g.kind === 'ip' ? (g.range ? t('acc.adv.kind.ip', { range: g.range }) : t('acc.adv.kind.ipNoRange')) : t(`acc.adv.kind.${g.kind}`);
  const programs = (ps: Grant[]) =>
    ps.length === 0
      ? t('acc.adv.nothing')
      : ps.map((p) => t(`acc.adv.${p.rule}`, { program: p.program === '*' ? t('acc.adv.everyProgram') : p.program === 'logs' ? t('acc.p.prog.logs') : ((link) => (link ? t(`acc.p.prog.${link}`) : p.program))(LINK_OF[p.program]) })).join(', ');
  const dflt = rules.allowByDefault === true ? 'allow' : rules.allowByDefault === false ? 'deny' : 'unknown';
  return (
    <>
      <Facts
        columns={1}
        label={label ?? t('acc.adv.groups')}
        items={[
          // Names are the author's text: masked like any id (a name may be a 24-hex id).
          ...rules.groups.map((g) => ({ label: maskUrl(g.name), value: kind(g) })),
          ...rules.grants.map((p) => ({ label: t('acc.adv.mayOpen', { group: maskUrl(p.group) }), value: programs(p.programs) })),
          { label: t('acc.adv.default'), value: t(`acc.adv.default.${dflt}`) },
        ]}
      />
    </>
  );
}

/** `onLanded`: called when the opening became a move to the Permissions tab (the caller closes what it had open). */
export function AccessDrawer({ c, isOpen, onClose, onLanded }: { c: Computer; isOpen: boolean; onClose: () => void; onLanded?: () => void }) {
  const t = useStrings(strings);
  const go = useGo();
  const q = useComputers();
  // The page's own row of this computer (its name there is the one the page's address resolves). A list that could
  // not be read shows no computer on the page: the drawer it is.
  const row = q.isError || q.fetchStatus === 'paused' ? null : q.data ? (q.data.find((x) => x.id === c.id) ?? null) : undefined;
  // Decided once per opening: a drawer already open stays one when the list later gains the computer.
  const [as, setAs] = useState<{ id: string; drawer: boolean } | null>(null);
  const decided = as && as.id === c.id ? as : null;
  const [guard, setGuard] = useState({ busy: false, dirty: false });
  useEffect(() => {
    if (!isOpen) { setAs(null); return; }
    if (decided || row === undefined) return;
    if (row === null) { setAs({ id: c.id, drawer: true }); return; }
    onClose();
    onLanded?.();
    go(links.permissions(handleOf(row)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [isOpen, row === undefined ? 0 : row === null ? 1 : 2, c.id, decided]);
  // Until the list is read there is no telling which it is: nothing shows.
  if (!isOpen || !decided?.drawer) return null;
  return (
    <Drawer overlayId="computers-access" resizeKey="computers-access" isOpen onOpenChange={(o) => !o && onClose()} title={t('acc.title', { name: c.name })} size="sm" busy={guard.busy} dirty={guard.dirty}>
      <AccessPanel key={c.id} c={c} onGuard={setGuard} />
    </Drawer>
  );
}
