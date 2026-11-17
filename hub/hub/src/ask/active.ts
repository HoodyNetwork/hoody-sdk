// active.ts: an Ask engine as an ACTIVE conversation source. It is activateSource (kit/agent/activate.ts,
// the one door: every action is checked with can() when it is called) over the read source (ask/source.ts), with SourceOps built on a
// pinned AskEngine and the readiness facts read from the live journal, attachment lease and approver lease.
//
// The engine's methods return nothing (or whether a send was taken); what became of a request shows only in LATER
// snapshots. So each operation reads its outcome from the snapshots that follow it, and anything the snapshots do not prove
// is `unknown` (C9): a send still sending when the wait ends, a user row that vanished, an ended engine, a gate that left
// without our decision being recorded as applied. Nothing here mints a key or sends around the engine: the row actions call
// the engine's own resend, retry and take-back on a row whose outcome is DEFINITE (Not sent; the prompt of a failed turn), and a
// journaled engine puts a resent row under a NEW key because the old one was refused, never an unknown one. The engine writes
// its key to the journal before the first request; this module only reads.
import { makeT } from '@kit';
import { approvers } from '@kit/agent/approver-live';
import { approverFactOf, activateSource, type Readiness } from '@kit/agent/activate';
import { leases } from '@kit/agent/lease';
import type { RateLimitReading } from '@kit/agent/rateLimit';
import type { ActiveConversationProvider, StartAt, StartAuto, StartDoor, StartOpts, StartPhase, StartState, Starter } from '@kit/agent/conversationsActive';
import { can, type Action, type Capability } from '@kit/agent/capability';
import { createShellJobStops, type JobAttemptView, type ShellJobStops, type ShellJobStopsSnapshot, type StopResult } from '@kit/agent/shellJobStop';
import { fixtureModeActive, hostEnv, type Target } from '@core';
import type { ActiveSource, Answer, DraftFile, ConvRef, ConvSnapshot, Decision, Draft, ForkOutcome, ForkRowView, GateRef, PendingRef, SendOutcome, TakeBack, WithdrawOutcome } from '@kit/agent/source';
import * as A from './attach';
import { objectUrl } from './objectUrl';
import * as C from './conv';
import { shellJobsIO, type ShellJobsIO } from './data';
import { targetOf, type AskEngine, type CardView, type Slot, type Snapshot, type StartOutcome } from './engine';
import type * as F from './fork';
import { currentAccount, type Entry } from './journal';
import * as L from './logic';
import { engineFor, openRef, subscribeAll, subscribeUnsettled, unsettledSends } from './registry';
import { takeApprovalAttempt } from '@kit/agent/useApproval';
import { canEdit, canResend, canWithdraw, fileCount, requestOf, retryFor, retryWaits } from './rowActions';
import { engineSource, type EngineSource, type Host } from './source';
import strings from './strings.en.json';

const words = makeT(strings);

/** How long an operation waits for its outcome to show before it answers `unknown` (the snapshots still tell the truth). */
export const WAIT_MS = 20_000;

/** The pieces the adapter reads, so a test can supply fakes. Defaults are the page's own. */
export interface ActiveDeps {
  approvers: Pick<ReturnType<typeof approvers>, 'state' | 'subscribe'>;
  /** `forget`: try a lease again after `gone` (a chat that was asleep is awake again); a fake without it never retries. */
  leases: Pick<ReturnType<typeof leases>, 'track' | 'state' | 'subscribe'> & Partial<Pick<ReturnType<typeof leases>, 'forget'>>;
  pending(handle: string): readonly Entry[];
  onPending(fn: () => void): () => void;
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
  /** Bytes of a base64 string, or null when it is not base64. */
  decode(b64: string): Uint8Array | null;
  /** An address for a sent image's bytes, so the message shows its picture (the engine lets it go with the conversation, or at once
   *  when the image is not kept). Absent: the message shows the image's name only. */
  url?(bytes: Uint8Array, media: string): string;
  waitMs: number;
  /** The chat's shell jobs; without it the source has none. */
  jobs?: JobsDeps;
}

/** What the shell-job store of a source needs from the page. */
export interface JobsDeps {
  /** The calls for the computer the engine was opened on; null where there is no live agent (fixture mode). */
  io(at: { project: string; computer: string; server?: string }): ShellJobsIO | null;
  /** A fresh idempotency key, one per press. */
  newKey(): string;
  /** How often the list is read again while a surface holds the store and the page is visible (ms). */
  every: number;
  /** The page is visible now. */
  visible(): boolean;
  /** Called when the page's visibility changes; returns the unsubscribe. */
  onVisibility(fn: () => void): () => void;
}

const SHELL_JOBS_EVERY_MS = 15_000;

const liveJobs = (): JobsDeps => ({
  io: (at) => (__HUB_FIXTURES__ && fixtureModeActive() ? null : shellJobsIO(at)),
  newKey: () => crypto.randomUUID(),
  every: SHELL_JOBS_EVERY_MS,
  visible: () => hostEnv().visible(),
  onVisibility: (fn) => hostEnv().onVisibilityChange(fn),
});

function decode(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

export const liveDeps = (): ActiveDeps => ({
  approvers: approvers(), leases: leases(), pending: unsettledSends, onPending: subscribeUnsettled,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>), decode, url: objectUrl, waitMs: WAIT_MS, jobs: liveJobs(),
});

const cardOf = (s: Snapshot, g: GateRef): CardView | undefined => s.gates.find((c) => c.gate.id === g.id && c.gate.generation === g.generation);
const done: SendOutcome = { k: 'done' };
const unknown: SendOutcome = { k: 'unknown' };
const refused = (code: string): SendOutcome => ({ k: 'refused', code });
/** What this adapter's operations refuse whatever the facts say, ahead of the capability table: the engine has no stop of the whole
 *  chat (ops.stop), so no surface may offer one. The active source's can() asks it first, so can() and the ops agree (the read
 *  side's can() is never asked: activateSource reads only its snapshot, and its facts refuse every write as read_only). */
const NO_CHAT_STOP: Capability = { ok: false, reason: 'unsupported' };
const refusedHere = (a: Action): Capability | null => (a === 'stopChat' ? NO_CHAT_STOP : null);
/** One draft text file as the engine's text part: kind and text kept as the host read them (attach.ts prepare's text branch, without
 *  the sniff and decode the host already did). Its contract: `f.text` is a string from readFiles/decodeText, so valid UTF-8 with no NUL;
 *  a direct caller of Draft.files must hold to that, since nothing here checks it again. */
function textPart(id: string, f: { name: string; text: string; from?: string }): A.Prepared {
  const name = A.safeName(f.name, 'file');
  if (typeof f.text !== 'string' || !f.text.trim()) return { ok: false, why: { key: 'ask.attEmpty', name } };
  const bytes = new TextEncoder().encode(f.text).length;
  if (bytes > A.TXT_BYTES) return { ok: false, why: { key: 'ask.attTextBig', name, size: bytes } };
  const from = typeof f.from === 'string' ? A.originToken(f.from) : '';
  return { ok: true, att: { id, kind: 'text', name, text: f.text, bytes, lines: f.text.replace(/\n$/, '').split('\n').length, ...(from ? { from } : {}) } };
}

/** The journal's entries for this chat that nothing in the snapshot shows yet and that a Check can answer: a send is shown by its
 *  row (same key), a decision by its card while the card says it is on its way or lost (activate.ts counts those); a stop, or a
 *  decision whose card is gone, still needs Check status. An interrupt entry no row shows is never counted: check() refuses an
 *  interrupt, so counting it would offer a Check the adapter then declines. (A reopened chat shows a journaled interrupt as its own
 *  unknown command row, records.ts k3 -> the engine's reopen; that row has the entry's key, so it is counted by the read side and
 *  checked as that row, never here.) */
export function unsettledOf(entries: readonly Entry[], ref: ConvRef, s: Snapshot): number {
  const keys = new Set(Object.values(s.conv.users).map((u) => u.key));
  const shown = new Set(s.gates.filter((c) => c.decision !== null).map((c) => `${c.gate.id}|${c.gate.generation}`));
  return entries.filter((e) => {
    if (e.h !== ref.computer || e.r !== ref.realm || e.s !== ref.sid) return false;
    if (e.kind === 'interrupt') return false;
    if (e.kind === 'decision' || e.kind === 'answer') return !(e.g !== undefined && shown.has(`${e.g}|${e.gn}`));
    return !keys.has(e.k);
  }).length;
}

