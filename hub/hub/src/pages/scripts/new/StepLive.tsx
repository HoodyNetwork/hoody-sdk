// Step 5, "Make it live", and its end, "It's live". What is sent
// is the checked snapshot, as is, once per draft (deploy.ts): the draft's record is reserved across tabs before anything
// is sent, and no answer frees that reservation (C9) except the computer's definite refusal of a first write
// send, which frees the draft back to open (deploy.ts). The step reads what to show from the stored
// record, so another tab and a reload see the same:
// - a send known not to have gone out (phase didnt): "Didn't deploy", Try again (the same reservation) or a warned Discard;
// - an outcome it cannot tell, a send still out past its heartbeat (phase held): "Not known if it's live", or the agent's
//   refusal: "It may be live", with Check (a fresh read of the computer for the path: the script found there releases the draft;
//   hoody-exec's own "Script not found" for it makes the reservation didnt, "No script found", with Deploy again and a warned
//   Discard: deploy.ts confirmDeployed; unless core still holds a send of the address, or can't free or list
//   its sends, each said so, Check again; a script found there that hoody-exec's journal proves another writer's (this
//   deploy's op refused or fenced) opens the draft again, shown as the address taken, Change address;
//   a read with no answer says so, with its cause when the failure gave one), the computer's Scripts list, and Discard, warned
//   that the script may already be live;
// - made live (consumed, or live_cleanup while its attempts are closed): "It's live".
// A refusal before anything was sent (the check no longer holds, another computer, no clock) says what fixes it and leaves
// Make it live pressable. The script, its public link and an idea's key are three separate outcomes.
import { AnatomySection, Band, ComputerLink, ConfirmDialog, CopyField, Facts, InlineActions, OutcomeBanner, PropagatingNote, SecretField, SubSection, Verdict, VerdictMark, Why, useStrings, webAddress, type AnyAction, type FaqItem } from '@kit';
import { buildPortUrl } from '@core';
import { useEffect, useRef, useState } from 'react';
import { compIdOf, useAliasCreate, useBoundSends, type Binding, type NoAnswer } from '../data';
import { addressOk, expectRoute, instantiateBody, newKey, pathFor, routeOf, template } from '../logic';
import strings from '../strings.en.json';
import { LOGIN_REFUSALS, confirmDeployed, deployInstantiate, deployWrite, type DeployAnswer } from './deploy';
import { ScriptAddress } from '../parts/ScriptAddress';
import { liveError, type LiveAction, type LiveError } from './liveErrors';
import { ensureRecord, useDraftRecord } from './record';
import { DEPLOY_BEAT_STALE_MS, deployStale, discardDraft, readDraftRecord } from './records';
import type { Snapshot, SnapshotVerdict } from './snapshot';
import type { Alias } from '../types';
import f from './Flow.module.css';

const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
/** A first send whose draft another tab has moved past the attempt this tab's code came from: nothing is sent. */
const STALE_DRAFT: LiveError = { tone: 'not_sent', title: { key: 'live.notMade' }, body: { key: 'flow.built.refused.stale' }, actions: [] };
/** A write with no checked code in this tab (a Try again after a reload: the record holds no code): Check fixes it. */
/** Try again of a reservation at an address no script can answer: nothing is sent; Discard is the way out. */
const resvRefused = (route: string): LiveError => ({ tone: 'not_sent', title: { key: 'live.unroutable.title' }, body: { key: 'flow.live.resvRefused.body', vars: { route } }, actions: [] });
const NOT_CHECKED: LiveError = { tone: 'not_sent', title: { key: 'live.notMade' }, body: { key: 'review.checkFirst' }, actions: ['checkCode'] };

/** `url` of a made link: the link's own web address as the create answer gave it (madeLinkUrl), or null when it gave none. */
export type Link = { k: 'none' } | { k: 'sending' } | { k: 'made'; url: string | null } | { k: 'refused'; code: string } | { k: 'unknown' };

/**
 * The made link's own web address, from the create answer: the link's record ({url}), bare or under `data`. Shown and
 * opened as given, never built from the link's name; an answer without an absolute http(s) address gives null.
 */
