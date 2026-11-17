// Network > Firewall: the computer's own firewall, the rules for traffic into and out of the whole
// computer, read from the Hoody API (GET /computers/:id/firewall/rules). A program's sandbox (Programs) limits one
// program; this covers all of them.
// Each rule reads as one sentence ("Block TCP port 25 to anywhere"). Blocks are listed before allows because that is
// how the host applies them: a block always wins over an allow, and anything no rule blocks is allowed (the API's
// own rule, said under the lists, and the empty state says so too).
//
// Changes: add, edit, turn off/on, delete, presets and reset. Each change is sent once (C9): a lost answer is
// held by core (lock computer.firewall, firewall.data.ts) and shown as "may have gone through" with Check again
// (reads only) and a warned Dismiss of that one hold, never as failed. While any firewall change of this computer is
// held, or one is on its way, every other firewall change of it waits: rules have no id, so one change at a time
// keeps "the rule shown" and "the rule changed" the same rule.
// There is no edit route: an edit adds the new rule, re-reads the list, and only once the new rule shows removes the
// old one. If that second step cannot go (refused, unknown, the new rule not shown yet, or the old rule cannot be
// named alone) both rules stay and the page says "The old rule is still there" with Remove it and Check again.
// A delete or switch names the rule by every field it has, and the host acts on the FIRST rule that matches (an
// unsent field matches anything): the page counts the matches first and says so, and refuses when another rule
// would be hit first.
// A block that touches SSH (22) or a Hoody kit port needs the computer's name typed: that traffic arrives from the
// host, so blocking it can cut the computer off from the Hub.
import { firewallSource, FW_LOCK, useAddRule, useFirewall, useRemoveRule, useResetFirewall, useToggleRule, type RuleVars, type ToggleVars } from '../firewall.data';
import { heldChanges, sendingChanges, useChangesVersion, useRealms, type HeldChange } from '@core';
import { readProblem, refusalOf, unreadableIn, namedBlocked, toggleBlocked, accessPill } from './Firewall.pure';
import type { T, Outcome } from './Firewall.pure';
export { readProblem, shownOrder, refusalOf, namedBlocked, toggleBlocked, accessPill } from './Firewall.pure';
export type { ReadProblem } from './Firewall.pure';
import { AnatomySection, AskAgentDrawer, Band, Button, createColumnHelper, DataTable, ConfirmDialog, DangerConfirm, Drawer, EmptyState, FormFooter, FormSection, IpAllowlistField, readIpFrom, resetAskAgentForTests, SegmentedControl, Select, Stack, StatusPill, Switch, Tag, TextField, ReasonButton, useAskAgent, Verdict, useStrings, withAskAgent, type IpDetails, type OutcomeLike, type RowActionEntry, type SectionActions, type SectionState } from '@kit';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMyIp } from '../data';
import type { Computer } from '../types';
import {
  addProved,
  agentStartOf,
  blocksSsh,
  blankForm,
  cutsOff,
  editPlan,
  exactKey,
  formOf,
  formProblems,
  formReady,
  matchesOf,
  PRESETS,
  presetRules,
  ruleOfForm,
  ruleParts,
  ruleSentence,
  summaryOf,
  type Action,
  type Direction,
  type FwForm,
  type FwList,
  type FwRule,
  type PresetId,
  type Protocol,
} from './Firewall.logic';
import { inPlace, isNoInternetRule, NO_INTERNET_RULES, nextStep, noInternetState, type NoInternetHandle } from './NoInternet.logic';
import { ExitIp } from './ExitIp';
import strings from './Firewall.strings.en.json';
import f from './Firewall.module.css';
import s from './parts.module.css';
const shownWithIndex = (rs: readonly FwRule[]) => {
  const xs = rs.map((r, i) => ({ r, i }));
  return [...xs.filter((x) => x.r.action !== 'allow'), ...xs.filter((x) => x.r.action === 'allow')];
};
/** Only an answer that may have applied is pending; core's not_sent (held back behind another change) is a refusal. */
const isPending = (r: Outcome) => r.outcome === 'pending';

/** The form's outcome, with core's result behind a refusal (the kit's Details). */
type FormOutcome = OutcomeLike & { error?: Outcome };

type DirMut = { add: ReturnType<typeof useAddRule>; remove: ReturnType<typeof useRemoveRule>; toggle: ReturnType<typeof useToggleRule> };

const holdsOf = (realm: string | null | undefined, computer: string): HeldChange[] =>
  heldChanges(FW_LOCK, { realm }).filter((h) => (h.identity as { computer?: string } | undefined)?.computer === computer);
/** Firewall changes of this computer still on their way (any sender: this page, another part, another tab). A send
 *  core cannot attribute counts too: it may be for this computer. */
const sendingOf = (realm: string | null | undefined, computer: string): number =>
  sendingChanges(FW_LOCK, { realm }).filter((x) => !x.attributed || (x.identity as { computer?: string } | null)?.computer === computer).length;
/** This computer's held firewall changes, in the realm shown. */
function useHolds(computer: string, realm: string | null | undefined): HeldChange[] {
  const version = useChangesVersion();
  // `version` re-reads core's holds when they move (useChangesVersion), as runner.ts does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => holdsOf(realm, computer), [version, realm, computer]);
}
function useSending(computer: string, realm: string | null | undefined): number {
  const version = useChangesVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sendingOf(realm, computer), [version, realm, computer]);
}

/** `start`: the form as the drawer opened it. Only a form that differs from it is unsaved input (the leave ask). */
type Editing = { mode: 'add'; form: FwForm; start: FwForm } | { mode: 'edit'; form: FwForm; start: FwForm; old: FwRule };
const sameForm = (a: FwForm, b: FwForm) => (Object.keys(a) as Array<keyof FwForm>).every((k) => a[k] === b[k]);
const openForm = (form: FwForm) => ({ form, start: form });
/** How long, and how often, the list re-reads after a start reached the Agent (4 reads a minute; the API allows 60). */
const AGENT_POLL_MS = 10 * 60_000;
const AGENT_POLL_EVERY = 15_000;
type Ask =
  | { kind: 'delete'; rule: FwRule }
  | { kind: 'toggle'; rule: FwRule }
  | { kind: 'cut'; ports: number[]; intent: Intent }
  | { kind: 'preset'; id: PresetId; addresses: string }
  | { kind: 'reset' };
interface Left { old: FwRule; added: FwRule }
/** What a typed lock-out confirmation goes on to do, kept as data: it runs through the handlers of the render the
 *  press happens in, so it is judged against the list as read then (a saved callback would judge an older list). */
type Intent = { kind: 'submit'; editing: Editing } | { kind: 'toggle'; rule: FwRule } | { kind: 'preset'; rules: FwRule[] };

/** `withExit`: the exit section (ExitIp) renders after the Internet access section and before the Firewall rules section
 *  (the Network tab's order: access, where traffic leaves from, rules), handed Internet access so its "Disable
 *  internet" choice asks this section's own Block. Both firewall sections share this component's sends and
 *  holds. */