/** What a Check names, or what one of its sources (an attempt, a card, a journal entry) is about: the computer, realm, session, the
 *  card or request key and the kind. The ONE test every source goes through: a source answers a Check only when all five agree,
 *  so no source (and no chat-wide count) can stand in for the thing named. A decision is the card's gate id; a journal decision or
 *  answer entry is a `decision`; every other entry is its own kind under its own key. */
export interface CheckIdentity { computer: string; realm: string; sid: string; key: string; kind: PendingRef['kind'] }
export const sameCheck = (a: CheckIdentity, b: CheckIdentity): boolean =>
  a.computer === b.computer && a.realm === b.realm && a.sid === b.sid && a.key === b.key && a.kind === b.kind;
/** The identity a journal entry holds, or null when it cannot name what it is about (a decision without its gate). */
export function entryIdentity(e: Entry): CheckIdentity | null {
  if (e.kind === 'decision' || e.kind === 'answer') return e.g ? { computer: e.h, realm: e.r, sid: e.s ?? '', key: e.g, kind: 'decision' } : null;
  return { computer: e.h, realm: e.r, sid: e.s ?? '', key: e.k, kind: e.kind };
}

const draftFileOf = (a: A.Att): DraftFile => ({
  id: a.id, kind: a.kind, name: a.name, url: a.kind === 'image' ? a.url : null, bytes: a.bytes, lines: a.kind === 'text' ? a.lines : 0,
  ...(a.kind === 'image' && a.resized ? { resized: a.resized } : {}),
});
const sameDraftFile = (a: DraftFile, b: DraftFile): boolean =>
  a.id === b.id && a.kind === b.kind && a.name === b.name && a.url === b.url && a.bytes === b.bytes && a.lines === b.lines
  && a.resized?.from === b.resized?.from && a.resized?.to === b.resized?.to;

export interface EngineActive extends ActiveSource {
  /** Lets the engine and the attachment hold go, once. */
  release(): void;
}

/** The engine's fork outcome in the host's words (a strings key the engine owns; one this build does not know reads as "may have been made"). */
export function forkOutcome(o: F.ForkOutcome): ForkOutcome {
  const say = (key: string): string => words((key in strings ? key : 'ask.forkMade') as Parameters<typeof words>[0]);
  // An outcome stamped with the account it was decided for carries the guard a host reads in the turn it acts (kit forkNow).
  const acct = o.acct;
  const guard = acct === undefined ? {} : { guard: { still: () => currentAccount() === acct, moved: { words: say('ask.forkAccount'), k1: o.asked ?? '' } } };
  if (o.k === 'opened') return { k: 'opened', sid: o.sid, ...guard };
  if (o.k === 'refused') return { k: 'refused', words: say(o.key), reason: o.reason, ...guard };
  return { k: 'unknown', words: say(o.key), reason: o.reason, k1: o.k1, ...guard };
}