export function madeLinkUrl(raw: unknown): string | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const d = o && o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : o;
  const url = d && typeof d.url === 'string' ? d.url : '';
  return webAddress(url) ? url : null;
}
export type Live =
  | { k: 'confirm' }
  | { k: 'sending' }
  /** Another tab is sending this draft now (its heartbeat is fresh). */
  | { k: 'elsewhere' }
  /** `origin`: the Exec origin of the computer and folder the stored record names ('' when this tab has no binding of it). */
  /** `own`: this tab's own send answered done, so the snapshot it shows is the deployed bytes. A record made live elsewhere
   *  (another tab, before a reload) is not: nothing here says what those bytes turn on or off. */
  | { k: 'done'; path: string; keys: Record<string, string> | null; origin: string; own: boolean }
  /** Nothing was sent: what fixes it. Make it live stays pressable. */
  | { k: 'refused'; e: LiveError }
  /** Nothing went through on the reservation; `e`: why this tab's last Try again was not sent, with what fixes it. `absent`:
   *  this tab's Check found no script at the reservation's route (its own address), so Deploy again is offered. */
  | { k: 'didnt'; e: LiveError | null; absent: { route: string; removed: boolean } | null }
  /** It may have gone through; `refusal`: the agent's own refusal of the send, shown as such. `why`: the last Check's read got
   *  no answer, and its failure said why. `check` 'waiting': the read found no script, but core still holds a send of the address;
   *  'kept': no script, but core's sends could not be listed or this one not freed. 'unproven': no script, but an idea's
   *  request has no journal to fence it, so it may still arrive. 'takenKept': a script is there that this
   *  deploy did not make, but core would not free its send yet. */
  /** `keyMaybe`: an idea's caller key may have been made, and is never shown. */
  | { k: 'held'; refusal: LiveError | null; check: Check; why: NoAnswer | null; keyMaybe: boolean }
  | { k: 'discarded' };

type Check = 'idle' | 'checking' | 'not_known' | 'waiting' | 'kept' | 'unproven' | 'takenKept';

export interface LiveIn {
  way: 'ai' | 'idea' | 'write';
  b: Binding | null;
  draftId: string;
  computer: string;
  compId: string;
  route: string;
  snap: Snapshot | null;
  verdict: SnapshotVerdict | null;
  idea: string | null;
  fields: Record<string, string>;
  link: string | null;
  /** The computer's public links as the page last read them: a made link whose answer held no address is looked up here by name. */
  linkRows?: readonly Alias[];
  /** The attempt this tab's code came from (AI way): a send is refused when the stored draft has moved past it. */
  attempt: number;
  /** The binding the stored record names, as the restore predicate reads it (recover.ts: its own project, computer and folder,
   *  never the editable draft's), or null/'unknown'. */
  recordBinding: Binding | null | 'unknown';
  /** The agent refused an idea's send for its own sign-in state: the page reads the agent's status again. */
  onLoginRefused?: () => void;
}