export function Firewall({ c, canWrite, withExit = false }: { c: Computer; canWrite: boolean; withExit?: boolean }) {
  const t = useStrings(strings);
  const q = useFirewall(c.id, !!c.id);
  const l = q.data;
  const muts: Record<Direction, DirMut> = {
    ingress: { add: useAddRule('ingress'), remove: useRemoveRule('ingress'), toggle: useToggleRule('ingress') },
    egress: { add: useAddRule('egress'), remove: useRemoveRule('egress'), toggle: useToggleRule('egress') },
  };
  const reset = useResetFirewall();
  const realm = useRealms().selected;
  const holds = useHolds(c.id, realm);
  const sending = useSending(c.id, realm);
  const [busy, setBusy] = useState(false);
  // This page's own Block / Allow run (several changes, a read between each): while it runs the section says so, and
  // the rules read mid-run are not shown as a group someone left half done.
  const [groupRun, setGroupRun] = useState<'on' | 'off' | null>(null);
  // Read at the moment of sending, not from the last render: a dialog opened earlier, or an edit's second step after
  // an await, must not send while another change of this computer is on its way or held (rules have no id).
  const busyRef = useRef(false);
  // Write access as rendered now, read between the steps of a change already started (an edit's remove, a preset's next
  // rule, the Internet access group): losing it stops the rest, as another change starting does.
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;
  const waitNow = () => !canWriteRef.current || busyRef.current || holdsOf(realm, c.id).length > 0 || sendingOf(realm, c.id) > 0;
  const waitText = () => (canWriteRef.current ? t('fw.wait', { name: c.name }) : t('ni.reason.noWrite', { name: c.name }));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formOutcome, setFormOutcome] = useState<FormOutcome | undefined>(undefined);
  const [ask, setAsk] = useState<Ask | null>(null);
  // A refusal keeps core's result (code, status, trace id) for the kit's Details; the page's own sentence stays.
  const [notice, setNotice] = useState<{ tone: 'neutral' | 'warn' | 'danger'; text: string; error?: Outcome } | null>(null);
  const [left, setLeft] = useState<Left | null>(null);
  // The open confirm names the computer it was opened for; it shows (and sends) only while that computer is still the one
  // shown and this sign-in can still write (a boolean followed the page to another computer).
  const [niAsk, setNiAsk] = useState<string | null>(null);
  // Losing write access cancels an open confirm: it never comes back on its own when access returns.
  useEffect(() => {
    if (!canWrite) {
      setNiAsk(null);
      // An open firewall confirmation (reset, preset, delete, switch, the lock-out one) goes too, so none can
      // send after the session lost write access; the rule drawer stays (a draft) with Add / Save off and its reason.
      setAsk(null);
    }
  }, [canWrite]);
  // After a start reached the Agent, its tools may change these rules (each change approved by the person): the list
  // re-reads every AGENT_POLL_EVERY for AGENT_POLL_MS so the rules, the summary and the next snapshot follow.
  // The timer depends on the stable refetch only, so other renders (typing in a form) never restart its countdown.
  // Its deadline lives per realm and computer (agentPolls), so a late 'sent' reaches whichever Firewall shows the
  // computer then, and another computer never polls for it.
  const pollUntil = useAgentPoll(agentKey(realm, c.id));
  const agentAsk = useFirewallAsk(c, realm, l, q.isError, { run: () => void q.refetch(), busy: q.isFetching });
  const withAskIfRead = (a: SectionActions) => (l && !q.isPending ? withAskAgent(a, agentAsk.action) : a);
  const refetch = q.refetch;
  useEffect(() => {
    if (pollUntil <= Date.now()) return;
    const timer = setInterval(() => {
      if (Date.now() > pollUntil) clearInterval(timer);
      else void refetch();
    }, AGENT_POLL_EVERY);
    return () => clearInterval(timer);
  }, [pollUntil, refetch]);
  // Another computer: nothing typed or asked survives (holds stay with core).
  useEffect(() => {
    setEditing(null);
    setAsk(null);
    setNiAsk(null);
    setNotice(null);
    setLeft(null);
    setFormOutcome(undefined);
  }, [c.id]);

  // A typed confirmation sends the drawer's form as it was when Add rule was pressed. When the form shown has changed
  // since (an Add my IP read whose update was queued before the press and rendered after it), the confirmation is
  // withdrawn and nothing is sent: the person presses Add rule again on the form they now see.
  const staleAsk = ask?.kind === 'cut' && ask.intent.kind === 'submit' && editing?.form !== ask.intent.editing.form;
  useEffect(() => {
    if (staleAsk) setAsk(null);
  }, [staleAsk]);

  const waiting = busy || holds.length > 0 || sending > 0;
  // A failed re-read keeps the last list on screen for drafts and open dialogs, but nothing is sent against it:
  // every write waits for a successful read, and says so.
  const stale = q.isError;
  const locked = !canWrite || waiting || !l || stale;
  // A standing reason on a control that is off: it claims nothing about what was sent (this page's own change may be
  // the one on its way). 'fw.wait' ("nothing was sent") is only for a press that was refused (sayWait, the form).
  // This page's own send (or its Block / Allow run) is not "another" change: it is named as the person's own.
  const own = busy || groupRun !== null;
  const waitWhyOwn = own ? t('fw.reason.own', { name: c.name }) : t('ni.reason.wait', { name: c.name });
  const lockedWhy = stale ? t('fw.reason.stale', { name: c.name }) : waitWhyOwn;
  const waitWhyText = !canWrite ? t('ni.reason.noWrite', { name: c.name }) : waitWhyOwn;
  const sayWait = () => setNotice({ tone: 'warn', text: waitText() });

  // An edit whose old rule is left: once a successful read shows the new rule and not the old one (the remove went
  // through though its answer was lost, or someone else removed it), the edit is done; nothing is sent.
  useEffect(() => {
    if (!left || !l || !q.isSuccess || holds.length > 0 || unreadableIn(l, left.old.direction) > 0) return;
    const has = (r: FwRule) => l[r.direction].some((x) => exactKey(x) === exactKey(r));
    if (has(left.added) && !has(left.old)) {
      setLeft(null);
      setNotice({ tone: 'neutral', text: t('fw.edit.done') });
    }
  }, [left, l, q.isSuccess, holds.length, t]);

  const send = async (run: () => Promise<Outcome>): Promise<Outcome> => {
    busyRef.current = true;
    setBusy(true);
    // A new send replaces the last action's line: an old "nothing was changed" must not sit beside a hold (C9).
    setNotice(null);
    const r = await run().catch((): Outcome => ({ outcome: 'pending' }));
    busyRef.current = false;
    setBusy(false);
    void q.refetch();
    return r;
  };
  const refusalText = (r: Outcome) => t(`fw.refused.${refusalOf(r)}`, { name: c.name });
  const addVars = (rule: FwRule): RuleVars => ({ computer: c.id, rule });
  const warnOf = (r: Outcome): number[] => {
    const w = (r.data as { warnings?: Array<{ code?: string; ports?: unknown }> } | undefined)?.warnings ?? [];
    return w.flatMap((x) => (x.code === 'FIREWALL_RULE_COVERS_KIT_PORTS' && Array.isArray(x.ports) ? x.ports.filter((p): p is number => typeof p === 'number') : []));
  };

  /** The second step of an edit: remove the old rule once a fresh read shows the new one and names the old alone.
   *  While it reads and removes, the page says it is working; "the old rule is still there" (`left`, with Remove it)
   *  is set only once the old rule is known to stay or the remove's outcome is unknown or refused. */
  const removeOld = async (lf: Left) => {
    if (waitNow()) {
      setLeft(lf);
      return sayWait();
    }
    setNotice({ tone: 'neutral', text: t('fw.edit.working') });
    const res = await q.refetch();
    // Only a successful fresh read counts: a failed refetch still carries the cached list.
    const fresh = res.isSuccess ? res.data : undefined;
    if (!fresh) {
      setLeft(lf);
      setNotice({ tone: 'warn', text: t('fw.left.readFailed') });
      return;
    }
    if (!addProved({ computer: c.id, key: exactKey(lf.added) }, [[fresh]])) {
      setLeft(lf);
      setNotice({ tone: 'warn', text: t('fw.left.notShown') });
      return;
    }
    const list = fresh[lf.old.direction];
    if (unreadableIn(fresh, lf.old.direction) > 0) {
      setLeft(lf);
      setNotice({ tone: 'warn', text: t('fw.match.unreadable') });
      return;
    }
    const index = list.findIndex((r) => exactKey(r) === exactKey(lf.old));
    if (index < 0) {
      setLeft(null);
      setNotice({ tone: 'neutral', text: t('fw.edit.done') });
      return;
    }
    const m = matchesOf(list, index, 'remove');
    if (!m.first || m.others > 0) {
      setLeft(lf);
      setNotice({ tone: 'warn', text: m.first ? t('fw.left.notAlone', { count: m.others }) : t('fw.left.notFirst') });
      return;
    }
    if (waitNow()) {
      setLeft(lf);
      return sayWait();
    }
    const sent = send(() => muts[lf.old.direction].remove.mutateAsync({ computer: c.id, rule: list[index] as FwRule }));
    // send() clears the last line as it starts: the edit's own remove says it is working until its answer is in.
    setNotice({ tone: 'neutral', text: t('fw.edit.working') });
    const r = await sent;
    if (r.outcome === 'done') {
      setLeft(null);
      setNotice({ tone: 'neutral', text: t('fw.edit.done') });
      return;
    }
    // Unknown (C9: held, never resent; a read settles it) or refused: the old rule may still be there.
    setLeft(lf);
    if (isPending(r)) setNotice(null);
    else setNotice({ tone: 'danger', text: refusalText(r), error: r });
  };

  const submit = async (e: Editing) => {
    const rule = ruleOfForm(e.form);
    setFormOutcome(undefined);
    if (waitNow()) {
      setFormOutcome({ kind: 'failed', message: t('fw.wait', { name: c.name }) });
      return;
    }
    if (e.mode === 'add') {
      const r = await send(() => muts[rule.direction].add.mutateAsync(addVars(rule)));
      if (r.outcome === 'done') {
        setEditing(null);
        const ports = warnOf(r);
        setNotice(ports.length ? { tone: 'warn', text: t('fw.added.kitWarn', { ports: ports.join(', '), name: c.name }) } : { tone: 'neutral', text: t('fw.added', { rule: ruleSentence(rule, t) }) });
      } else if (isPending(r)) setEditing(null);
      else setFormOutcome({ kind: 'failed', message: refusalText(r), error: r });
      return;
    }
    const plan = editPlan(e.old, e.form);
    if (plan.kind === 'none') {
      setEditing(null);
      return;
    }
    if (plan.kind === 'toggle') {
      const why = l ? toggleBlocked(l, e.old) : null;
      if (why) {
        setFormOutcome({ kind: 'failed', message: why === 'unreadable' ? t('fw.match.unreadable') : t('fw.match.toggleShared') });
        return;
      }
      const r = await send(() => muts[e.old.direction].toggle.mutateAsync({ computer: c.id, rule: e.old, state: plan.state }));
      if (r.outcome === 'done' || isPending(r)) setEditing(null);
      else setFormOutcome({ kind: 'failed', message: refusalText(r), error: r });
      return;
    }
    const lf: Left = { old: e.old, added: plan.add };
    const r = await send(() => muts[plan.add.direction].add.mutateAsync({ ...addVars(plan.add) }));
    if (r.outcome === 'done') {
      setEditing(null);
      await removeOld(lf);
    } else if (isPending(r)) {
      // The add may have gone through: its hold says so; the old rule stays until it is checked.
      setEditing(null);
      setLeft(lf);
    } else setFormOutcome({ kind: 'failed', message: refusalText(r), error: r });
  };
  /** Every way a rule can be switched on or added passes here: a block on SSH or a kit port asks for the name. */
  const runIntent = (i: Intent) => {
    if (i.kind === 'submit' && editing?.form !== i.editing.form) return;
    if (i.kind === 'submit') void submit(i.editing);
    else if (i.kind === 'toggle') void runToggle(i.rule);
    else void runPreset(i.rules);
  };
  const guarded = (form: FwForm, intent: Intent) => {
    const ports = cutsOff(form);
    if (ports.length) setAsk({ kind: 'cut', ports, intent });
    else runIntent(intent);
  };

  const runDelete = async (rule: FwRule) => {
    setAsk(null);
    if (waitNow()) return sayWait();
    if (!l || namedBlocked(l, rule, 'remove').why) return setNotice({ tone: 'warn', text: t('fw.match.changed') });
    const r = await send(() => muts[rule.direction].remove.mutateAsync({ computer: c.id, rule }));
    if (r.outcome === 'done') {
      setNotice({ tone: 'neutral', text: t('fw.deleted', { rule: ruleSentence(rule, t) }) });
      if (left && exactKey(left.old) === exactKey(rule)) setLeft(null);
    } else if (!isPending(r)) setNotice({ tone: 'danger', text: refusalText(r), error: r });
  };
  const runToggle = async (rule: FwRule) => {
    setAsk(null);
    if (waitNow()) return sayWait();
    if (!l || toggleBlocked(l, rule)) return setNotice({ tone: 'warn', text: t('fw.match.changed') });
    const v: ToggleVars = { computer: c.id, rule, state: rule.state === 'enabled' ? 'disabled' : 'enabled' };
    const r = await send(() => muts[rule.direction].toggle.mutateAsync(v));
    if (r.outcome !== 'done' && !isPending(r)) setNotice({ tone: 'danger', text: refusalText(r), error: r });
  };
  const runPreset = async (rules: FwRule[]) => {
    setAsk(null);
    if (waitNow()) return sayWait();
    const have = new Set(l ? [...l.ingress, ...l.egress].map(exactKey) : []);
    let added = 0;
    for (const [i, rule] of rules.entries()) {
      if (have.has(exactKey(rule))) {
        added++;
        continue;
      }
      // Each send is judged at its own moment: a change of this computer that started meanwhile stops the rest.
      if (i > 0 && waitNow()) {
        setNotice({ tone: 'warn', text: `${t('fw.preset.partial', { done: added, total: rules.length, count: rules.length })} ${canWriteRef.current ? t('fw.preset.stoppedWait', { name: c.name }) : t('ni.reason.noWrite', { name: c.name })}` });
        return;
      }
      const r = await send(() => muts[rule.direction].add.mutateAsync(addVars(rule)));
      if (r.outcome === 'done') added++;
      else {
        // Stop at the first that did not go: an unknown one is held (shown below), the rest were not sent.
        setNotice({ tone: isPending(r) ? 'warn' : 'danger', text: `${t('fw.preset.partial', { done: added, total: rules.length, count: rules.length })} ${isPending(r) ? t('fw.preset.stoppedUnknown') : refusalText(r)}`, ...(isPending(r) ? {} : { error: r }) });
        return;
      }
    }
    setNotice({ tone: 'neutral', text: t('fw.preset.done', { total: rules.length, count: rules.length }) });
  };
  const runReset = async () => {
    setAsk(null);
    if (waitNow()) return sayWait();
    const r = await send(() => reset.mutateAsync({ computer: c.id }));
    if (r.outcome === 'done') {
      setLeft(null);
      setNotice({ tone: 'neutral', text: t('fw.reset.done', { name: c.name }) });
    } else if (!isPending(r)) setNotice({ tone: 'danger', text: refusalText(r), error: r });
  };

  // No internet: one rule change at a time, each sent once (C9). Before EVERY change the page reads the rules
  // again (awaited), checks that no other firewall change of this computer started meanwhile (core's lock is per rule,
  // so it does not keep a Reset or another rule's change apart), and decides the next change from that read alone
  // (nextStep). The first change that does not go stops the run; a lost answer is held by core, never resent.
  // One press sends at most NI_MAX_STEPS changes; the read after the last one still decides done or not.
  const NI_MAX_STEPS = 12;
  const runGroup = async (mode: 'on' | 'off') => {
    setNiAsk(null);
    if (!canWrite) return;
    setGroupRun(mode);
    try {
      await runGroupSteps(mode);
    } finally {
      setGroupRun(null);
    }
  };
  const runGroupSteps = async (mode: 'on' | 'off') => {
    const stoppedAt = (n: number) => (n > 0 ? `${t('ni.stopped', { count: n })} ` : '');
    let done = 0;
    for (;;) {
      if (waitNow()) return done ? setNotice({ tone: 'warn', text: `${stoppedAt(done)}${waitText()}` }) : sayWait();
      const res = await q.refetch();
      const fresh = res.isSuccess ? res.data : undefined;
      if (waitNow()) return done ? setNotice({ tone: 'warn', text: `${stoppedAt(done)}${waitText()}` }) : sayWait();
      const next = fresh ? nextStep(fresh, mode) : ({ kind: 'unknown' } as const);
      if (next.kind === 'unknown') return setNotice({ tone: 'warn', text: `${stoppedAt(done)}${t('ni.readFailed')}` });
      if (next.kind === 'blocked') return setNotice({ tone: 'warn', text: `${stoppedAt(done)}${t(next.why === 'twins' ? 'ni.blockedErr' : 'ni.blockedOther')}` });
      if (next.kind === 'done') return setNotice({ tone: 'neutral', text: t(mode === 'on' ? 'ni.done.on' : 'ni.done.off', { name: c.name }) });
      // The way on names what the page shows after this read: the Blocked choice when off, Finish / Remove when partly set.
      if (done >= NI_MAX_STEPS) return setNotice({ tone: 'warn', text: t(noInternetState(fresh) === 'off' ? 'ni.limitOff' : 'ni.limit', { count: done }) });
      const m = muts[next.rule.direction];
      const rule = next.rule;
      const r = await send(() => (next.kind === 'add' ? m.add.mutateAsync(addVars(rule)) : m.remove.mutateAsync({ computer: c.id, rule })));
      if (r.outcome !== 'done') {
        const text = `${stoppedAt(done)}${isPending(r) ? t('ni.stoppedUnknown') : refusalText(r)}`;
        return setNotice({ tone: isPending(r) ? 'warn' : 'danger', text, ...(isPending(r) ? {} : { error: r }) });
      }
      done++;
    }
  };
  const ni = q.isError ? 'unknown' : noInternetState(l);
  // Why Block / Allow can't be used now: the head action's reason (shown on focus, hover and tap).
  const accessReason = q.isPending ? t('ni.reason.reading')
    : !canWrite ? t('ni.reason.noWrite', { name: c.name })
    : groupRun ? t(groupRun === 'on' ? 'ni.working.on' : 'ni.working.off', { name: c.name })
    : ni === 'partial' ? t('ni.reason.partial')
    : ni === 'unknown' ? t('ni.reason.unknown')
    : waiting ? waitWhyOwn
    : null;
  // Mid-run the rules read are a step of this page's own change: no "Partly blocked" verdict until it ends.
  const pill = q.isPending || (groupRun && ni === 'partial') ? null : accessPill(ni);
  const niHandle = useMemo<NoInternetHandle>(() => ({ state: q.isPending ? 'reading' : ni, canChange: accessReason === null, block: () => setNiAsk(c.id) }), [q.isPending, ni, accessReason, c.id]);

  const openPreset = (id: PresetId | 'port') => {
    setNotice(null);
    if (id === 'port') setEditing({ mode: 'add', ...openForm({ ...blankForm('ingress'), description: t('fw.preset.port.desc') }) });
    else setAsk({ kind: 'preset', id, addresses: '' });
  };

  // Edit is the row's inline action; Turn off / on and Delete in its menu (Delete in the danger area). While another change
  // of this computer is on its way or held, each says why it waits.
  const waitWhy = locked ? { isDisabled: true, disabledReason: lockedWhy } : {};
  const rowActions = (rule: FwRule): RowActionEntry[] => [
    { id: 'edit', label: t('fw.row.edit'), inline: true, opens: true, ...waitWhy, onAction: () => { setFormOutcome(undefined); setEditing({ mode: 'edit', ...openForm(formOf(rule)), old: rule }); } },
    { id: 'toggle', label: rule.state === 'enabled' ? t('fw.row.off') : t('fw.row.on'), opens: true, ...waitWhy, onAction: () => setAsk({ kind: 'toggle', rule }) },
    '-',
    { id: 'delete', label: t('fw.row.delete'), tone: 'danger' as const, opens: true, ...waitWhy, onAction: () => setAsk({ kind: 'delete', rule }) },
  ];

  const presetItems = [...PRESETS.map((id) => ({ id, label: t(`fw.preset.${id}`), opens: true, isDisabled: locked, ...(locked ? { disabledReason: lockedWhy } : {}), onAction: () => openPreset(id) })), { id: 'port', label: t('fw.preset.port'), opens: true, isDisabled: locked, ...(locked ? { disabledReason: lockedWhy } : {}), onAction: () => openPreset('port') }];
  const fwState: SectionState = q.isPending
    ? { kind: 'loading', rows: 3, variant: 'table' }
    : q.isError || !l
      ? readProblem(q.error) === 'denied'
        ? { kind: 'notHere', title: t('fw.read.deniedTitle'), body: t('fw.read.denied', { name: c.name }), icon: 'lock' }
        : { kind: 'failed', error: q.error, onRetry: () => void q.refetch(), busy: q.isFetching }
      : { kind: 'ready' };

  return (
    <>
    <AnatomySection
      id="net-access"
      title={t('ni.title')}
      description={t('ni.desc', { name: c.name })}
      info={t('ni.what')}
      // A read-only session gets no write action: the state and its line stay.
      actions={canWrite ? {
        primary: ni === 'on'
          ? { id: 'ni-allow', label: t('ni.allowGo'), onPress: () => void runGroup('off'), ...(accessReason ? { disabledReason: accessReason } : {}) }
          : { id: 'ni-block', label: t('ni.blockGo'), opens: 'dialog', onPress: () => setNiAsk(c.id), ...(accessReason ? { disabledReason: accessReason } : {}) },
      } : undefined}
      notices={
        groupRun ? (
          <Band /* noDetails: nothing was refused; this page's own Block / Allow run is on its way */ tone="neutral" size="table">
            {t(groupRun === 'on' ? 'ni.working.on' : 'ni.working.off', { name: c.name })}
          </Band>
        ) : ni === 'partial' && l ? (
          <Band
            /* noDetails: no rejection; the rules read show the group only partly in place */
            tone="warn"
            size="table"
            actions={canWrite ? (
              <>
                {waiting ? <ReasonButton size="sm" reason={waitWhyText}>{t('ni.finish')}</ReasonButton> : <Button size="sm" onPress={() => setNiAsk(c.id)}>{t('ni.finish')}</Button>}
                {waiting ? <ReasonButton size="sm" reason={waitWhyText}>{t('ni.remove')}</ReasonButton> : <Button size="sm" variant="ghost" onPress={() => void runGroup('off')}>{t('ni.remove')}</Button>}
              </>
            ) : undefined}
          >
            {t('ni.partial', { name: c.name, have: inPlace(l), total: NO_INTERNET_RULES.length })}
          </Band>
        ) : ni === 'unknown' && !q.isPending ? (
          <Band
            /* noDetails: the Firewall section below shows the failed read with its Details */
            tone="warn"
            size="table"
            actions={<Button size="sm" variant="ghost" busy={q.isFetching} onPress={() => void q.refetch()}>{t('ni.check')}</Button>}
          >
            {t('ni.unknown', { name: c.name })}
          </Band>
        ) : null
      }
      state={{ kind: 'ready' }}
    >
      {pill && (ni === 'on' || ni === 'off') ? (
        <p className={s.row}>
          <StatusPill tone={pill.tone}>{t(pill.key)}</StatusPill>
          <span className={s.help}>{t(ni === 'on' ? 'ni.now.on' : 'ni.now.off', { name: c.name })}</span>
        </p>
      ) : pill ? (
        <p className={s.row}>
          <StatusPill tone={pill.tone}>{t(pill.key)}</StatusPill>
        </p>
      ) : null}
      <ConfirmDialog overlayId="computers-firewall-ni-ask"
        isOpen={niAsk === c.id && canWrite}
        onOpenChange={(o) => !o && setNiAsk(null)}
        title={t('ni.ask.title', { name: c.name })}
        body={t('ni.ask.body', { name: c.name })}
        confirmLabel={t('ni.ask.go')}
        onConfirm={() => { if (niAsk === c.id && canWrite) void runGroup('on'); }}
      />
    </AnatomySection>
    {withExit ? <ExitIp c={c} canWrite={canWrite} noInternet={niHandle} /> : null}
    <AnatomySection
      id="net-firewall"
      title={t('fw.title')}
      description={t('fw.howApplied')}
      info={t('fw.outside.tip')}
      // Ask the Agent (kit): placed by the kit, a free secondary slot of the head, else the top of the ⋯ menu;
      // shown once the rules were read (the question is about them).
      actions={withAskIfRead({
        ...(canWrite && l ? { primary: { id: 'fw-add', label: t('fw.add'), opens: 'dialog' as const, onPress: () => { setNotice(null); setFormOutcome(undefined); setEditing({ mode: 'add', ...openForm(blankForm('ingress')) }); }, ...(locked ? { disabledReason: lockedWhy } : {}) } } : {}),
        menu: [
          ...(canWrite && l ? [{ id: 'presets', label: t('fw.presets'), items: presetItems }] : []),
          ...(canWrite && l ? ['-' as const, { id: 'reset', label: t('fw.reset'), tone: 'danger' as const, opens: true, isDisabled: locked, ...(locked ? { disabledReason: lockedWhy } : {}), onAction: () => setAsk({ kind: 'reset' }) }] : []),
        ],
      })}
      notices={
        <>
          {holds.map((h) => (
            <HeldBand key={h.hold ?? JSON.stringify(h.identity)} h={h} name={c.name} muts={muts} reset={reset} />
          ))}
          {left && !holds.length ? (
            <Band
              /* noDetails: no rejection here; the old rule's fate waits on a fresh read of the list */
              tone="warn"
              size="table"
              actions={
                <>
                  {/* A read-only session gets no write action: the notice and Check again stay. */}
                  {!canWrite ? null : busy ? <ReasonButton size="sm" reason={waitWhyText}>{t('fw.left.remove')}</ReasonButton> : <Button size="sm" onPress={() => void removeOld(left)}>{t('fw.left.remove')}</Button>}
                  {busy ? <ReasonButton size="sm" reason={waitWhyText}>{t('fw.held.check')}</ReasonButton> : <Button size="sm" variant="ghost" onPress={() => void q.refetch()}>{t('fw.held.check')}</Button>}
                </>
              }
            >
              {t('fw.left.text', { old: ruleSentence(left.old, t), added: ruleSentence(left.added, t) })}
            </Band>
          ) : null}
          {notice ? (
            <Band tone={notice.tone} size="table" error={notice.error}>
              {notice.text}
            </Band>
          ) : null}
          {l && !stale && l.unreadable > 0 ? (
            <Band /* noDetails: rules the page cannot read, nothing was refused */ tone="warn" size="table">
              {t('fw.unreadable', { count: l.unreadable })}
            </Band>
          ) : null}
          {!canWrite && l ? (
            <Band size="table">
              {t('fw.noWrite', { name: c.name })}
            </Band>
          ) : null}
        </>
      }
      state={fwState}
      flush
    >
      {fwState.kind === 'ready' && l ? <RulesTable name={c.name} l={l} actions={canWrite ? rowActions : undefined} /> : null}
    </AnatomySection>
      {/* The overlays sit outside the section: its failed state (a failed re-read) does not unmount them, so a draft, an
          outcome or an open dialog survives it. The Agent drawer is the kit's: its words and its answer stay with the
          computer they were asked on (askKey). */}
      <AskAgentDrawer ask={agentAsk} />
      <RuleDrawer
        editing={editing}
        busy={busy}
        locked={locked && !busy}
        lockedWhy={!canWrite ? t('ni.reason.noWrite', { name: c.name }) : lockedWhy}
        outcome={formOutcome}
        onChange={(form) => setEditing((e) => (e ? { ...e, form } : e))}
        onUpdate={(up) => setEditing((e) => (e ? { ...e, form: up(e.form) } : e))}
        captured={ask?.kind === 'cut' && ask.intent.kind === 'submit'}
        onClose={() => { setEditing(null); setFormOutcome(undefined); }}
        onSubmit={() => {
          if (!editing || !formReady(editing.form)) return;
          const e = editing;
          guarded(e.form, { kind: 'submit', editing: e });
        }}
      />
      <AskDialogs ask={staleAsk ? null : ask} name={c.name} l={l} t={t} waiting={waiting} stale={stale} onClose={() => setAsk(null)} onChange={setAsk} guarded={guarded} runIntent={runIntent} runDelete={runDelete} runToggle={runToggle} runReset={runReset} />
    </>
  );
}