export function engineActive(handle: { current(): AskEngine; release(): void; onSwap?(fn: () => void): () => void }, ref: ConvRef, host: () => Host, deps: ActiveDeps = liveDeps()): EngineActive {
  const source = engineSource(handle, ref, host);
  const eng = (): AskEngine => handle.current();
  // The read source cannot say the chat's approval mode (it is read-only and every write is refused for that). The mode is a fact
  // the table needs: a Strict chat's sends wait for a HELD approver lease (capability.ts), and nothing else enforces that. A chat
  // whose mode was not read yet counts as Strict (engine.activation), so it cannot send around the lease while it is unknown.
  let facts: { base: ConvSnapshot; strict: boolean; queued: number; snap: ConvSnapshot } | null = null;
  const read: EngineSource = {
    ...source,
    snapshot() {
      const base = source.snapshot(), strict = eng().activation().strict;
      // A queued follow-up has no outcome yet either (the read side counts only unknown rows): Check status must see it.
      const queued = Object.values(eng().getSnapshot().conv.users).filter((u) => u.state === 'queued').length;
      if (facts && facts.base === base && facts.strict === strict && facts.queued === queued) return facts.snap;
      const snap: ConvSnapshot = { ...base, facts: { ...base.facts, approval: strict ? 'always' : 'default', unsettledSends: base.facts.unsettledSends + queued } };
      facts = { base, strict, queued, snap };
      return snap;
    },
    can: (a) => can(a, read.snapshot().facts),
  };

  // ---- readiness ----
  // The attachment hold is tracked once the chat's lease address is known and the engine found the chat ready, and PINNED for as
  // long as a surface holds this source: an idle chat takes no lease otherwise, and the prerequisite is a HELD lease, never the mere absence of `gone`. Until the lease is
  // held (acquiring, failing, or not yet tracked) every send is refused by the table. A hold too many while the engine streams is
  // harmless; a hold too few lets the agent close the chat under a waiting approval.
  let hold: { h: ReturnType<ActiveDeps['leases']['track']>; key: string } | null = null;
  let released = false;
  // The lease manager tells its subscribers synchronously from inside track() (phase `acquiring`) and close(): a subscriber that
  // syncs the hold meets this call half done, so a call made while one is under way does nothing (the one under way finishes it).
  let taking = false;
  const holdKeyOf = (a: ReturnType<AskEngine['activation']>): string | null => (a.ref ? `${a.ref.computer}|${a.ref.realm}|${a.ref.sid}` : null);
  const holdFor = (a: ReturnType<AskEngine['activation']>, again = true): typeof hold => {
    const key = holdKeyOf(a);
    if (!a.ref || key === null || released || taking) return null;
    // Only a chat the engine has read and found ready is held: one still being looked at, blocked (gone, forbidden, offline) or
    // ended makes no attachment request. A hold already taken is kept through a transient block (a hold too few lets the agent
    // close the chat under a waiting approval); it moves to a new address only once that is ready.
    if (eng().getSnapshot().phase !== 'ready') return hold;
    if (hold && hold.key === key) return hold;
    taking = true;
    try {
      const old = hold;
      hold = null;
      old?.h.close();
      const h = deps.leases.track({ computer: a.ref.computer, realm: a.ref.realm, sid: a.ref.sid as string, target: a.ref.target as never }, { busy: false, streaming: false, pinned: true });
      // Released while the manager was telling its subscribers: nobody is left to close this handle.
      if (released) h.close(); else hold = { h, key };
    } finally {
      taking = false;
    }
    // The chat's address may have changed while the manager was telling its subscribers (their sync was skipped as re-entrant):
    // once more for the newer one, never a loop.
    if (again && !released) { const b = eng().activation(); if (holdKeyOf(b) !== null && holdKeyOf(b) !== hold?.key) return holdFor(b, false); }
    return hold;
  };
  /** Takes the attachment hold once the chat is named. Called when the surface subscribes and on every change, never from a
   *  snapshot read (a read has no side effect). */
  // The agent grants a lease for a LIVE chat only: on a chat it put to sleep the acquire answers 404 and the manager stops at `gone`.
  // When the chat is awake again (the person's message woke it, or another client did), the lease is tried once more.
  let asleep = false;
  const syncHold = () => {
    const a = eng().activation();
    holdFor(a);
    const now = eng().getSnapshot().dormant;
    const woke = asleep && !now;
    asleep = now;
    if (woke && a.ref) {
      const ref = { computer: a.ref.computer, realm: a.ref.realm, sid: a.ref.sid as string, target: a.ref.target as never };
      if (deps.leases.state(ref).phase === 'gone') deps.leases.forget?.(ref);
    }
  };
  const readiness = (): Readiness => {
    const e = eng(), a = e.activation();
    const lease = a.ref ? deps.leases.state({ computer: a.ref.computer, realm: a.ref.realm, sid: a.ref.sid as string, target: a.ref.target as never }) : null;
    const approver = a.ref ? approverFactOf(a.strict, deps.approvers.state(a.ref)) : a.strict ? 'missing' : 'notNeeded';
    const r: Readiness = {
      journal: a.journal,
      // By-key recovery is the journal's own read-back (checkById): a journaled engine has it.
      recovery: a.journal,
      // A chat the computer put to sleep holds nothing a lease would keep (no turn, no parked gate) and cannot get one until it is
      // awake: the person's message wakes it first (engine wakeThen), so the missing lease does not hold the send back.
      attachment: lease?.phase === 'held' || e.getSnapshot().dormant,
      approver,
    };
    return r;
  };

  // ---- waiting for an outcome ----
  /** Resolves `settle(snapshot)` as soon as it answers, else `unknown` when the wait ends or the engine does. `cancel`: the
   *  caller answered without it; nothing is left running. */
  const until = (e: AskEngine, settle: (s: Snapshot) => SendOutcome | null): { p: Promise<SendOutcome>; cancel(): void } => {
    let off: (() => void) | null = null;
    let timer: unknown = null;
    let over = false;
    let res: (o: SendOutcome) => void = () => undefined;
    const p = new Promise<SendOutcome>((resolve) => { res = resolve; });
    const finish = (o: SendOutcome) => {
      if (over) return;
      over = true;
      if (timer !== null) deps.clear(timer);
      queueMicrotask(() => off?.());
      res(o);
    };
    const look = () => {
      if (over) return;
      const s = e.getSnapshot();
      // An ended engine proves nothing about a request in flight (its conversation is cleared on the way out): unknown, always.
      const o = s.phase === 'ended' ? unknown : settle(s);
      if (o) finish(o);
    };
    off = e.subscribe(look);
    timer = deps.set(() => finish(unknown), deps.waitMs);
    look();
    return { p, cancel: () => finish(unknown) };
  };

  const userOutcome = (state: C.SendState): SendOutcome | null => {
    switch (state) {
      case 'sent': case 'queued': return done;
      case 'notSent': return refused('not_sent');
      case 'refused': return refused('refused');
      case 'superseded': return refused('superseded');
      case 'unknown': return unknown;
      default: return null;
    }
  };

  // ---- the operations ----
  /** The draft's images and text files go into the engine's draft, as the dock's own picks do (engine.attach, then the message's
   *  UserMsg.imgs/files): text files are parts, under the dock's 24 KB file and 28 KB message rules, never folded into the typed
   *  text. `own` is told the ids this call may have put in the draft BEFORE the engine is asked to attach them, so a throw can be
   *  undone. */
  const attachParts = (e: AskEngine, d: Draft, own: (ids: string[]) => void): { ids: string[] } | SendOutcome => {
    const list: A.Prepared[] = [];
    let n = 0;
    // Every image is decoded before any gets an address: a bad one refuses the send with nothing made to let go.
    const decoded = (d.images ?? []).map((im) => ({ name: im.name, bytes: deps.decode(im.data) }));
    if (decoded.some((x) => !x.bytes)) return refused('bad_image');
    for (const { name, bytes } of decoded) {
      if (!bytes) continue;
      // The engine's own copy gets its own address: the composer lets its thumbnail go when the send is taken, the sent row keeps this one.
      list.push(A.prepare(`i${Date.now().toString(36)}${n++}`, name, bytes, () => deps.url?.(bytes, A.sniff(bytes) ?? 'application/octet-stream') ?? ''));
    }
    // A text file the host already read as text stays text, its text exactly as given: it is never re-encoded and prepared again
    // (that would sniff it anew, so a text beginning "BM" after its BOM could turn into an image, and strip a second BOM). Only what
    // a send needs is judged here: a string, not blank, within the per-file size; the count and the message size are engine.attach's
    // (A.admit), as for a picked file.
    for (const f of d.files ?? []) list.push(textPart(`t${Date.now().toString(36)}${n++}`, f));
    const mine = list.flatMap((p) => (p.ok ? [p.att.id] : []));
    own(mine);
    const before = new Set(e.getSnapshot().att.items.map((x) => x.id));
    e.attach(list, d.text);
    const att = e.getSnapshot().att;
    const kept = mine.filter((id) => att.items.some((x) => x.id === id && !before.has(id)));
    if (kept.length !== list.length) {
      for (const id of kept) e.unattach(id);
      own([]);
      return refused('attachment_refused');
    }
    return { ids: kept };
  };

  const send = async (d: Draft, o?: { autoApproveTurn?: boolean }): Promise<SendOutcome> => {
    const e = eng();
    // "Auto-approve this reply": this one message goes as a fresh turn carrying the policy, or not at all (engine.autoTurnBlock).
    const policy = o?.autoApproveTurn ? 'auto_approve' as const : undefined;
    if (policy && e.autoTurnBlock()) return refused('auto_turn_unavailable');
    const had = new Map(Object.entries(e.getSnapshot().conv.users).map(([id, u]) => [id, u.state] as const));
    let added: string[] = [];
    let row: { id: string; key: string } | null = null;
    try {
      if (d.images?.length || d.files?.length) {
        const r = attachParts(e, d, (ids) => { added = ids; });
        if ('k' in r) return r;
      }
      const ok = e.send(d.text, d.anyway === true, undefined, policy);
      if (!ok) {
        for (const id of added) e.unattach(id);
        return refused(e.getSnapshot().dup ? 'duplicate_held' : 'not_sent');
      }
      // The row this send made (or, without a journal, the lost row the retyped text went under): exactly one, else unknown.
      const now = e.getSnapshot().conv.users;
      const mine = Object.keys(now).filter((id) => !had.has(id) || (had.get(id) !== 'sending' && now[id]?.state === 'sending'));
      if (mine.length !== 1) return unknown;
      row = { id: mine[0] as string, key: now[mine[0] as string]?.key ?? '' };
    } catch (x) {
      // The call threw: whatever it attached must not ride a later, unrelated message. The wrapper above reads the throw as unknown.
      for (const id of added) { try { e.unattach(id); } catch { /* already gone */ } }
      throw x;
    }
    return settleRow(e, row.id, row.key);
  };

  /** What became of ONE request, read from the row it made: `done` only on proof it was taken, `refused` only when it was not, and
   *  `unknown` for anything else. The row is bound by its id AND the key this call put it under; the row gone, or carrying another
   *  request's key, says nothing about THIS one. */
  const settleRow = (e: AskEngine, uid: string, key: string): Promise<SendOutcome> => {
    // A first message whose session does not exist yet is created under the CREATE key, which a later attempt replaces while the row's
    // own key stays: the first create key the wait sees is its attempt's, and another one is another attempt (unknown). The create key
    // leaving the snapshot is the session being made, not another attempt.
    let create: string | undefined;
    return until(e, (s) => {
      const u = s.conv.users[uid];
      if (!u || u.key !== key) return unknown;
      if (u.via === 'create' && s.createKey !== undefined) {
        if (create !== undefined && create !== s.createKey) return unknown;
        create = s.createKey;
      }
      return userOutcome(u.state);
    }).p;
  };
  /** The rows a resend or a retry is waiting on: a second one on the same row while the first waits is refused, so no wait can ever
   *  follow another attempt's request (the engine takes a row's resend, and a retry's message, as separate attempts). */
  const flights = new Set<string>();
  const flight = (id: string, run: () => Promise<SendOutcome>): Promise<SendOutcome> => {
    if (flights.has(id)) return Promise.resolve(refused('busy'));
    flights.add(id);
    let p: Promise<SendOutcome>;
    try { p = run(); } catch (x) { flights.delete(id); throw x; }
    return p.finally(() => { flights.delete(id); });
  };

  /** The user row a request names (its key AND kind through the same identity test Check uses), or undefined. */
  const rowFor = (s: Snapshot, p: PendingRef): C.UserMsg | undefined => {
    const chat = { computer: ref.computer, realm: ref.realm, sid: ref.sid };
    return Object.values(s.conv.users).find((u) => sameCheck({ ...chat, key: p.key, kind: p.kind }, { ...chat, ...requestOf(u, s) }));
  };

  /** Send again a message the agent definitely did not take. The engine puts the row under a NEW key (a tried key is never asked again
   *  with a journal), once, inside this call: the wait is bound to the row and to THAT key, so a row republished under any other key
   *  afterwards is another request's and answers `unknown`. */
  const resend = async (p: PendingRef): Promise<SendOutcome> => {
    const e = eng();
    const row = rowFor(e.getSnapshot(), p);
    if (!row) return refused('nothing_to_resend');
    if (!canResend(row)) return refused('not_resendable');
    const uid = row.id;
    return flight(uid, async () => {
      e.resend(uid);
      const u = e.getSnapshot().conv.users[uid];
      // The engine left the row unchanged (it could not take it): nothing went.
      if (!u || u.state === 'notSent') return refused('not_sent');
      return settleRow(e, uid, u.key);
    });
  };

  /** Retry the prompt of the newest failed turn, as a new message (its own text and files). It makes a NEW row: found as `send` finds
   *  its row, and waited on the same way. */
  const retry = async (p: PendingRef): Promise<SendOutcome> => {
    const e = eng();
    const s0 = e.getSnapshot();
    const row = rowFor(s0, p);
    if (!row) return refused('nothing_to_retry');
    const bs = C.blocks(s0.conv, Date.now());
    const last = bs[bs.length - 1];
    if (!(last && last.k === 'outcome' && !retryWaits(last, Date.now()) && retryFor(last, true) === row.id)) return refused('not_retryable');
    const had = new Map(Object.entries(s0.conv.users).map(([id, u]) => [id, u.state] as const));
    return flight(row.id, async () => {
      if (!e.retryMsg(row.id)) return refused(e.getSnapshot().dup ? 'duplicate_held' : 'not_sent');
      const now = e.getSnapshot().conv.users;
      const mine = Object.keys(now).filter((id) => !had.has(id) || (had.get(id) !== 'sending' && now[id]?.state === 'sending'));
      if (mine.length !== 1) return unknown;
      return settleRow(e, mine[0] as string, now[mine[0] as string]?.key ?? '');
    });
  };

  /** Take a Not sent message back to the draft: a local change, nothing is sent. Its text crosses; its files stay in the engine's draft
   *  and only their count crosses. */
  const takeBack = (p: PendingRef): TakeBack => {
    const e = eng();
    const row = rowFor(e.getSnapshot(), p);
    if (!row) return { k: 'refused', code: 'nothing_to_take_back' };
    if (!canEdit(row)) return { k: 'refused', code: 'not_editable' };
    const files = fileCount(row);
    // All or nothing: a message comes back only when every one of its files fits the draft (count, images, size); otherwise the row and
    // the draft stay as they are and Edit says why. A refused file is never dropped with its row.
    if (files > 0 && A.admit(e.getSnapshot().att.items, [...(row.imgs ?? []), ...(row.files ?? [])], '').refused.length > 0) return { k: 'refused', code: 'draft_full' };
    const text = e.takeBack(row.id);
    return text === null ? { k: 'refused', code: 'not_sent' } : { k: 'text', text, files };
  };

  /** Edit or Remove on a queued follow-up: the engine asks the agent to take it back, once for the row (a second press while the first is
   *  out or unknown is refused by the engine's own row state). */
  const withdraw = async (p: PendingRef, then: 'remove' | 'edit'): Promise<WithdrawOutcome> => {
    const e = eng();
    const row = rowFor(e.getSnapshot(), p);
    if (!row) return { k: 'refused', code: 'nothing_to_withdraw' };
    if (!canWithdraw(row)) return { k: 'refused', code: 'not_withdrawable' };
    return e.withdraw(row.id, then);
  };

  const decideLike = async (g: GateRef, kind: CardView['gate']['kind'], go: (e: AskEngine) => string | null): Promise<SendOutcome> => {
    const e = eng();
    const s0 = e.getSnapshot();
    const c0 = cardOf(s0, g);
    if (!c0 || c0.gate.kind !== kind) return refused('no_gate');
    const key = c0.key;
    // The engine names THIS call's request (null: it took nothing, e.g. the card is already claimed by another call). Everything
    // after is judged by that id alone: another call's attempt, proof or a flag an earlier call left never answers this one.
    const rid = go(e);
    if (!rid) return refused('not_applied');
    return until(e, () => {
      const p = e.decisionProof(rid);
      if (p === 'applied') return done;
      if (p === 'elsewhere') return refused('decided_elsewhere');
      if (p === 'chatElsewhere') return refused('chat_elsewhere');
      if (p === 'notKept') return refused('not_kept');
      if (p === 'refused' || p === 'notTaken') return refused('not_applied');
      const a = e.attemptOf(key);
      if (a && a.rid === rid) return a.status === 'unknown' ? unknown : null;
      // No attempt of ours yet: our claim still waits for the cross-tab lock (asked by its id: the card may already have left, and the
      // claim then proves notTaken). Otherwise the attempt is gone with no proof either way (another tab settled it): not known.
      return e.claimWaiting(rid) ? null : unknown;
    }).p;
  };

  const keyOf = (g: GateRef): string | undefined => cardOf(eng().getSnapshot(), g)?.key;

  // ---- shell jobs ----
  // One store per source, made on first use for the computer the engine was opened on (its slot), and dropped with the source.
  // Every read of the list goes through ONE host gate, for the timer, the turn edges and a person's Check again or refresh
  // alike (the surface gets only the gated operations, never the store's own read methods). The gate reads only while a
  // surface holds the store, the page is visible and the source is not released, and never while a Stop is on its way. A read
  // is a pass: one list request, whose answer every check of the pass reads in turn (the store settles an attempt only from its
  // newest read, so the checks run one after another on that one answer). A check asked while a pass runs joins it; one asked
  // while a Stop is sending waits for that Stop to settle, then reads once. A timer or edge tick checks every attempt whose
  // answer was lost (a read, never the stop again) and otherwise reads the list. A check asked but not yet begun (waiting for a
  // Stop, or queued behind the pass's earlier checks) is shown as checking, and no Stop is pressed on it, as for a check on its way.
  let jobs: { store: ShellJobStops; stop(): void } | null = null;
  const makeJobs = (J: JobsDeps, gate: () => Capability): typeof jobs => {
    const slot = eng().slot;
    const io = J.io({ project: slot.project, computer: slot.computer, server: slot.server });
    if (!io) return null;
    type ListAnswer = Awaited<ReturnType<ShellJobsIO['list']>>;
    /** A pass: its one list answer, the checks to run on it, and its end. */
    type Pass = { answer: Promise<ListAnswer> | null; queue: string[]; begun: number; done: Promise<void> };
    let pass: Pass | null = null;
    const listOnce = (c: { realm: string; sid: string }): Promise<ListAnswer> => {
      if (!pass) return io.list(c);
      pass.answer ??= io.list(c);
      return pass.answer;
    };
    const store = createShellJobStops({
      chat: { computer: ref.computer, realm: ref.realm, sid: ref.sid },
      list: listOnce,
      stop: (t, key) => io.stop(t, key),
      newKey: () => J.newKey(),
      can: gate,
    });
    let subs = 0, timer: unknown = null, edge = '', offEng: (() => void) | null = null, offSwap: (() => void) | null = null, offVis: (() => void) | null = null, offStore: (() => void) | null = null;
    /** Checks asked while a Stop was sending, run once it settles. */
    const waiting = new Set<string>();
    /** The surface's own listeners: told when an asked check is deferred or begins, beside the store's changes. */
    const told = new Set<() => void>();
    const tell = (): void => { for (const f of [...told]) f(); };
    /** Checks asked and not yet begun: their attempts read as checking. */
    const deferred = (): Set<string> => new Set([...waiting, ...(pass ? pass.queue.slice(pass.begun) : [])]);
    let shownFrom: ShellJobStopsSnapshot | null = null, shownKey = '', shown: ShellJobStopsSnapshot | null = null;
    /** The store's snapshot, with every deferred check drawn as checking; the same object until either changes. */
    const view = (): ShellJobStopsSnapshot => {
      const base = store.snapshot();
      const ids = [...deferred()].filter((id) => { const a = base.attempts.get(id); return a?.phase === 'unknown' && !a.checking; });
      const key = ids.sort().join('\n');
      if (base === shownFrom && key === shownKey && shown) return shown;
      shownFrom = base; shownKey = key;
      if (ids.length === 0) { shown = base; return base; }
      const attempts = new Map<string, JobAttemptView>(base.attempts);
      for (const id of ids) attempts.set(id, { phase: 'unknown', checking: true });
      shown = { ...base, attempts };
      return shown;
    };
    const sending = (): boolean => [...store.snapshot().attempts.values()].some((a) => a.phase === 'sending');
    const open = (): boolean => subs > 0 && !released && J.visible();
    const lost = (): string[] => [...store.snapshot().attempts].filter(([, a]) => a.phase === 'unknown' && !a.checking).map(([id]) => id);
    /** Starts a pass for `ids` (none: a plain read), or joins the running one. Resolves when that pass ends. */
    const read = (ids: readonly string[]): Promise<void> => {
      if (pass) {
        for (const id of ids) if (!pass.queue.includes(id)) pass.queue.push(id);
        tell();
        return pass.done;
      }
      const p: Pass = { answer: null, queue: [...ids], begun: 0, done: Promise.resolve() };
      pass = p;
      p.done = (async () => {
        try {
          if (p.queue.length === 0) await store.refresh();
          for (let i = 0; i < p.queue.length; i++) { p.begun = i + 1; await store.check(p.queue[i]!); }
        } catch {
          // The store answers every read itself (an unreadable list is its own state); nothing here is an outcome.
        } finally {
          if (pass === p) { pass = null; tell(); }
        }
      })();
      if (p.queue.length > 1) tell(); // the checks after the first wait their turn in this pass
      return p.done;
    };
    /** The one gate every read passes. */
    const gated = (ids: readonly string[]): Promise<void> => {
      if (!open()) return Promise.resolve();
      if (sending()) { for (const id of ids) waiting.add(id); if (ids.length) tell(); return Promise.resolve(); }
      return read(ids);
    };
    const tick = (): void => { if (!pass) void gated(lost()); };
    const onStore = (): void => {
      if (waiting.size === 0 || sending() || !open()) return;
      const ids = [...waiting].filter((id) => lost().includes(id));
      waiting.clear();
      void read(ids);
    };
    const arm = (): void => {
      // A listener told during the tick can release the source (stop() then finds no timer to clear): a released source arms nothing,
      // here for the callback's rearm and for start() alike.
      if (released) return;
      timer = deps.set(() => { timer = null; tick(); if (subs) arm(); }, J.every);
    };
    const edgeOf = (): string => { const t = C.current(eng().getSnapshot().conv); return t ? `${t.s.turnId ?? ''}|${C.running(t) ? 1 : 0}` : ''; };
    const start = (): void => {
      // A released source starts no watch: a store a caller kept can be subscribed again (or the last subscriber can leave and come back
      // inside stop()'s own notice), and nothing would ever call that watch off.
      if (released) return;
      // Bound to the engine under the handle now, and again whenever the handle moves to another (a lent dock engine handed over).
      const bind = (): void => { offEng?.(); edge = edgeOf(); offEng = eng().subscribe(() => { const e = edgeOf(); if (e !== edge) { edge = e; tick(); } }); };
      bind();
      // The announcement walks a copy of the callbacks: one that runs after this watch stopped (its last subscriber left, or an earlier
      // callback released the source with a subscriber still there) binds nothing.
      offSwap = handle.onSwap?.(() => { if (subs === 0 || released) return; bind(); tick(); }) ?? null;
      offVis = J.onVisibility(() => { if (J.visible()) tick(); });
      offStore = store.subscribe(onStore);
      arm();
      tick();
    };
    const stop = (): void => {
      if (timer !== null) { deps.clear(timer); timer = null; }
      offEng?.(); offVis?.(); offStore?.(); offSwap?.();
      offEng = offVis = offStore = offSwap = null;
      waiting.clear();
      tell();
    };
    const BUSY: StopResult = { k: 'refused', why: 'busy' };
    const held: ShellJobStops = {
      snapshot: view,
      canStop: (jobId) => (deferred().has(jobId) ? BUSY : store.canStop(jobId)),
      stop: (jobId) => (deferred().has(jobId) ? Promise.resolve(BUSY) : store.stop(jobId)),
      refresh: () => gated([]),
      check: (jobId) => (lost().includes(jobId) ? gated([jobId]) : Promise.resolve()),
      subscribe(fn) {
        const off = store.subscribe(fn);
        const mine = (): void => fn();
        told.add(mine);
        if (subs++ === 0) start();
        let done = false;
        return () => { if (done) return; done = true; off(); told.delete(mine); if (--subs === 0) stop(); };
      },
    };
    return { store: held, stop };
  };

  const ops = {
    send,
    async stop(scope: 'turn' | 'chat'): Promise<SendOutcome> {
      // The engine can cancel the running turn; it has no stop of the whole chat.
      if (scope === 'chat') return refused('unsupported');
      const e = eng();
      const t0 = C.current(e.getSnapshot().conv);
      if (!t0 || !C.running(t0)) return refused('no_turn');
      // On its way, or its answer lost: a second cancellation is never sent (the attempt reads it as unknown).
      if (t0.s.stopping || t0.s.stopUnsure) return refused('stop_pending');
      const id = t0.s.turnId;
      let sawStopping = false;
      const w = until(e, (s) => {
        // Evidence about THIS turn only: a missing turn, or a newer one, says nothing about whether our cancel took.
        const t = s.conv.turns.find((x) => x.s.turnId === id);
        if (!t) return unknown;
        if (t.s.terminal) return done;
        if (t.s.stopping) { sawStopping = true; return null; }
        // Its answer was lost and the turn never showed it ended: not known, never refused.
        if (t.s.stopUnsure) return unknown;
        // The cancel was refused: the turn runs on and Stop shows again.
        return sawStopping ? refused('stop_refused') : null;
      });
      e.stop();
      if (!sawStopping && !C.current(e.getSnapshot().conv)?.s.stopping) { w.cancel(); return refused('stop_not_sent'); }
      return w.p;
    },
    // Check again on a line whose turn outcome could not be told: the engine reads the turn list and transcript again (a read only).
    recheckOutcome: () => { eng().checkOutcome(); },
    decide: (g: GateRef, d: Decision) => decideLike(g, 'confirm', (e) => e.decide(d.choice, d.reason, g)),
    answer: (g: GateRef, a: Answer) => decideLike(g, 'question', (e) => e.answer(a, g)),
    async check(p: PendingRef): Promise<SendOutcome> {
      const e = eng();
      const chat = { computer: ref.computer, realm: ref.realm, sid: ref.sid };
      const target: CheckIdentity = { ...chat, key: p.key, kind: p.kind };
      /** Does the journal hold an unsettled entry that is about exactly what was named? */
      const journalHolds = (t: CheckIdentity): boolean => deps.pending(ref.computer).some((x) => { const i = entryIdentity(x); return i !== null && sameCheck(t, i); });
      if (p.kind === 'decision') {
        // Check names ONE card (its engine key): every source below answers it only through `sameCheck`.
        const at = e.attemptOf(p.key);
        if (at && sameCheck(target, { ...chat, key: p.key, kind: 'decision' })) {
          const rid = at.rid;
          // Settled only by request-specific proof: a gate that left the snapshot, or an attempt that vanished, proves nothing (C9).
          const w = until(e, () => {
            const pr = e.decisionProof(rid);
            if (pr === undefined) return e.attemptOf(p.key)?.rid === rid ? null : unknown;
            return pr === 'applied' ? done : pr === 'refused' || pr === 'notTaken' ? refused('not_applied') : pr === 'chatElsewhere' ? refused('chat_elsewhere') : pr === 'notKept' ? refused('not_kept') : refused('decided_elsewhere');
          });
          e.checkDecision();
          return w.p;
        }
        // Not an attempt of THIS page: a restored or imported unknown card, or a journal entry whose card is gone, can still need
        // Check. The session is read again and the answer stays unknown (no request-specific proof exists for it).
        if (e.getSnapshot().gates.some((c) => c.decision === 'unknown' && sameCheck(target, { ...chat, key: c.key, kind: 'decision' }))) { e.checkDecision(); return unknown; }
        if (!journalHolds(target)) return refused('nothing_to_check');
        e.checkNow();
        return unknown;
      }
      // A Check named as an interrupt has nothing to read: a reopened chat shows a journaled interrupt as a command row, checked as
      // that row (kind message), and a bare interrupt entry cannot say what became of it (unsettledOf leaves it out for that reason).
      if (p.kind === 'interrupt') return refused('unsupported');
      // A message, turn or create request is a ROW, bound by its request key AND kind (never by the row id): the row that answers is
      // the one whose identity is the target, looked up again on every snapshot, so a row republished under another key or kind, or
      // replaced, is not the request and the wait ends `unknown` (never the replacement's outcome). There is no "whichever row is
      // unknown" fallback. A stop has no row (no row's kind is `stop`, so none matches): only its journal entry can be read, and only through the same identity test.
      const rowOf = (s: Snapshot): C.UserMsg | undefined => Object.values(s.conv.users).find((u) => sameCheck(target, { ...chat, ...requestOf(u, s) }));
      const row = rowOf(e.getSnapshot());
      if (!row) {
        if (!journalHolds(target)) return refused('nothing_to_check');
        e.checkNow();
        return unknown;
      }
      const verdict = (u: C.UserMsg): SendOutcome | null => {
        switch (u.state) {
          case 'sent': case 'queued': return done;
          case 'notSent': return refused('not_sent');
          case 'refused': return refused('refused');
          case 'superseded': return refused('superseded');
          default: return null; // still unknown (or sending): not settled
        }
      };
      if (row.state === 'sending') return refused('still_sending');
      const settled = verdict(row);
      if (settled && row.state !== 'queued') return settled;
      // Unknown, or queued with its delivery still to be read back: ask the engine about THIS row once, then wait on its identity.
      const w = until(e, (s) => { const u = rowOf(s); return u ? verdict(u) : unknown; });
      try { e.check(row.id); } catch { w.cancel(); return unknown; }
      return settled ? (w.cancel(), settled) : w.p;
    },
    fork: async (o?: { turn: number; pin?: number }): Promise<ForkOutcome> => forkOutcome(await eng().fork(o ?? null)),
    checkFork: async (k1: string): Promise<ForkOutcome> => forkOutcome(await eng().checkFork(k1)),
    hideFork: (k1: string): Promise<boolean> => eng().hideFork(k1),
    forks: (): readonly ForkRowView[] | null => {
      const sid = eng().record?.s ?? null;
      const rows = eng().forkRows();
      if (!rows || !sid) return rows ? [] : null;
      return rows.filter((x) => x.parent === sid).map((x) => ({ k1: x.k1, parent: x.parent, turn: x.turn, bad: x.bad, hidden: x.hidden, mine: x.mine }));
    },
    resend,
    retry,
    takeBack,
    withdraw,
    dismissDecision(g: GateRef): void {
      const k = keyOf(g);
      if (k !== undefined) eng().dismissDecision(k);
    },
    canDismiss(g: GateRef): boolean {
      const k = keyOf(g);
      return k !== undefined && eng().canDismiss(k);
    },
    ...(deps.jobs ? {
      shellJobs(gate: () => Capability): ShellJobStops | null {
        if (released || !deps.jobs) return null;
        jobs ??= makeJobs(deps.jobs, gate);
        return jobs?.store ?? null;
      },
    } : {}),
  };

  const unsettled = {
    count: () => unsettledOf(deps.pending(ref.computer), ref, eng().getSnapshot()),
    subscribe: (fn: () => void) => deps.onPending(fn),
  };
  const onReadiness = (fn: () => void): (() => void) => {
    const a = deps.approvers.subscribe(() => fn()), b = deps.leases.subscribe(() => fn());
    return () => { a(); b(); };
  };

  let lastDraft: readonly DraftFile[] = [];
  const active = activateSource({ read, ops, readiness, onReadiness, unsettled });
  return {
    ...active,
    // activateSource asks the table alone; the adapter's own refusals come first here too.
    can: (a) => refusedHere(a) ?? active.can(a),
    // The Claude Code account's usage-limit reading, straight from the engine's snapshot: activateSource's ops carry
    // only the actions it gates, so this rides beside them. The source's subscribe tells a surface when it moved.
    rateLimit(): RateLimitReading | null {
      return released ? null : eng().getSnapshot().rateLimit ?? null;
    },
    // The engine's draft files (a taken-back message brings its files here), as the host's read-only list; the same array while nothing
    // about them changed, so a surface can read it under subscribe.
    draftFiles(): readonly DraftFile[] {
      const now = released ? [] : eng().getSnapshot().att.items.map(draftFileOf);
      if (now.length === lastDraft.length && now.every((x, i) => sameDraftFile(x, lastDraft[i] as DraftFile))) return lastDraft;
      lastDraft = now;
      return now;
    },
    dropDraftFile(id: string): void {
      if (!released) eng().unattach(id);
    },
    // The dock switch's own write (ask/Composer.tsx setAutoShared), for a page: the engine records the choice (setAuto), so its
    // send guard (turnOut) does not put an On made here back Off. One shared attempt per conversation; it ends with THIS write's
    // own end as the engine tells it: answered drops it, anything else leaves it "may have gone through".
    setAutoApprove(want: boolean, at?: Target): boolean {
      // Off is never held back here (narrowing): only an On asks the table first.
      if (released || (want && !(refusedHere('setYolo') ?? active.can('setYolo')).ok)) return false;
      const e = eng(), rec = e.record, slot = e.slot;
      if (!rec?.s) return false;
      // The attempt names the same computer the engine writes to, or it is not taken: a caller's target for another computer sends nothing.
      if (at && (at.project.id !== slot.project || at.container.id !== slot.computer)) return false;
      const h = takeApprovalAttempt(at ?? targetOf(slot.project, slot.computer, slot.server), rec.r, rec.s, { field: 'yolo', value: want });
      if (!h) return false;
      const sent = e.setAuto(want, (o) => (o === 'answered' ? h.settle() : h.unknown()));
      if (!sent) h.settle();
      return sent;
    },
    approvalChanged(): void {
      if (!released) eng().checkMode();
    },
    subscribe(fn) {
      const off = active.subscribe(() => { syncHold(); fn(); });
      syncHold();
      return off;
    },
    release() {
      if (released) return;
      released = true;
      jobs?.stop();
      jobs = null;
      hold?.h.close();
      hold = null;
      read.release();
    },
  };
}