/** The send of a draft and its outcome, as the stored record and this tab's own last answer say. */
export function useLive(o: LiveIn) {
  const t = useStrings(strings);
  // Every send goes to the bound computer and folder, only while the Hub shows it (useBoundSends).
  const sends = useBoundSends(o.b);
  const alias = useAliasCreate();
  const rec = useDraftRecord(o.draftId);
  // Recovery of a reservation (Check, Try again) goes to the reservation's own project, computer and folder, as the stored
  // record names them: never to the draft's local binding, which the person may have moved since (Use <computer> instead).
  const held = rec !== 'unreadable' && rec && rec.state === 'deploying' ? o.recordBinding : null;
  const heldB = held && held !== 'unknown' ? held : null;
  const recSends = useBoundSends(heldB);
  // An observer re-reads when another tab's heartbeat goes stale: its own render then shows Check and Discard.
  const [, setTick] = useState(0);
  const beatAt = rec !== 'unreadable' && rec?.state === 'deploying' && rec.deploy?.phase === 'sending' ? rec.deploy.beatAt : null;
  useEffect(() => {
    if (beatAt === null) return;
    const id = setTimeout(() => setTick((x) => x + 1), Math.max(0, beatAt + DEPLOY_BEAT_STALE_MS - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [beatAt]);
  const [sending, setSending] = useState(false);
  // This tab's last answer that the record does not hold: a refusal before anything was sent, or the agent's refusal.
  const [refusal, setRefusal] = useState<LiveError | null>(null);
  // Why this tab's last Try again on the reservation was not sent (nothing went out): shown on the reservation's own band.
  const [unsent, setUnsent] = useState<LiveError | null>(null);
  const [check, setCheck] = useState<Check>('idle');
  const [why, setWhy] = useState<NoAnswer | null>(null);
  // The op this tab's Check found absent: its didnt band says so, with Deploy again, while the record still holds that op.
  const [absentOp, setAbsentOp] = useState<string | null>(null);
  // That Check also found the op committed in hoody-exec's journal: the script was made, then removed since (ABSENT_REMOVED).
  const [absentRemoved, setAbsentRemoved] = useState(false);
  // An idea's request as this tab sent it, under its reservation's Idempotency-Key: Deploy again of that same reservation sends
  // it unchanged, so a first send that lands late is replayed under the key, not refused as new content under it. In this tab's
  // memory only, never stored (a reload makes a new request under the key).
  const ideaSent = useRef<{ idem: string; callerKey: string; vars: Record<string, string>; keys: Record<string, string> } | null>(null);
  const [discardNote, setDiscardNote] = useState(false);
  const [link, setLink] = useState<Link>({ k: 'none' });
  // An idea's key is shown only to the tab that made it, and only once the script is made.
  const keys = useRef<Record<string, string> | null>(null);
  // The keys of the request this tab is sending: they become the shown keys only when this tab's own send answers done.
  const candidate = useRef<Record<string, string> | null>(null);
  // This tab's own send answered done (the same evidence rule as the keys).
  const own = useRef(false);
  const linked = useRef<string | null>(null);
  const exec = o.b?.exec ?? o.snap?.exec ?? 1;
  const path = pathFor(o.route, 'ts', exec);
  const via = o.way === 'idea' ? 'idea' : 'write';
  const words = (kind: 'failed' | 'not_sent', code: string | null) => liveError({ via, kind, code, computer: o.computer, route: o.route });

  const sendLink = (p: string) => {
    if (!o.link || linked.current === p) return;
    linked.current = p;
    setLink({ k: 'sending' });
    void alias.mutateAsync({ compId: o.compId, target: p, alias: o.link, exec }).then(
      (r) => setLink(r?.outcome === 'done' ? { k: 'made', url: madeLinkUrl(r.data) } : r?.outcome === 'failed' ? { k: 'refused', code: r.code ?? '' } : r?.outcome === 'not_sent' ? { k: 'refused', code: '' } : { k: 'unknown' }),
      () => setLink({ k: 'unknown' }),
    );
  };

  // What the record says now; this tab's own send in flight comes first.
  const r = rec === 'unreadable' ? null : rec;
  let live: Live;
  if (sending) live = { k: 'sending' };
  else if (r && (r.state === 'consumed' || r.state === 'live_cleanup')) {
    // The address is the deployed record's own: its project, computer and folder with its path, never the editable draft's
    // binding (another tab may have deployed it elsewhere). A binding of another computer gives no origin (the path alone).
    const onRecord = (b: Binding | null | 'unknown'): Binding | null => (b && b !== 'unknown' && b.target.project.id === r.project && compIdOf(b) === r.compId ? b : null);
    live = { k: 'done', path: r.deploy?.path ?? path ?? '', keys: keys.current, origin: liveOrigin(onRecord(o.recordBinding) ?? onRecord(o.b), r.exec), own: own.current };
  }
  else if (r?.state === 'discarded') live = { k: 'discarded' };
  else if (r?.state === 'deploying' && r.deploy?.phase === 'didnt') live = { k: 'didnt', e: unsent, absent: absentOp !== null && r.deploy.opId === absentOp ? { route: routeOf(r.deploy.path) ?? r.deploy.path, removed: absentRemoved } : null };
  else if (r?.state === 'deploying' && (r.deploy?.phase === 'held' || deployStale(r))) live = { k: 'held', refusal, check, why, keyMaybe: o.way === 'idea' };
  else if (r?.state === 'deploying') live = { k: 'elsewhere' };
  else live = refusal ? { k: 'refused', e: refusal } : { k: 'confirm' };
  // The public link is asked for once the script is live (here or in another tab), after the render that shows it.
  const donePath = live.k === 'done' ? live.path : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the live path is the trigger; sendLink sends once per path
  useEffect(() => { if (donePath) sendLink(donePath); }, [donePath]);

  /** One answer of deploy.ts: done shows "It's live" (from the record); the rest leave the record to say what it holds. */
  const answered = (a: DeployAnswer) => {
    setCheck('idle');
    setWhy(null);
    if (a.outcome === 'failed') {
      const w = words('failed', a.code);
      setRefusal(w);
      // The agent's own sign-in state: nothing was made and the reservation is stored didnt (deploy.ts settleSend), so its band
      // says why (not "hasn't made the script" alone), with Try again; the page's status read follows, for the sign-in beside it.
      if (LOGIN_REFUSALS.includes(a.code)) { setUnsent(w); o.onLoginRefused?.(); }
    }
    else if (a.outcome === 'not_sent') setRefusal(words('not_sent', a.code));
    else setRefusal(null);
  };

  const send = async () => {
    if (sending) return;
    if (live.k !== 'confirm' && live.k !== 'refused' && live.k !== 'didnt') return;
    // Try again resends the reservation on its own computer, gated on the reservation alone (a reload restores no address or
    // binding into the draft, and the person may have changed both since); a first send goes to the draft's binding, opened
    // (or rebound while open) there first.
    const again = live.k === 'didnt';
    const refuse = (e: LiveError) => (again ? setUnsent : setRefusal)(e);
    if (!again && (!o.b || !path)) return;
    const viaSends = again ? recSends : sends;
    setSending(true);
    setRefusal(null);
    setUnsent(null);
    candidate.current = null;
    try {
      if (!again) {
        if (!o.b) return;
        const opened = await ensureRecord(o.draftId, o.way, o.b);
        if (!opened.ok) { refuse(words('not_sent', 'NO_RECORD')); return; }
        // The code this tab holds is attempt o.attempt's: a draft another tab has moved on is not sent with older code.
        if (o.way === 'ai' && opened.record.current !== o.attempt) { refuse(STALE_DRAFT); return; }
      } else if (!heldB) {
        refuse(words('not_sent', 'NOT_SHOWN'));
        return;
      }
      // Try again resends the reservation as stored: its own path, and only code of the attempt it was made from. Local inputs
      // the person changed since (address, a newer attempt) are never sent under it.
      const resv = again && r?.deploy ? r.deploy : null;
      if (again && !resv) { refuse(words('not_sent', 'NO_RECORD')); return; }
      if (resv && o.way === 'ai' && resv.attempt !== o.attempt) { refuse(STALE_DRAFT); return; }
      // A reservation made before the Hub refused an address (an intercepted path, a .md, pre/post, a final .js/.ts) is never
      // sent again: hoody-exec's write guard would pass it, and "It's live" would show while no script answers there.
      const resvRoute = resv ? routeOf(resv.path) : null;
      if (resv && !addressOk(resvRoute)) { refuse(resvRefused(resvRoute ?? resv.path)); return; }
      const sendPath = resv ? resv.path : path;
      const at = again ? heldB : o.b;
      if (!sendPath || !at) { refuse(words('not_sent', 'NO_RECORD')); return; }
      if (o.way === 'idea') {
        const tpl = template(o.idea);
        if (!tpl) { refuse(words('not_sent', null)); return; }
        // Deploy again or Try again of a reservation this tab sent sends this tab's request of it again, as it was (a first send
        // a Check found absent may still land, and one known not sent never left). After a reload, or in a tab that did not send
        // it, nothing holds that request: a new one goes under the key, and one the agent refuses (the first landed) is held.
        const same = resv && ideaSent.current?.idem === resv.opId ? ideaSent.current : null;
        let req: { callerKey: string; vars: Record<string, string>; keys: Record<string, string> };
        if (same) req = same;
        else {
          const callerKey = newKey(rand);
          const body = instantiateBody(tpl.name, { containerId: compIdOf(at), path: sendPath, values: o.fields, callerKey }, rand);
          if ('error' in body) { refuse(words('not_sent', null)); return; }
          req = { callerKey, vars: body.body.vars, keys: { [t('key.label')]: callerKey, ...body.secrets } };
        }
        candidate.current = req.keys;
        const a = await deployInstantiate({ sends: viaSends }, { draftId: o.draftId, project: at.target.project.id, compId: compIdOf(at), exec: at.exec, name: tpl.name, path: sendPath, vars: req.vars, callerKey: req.callerKey, sent: (idem) => { ideaSent.current = { idem, ...req }; } });
        // Only this tab's own send, answered done, made these keys: any other end (another tab's send, an unknown) shows none.
        if (a.outcome === 'done') { keys.current = candidate.current; ideaSent.current = null; own.current = true; }
        candidate.current = null;
        answered(a);
        return;
      }
      if (!o.snap || !o.verdict) { refuse(NOT_CHECKED); return; }
      // The route guard names the address the write goes to: on Try again, the reservation's own, never the draft's current one.
      // hoody-exec checks it against the tree the write leaves (scripts/write checkRouteEffect), where the new file answers its
      // own address: answeredBy is the written path. Null ("nothing answers it") is refused 409 ROUTE_EFFECT_CHANGED, nothing
      // written, on every send.
      const route = resv ? routeOf(resv.path) : o.route;
      const wrote = await deployWrite({ sends: viaSends }, { draftId: o.draftId, snapshot: o.snap, verdict: o.verdict, path: sendPath, expectRoute: expectRoute(route, sendPath), ...(o.way === 'ai' ? { attempt: o.attempt } : {}) });
      if (wrote.outcome === 'done') own.current = true;
      answered(wrote);
    } catch {
      // A throw after the reservation leaves the record as it is (it says what may have happened); before it, nothing was sent.
      setRefusal(null);
    } finally {
      candidate.current = null;
      setSending(false);
    }
  };

  /** Check: a fresh read of the reservation's own computer for its path. The script found there releases the draft; hoody-exec's
   *  own "Script not found" for it makes the reservation didnt (deploy.ts confirmDeployed), shown with Deploy again. */
  const checkAgain = async () => {
    setCheck('checking');
    setWhy(null);
    if (!heldB) { setCheck('not_known'); return; }
    const a = await confirmDeployed({ sends: recSends }, o.draftId).catch(() => ({ outcome: 'pending', code: 'NOT_KNOWN' }) as DeployAnswer);
    // The script found there is another writer's (hoody-exec's journal settled this deploy's op refused or fenced): the draft is
    // open again, shown as the address taken, with Change address.
    if (a.outcome === 'failed') setRefusal(words('failed', a.code));
    if (a.outcome === 'not_sent' && (a.code === 'ABSENT' || a.code === 'ABSENT_REMOVED')) {
      const now = readDraftRecord(o.draftId);
      setAbsentOp(now !== 'unreadable' && now?.state === 'deploying' && now.deploy?.phase === 'didnt' ? now.deploy.opId : null);
      setAbsentRemoved(a.code === 'ABSENT_REMOVED');
    }
    // A record that moved while the read was out shows what it holds now; no script while core still holds a send of the address,
    // or can't list or free its sends, says so; a script found there that core won't let go of yet says so; any other pending
    // answer is still not known.
    setCheck(a.outcome !== 'pending' || a.code === 'RECORD_MOVED' ? 'idle' : a.code === 'ABSENT_HELD' ? 'waiting' : a.code === 'ABSENT_KEPT' ? 'kept' : a.code === 'ABSENT_UNPROVEN' ? 'unproven' : a.code === 'TAKEN_KEPT' ? 'takenKept' : 'not_known');
    setWhy(a.outcome === 'pending' ? a.why ?? null : null);
  };

  /**
   * Discard the draft, only in the state the person saw: `seen` is the deploy (phase and op) that screen showed. Didnt's
   * Discard releases a send known not sent; held's, after the warning, one that may have gone through. A record that moved
   * since (another tab's Try again, a new send) is not discarded: its own screen, and warning, show instead.
   */
  const discard = async (seen: { phase: 'didnt' | 'held'; opId: string | null }): Promise<boolean> => {
    const cur = readDraftRecord(o.draftId);
    if (cur === 'unreadable') { setDiscardNote(true); return false; }
    if (cur === null) return true;
    if (cur.state === 'deploying') {
      const now = cur.deploy?.phase === 'didnt' ? 'didnt' : cur.deploy?.phase === 'held' || deployStale(cur) ? 'held' : 'sending';
      if (now !== seen.phase || (cur.deploy?.opId ?? null) !== seen.opId) { setDiscardNote(true); return false; }
    }
    const d = await discardDraft(cur, { mayBeDeployed: cur.state === 'deploying' }).catch(() => ({ ok: false as const }));
    setDiscardNote(!d.ok);
    return d.ok;
  };

  const canSend = live.k === 'confirm' || live.k === 'refused';
  // The made link's address: the create answer's, else the row of that name in the computer's list of links (read again
  // after the create). Never built here.
  const listed = link.k === 'made' && !link.url && o.link ? o.linkRows?.find((a) => a.alias === o.link)?.url : undefined;
  const linkShown: Link = link.k === 'made' && !link.url && listed && webAddress(listed) ? { k: 'made', url: listed } : link;
  const op = r?.state === 'deploying' ? (r.deploy?.opId ?? null) : null;
  return { live, link: linkShown, send, checkAgain, discard, discardNote, canSend, op, again: () => { setRefusal(null); setUnsent(null); } };
}

export type UseLive = ReturnType<typeof useLive>;

export interface StepLiveProps {
  api: UseLive;
  route: string;
  computer: string;
  /** The computer's id: its name links to its page (the id is never shown). */
  compId?: string;
  /** The public link's name, when one is asked for. */
  linkName?: string | null;
  schedule: string | null;
  /** An idea that carries its own schedule (Where says so too). */
  ownSchedule?: boolean;
  /** The bytes that go live turn the script off (`// @enabled false`, the Check's "turned off"): it will not answer. */
  off?: boolean;
  link: boolean;
  /** The page's answer about public links: the made link's "who can open it" ends with its link (as the Overview's does). */
  linkFaq?: FaqItem;
  onAction: (a: LiveAction) => void;
  onTry: () => void;
  onOpen: () => void;
  onAnother: () => void;
  /** The draft was discarded: leave the flow. */
  onDiscarded: () => void;
  /** The idea way's agent sign-in, while the agent is signed out (or its sign-in has something to say): under the band. */
  signIn?: React.ReactNode;
}

/** The made keys are shown only once the deploy's answer is in hand (live.k === 'done'): the list is ready when drawn. */
const READY = { kind: 'ready' } as const;

// `linkFaq` is taken by name: the page FAQ check follows a forwarded item only through a named parameter.
export function StepLive({ linkFaq, ...p }: StepLiveProps) {
  const t = useStrings(strings);
  const { live, link } = p.api;
  // The warned Discard's dialog, open for the state it was asked from: held (may be live) or didnt (a request may be on its way).
  const [warn, setWarn] = useState<'didnt' | 'held' | null>(null);
  const tr = (w: { key: string; vars?: Record<string, string | number> }) => t(w.key as never, w.vars as never);
  // The deploy this screen shows: a Discard releases only that one (useLive discard).
  const seenOp = p.api.op;
  const discard = async (phase: 'didnt' | 'held') => { if (await p.api.discard({ phase, opId: seenOp })) p.onDiscarded(); };

  if (live.k === 'done') {
    return (
      // The step's heading takes focus on arrival (the wizard's first heading: no field here, the address is text + a button).
      <AnatomySection id="new-live" title={t('flow.live.done')}>
        {/* The confirm's plate turned receipt. The address as Where it answers shows it (ScriptAddress: the route and exec-1
            readable, the middle of each id hidden, Copy whole), of the path the deploy made: a reservation sent again keeps
            its own route. */}
        <Verdict label={t('flow.live.isLive')}>
          {/* On or off is said only of bytes this tab sent; a record made live elsewhere says where, nothing more. */}
          {live.own ? (
            <>
              {p.off ? <VerdictMark tone="warn">{t('flow.live.off')}</VerdictMark> : <VerdictMark tone="good">{t('flow.live.answering')}</VerdictMark>} {t('flow.live.answeringAt', { route: (live.path ? routeOf(live.path) : null) ?? p.route, computer: p.computer })}
            </>
          ) : (
            t('flow.live.madeAt', { route: (live.path ? routeOf(live.path) : null) ?? p.route, computer: p.computer })
          )}
        </Verdict>
        {/* Open is offered here only: the script was made a moment ago, and opening its address runs it (Try it does the same). */}
        <ScriptAddress origin={live.origin} path={(live.path ? routeOf(live.path) : null) ?? p.route} label={t('flow.live.url')} open />
        {p.link ? (
          <SubSection title={t('flow.live.linkTitle')}>
            <p className={f.fact} role="status" /* reason: the link's one-line state, announced in place (inline first) */>
              {link.k === 'made' ? t(link.url ? 'flow.live.linkMade' : 'flow.live.linkMadeNoUrl') : link.k === 'refused' ? t('flow.live.linkRefused') : link.k === 'unknown' ? t('flow.live.linkUnknown') : t('flow.live.linkSending')}
            </p>
            {/* The link's own address, whole, as the answer gave it: the kit's field of a value to copy, which draws a web
                address as a new-tab link beside its Copy. */}
            {link.k === 'made' && link.url ? <CopyField label={t('flow.rail.link')} value={link.url} copyName={t('share.copy')} /> : null}
            {link.k === 'made' && link.url ? <PropagatingNote variant="created" /> : null}
            {link.k === 'made' && linkFaq ? <Why question={t('share.who.q')} faq={{ item: linkFaq, label: t('share.more') }}>{t('flow.live.linkWhat')}</Why> : null}
          </SubSection>
        ) : null}
        {live.keys ? (
          <SubSection title={t('new.secretTitle')} description={t('new.secretBody')} state={READY}>
            {/* Each key is a secret, so a kit SecretField (masked until Show, wiped when the page goes; the terminal asks its
                screen before it shows or copies one), never a CopyField. The section says it is shown once, so no note. */}
            {Object.entries(live.keys).map(([k, v]) => <SecretField key={k} label={k} value={v} once={false} />)}
          </SubSection>
        ) : null}
        <InlineActions
          size="md"
          label={t('flow.live.doneActions')}
          // One primary per screen: the wizard's foot holds Finish, so Try it is an ordinary action here.
          actions={[
            { id: 'try', label: t('flow.live.try'), onPress: p.onTry },
            { id: 'open', label: t('flow.live.open'), onPress: p.onOpen },
            { id: 'another', label: t('flow.live.another'), onPress: p.onAnother },
          ]}
        />
      </AnatomySection>
    );
  }

  /** A refusal's banner and the actions that fix it (Make it live, Try again and Check are the band's own buttons). */
  const refusalOf = (e: LiveError) => ({
    banner: <OutcomeBanner kind={e.tone === 'not_sent' ? 'not_sent' : 'failed'} title={tr(e.title)} body={<><span>{tr(e.body)}</span>{e.extra ? <span> {tr(e.extra)}</span> : null}</>} /* noDetails: deploy.ts answers with a code, worded here; no rejection object reaches the page */ />,
    actions: e.actions.filter((a) => a !== 'makeLive' && a !== 'tryAgain' && a !== 'checkAgain'),
  });
  /** A refusal's own action (the first of them is the band's primary). */
  const liveAct = (a: LiveAction): AnyAction => ({ id: a, label: t(`flow.live.act.${a}` as never), onPress: () => p.onAction(a) });
  let band: React.ReactNode = null;
  if (live.k === 'refused') {
    const e = refusalOf(live.e);
    band = (
      <div className={f.band}>
        {e.banner}
        <InlineActions
          size="md"
          label={t('flow.live.bandActions')}
          actions={e.actions.slice(1).map(liveAct)}
          primary={e.actions.length > 0 ? liveAct(e.actions[0] as LiveAction) : undefined}
        />
      </div>
    );
  } else if (live.k === 'didnt') {
    // A Try again this tab could not send (after a reload: no checked code) says why and what fixes it; the reservation's own
    // Try again and Discard stay. A Check that found no script there says so, and offers the same send as Deploy again.
    const e = live.e ? refusalOf(live.e) : null;
    const absent = !e ? live.absent : null;
    // The refusal's own fix leads as the primary, else the send; Discard (warned: a didnt a Check found absent may still be
    // made by a request on its way, and after a reload nothing tells it from a send known not sent) is the least used, so
    // with four it goes in the More menu. Today refusalOf leaves a didnt at most one
    // fix (Check the code), so three are drawn.
    const send: AnyAction = { id: 'send', label: t(absent ? 'flow.live.act.deployAgain' : 'flow.live.act.tryAgain'), onPress: () => void p.api.send() };
    const discard: AnyAction = { id: 'discard', label: t('flow.live.discard'), onPress: () => setWarn('didnt') };
    const fixes = (e?.actions ?? []).map((a) => liveAct(a as LiveAction));
    const didntLead = fixes[0] ?? send;
    const others = fixes.length > 0 ? [...fixes.slice(1), send] : [];
    const four = others.length + 2 > 3;
    const didntShown = four ? others : [...others, discard];
    const didntMore = four ? [{ id: 'discard', label: t('flow.live.discard'), opens: true, onAction: () => setWarn('didnt') }] : [];
    band = (
      <div className={f.band}>
        {e ? e.banner : absent ? (
          absent.removed ? (
            <OutcomeBanner kind="not_sent" title={t('flow.live.removed.title')} body={t('flow.live.removed.body', { computer: p.computer, route: absent.route })} /* noDetails: the Check found no script at the path, and hoody-exec's journal says this deploy made it; worded here */ />
          ) : (
            <OutcomeBanner kind="not_sent" title={t('flow.live.absent.title')} body={t('flow.live.absent.body', { computer: p.computer, route: absent.route })} /* noDetails: the Check's read found no script at the path; worded here, the rejection stays in data.ts */ />
          )
        ) : <OutcomeBanner kind="not_sent" title={t('flow.live.didnt.title')} body={t('flow.live.didnt.body')} /* noDetails: read from the stored record (phase didnt), not from a rejection */ />}
        <InlineActions size="md" label={t('flow.live.bandActions')} actions={didntShown} primary={didntLead} more={didntMore} />
      </div>
    );
  } else if (live.k === 'held') {
    band = (
      <div className={f.band}>
        {/* The agent turned this request down, said as such without saying what happened to the deploy (it is held). */}
        {live.refusal ? <p className={f.fact}>{t('flow.live.held.refused', { computer: p.computer })}</p> : null}
        <OutcomeBanner kind="pending" title={t(live.refusal ? 'flow.live.held.titleRefused' : 'flow.live.held.title')} body={t('flow.live.held.body')} /* noDetails: an unknown outcome read from the stored record, not a rejection */ />
        {live.keyMaybe ? <p className={f.note}>{t('new.secretUnseen')}</p> : null}
        {live.check === 'not_known' || live.check === 'waiting' || live.check === 'kept' || live.check === 'unproven' || live.check === 'takenKept' ? (
          <p className={f.fact} role="status" /* reason: the Check's one-line answer, announced in place */>
            {live.check === 'waiting' ? t('flow.live.held.absentHeld') : live.check === 'kept' ? t('flow.live.held.absentKept') : live.check === 'unproven' ? t('flow.live.held.absentUnproven') : live.check === 'takenKept' ? t('flow.live.held.takenKept') : live.why ? `${t(`flow.live.why.${live.why}`, { computer: p.computer })} ${t('flow.live.held.notKnownWhy')}` : t('flow.live.held.notKnown')}
          </p>
        ) : null}
        <InlineActions
          size="md"
          label={t('flow.live.bandActions')}
          actions={[
            { id: 'openScripts', label: t('flow.live.act.openScripts'), onPress: () => p.onAction('openScripts') },
            { id: 'discard', label: t('flow.live.discard'), onPress: () => setWarn('held') },
          ]}
          primary={{ id: 'checkAgain', label: t('flow.live.act.checkAgain'), busy: live.check === 'checking', onPress: () => void p.api.checkAgain() }}
        />
      </div>
    );
  } else if (live.k === 'elsewhere') {
    band = <p className={f.fact} role="status">{t('flow.live.elsewhere')}{/* one-line live hint: another tab is sending this draft */}</p>;
  } else if (live.k === 'discarded') {
    band = (
      <div className={f.band}>
        <p className={f.fact}>{t('flow.live.discarded')}</p>
        <InlineActions size="md" actions={[]} primary={{ id: 'another', label: t('flow.live.another'), onPress: p.onAnother }} />
      </div>
    );
  }

  return (
    // The step's heading takes focus on arrival (the wizard's first heading: the step has no field).
    <AnatomySection id="new-live" title={t('flow.live.title')}>
      {/* One plate: what answers where once it is live, what happens then, and the facts that go live with it. */}
      <Verdict
        label={t('flow.live.goesLive')}
        next={t(p.off ? 'flow.live.startsOff' : 'flow.live.starts')}
        facts={(
          // Values sit next to their labels, as on Check it.
          <Facts
            columns={2}
            items={[
              // Values as nodes: Facts would autolink a string; the route and the computer's name are shown as written.
              { label: t('flow.rail.at'), value: <>{p.route}</>, mono: true },
              { label: t('flow.rail.on'), value: <ComputerLink name={p.computer} {...(p.compId ? { id: p.compId } : {})} variant="nav" /> },
              { label: t('flow.rail.runs'), value: p.ownSchedule ? t('flow.rail.ideaOwn') : p.schedule === null ? t('flow.where.onlyCalled') : `${p.schedule} UTC` },
              { label: t('flow.rail.link'), value: <>{p.link ? (p.linkName ? t('flow.check.linkWill', { name: p.linkName }) : t('flow.rail.linkOn')) : t('flow.rail.linkOff')}</> },
            ]}
          />
        )}
      >
        {t(p.off ? 'flow.live.leadOff' : 'flow.live.lead', { route: p.route, computer: p.computer })}
      </Verdict>
      {live.k === 'sending' ? <p className={f.fact} role="status">{t('flow.live.sending', { computer: p.computer })}{/* one-line live hint: the send is under way */}</p> : null}
      {band}
      {/* a made script returned above; a discarded draft has nothing to sign in for */}
      {live.k !== 'discarded' ? p.signIn : null}
      {p.api.discardNote ? <Band tone="danger" size="table" /* noDetails: the page's own read-back, the discard did not happen */>{t('flow.live.discardRefused')}</Band> : null}
      <ConfirmDialog
        overlayId="scripts-new-live-discard"
        isOpen={warn !== null}
        onOpenChange={(open) => { if (!open) setWarn(null); }}
        title={t('flow.live.discardWarn.title')}
        body={t(warn === 'didnt' ? 'flow.live.discardWarn.didntBody' : 'flow.live.discardWarn.body', { computer: p.computer })}
        confirmLabel={t('flow.live.discard')}
        cancelLabel={t('flow.live.discardWarn.keep')}
        onConfirm={() => { const phase = warn; setWarn(null); if (phase) void discard(phase); }}
      />
    </AnatomySection>
  );
}

/** The computer's Exec origin a script answers on ('' without a binding): its full URL is this plus its route. */
export const liveOrigin = (b: Binding | null, exec: number): string => (b ? buildPortUrl(b.target.project, b.target.container, 'exec', exec) : '');