function AskDialogs({ ask, name, l, t, waiting, stale, onClose, onChange, guarded, runIntent, runDelete, runToggle, runReset }: {
  ask: Ask | null; name: string; l: FwList | undefined; t: T; waiting: boolean; stale: boolean; onClose: () => void; onChange: (next: Ask | ((cur: Ask | null) => Ask | null)) => void;
  guarded: (form: FwForm, intent: Intent) => void; runIntent: (i: Intent) => void;
  runDelete: (r: FwRule) => Promise<void>; runToggle: (r: FwRule) => Promise<void>; runReset: () => Promise<void>;
}) {
  const open = (o: boolean) => !o && onClose();
  const target = ask && (ask.kind === 'delete' || ask.kind === 'toggle') && l ? ask : null;
  // Judged on the list as read now (a re-read while the dialog is open re-judges it), for the rule whose fields are
  // sent. With an unreadable rule in that direction neither can be judged.
  const named = target && l ? namedBlocked(l, target.rule, target.kind === 'delete' ? 'remove' : 'toggle') : null;
  const blocked = !!named?.why;
  const matchText = !named ? '' : named.why === 'unreadable' ? t('fw.match.unreadable') : named.why === 'gone' ? t('fw.match.gone') : named.why === 'notFirst' ? t('fw.match.notFirst', { count: named.others }) : named.why === 'shared' ? t('fw.match.toggleShared') : named.others > 0 ? t('fw.match.others', { count: named.others }) : '';
  // Another change of this computer on its way or held: every open dialog waits (its send rechecks too).
  // A failed re-read leaves an open dialog open (its typing kept) but sends nothing until a read succeeds: Confirm is off
  // where the dialog allows it, and the typed-name dialogs (whose Confirm follows the name) refuse at the press. Each
  // says why. Busy stays for a change on its way, so Cancel still closes a dialog held only by the failed read.
  const held = waiting || stale;
  const heldWhy = stale ? t('fw.reason.stale', { name }) : t('ni.reason.wait', { name });
  const naming = [matchText, held ? heldWhy : ''].filter(Boolean).join(' ');
  const presetRs = ask?.kind === 'preset' ? presetRules(ask.id, { addresses: ask.addresses }) : [];
  const readIp = useReadIp();
  return (
    <>
      <ConfirmDialog overlayId="computers-firewall-delete"
        isOpen={ask?.kind === 'delete'}
        onOpenChange={open}
        tone="danger"
        title={t('fw.delete.title')}
        body={ask?.kind === 'delete' ? `${t('fw.delete.body', { rule: ruleSentence(ask.rule, t), name })}${naming ? ` ${naming}` : ''}` : ''}
        confirmLabel={t('fw.delete.go')}
        confirmDisabled={blocked || held}
        onConfirm={() => ask?.kind === 'delete' && void runDelete(ask.rule)}
      />
      <ConfirmDialog overlayId="computers-firewall-confirm-dialog-1"
        isOpen={ask?.kind === 'toggle'}
        onOpenChange={open}
        title={ask?.kind === 'toggle' && ask.rule.state === 'enabled' ? t('fw.toggle.offTitle') : t('fw.toggle.onTitle')}
        body={ask?.kind === 'toggle' ? [`${ruleSentence(ask.rule, t)}.`, ask.rule.state === 'disabled' && blocksSsh({ ...formOf(ask.rule), enabled: true }) ? t('fw.ssh.note') : '', naming].filter(Boolean).join(' ') : ''}
        confirmLabel={ask?.kind === 'toggle' && ask.rule.state === 'enabled' ? t('fw.row.off') : t('fw.row.on')}
        confirmDisabled={blocked || held}
        onConfirm={() => {
          if (ask?.kind !== 'toggle') return;
          const rule = ask.rule;
          if (rule.state === 'disabled') guarded({ ...formOf(rule), enabled: true }, { kind: 'toggle', rule });
          else void runToggle(rule);
        }}
      />
      <DangerConfirm overlayId="computers-firewall-cut"
        isOpen={ask?.kind === 'cut'}
        onOpenChange={open}
        title={t('fw.cut.title', { name })}
        body={ask?.kind === 'cut' ? [t('fw.cut.body', { ports: ask.ports.join(', '), name }), held ? heldWhy : ''].filter(Boolean).join(' ') : ''}
        busy={waiting}
        consequences={[t('fw.cut.c1', { name }), t('fw.cut.c2')]}
        confirmText={name}
        confirmLabel={t('fw.cut.go')}
        onConfirm={() => {
          if (ask?.kind !== 'cut' || stale) return;
          const intent = ask.intent;
          onClose();
          runIntent(intent);
        }}
      />
      <ConfirmDialog overlayId="computers-firewall-confirm-dialog-2"
        isOpen={ask?.kind === 'preset'}
        onOpenChange={open}
        title={ask?.kind === 'preset' ? t(`fw.preset.${ask.id}`) : ''}
        confirmLabel={t('fw.preset.go', { count: presetRs.length })}
        confirmDisabled={presetRs.length === 0 || held}
        onConfirm={() => {
          if (ask?.kind !== 'preset' || !presetRs.length) return;
          const rs = presetRs;
          const cut = rs.map((r) => cutsOff(formOf(r))).find((p) => p.length);
          if (cut) onChange({ kind: 'cut', ports: cut, intent: { kind: 'preset', rules: rs } });
          else runIntent({ kind: 'preset', rules: rs });
        }}
      >
        {ask?.kind === 'preset' ? (
          <div className={s.stack}>
            <p className={s.help}>{t(`fw.preset.${ask.id}.help`, { name })}</p>
            {held ? <Band /* noDetails: nothing was refused; the preset waits for the rules or another change */ tone="warn" size="table">{heldWhy}</Band> : null}
            {ask.id === 'addresses' ? (
              <IpAllowlistField label={t('fw.form.addresses.in')} description={t('fw.form.addresses.list')} value={ask.addresses} onChange={(up) => onChange((cur) => (cur?.kind === 'preset' ? { ...cur, addresses: up(cur.addresses) } : cur))} readIp={readIp} isDisabled={waiting} />
            ) : null}
            {presetRs.length ? (
              <ul className={f.list}>
                {presetRs.map((r, i) => (
                  <li key={i} className={f.rule}>
                    <span className={f.sentence}>{ruleSentence(r, t)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
      <DangerConfirm overlayId="computers-firewall-reset"
        isOpen={ask?.kind === 'reset'}
        onOpenChange={open}
        title={t('fw.reset.title', { name })}
        body={[t('fw.reset.body', { name }), held ? heldWhy : ''].filter(Boolean).join(' ')}
        busy={waiting}
        consequences={[t('fw.reset.c1'), t('fw.reset.c2', { name })]}
        confirmText={name}
        confirmLabel={t('fw.reset.go')}
        onConfirm={() => { if (!stale) void runReset(); }}
      />
    </>
  );
}

/** A change that may have gone through: Check again (reads only) and, for this page's own hold, a warned Dismiss of
 *  exactly that hold. Another page's hold is that page's to settle. */
function HeldBand({ h, name, muts, reset }: { h: HeldChange; name: string; muts: Record<Direction, DirMut>; reset: ReturnType<typeof useResetFirewall> }) {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState(false);
  const id = (h.identity ?? {}) as { act?: string; rule?: FwRule; state?: string; computer?: string };
  const rule = id.rule;
  const dir = rule?.direction === 'egress' ? 'egress' : 'ingress';
  const key = id.act === 'reset' ? 'fwReset' : `fw${id.act === 'add' ? 'Add' : id.act === 'remove' ? 'Remove' : 'Toggle'}${dir === 'ingress' ? 'In' : 'Out'}`;
  const m = id.act === 'reset' ? reset : id.act === 'add' ? muts[dir].add : id.act === 'remove' ? muts[dir].remove : muts[dir].toggle;
  const other = firewallSource.heldBy(key, h) === 'other';
  const sentence = rule ? ruleSentence(rule, t) : '';
  const text = id.act === 'reset' ? t('fw.held.reset', { name }) : id.act === 'add' ? t('fw.held.add', { rule: sentence }) : id.act === 'remove' ? t('fw.held.remove', { rule: sentence }) : t(id.state === 'disabled' ? 'fw.held.off' : 'fw.held.on', { rule: sentence });
  const dismiss = () => {
    setAsked(false);
    if (!h.hold || other) return;
    const vars = id.act === 'reset' ? { computer: id.computer ?? '' } : id.act === 'toggle' ? { computer: id.computer ?? '', rule: rule as FwRule, state: id.state as 'enabled' | 'disabled' } : { computer: id.computer ?? '', rule: rule as FwRule };
    void (m.dismiss as (v: unknown, hold: string) => Promise<boolean>)(vars, h.hold);
  };
  return (
    <>
      <Band
        /* noDetails: the hold is the fact; Check again reads it back, and core keeps its details */
        tone="warn"
        size="table"
        actions={
          <>
            <Button size="sm" busy={checking} onPress={() => { setChecking(true); void m.readBack().catch(() => false).finally(() => setChecking(false)); }}>{t('fw.held.check')}</Button>
            {other ? null : <Button size="sm" variant="ghost" onPress={() => setAsked(true)}>{t('fw.held.dismiss')}</Button>}
          </>
        }
      >
        {other ? `${text} ${t('fw.held.elsewhere')}` : text}
      </Band>
      <ConfirmDialog overlayId="computers-firewall-held-dismiss" isOpen={asked && !other} onOpenChange={(o) => !o && setAsked(false)} title={t('fw.held.dismissTitle')} body={t('fw.held.dismissBody', { name })} confirmLabel={t('fw.held.dismissGo')} onConfirm={dismiss} />
    </>
  );
}

/** Add my IP's read (kit IpAllowlistField): GET /ip through the page's myIp query, only when pressed. */
function useReadIp(): () => Promise<IpDetails | null> {
  return readIpFrom(useMyIp(false));
}

const ACTION_OPTS: readonly Action[] = ['drop', 'reject', 'allow'];
const PROTO_OPTS: readonly Protocol[] = ['tcp', 'udp', 'icmp4'];

function RuleDrawer({ editing, busy, locked, lockedWhy, captured, outcome, onChange, onUpdate, onClose, onSubmit }: {
  editing: Editing | null; busy: boolean; locked: boolean; lockedWhy: string; outcome: FormOutcome | undefined;
  /** A typed confirmation holds the form as it was when Add rule was pressed: Add my IP changes nothing until it
   *  closes, and a read asked before it never lands (the field's lock starts a new generation). */
  captured: boolean;
  onChange: (f: FwForm) => void; onUpdate: (up: (f: FwForm) => FwForm) => void; onClose: () => void; onSubmit: () => void;
}) {
  const t = useStrings(strings);
  const form = editing?.form ?? blankForm('ingress');
  const p = formProblems(form);
  const touched = (v: string) => v.trim() !== '';
  const set = (patch: Partial<FwForm>) => onChange({ ...form, ...patch });
  const err = (field: keyof typeof p, shown: boolean) => (shown && p[field] ? t(`fw.form.${field}.${p[field]}` as Parameters<T>[0]) : undefined);
  // A required field still empty (Ports first, then Description) when nothing else is wrong and something is already
  // set: the plate and the footer name it, so a started form never looks dead (an address alone, Add rule off, no
  // reason). Only an untouched form keeps the placeholder.
  const onlyNeeded = Object.keys(p).length > 0 && Object.values(p).every((v) => v === 'needed');
  const missing = !onlyNeeded || sameForm(form, blankForm(form.direction)) ? null : p.ports === 'needed' ? 'ports' : p.description === 'needed' ? 'description' : null;
  const cut = cutsOff(form);
  const replace = editing?.mode === 'edit' && editPlan(editing.old, form).kind === 'replace';
  // A refusal shows in the footer in the page's own words ("another change is still being checked"), with the kit's
  // Details for the API's answer behind it.
  const readIp = useReadIp();
  return (
    <Drawer overlayId="computers-firewall-drawer" resizeKey="computers-firewall-rule"
      isOpen={editing !== null}
      onOpenChange={(o) => !o && onClose()}
      title={editing?.mode === 'edit' ? t('fw.form.editTitle') : t('fw.form.addTitle')}
      // How an edit is saved is the drawer's subtitle, not a note under the form.
      subtitle={replace ? t('fw.form.replaceNote') : undefined}
      size="md"
      // Unsaved input is a form that differs from how it opened: an untouched one closes without the leave ask.
      dirty={!!editing && !sameForm(editing.form, editing.start)}
      busy={busy}
      footer={
        <FormFooter
          // "Unsaved changes" only for a ready form that differs from how it opened (an untouched edit has none).
          dirty={formReady(form) && !!editing && !sameForm(editing.form, editing.start)}
          requireDirty={false}
          submitDisabled={!formReady(form) || locked}
          {...(missing ? { reason: t(`fw.form.${missing}.needed` as Parameters<T>[0]) } : {})}
          busy={busy}
          busyLabel={t('fw.form.busy')}
          doneText={t('fw.form.done')}
          outcome={outcome}
          error={outcome?.error}
          failedDetail={outcome?.message}
          submitLabel={editing?.mode === 'edit' ? t('fw.form.save') : t('fw.form.go')}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      }
    >
      {/* A group, not a <form>: the footer's button is the one way to send, so one press is one send. Three sections
          (what happens to the traffic, which traffic, its name and state), then the rule as one sentence: the closing
          block, in the form's own flow, so no field is ever under it. The one warning (the form's wait, else the
          cut-off warning) stands right under the ports, in view when the drawer opens. */}
      <div role="group" aria-label={editing?.mode === 'edit' ? t('fw.form.editTitle') : t('fw.form.addTitle')}>
      <Stack gap={4}>
        <FormSection label={t('fw.form.sec.rule')}>
          <SegmentedControl<Direction> label={t('fw.form.direction')} showLabel items={[{ id: 'ingress', label: t('fw.inbound') }, { id: 'egress', label: t('fw.outbound') }]} value={form.direction} onChange={(v) => set({ direction: v })} />
          <Select<Action> label={t('fw.form.action')} description={form.action === 'allow' ? t('fw.form.allowNote') : undefined} options={ACTION_OPTS.map((v) => ({ value: v, label: t(`fw.form.action.${v}`) }))} value={form.action} onChange={(v) => set({ action: v })} />
        </FormSection>
        <FormSection title={t('fw.form.sec.match')}>
          <Select<Protocol> label={t('fw.form.protocol')} options={PROTO_OPTS.map((v) => ({ value: v, label: t(`fw.form.protocol.${v}`) }))} value={form.protocol} onChange={(v) => set({ protocol: v })} />
          {form.protocol !== 'icmp4' ? (
            <TextField label={t('fw.form.ports')} description={blocksSsh(form) ? t('fw.form.ports.helpSsh') : t('fw.form.ports.help')} value={form.ports} onChange={(v) => set({ ports: v })} errorMessage={err('ports', touched(form.ports) || p.ports !== 'needed')} inputMode="numeric" mono />
          ) : (
            <>
              <TextField label={t('fw.form.icmpType')} description={t('fw.form.icmpType.help')} value={form.icmpType} onChange={(v) => set({ icmpType: v })} errorMessage={err('icmpType', true)} inputMode="numeric" mono />
              <TextField label={t('fw.form.icmpCode')} value={form.icmpCode} onChange={(v) => set({ icmpCode: v })} errorMessage={err('icmpCode', true)} inputMode="numeric" mono />
            </>
          )}
          {/* One Band, in view when the drawer opens: the form's wait, else the cut-off warning under the ports it is about. */}
          {locked || cut.length ? (
            <Band /* noDetails: nothing was refused; the form waits, or warns before anything is sent */ tone="warn" size="table">{locked ? lockedWhy : t('fw.cut.inline', { ports: cut.join(', ') })}</Band>
          ) : null}
          <IpAllowlistField
            label={form.direction === 'ingress' ? t('fw.form.addresses.in') : t('fw.form.addresses.out')}
            description={t('fw.form.addresses.help')}
            value={form.addresses}
            onChange={(up) => onUpdate((f) => ({ ...f, addresses: up(f.addresses) }))}
            readIp={readIp}
            errorMessage={err('addresses', true)}
            isDisabled={busy || captured}
          />
        </FormSection>
        <FormSection title={t('fw.form.sec.name')}>
          <TextField label={t('fw.form.description')} value={form.description} onChange={(v) => set({ description: v })} errorMessage={err('description', touched(form.description))} />
          <Switch label={t('fw.form.enabled')} isSelected={form.enabled} onChange={(v) => set({ enabled: v })} />
        </FormSection>
        {/* Not the pinned summary: on this form every field, the On switch included, stays in view above the footer.
            The plate names itself (kit Verdict): the section adds no second name. */}
        <FormSection>
          <Verdict label={t('fw.form.previewLabel')}>{formReady(form) ? t('fw.form.preview', { rule: ruleSentence(ruleOfForm(form), t) }) : missing ? t(`fw.form.previewNeeds.${missing}` as Parameters<T>[0]) : t('fw.form.previewEmpty')}</Verdict>
        </FormSection>
      </Stack>
      </div>
    </Drawer>
  );
}

// After a question reached the Agent its tools may change these rules: the list re-reads until this deadline, per realm
// and computer (module state, so leaving a computer and coming back keeps it; a reload forgets it). The question and
// its C9 hold are the kit's (useAskAgent).
const agentKey = (realm: string | null | undefined, computer: string) => `${realm ?? ''}|${computer}`;
const agentPolls = new Map<string, number>();
const pollListeners = new Set<() => void>();
function setAgentPoll(key: string, until: number) {
  agentPolls.set(key, until);
  for (const fn of pollListeners) fn();
}
const subscribeAgentPolls = (fn: () => void) => {
  pollListeners.add(fn);
  return () => pollListeners.delete(fn);
};
const useAgentPoll = (key: string) => useSyncExternalStore(subscribeAgentPolls, () => agentPolls.get(key) ?? 0, () => agentPolls.get(key) ?? 0);
/** Tests: forget every computer's Agent question and re-read deadline. */
export function resetAgentStartsForTests(): void {
  agentPolls.clear();
  resetAskAgentForTests();
}

/**
 * The Agent, through the kit's Ask the Agent: Explain (a fixed question) and "Tell the Agent what you
 * want" each start a NEW Agent conversation with the rules as context (agentStartOf: the computer's name, never its id;
 * a description's keys hidden and ids shortened; a Tell that may hold a key is refused). The Agent
 * changes rules only with its own tools, which ask the person to approve each
 * change; the list re-reads like any other change. While the last read failed (stale), nothing is asked: a snapshot
 * would describe rules not read now.
 */
function useFirewallAsk(c: Computer, realm: string | null | undefined, l: FwList | undefined, stale: boolean, reread: { run: () => void; busy: boolean }) {
  const t = useStrings(strings);
  const key = agentKey(realm, c.id);
  const explainStart = l ? agentStartOf({ kind: 'explain' }, c.name, l, t) : null;
  return useAskAgent({
    askKey: `firewall:${key}`,
    subject: t('fw.agent.subject', { name: c.name }),
    source: t('fw.title'),
    computer: c,
    ...(explainStart ? { reads: explainStart.context } : {}),
    // A failed re-read still opens the drawer: it says why and holds "Read the rules again".
    ...(stale || !l ? { disabledReason: t('fw.agent.stale', { name: c.name }), opensDisabled: true } : {}),
    explain: { run: (send) => send(explainStart?.fits ? { text: explainStart.text, context: explainStart.context } : null) },
    tell: {
      label: t('fw.agent.tellLabel'),
      description: t('fw.agent.tellHint'),
      check: (request) => {
        if (!l) return null;
        const st = agentStartOf({ kind: 'tell', request }, c.name, l, t);
        if (st.secret) return { problem: t('fw.agent.secret') };
        if (!st.text) return null;
        return st.fits ? { q: { text: st.text, context: st.context } } : { problem: t('fw.agent.tooLong') };
      },
    },
    onOutcome: (o) => { if (o === 'sent') setAgentPoll(key, Date.now() + AGENT_POLL_MS); },
    after: (
      <>
        {/* A plain summary from the rules alone (no AI), so an Agent answer is never the only one. */}
        {l && !stale ? <p className={s.help}>{summaryOf(l, t)}</p> : null}
        <Button size="sm" variant="ghost" busy={reread.busy} onPress={reread.run}>
          {t('fw.agent.reread')}
        </Button>
      </>
    ),
  });
}

type RowActions = (rule: FwRule) => RowActionEntry[];

/** One rule as a table row: its direction's list and its index there (a delete or switch names the rule by its fields;
 *  the index only keys the row). */
type RuleRow = { key: string; r: FwRule };

/** The rules as one table grouped Inbound / Outbound (blocks before allows, as the host applies them). The Internet
 *  access block's rules are not rows: each group says how many of them it holds, set by Internet access. */
function RulesTable({ name, l, actions }: { name: string; l: FwList; actions?: RowActions }) {
  const t = useStrings(strings);
  const rowsOf = (d: Direction): RuleRow[] => shownWithIndex(l[d].filter((r) => !isNoInternetRule(r))).map(({ r, i }) => ({ key: `${d}-${i}`, r }));
  const rows = [...rowsOf('ingress'), ...rowsOf('egress')];
  const none = l.ingress.length === 0 && l.egress.length === 0 && l.unreadable === 0;
  const noteOf = (d: Direction) => {
    const group = l[d].filter(isNoInternetRule).length;
    const bad = d === 'ingress' ? l.unreadableIn : l.unreadableOut;
    const shown = rowsOf(d).length;
    const parts = [
      group > 0 ? `${t('ni.group', { count: group })} (${t('ni.setBy')})` : null,
      bad > 0 ? t('fw.dir.unreadable', { count: bad }) : null,
      shown === 0 && group === 0 && bad === 0 ? (d === 'ingress' ? t('fw.inbound.none', { name }) : t('fw.outbound.none')) : null,
    ].filter((x): x is string => x !== null);
    return parts.length ? parts.join(' ') : undefined;
  };
  // The empty state's line for a direction: its note, named by the direction (no group row above it there).
  const lineOf = (d: Direction) => {
    const note = noteOf(d);
    return note === undefined ? undefined : t('fw.dir.line', { dir: t(d === 'ingress' ? 'fw.inbound' : 'fw.outbound'), note });
  };
  const col = createColumnHelper<RuleRow>();
  const columns = [
    // Action and state share the one status cell: the list layout (390) shows a single status, so an off rule must say
    // Off beside its verb there too. Sized for the drawn tags (fitPad), not their bare words.
    col.display({
      id: 'action',
      header: t('fw.col.action'),
      meta: { size: 'fit', fitText: (x: RuleRow) => `${ruleParts(x.r, t).verb}${x.r.state === 'disabled' ? ` ${t('fw.off')}` : ''}`, fitPad: 40, list: 'status', label: t('fw.col.action') },
      cell: (x) => (
        <>
          <Tag tone={x.row.original.r.action === 'allow' ? 'ok' : 'warn'}>{ruleParts(x.row.original.r, t).verb}</Tag>
          {x.row.original.r.state === 'disabled' ? <> <Tag>{t('fw.off')}</Tag></> : null}
        </>
      ),
    }),
    col.display({ id: 'what', header: t('fw.col.what'), meta: { pinned: true, list: 'primary', label: t('fw.col.what') }, cell: (x) => ruleParts(x.row.original.r, t).what }),
    col.display({ id: 'where', header: t('fw.col.where'), meta: { mono: true, list: 'meta', label: t('fw.col.where') }, cell: (x) => { const p = ruleParts(x.row.original.r, t); return p.sourcePorts ? `${p.where} ${t('fw.sourcePorts', { ports: p.sourcePorts })}` : p.where; } }),
    col.display({ id: 'note', header: t('fw.col.note'), meta: { priority: 2, list: 'meta', label: t('fw.col.note') }, cell: (x) => x.row.original.r.description }),
  ];
  return (
    <DataTable
      label={t('fw.title')}
      data={none ? [] : rows}
      columns={columns}
      getRowId={(x) => x.key}
      fill={false}
      bare
      noViewMenu
      sortParam={false}
      onRowAction={false}
      groupBy={(x) => x.r.direction}
      groups={none ? [] : (['ingress', 'egress'] as const).map((d) => ({ id: d, label: t(d === 'ingress' ? 'fw.inbound' : 'fw.outbound'), showEmpty: true, note: noteOf(d) }))}
      countLabel={(n) => t('fw.count', { count: n })}
      empty={
        none ? (
          <EmptyState size="sm" icon="lock" title={t('fw.empty.title')} body={t('fw.empty.body', { name })} />
        ) : (
          // Rules exist but none is a row (only Internet access's, or only rules the page can't read): each direction's
          // note on its own line, named by its direction, never "no rules".
          <EmptyState
            size="sm"
            icon="lock"
            title={t('fw.noRows')}
            body={(['ingress', 'egress'] as const).map((d) => lineOf(d)).filter((x): x is string => x !== undefined).map((x) => <span key={x} className={s.line}>{x}</span>)}
          />
        )
      }
      {...(actions ? { actions: (x: RuleRow) => actions(x.r) } : {})}
    />
  );
}