/** Opens the chat's engine for sending: the same pinned engine every other holder shares (no second stream), as an active source. */
export function openActive(account: string, ref: ConvRef, at: { project: string; id: string; name: string } | undefined, host: () => Host, deps?: ActiveDeps): EngineActive | null {
  const h = openRef(account, ref, at);
  return h ? engineActive(h, ref, host, deps) : null;
}

/** The provider pages reach through kit/agent/conversationsActive (registered in ask/index.ts). The host's words are the
 *  reference's own until a page gives better ones, as for the read provider. */
export const askActiveConversations: ActiveConversationProvider = {
  open(account, ref, at) {
    if (!account) return null;
    const a = openActive(account, ref, at ?? undefined, () => ({ computer: at?.name || ref.computer, realm: ref.realm }));
    return a ? { source: a, release: () => a.release() } : null;
  },
  starter(account, at) { return starterOf(account, at); },
};

// ---- the starts of new chats: the kit's `Starter` (kit/agent/conversationsActive.ts) on the slot's dock engine ----
//
// One place per account + computer + realm holds at most one start. The engine's queueStart sends it (journal entry and record
// before the create, the same C9 path as Home's quick ask); the place keeps its own busy guard, because the engine replaces a
// watched start with a new one. A start is busy from start() until its create key is resolved: `opened` (the session is proven) or
// `notSent` (nothing left, or the journal's notAdmitted). The engine's own recovery, a check() here, or the journal letting the key
// go settle it; anything else keeps the key and the door shut while the start is shown. Stop tracking ends it: the door opens and
// the journal keeps the key (the dock still tracks it; a Check still out is fenced and retires nothing). An unproven create the
// journal holds for the slot that this page did not start (a reload while it was in flight, or the dock's own) is taken up as this
// place's unknown whenever no start runs here, before any start is judged, so a start that may have gone through is never shown as
// nothing and never sent over.

/** What a place needs from the page; a test supplies fakes. */
export interface StartDeps {
  /** The slot's dock engine (made and opened on first use, replaced when it ended). */
  engine(slot: Slot, target: Target): AskEngine;
  /** Called when the registry's engines change; returns the unsubscribe. */
  onEngines(fn: () => void): () => void;
  /** Called when the journal's unsettled requests change; returns the unsubscribe. */
  onPending(fn: () => void): () => void;
}
const liveStart: StartDeps = { engine: engineFor, onEngines: subscribeAll, onPending: subscribeUnsettled };

/** A start until its key is resolved. `uid`: its first message's row (null until the engine sent it); `k1`: its create key (null
 *  until a record was made: before that nothing can have left); `watched`: the engine still reports on it (its tell has not ended);
 *  `unknown`: the engine said it may have gone through (from then on the start is unresolved, not merely in flight); `released`:
 *  the journal no longer holds the key, so nothing more comes from it and only check() reads the key again. */
interface Run { eng: AskEngine; off: () => void; uid: string | null; k1: string | null; watched: boolean; unknown: boolean; checking: boolean; released: boolean; from?: string }
interface Place {
  key: string; slot: Slot; target: Target; deps: StartDeps;
  holds: number; subs: Set<() => void>;
  eng: AskEngine | null; offEng: (() => void) | null; offAll: (() => void) | null; offPending: (() => void) | null;
  run: Run | null;
  phase: StartPhase; snap: StartState;
}
const places = new Map<string, Place>();
/** Create keys this page is done with, per place key: the person took them off with Stop tracking, or this page's own start of them
 *  ended on a verdict (opened, notSent). Never taken up again on this page (memory only, so a new page shows an unproven one once
 *  more). Kept apart from the place, which goes when nobody holds it. */
const untracked = new Map<string, Set<string>>();
function doneWith(p: Place, k1: string | null | undefined): void {
  if (k1) (untracked.get(p.key) ?? untracked.set(p.key, new Set()).get(p.key)!).add(k1);
}
const NONE: StartPhase = Object.freeze({ k: 'none' }) as StartPhase;
const OPEN: StartDoor = Object.freeze({ ok: true }) as StartDoor;

/** The starter of one place, a new hold on it. Null without an account or a named computer, or for All realms. */
export function starterOf(account: string, at: StartAt, deps: StartDeps = liveStart): Starter | null {
  const c = at.computer;
  // One realm only (never All realms): the same realm test the create body makes.
  if (!account || !c || !c.id || !c.name || !c.project || !L.createBody(at.realm, c.id)) return null;
  const key = JSON.stringify([account, c.project, c.id, at.realm]);
  let p = places.get(key);
  // A place made before the server was known reaches no agent (or one made for another server, the wrong one): once a caller names the
  // server the place takes it (the registry then replaces its engine at the next attach); a known server is never given up for an unknown one.
  if (p && c.server && p.slot.server !== c.server) { p.slot = { ...p.slot, server: c.server }; p.target = targetOf(c.project, c.id, c.server); }
  if (!p) {
    const slot: Slot = { account, project: c.project, computer: c.id, realm: at.realm, name: c.name, server: c.server };
    const target = targetOf(c.project, c.id, c.server);
    p = {
      key, slot, target, deps, holds: 0, subs: new Set(),
      eng: null, offEng: null, offAll: null, offPending: null, run: null,
      phase: NONE, snap: Object.freeze({ door: Object.freeze({ ok: false, why: '' }), phase: NONE, auto: 'unknown' }) as StartState,
    };
    places.set(key, p);
  }
  const place = p;
  place.holds++;
  if (!place.offAll) place.offAll = place.deps.onEngines(() => refresh(place));
  refresh(place);
  let held = true;
  return {
    state: () => place.snap,
    subscribe(fn) { place.subs.add(fn); return () => { place.subs.delete(fn); }; },
    start: (text, o) => startIn(place, text, o),
    check: () => checkIn(place),
    settle: (shown) => settleIn(place, shown),
    release() {
      if (!held) return;
      held = false;
      place.holds--;
      tidy(place);
    },
  };
}

/** The place's dock engine while a page holds it (never made for a place nobody shows); else the start's own engine. */
function attach(p: Place): AskEngine | null {
  if (p.holds <= 0) return p.run?.eng ?? null;
  const e = p.deps.engine(p.slot, p.target);
  if (e !== p.eng) {
    p.offEng?.();
    p.eng = e;
    p.offEng = e.subscribe(() => refresh(p));
  }
  return e;
}
function doorOf(p: Place, e: AskEngine | null): StartDoor {
  if (p.run) return { ok: false, why: words(p.run.unknown ? 'ask.startUnresolved' : 'ask.startBusy') };
  if (!e || !e.canSend() || !e.activation().journal) return { ok: false, why: words('ask.startNotReady') };
  return OPEN;
}
/** No start runs here: the slot's newest create the journal still holds with no session proven (`unprovenCreate`: a reload while it
 *  was in flight, or a create the dock made while an earlier outcome is still shown) becomes this place's unknown start, over
 *  whatever outcome is shown (C9: the new unknown wins). Nothing is taken up while the journal cannot say (unreadable, another account
 *  shown). A key this page is done with is never taken up again, and does not hide an older unproven create behind it. */
function takeUp(p: Place, e: AskEngine | null): void {
  if (p.run || !e) return;
  const done = untracked.get(p.key);
  const k1 = e.unprovenCreate(done);
  if (!k1 || done?.has(k1)) return;
  const r: Run = { eng: e, off: () => undefined, uid: null, k1, watched: false, unknown: true, checking: false, released: false };
  r.off = e.subscribe(() => refresh(p));
  p.run = r;
  p.phase = Object.freeze({ k: 'unknown', taken: true }) as StartPhase;
  watchJournal(p, r);
}
function refresh(p: Place): void {
  const e = attach(p);
  takeUp(p, e);
  const r = p.run;
  if (r) {
    // The row is known once the engine sent it; the create key once its record was made.
    if (r.watched && !r.uid) r.uid = r.eng.startRow();
    if (r.uid && !r.k1) r.k1 = r.eng.createKeyOf(r.uid);
    // The engine stopped reporting on it (it ended, or another start or conversation took its place). Its tell may not come again
    // (an unknown is told once), so an unresolved key goes to the journal from here.
    if (r.watched && (r.eng.getSnapshot().phase === 'ended' || (r.uid !== null && r.eng.startRow() !== r.uid))) {
      r.watched = false;
      if (r.unknown) watchJournal(p, r);
    }
    if (r.k1) {
      const mine = r.eng.sessionOfKey(r.k1);
      const other = !mine && e && e !== r.eng ? e.sessionOfKey(r.k1) : null;
      if (mine) return opened(p, mine, r.eng.handle());
      if (other && e) return opened(p, other, e.handle());
    }
    if (p.phase.k === 'waiting' && r.uid) p.phase = Object.freeze({ k: 'starting' }) as StartPhase;
    if (!r.watched) leftByJournal(p, r);
  }
  publishIn(p, e);
}
/** What a start made now would do about approvals before its first message (StartAuto), as the place's engine says it. */
function autoOf(e: AskEngine | null): StartAuto {
  const a = e ? e.autoAtStart() : undefined;
  return a === undefined ? 'unknown' : a === null ? 'none' : a ? 'on' : 'off';
}
function publishIn(p: Place, e: AskEngine | null = p.holds > 0 ? p.eng : p.run?.eng ?? null): void {
  const door = doorOf(p, e), auto = autoOf(e);
  const was = p.snap;
  const same = was.door.ok === door.ok && (door.ok || (!was.door.ok && was.door.why === door.why));
  if (same && was.phase === p.phase && was.auto === auto) return;
  p.snap = Object.freeze({ door: same ? was.door : Object.freeze(door), phase: p.phase, auto }) as StartState;
  for (const f of [...p.subs]) { try { f(); } catch { /* the page's own */ } }
}
/** The key is resolved: the run ends and its subscriptions go. */
function endRun(p: Place): void {
  const r = p.run;
  if (!r) return;
  p.run = null;
  r.off();
  p.offPending?.();
  p.offPending = null;
}
function opened(p: Place, sid: string, handle: string): void {
  // The kind of page that made it (StartOpts.from): a page of another kind does not go to its chat (useStarter). A start taken up from
  // the journal has none.
  const from = p.run?.from;
  doneWith(p, p.run?.k1);
  endRun(p);
  p.phase = Object.freeze({ k: 'opened', ref: { computer: handle, realm: p.slot.realm, sid }, ...(from !== undefined ? { from } : {}) }) as StartPhase;
  publishIn(p);
  tidy(p);
}
function notSent(p: Place, reason: string | null): void {
  doneWith(p, p.run?.k1);
  endRun(p);
  // The row's own reason when it is one of these words (the realm default unread, the record not kept), else the plain one.
  const key = (reason && Object.hasOwn(strings, reason) ? reason : 'ask.startNotSent') as Parameters<typeof words>[0];
  p.phase = Object.freeze({ k: 'notSent', why: words(key) }) as StartPhase;
  publishIn(p);
  tidy(p);
}
/** The engine's word on the start. `row`: its first message's row (null: none was made, nothing left). */
function told(p: Place, r: Run, o: StartOutcome, row: string | null): void {
  if (p.run !== r) return;
  if (row) r.uid = row;
  if (r.uid && !r.k1) r.k1 = r.eng.createKeyOf(r.uid);
  const st = r.uid ? r.eng.rowState(r.uid) : null;
  // A proven session beats every first-message outcome (it is `opened`, never `notSent`).
  const sid = r.k1 ? r.eng.sessionOfKey(r.k1) : null;
  if (sid) return opened(p, sid, r.eng.handle());
  if (o === 'notSent') return notSent(p, st?.reason ?? null);
  // `sent` without a proven session, or `unknown`: the key is kept. A tell that ended the watch leaves the key to the journal.
  r.unknown = true;
  if (o !== 'unknown' || !r.eng.startRow()) r.watched = false;
  if (!r.k1 && !r.watched) {
    // No record was made, so the journal holds nothing to recover by; what became of it cannot be told (C9): unknown, not held.
    endRun(p);
    p.phase = Object.freeze({ k: 'unknown' }) as StartPhase;
    publishIn(p);
    return tidy(p);
  }
  if (p.phase.k !== 'unknown') p.phase = Object.freeze({ k: 'unknown' }) as StartPhase;
  watchJournal(p, r);
  publishIn(p);
}
/** An unresolved key the engine no longer reports on: the journal is watched, and a key it lets go is read once more. */
function watchJournal(p: Place, r: Run): void {
  if (r.watched || r.released || p.offPending || !r.k1) return;
  p.offPending = p.deps.onPending(() => { if (p.run === r) leftByJournal(p, r); });
  leftByJournal(p, r);
}
function leftByJournal(p: Place, r: Run): void {
  if (r.watched || !r.k1 || r.checking || r.released) return;
  const e = p.holds > 0 ? p.eng ?? r.eng : r.eng;
  if (e.keyHeld(r.k1) !== false) return;
  // The journal let the key go (its recovery, a sweep, or the person's Dismiss elsewhere): one read by key tells whether a chat was
  // made. Its letting go proves nothing about the create, so the run (and the shut door) stays until the read proves it either way.
  release(p, r);
  readKey(p, r, e);
}
/** The journal no longer holds the key: its watch ends (nothing more comes from it), and only check() reads the key from here. */
function release(p: Place, r: Run): void {
  r.released = true;
  p.offPending?.();
  p.offPending = null;
}
function readKey(p: Place, r: Run, e: AskEngine): void {
  const k1 = r.k1;
  if (!k1) return;
  r.checking = true;
  // Fenced by the run it was asked for: once that run ended (Stop tracking), the journal retires nothing and settles nothing for it.
  void e.checkKey(k1, () => p.run === r).then((v) => {
    r.checking = false;
    if (p.run !== r) return;
    if (v.t === 'settled' && v.sid) return opened(p, v.sid, e.handle());
    if (v.t === 'notAdmitted') return notSent(p, null);
    // Anything else proves neither (settled without a session, closed, unknown, a failed read): the start stays unknown with its key
    // and the door shut (the Starter lets a key go only on opened or notAdmitted), and check() can read it again.
    if (!r.watched && e.keyHeld(k1) === false) release(p, r);
    publishIn(p);
  });
}

function startIn(p: Place, text: string, o: StartOpts): boolean {
  const e = attach(p);
  // An unproven create in the journal is taken up first (it shuts the door), then the door and the busy check are judged together,
  // now, before anything is queued.
  takeUp(p, e);
  if (p.run) { publishIn(p, e); return false; }
  if (!e || doorOf(p, e) !== OPEN) return false;
  if (typeof text !== 'string' || L.checkText(text.trim())) return false;
  if (!o || typeof o.agent !== 'string' || typeof o.strict !== 'boolean') return false;
  const opts: L.CreateOpts = {
    agent: o.agent,
    ...(o.model !== undefined ? { model: o.model } : {}),
    ...(o.claude !== undefined ? { claude: { model: o.claude.model } } : {}),
    ...(o.cwd !== undefined ? { cwd: o.cwd } : {}),
    strict: o.strict,
    helperGates: true,
  };
  // A choice the create body refuses sends nothing.
  if (!L.createBody(p.slot.realm, p.slot.computer, opts)) return false;
  const r: Run = { eng: e, off: () => undefined, uid: null, k1: null, watched: true, unknown: false, checking: false, released: false, from: typeof o.from === 'string' ? o.from : '' };
  // The start's own subscription: it outlives the page's hold on the place.
  r.off = e.subscribe(() => refresh(p));
  p.run = r;
  p.phase = Object.freeze({ k: 'waiting' }) as StartPhase;
  publishIn(p, e);
  e.queueStart(text, (out, row) => told(p, r, out, row), opts, o.askFirst === true);
  if (p.run === r) refresh(p);
  return true;
}
function checkIn(p: Place): void {
  const r = p.run;
  // An unresolved start that is shown (Stop tracking ended it: nothing is read from here).
  if (!r || !r.unknown || r.checking) return;
  // Both reads are fenced by this run: a Check still out when Stop tracking ends the run retires nothing and is not acted on.
  // The engine still reports on its row: its own check (a read by key through the journal, never a resend), which also sends the
  // first message once the create is proved (a read of the key alone would open the chat without it).
  if (r.watched && r.uid && r.eng.startRow() === r.uid) { r.eng.check(r.uid, () => p.run === r); return; }
  if (!r.k1) return;
  // Otherwise the journal's recovery by key (a read, a retire only after a miss; never a resend).
  const e = p.holds > 0 ? p.eng ?? r.eng : r.eng;
  readKey(p, r, e);
}
function settleIn(p: Place, shown: StartPhase): boolean {
  if (shown !== p.phase) return false;
  if (shown.k !== 'opened' && shown.k !== 'notSent' && shown.k !== 'unknown') return false;
  // Stop tracking (an unknown taken off the screen) ends the start: the door opens, the journal keeps its key untouched (no read, no
  // retire; the dock still tracks it), and this page never takes that key up again.
  if (shown.k === 'unknown') {
    const r = p.run;
    doneWith(p, r?.k1);
    // The engine that ran the start, and the one the place holds now (it may have been replaced and reloaded the same unknown row).
    if (r?.k1) for (const e of new Set([r.eng, p.eng])) e?.releaseCreate(r.k1);
    endRun(p);
  }
  p.phase = NONE;
  publishIn(p);
  tidy(p);
  return true;
}
/** A place nobody holds, with no start and nothing to show, goes. */
function tidy(p: Place): void {
  if (p.holds > 0) return;
  if (p.eng) { p.offEng?.(); p.offEng = null; p.eng = null; }
  if (p.run || p.phase.k !== 'none') {
    // Not held but still owed: the engine list is followed only through the start's own engine.
    return;
  }
  p.offAll?.();
  p.offAll = null;
  if (places.get(p.key) === p) places.delete(p.key);
}
/** Tests: every place goes (subscriptions called off). */
export function resetStartersForTests(): void {
  for (const p of places.values()) { p.run?.off(); p.offEng?.(); p.offAll?.(); p.offPending?.(); }
  places.clear();
  untracked.clear();
}
