// source.ts: a pinned Ask engine read as a kit/agent ConversationSource, for the surfaces that draw a
// conversation with SessionView (the AI tab's chat). READ ONLY: the source has no send, stop, decide, answer or
// check, and its facts answer every write `read_only`: sending is activated only through activateSource (ask/active.ts). The
// words are the dock's (Column.tsx), so one step, outcome or note reads the same in the dock and the page; a send or a
// step whose outcome is unknown is never shown as done or failed (C9).
import { computerHandle } from '@core';
import { makeT } from '@kit';
import { can, type CapFacts } from '@kit/agent/capability';
import type { ConversationProvider, ConvListRow } from '@kit/agent/conversations';
import type { ConvActivity, ConvBlock, ConvMeta, ConvRef, ConvSnapshot, ConversationSource, EditView, FileView, GateEntry, PendingRef, RowAction, Watch, WatchRank } from '@kit/agent/source';
// The pure hrefs, not ../pages/files/links: that re-exports Files components that load '@kit' (app/kitGraph.test.ts).
import { links as aiLinks } from '../pages/ai/links';
import { links as filesLinks } from '../pages/files/hrefs';
import { clean } from './code';
import { clock, shownReply, trailSteps } from './Column';
import * as C from './conv';
import { editRows } from './edits';
import { loadPhase } from './loadPhase';
import type { AskEngine, CardView, Snapshot } from './engine';
import { failureKey } from './logic';
import { openRef, sessionsFor } from './registry';
import { actionsOf, queuedWords, requestOf, retryFor, retryWaits } from './rowActions';
import strings from './strings.en.json';
import { cacheAccount, readCached, writeCached } from './transcriptCache';

const t = makeT(strings);
type Key = Parameters<typeof t>[0];

/** What the page knows that the engine does not: where the chat runs, in words, and its title from the chat list. */
export interface Host {
  computer: string;
  realm: string;
  folder?: string;
  title?: string | null;
}

const NOTE: Partial<Record<C.SendState, { key: Key; bad?: true }>> = {
  sending: { key: 'ask.sending' },
  queued: { key: 'ask.queued' },
  unknown: { key: 'ask.mayHave' },
  notSent: { key: 'ask.notSent', bad: true },
  refused: { key: 'ask.refused', bad: true },
  superseded: { key: 'ask.superseded' },
};

function userBlock(key: string, m: C.UserMsg, id?: { req?: PendingRef; actions: readonly RowAction[] }, gate = false): ConvBlock {
  const files: FileView[] = [
    ...(m.pics ?? []).map((p, i): FileView => ({ id: `${m.id}:pic${i}`, kind: 'image', name: p.name || t('ask.attPicture', { n: i + 1 }), ...(p.id ? { stored: p.id } : { gone: true as const }) })),
    ...(m.imgs ?? []).map((a): FileView => ({ id: a.id, kind: 'image', name: a.name, url: a.url, ...(a.resized ? { meta: t('ask.attResizedShort') } : {}) })),
    ...(m.files ?? []).map((f): FileView => ({ id: f.id, kind: 'text', name: f.name, meta: f.from ? t('ask.attLinesFrom', { count: f.lines, n: f.lines, from: f.from }) : t('ask.attLines', { count: f.lines, n: f.lines }) })),
  ];
  // A refused message says why when the engine knows (a strings key), as the dock does.
  // A queued row says what taking it back came to (queuedWords); a message taken back says so, never "Not sent" as a failure.
  // A sent row with no text waits for it ("Reached the agent"), unless the agent's record shows it was pictures only.
  const n = m.state === 'refused' && m.reason ? { key: m.reason as Key, bad: true as const }
    : m.state === 'queued' ? { key: queuedWords(m, gate) as Key }
      : m.state === 'notSent' && m.reason === 'ask.withdrawn' ? { key: 'ask.withdrawn' as Key }
        : NOTE[m.state];
  const note = n ? { text: t(n.key), ...(n.bad ? { bad: true } : {}) } : m.state === 'sent' && !m.text && !m.pics?.length ? { text: t('ask.reachedAgent') } : undefined;
  return {
    k: 'user', key, text: clean(m.text, 8000).text, at: m.at, ...(files.length ? { files } : {}), ...(note ? { note } : {}),
    ...(id?.req ? { req: id.req } : {}), ...(id?.actions.length ? { actions: id.actions } : {}), ...(m.state === 'queued' ? { queued: true as const } : {}),
    ...(m.via === 'command' ? { followUp: true as const } : {}),
  };
}

function failureWords(code: string, retryAt: string | null = null): string {
  const key = failureKey(code);
  // A rate limit names the time the agent said to try again, as the dock's column does.
  if (key === 'ask.rateLimited' && retryAt && clock(retryAt)) return t('ask.rateLimitedAt', { time: clock(retryAt) });
  return t((key === 'ask.failed' ? 'ask.o.failed' : key) as Key);
}

/** Where the next step is taken after a failure no Retry helps (no usable model, a conversation too long for its model): the
 *  models page, as the dock's Open AI models. */
function failureLink(code: string): { link?: { label: string; href: string } } {
  const key = failureKey(code);
  return key === 'ask.noModel' || key === 'ask.tooLong' ? { link: { label: t('ask.openModels'), href: aiLinks.list } } : {};
}

/** The engine's column as kit blocks. */
export function blocksOf(bs: readonly C.Block[], ctx: { createKey?: string; now?: number; gate?: boolean } = {}): ConvBlock[] {
  const out: ConvBlock[] = [];
  // The prompt a failed turn's Retry belongs to: the newest block's failure, as the dock's column judges it (rowActions.ts), unless the
  // failure says to wait (a rate limit).
  const last = bs[bs.length - 1];
  const retryUid = last && last.k === 'outcome' && !retryWaits(last, ctx.now ?? Date.now()) ? retryFor(last, true) : null;
  for (const b of bs) {
    switch (b.k) {
      case 'user': out.push(userBlock(b.key, b.msg, { ...(b.msg.key ? { req: requestOf(b.msg, ctx) } : {}), actions: actionsOf(b.msg, retryUid) }, ctx.gate)); break;
      case 'trail': out.push(trailSteps(b, t)); break;
      case 'reply': {
        const text = shownReply(b.text);
        if (!text) break;
        // While the turn waits on a decision nothing streams: no caret beside the text.
        out.push({ k: 'reply', key: b.key, text, streaming: b.streaming && !ctx.gate, final: b.final, cost: b.cost, at: b.at, ...(b.cut ? { cut: t('ask.replyCut') } : {}), ...(b.turn !== undefined ? { turn: b.turn } : {}), ...(b.files ? { files: b.files } : {}) });
        break;
      }
      // The agent's summary of the earlier conversation: shown as replies are (secrets hidden), as a note of its own.
      case 'summary': { const text = shownReply(b.text); if (text) out.push({ k: 'summary', key: b.key, text }); break; }
      case 'decided': out.push({ k: 'decided', key: b.key, d: { kind: b.d.kind, tool: b.d.tool, text: b.d.text, ...(b.d.answer !== undefined ? { answer: b.d.answer } : {}), ...(b.d.typed ? { typed: true as const } : {}), ...(b.d.more ? { more: b.d.more } : {}) } }); break;
      case 'outcome':
        if (b.state === 'completed') break;
        if (b.state === 'failed') out.push({ k: 'line', key: b.key, text: failureWords(b.code, b.retryAt), tone: 'bad', ...failureLink(b.code) });
        else out.push({ k: 'line', key: b.key, text: t(b.state === 'cancelled' ? 'ask.o.cancelled' : 'ask.o.interrupted'), tone: 'muted' });
        break;
      case 'error': out.push({ k: 'line', key: b.key, text: failureWords(b.code, b.retryAt), tone: 'bad', ...failureLink(b.code) }); break;
      // Not known how the turn ended: the line offers Check again (recheck), which reads the conversation again and sends nothing.
      case 'unsure': out.push({ k: 'line', key: b.key, text: t('ask.o.unsure'), tone: 'info', recheck: true }); break;
      // A Stop whose answer was lost: the same Check again, which reads the turn's receipt (engine checkOutcome). Marked `stop`: the
      // composer then shows no Stop note of its own beside it.
      case 'stopUnsure': out.push({ k: 'line', key: b.key, text: t('ask.stopUnsure'), tone: 'info', recheck: true, stop: true }); break;
      // Hooks are trusted in the Agent app: the line offers it (the dock draws its own card with the same link).
      case 'hooks': out.push({ k: 'line', key: b.key, text: t('ask.hooksBody'), tone: 'info', agentApp: t('ask.hooksOpenAgent') }); break;
    }
  }
  return out;
}

/** Each card names the gate it was drawn for (a decision never goes to a gate that replaced it). */
export function gatesOf(cards: readonly CardView[]): GateEntry[] {
  return cards.map((c) => ({ key: c.key, ref: { id: c.gate.id, generation: c.gate.generation }, gate: c.gate, helper: c.helper, addressing: c.addressing, held: c.held, decision: c.decision }));
}

/** Whether the conversation can be read now. The engine says it can't in two ways: a blocked or ended phase, or a band
 *  over a ready (or still checking) column: stopped, starting, being set up, cannot reach, connection lost. */
export function reachOf(s: Snapshot): CapFacts['reach'] {
  if (s.phase === 'ended') return 'unreachable';
  if (s.phase === 'blocked') {
    const k = s.blocked?.key;
    return k === 'ask.accessRefused' || k === 'ask.otherAccount' ? 'forbidden' : k === 'ask.gone' || k === 'ask.goneOrUnreachable' ? 'missing' : 'unreachable';
  }
  if (s.band && s.band.k !== 'busy') return 'unreachable';
  // The engine's own connection state (band null): a stream lost mid-turn.
  return s.status === 'lost' ? 'unreachable' : 'ok';
}


const BAND: Record<Exclude<NonNullable<Snapshot['band']>, null>['k'], { key: Key; tone: 'muted' | 'bad' | 'info' }> = {
  stopped: { key: 'ask.stopped', tone: 'muted' },
  starting: { key: 'ask.starting', tone: 'muted' },
  provisioning: { key: 'ask.provisioning', tone: 'muted' },
  unreachable: { key: 'ask.unreachable', tone: 'bad' },
  lost: { key: 'ask.lost', tone: 'info' },
  busy: { key: 'ask.busy', tone: 'info' },
};
/** The engine's own reason, in the dock's words, as the first line of the transcript (the dock draws it as its band or
 *  blocked state). A blocked key the dock has no words for reads as "can't reach". None for an ended engine: its holder
 *  opens again under the new context. */
/** The one rule for the "Reconnecting…" line: only after a stream that was open broke (Snapshot.streamBroke).
 *  Any other catch-up (a first read finding a running turn, a dock reopened, the watch raised again) shows the normal
 *  loading state: the status stays `reconnecting`, so the chat is still loading and unsure (factsOf, metaStatus). */
export function showsReconnecting(s: Snapshot): boolean {
  return s.status === 'reconnecting' && s.streamBroke !== false;
}

export function reachLine(s: Snapshot, computer: string): ConvBlock | null {
  if (s.phase === 'blocked' && s.blocked) {
    const key = (s.blocked.key in strings ? s.blocked.key : 'ask.unreachable') as Key;
    return { k: 'line', key: 'reach', text: t(key, { computer }), tone: s.blocked.tone === 'muted' ? 'muted' : 'bad' };
  }
  if (s.phase === 'ended') return null;
  if (!s.band) {
    if (s.status === 'lost') return { k: 'line', key: 'reach', text: t('ask.lost'), tone: 'info' };
    if (showsReconnecting(s)) return { k: 'line', key: 'reach', text: t('ask.status.reconnecting'), tone: 'info' };
    return null;
  }
  const b = BAND[s.band.k];
  return { k: 'line', key: 'reach', text: t(b.key, { computer }), tone: b.tone };
}

/** The capability facts of a READ source: nothing was activated, so every write is `read_only`. A conversation that
 *  can't be read is never idle or running: its state is loading until a read says otherwise. */
/** The rows Check status can read: an unknown row, and a queued one whose take-back has an unknown outcome (rowActions `check`). */
export function checkableRows(users: Readonly<Record<string, C.UserMsg>>): number {
  return Object.values(users).filter((u) => u.state === 'unknown' || (u.state === 'queued' && u.wd === 'unknown')).length;
}

export function factsOf(s: Snapshot): CapFacts {
  const lead = s.gates.find((c) => !c.helper) ?? s.gates[0];
  const reach = reachOf(s);
  // Reconnecting: the turn's state is not known until the stream answers again.
  const unsure = reach !== 'ok' || s.status === 'reconnecting';
  return {
    mode: 'read',
    backend: 'native',
    reach,
    state: s.phase === 'checking' || unsure ? 'loading' : s.status !== null ? 'running' : 'idle',
    daemonPaused: false,
    approval: 'unknown',
    firstTurnStarted: s.conv.turns.length > 0,
    turn: !unsure && s.status !== null,
    gate: lead ? lead.gate.kind : 'none',
    gateBlocked: !lead ? false : lead.gate.blocked === 'policy' ? 'policy' : lead.helper ? 'helper' : lead.addressing ? 'addressing' : lead.held ? 'held' : false,
    decisionPending: s.decision.pending || s.decision.unknown,
    queued: false,
    children: false,
    shells: false,
    // Only what Check status can read: an unknown row. A row still sending is refused by Check (`still_sending`), so counting it
    // would make can('check') promise what the source then refuses.
    unsettledSends: checkableRows(s.conv.users),
    // The finished turns the conversation shows: a fork needs one (capability.ts `fork`).
    completedTurns: s.conv.turns.filter((x) => !C.running(x) && x.s.terminal?.state === 'completed').length,
    // Asleep on the computer (GET /state live:false): a message wakes it; the live-only changes are refused until then (capability.ts).
    asleep: s.dormant,
    // Auto-approve as the stream says it (a yolo_mode frame from any client): the page reads the approvals again when it moves.
    // A snapshot without the switch (a partial one) says nothing about it.
    auto: s.auto?.on ?? null,
    prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' },
  };
}

/** The header's status: a gate waiting for the person is "needs you"; one whose decision is on its way is not. A
 *  conversation that can't be read says so ("Can't reach"); an ended engine is loading (its holder opens again). */
export function metaStatus(s: Snapshot): ConvMeta['status'] {
  if (s.phase === 'checking' && !s.band) return 'loading';
  if (s.phase === 'ended') return 'loading';
  if (reachOf(s) !== 'ok') return 'unreachable';
  if (s.status === 'reconnecting') return 'loading';
  if (s.gates.some((c) => c.decision === null)) return 'needs';
  return s.status !== null ? 'running' : 'idle';
}

function firstText(c: C.Conv): string | null {
  const first = Object.values(c.users).sort((a, b) => a.at - b.at)[0];
  return first?.text ? C.titleOf(first.text) : null;
}

/** The running turn's agent id (absent while nothing runs or the agent has not named it yet). */
function runningTurnOf(c: C.Conv): { turnId?: string } {
  const t = C.current(c);
  return t && C.running(t) && t.s.turnId ? { turnId: t.s.turnId } : {};
}

/** The newest named turn the conversation shows ended. */
function endedTurnOf(c: C.Conv): { endedTurnId?: string } {
  for (let i = c.turns.length - 1; i >= 0; i--) {
    const t = c.turns[i]!;
    if (t.s.terminal && t.s.turnId) return { endedTurnId: t.s.turnId };
  }
  return {};
}

/** The agent's last state read (since this engine opened) names the turn shown running, or none while none runs. */
function turnConfirmed(s: Snapshot): boolean {
  return s.stateTurn !== undefined && (runningTurnOf(s.conv).turnId ?? null) === s.stateTurn;
}

/** The folder that holds a file, as an absolute path, or null: a relative path is joined to the chat's folder when that one is absolute. */
function folderOf(path: string, folder: string | undefined): string | null {
  const abs = path.startsWith('/') ? path : folder && folder.startsWith('/') ? `${folder.replace(/\/+$/, '')}/${path}` : null;
  if (!abs) return null;
  const i = abs.lastIndexOf('/');
  return i > 0 ? abs.slice(0, i) : '/';
}

/** The chat's edits for Details, memory only: built from the engine's state on every snapshot, never stored. `handle`: the
 *  chat's computer, for Open in Files (a call that named another computer gets none). */
function editsOf(s: Snapshot, host: Host, handle: string | undefined): { edits: EditView[]; editsMore?: number } {
  const { rows, more } = editRows(s.conv.turns.map((x) => x.s));
  const edits = rows.map((e): EditView => {
    const dir = handle && !e.computer ? folderOf(e.path, host.folder) : null;
    return {
      id: e.key, path: e.path, verb: e.verb,
      ...(e.verb === 'edited' && e.old !== undefined && e.new !== undefined ? { diff: { old: e.old, new: e.new, ...(e.all ? { all: true } : {}) } } : {}),
      ...(e.verb === 'written' && e.size !== undefined ? { meta: t('ask.editSize', { n: e.size }) } : {}),
      ...(e.cut ? { cut: true } : {}),
      ...(e.unsure ? { unsure: true } : {}),
      ...(e.computer ? { computer: e.computer } : {}),
      ...(dir ? { open: filesLinks.at(handle as string, dir) } : {}),
    };
  });
  return { edits, ...(more > 0 ? { editsMore: more } : {}) };
}

/** The engine's word on what the chat waits for (loadPhase), when the facts cannot say it: a message on its way, catching up, a
 *  connection being opened again or lost, a Stop on its way. Working, waiting on a card and idle the kit reads from the facts. */
export function activityOf(s: Snapshot): { activity?: ConvActivity } {
  const p = loadPhase(s);
  return p === 'sending' || p === 'catching_up' || p === 'reconnecting' || p === 'lost' || p === 'stopping' ? { activity: { phase: p } } : {};
}

/** What a running turn waits on when no step runs and no reply streams (the kit's working row reads it): the agent compacting the
 *  conversation, else the model. Only while the engine says the turn is working; every other phase has its own words. */
export function workOf(s: Snapshot): { work?: 'compacting' | 'thinking' } {
  if (loadPhase(s) !== 'working') return {};
  return { work: C.current(s.conv)?.s.compacting ? 'compacting' : 'thinking' };
}

export function convSnapshot(s: Snapshot, host: Host, now: number, handle?: string): ConvSnapshot {
  const blocks = blocksOf(C.blocks(s.conv, now), { createKey: s.createKey, now, gate: !!s.gate });
  const why = reachLine(s, host.computer);
  if (why) blocks.unshift(why);
  if (s.dormant) blocks.push({ k: 'line', key: 'dormant', text: t('ask.dormant'), tone: 'muted' });
  // A decision refused because the chat is marked bound elsewhere: one line says why the card stays (never "not kept").
  if (s.decision.elsewhere) blocks.push({ k: 'line', key: 'elsewhere', text: t('ask.chatElsewhere'), tone: 'info' });
  return {
    facts: factsOf(s),
    ...activityOf(s),
    ...workOf(s),
    title: host.title?.trim() ? host.title : firstText(s.conv),
    blocks,
    gates: gatesOf(s.gates),
    ...(s.conv.gapTop ? { gapTop: true } : {}),
    ...runningTurnOf(s.conv),
    ...(turnConfirmed(s) ? { turnConfirmed: true as const } : {}),
    ...endedTurnOf(s.conv),
    meta: { computer: host.computer, realm: host.realm, ...(host.folder ? { folder: host.folder } : {}), status: metaStatus(s) },
    ...editsOf(s, host, handle),
    usage: s.usage ?? C.usageTurns(s.conv),
  };
}

/** A read source on a pinned engine. `refresh()`: the host's words changed. `release()`: lets the engine go, once. */
export interface EngineSource extends ConversationSource {
  refresh(): void;
  release(): void;
}

/** Whether a chat's view may be kept as its saved copy (transcriptCache.ts): the computer answered and the chat is settled
 *  (nothing runs, no gate is open, nothing is unsure or still being sent), so every block is finished and no gate's text is in
 *  it beyond what the transcript shows. */
export function cacheable(s: Snapshot, view: ConvSnapshot): boolean {
  return s.phase === 'ready' && reachOf(s) === 'ok' && s.status === null && s.gates.length === 0 && view.gates.length === 0 && view.blocks.length > 0
    && view.facts.unsettledSends === 0 && Object.values(s.conv.users).every((u) => u.state !== 'sending' && u.state !== 'unknown' && u.state !== 'queued')
    // Nothing unsure: no turn whose outcome could not be told (the conversation's own mark or a turn's), no decision on its way.
    && !s.conv.unsure && s.conv.turns.every((t) => !t.unsure) && !s.decision.pending && !s.decision.unknown;
}

/** How long a settled view waits before it is kept (a burst of updates is kept once). */
const CACHE_WAIT_MS = 800;

export function engineSource(handle: { current(): AskEngine; release(): void; onSwap?(fn: () => void): () => void; watch?(level: Watch, rank?: WatchRank): void }, ref: ConvRef, host: () => Host): EngineSource {
  const subs = new Set<() => void>();
  let cache: { eng: AskEngine; snap: Snapshot; host: Host; view: ConvSnapshot } | null = null;
  let stale = false;
  let released = false;
  // The saved copy: read once, shown only while the computer has not answered and nothing else is shown, and
  // dropped for good once it answers (never merged with the answer).
  let saved: { blocks: ConvBlock[]; at: number } | null = null;
  let answered = false;
  let keepTimer: ReturnType<typeof setTimeout> | null = null;
  let kept = '';
  const keep = (view: ConvSnapshot) => {
    const text = JSON.stringify(view.blocks);
    if (text === kept) return;
    if (keepTimer) clearTimeout(keepTimer);
    // The account shown when the view settled: the copy is kept for it only (another account shown by the time the wait ends
    // keeps nothing), and only if the engine still holds that same snapshot.
    const uid = cacheAccount();
    if (!uid) return;
    keepTimer = setTimeout(() => {
      keepTimer = null;
      if (released) return;
      const now = cache;
      if (!now || now.eng !== handle.current() || now.snap !== now.eng.getSnapshot()) return;
      if (!cacheable(now.snap, now.view) || JSON.stringify(now.view.blocks) !== text) return;
      // Marked kept when its write starts (a later different view is written after it, in order); a refused write (the account
      // still opening, a store that refused) unmarks it, so the next settled view, even an unchanged one, is tried again.
      kept = text;
      void writeCached(ref, now.view.blocks, Date.now(), uid).then((ok) => { if (!ok && kept === text) kept = ''; });
    }, CACHE_WAIT_MS);
  };
  const snapshot = (): ConvSnapshot => {
    const eng = handle.current();
    const s = eng.getSnapshot();
    if (cache && !stale && cache.eng === eng && cache.snap === s) return cache.view;
    const h = host();
    let view = convSnapshot(s, h, Date.now(), ref.computer);
    if (s.phase !== 'checking') { answered = true; saved = null; }
    if (saved && !answered && view.blocks.length === 0 && view.gates.length === 0) view = { ...view, blocks: saved.blocks, saved: { at: saved.at } };
    else if (cacheable(s, view)) keep(view);
    cache = { eng, snap: s, host: h, view };
    stale = false;
    return cache.view;
  };
  const notify = () => { for (const f of [...subs]) f(); };
  void readCached(ref).then((c) => {
    if (!c || released || answered) return;
    saved = c;
    stale = true;
    notify();
  });
  return {
    kind: 'session',
    ref,
    snapshot,
    subscribe(fn) {
      subs.add(fn);
      let off = handle.current().subscribe(fn);
      // The conversation passes from the dock's engine to its pinned one (registry openRef): the watch follows it.
      const offSwap = handle.onSwap?.(() => { off(); off = handle.current().subscribe(fn); fn(); });
      return () => { subs.delete(fn); off(); offSwap?.(); };
    },
    // This holder's level, aggregated per engine by the registry (openRef's RefHandle.watch): stream > state > off.
    watch(w, rank) { if (!released) handle.watch?.(w, rank); },
    can: (a) => can(a, snapshot().facts),
    refresh() { stale = true; notify(); },
    release() { if (released) return; released = true; if (keepTimer) clearTimeout(keepTimer); keepTimer = null; handle.release(); },
  };
}

/** A chat list's answer (GET /sessions) as rows of `computer` in `realm`, newest first (an unknown time last); a title is the
 *  first message's, as Recent's (C.titleOf). An answer that is not a list is a failed read, never "no chats". */
export function listRows(b: unknown, computer: string, realm: string): ConvListRow[] {
  const items = b !== null && typeof b === 'object' && Array.isArray((b as { items?: unknown }).items) ? (b as { items: unknown[] }).items : null;
  if (!items) throw new Error('not a chat list');
  const rows: ConvListRow[] = [];
  for (const x of items) {
    if (x === null || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) continue;
    const first = typeof r.first_message === 'string' ? r.first_message : '';
    const last = typeof r.last_request_at === 'string' ? Date.parse(r.last_request_at) : NaN;
    rows.push({ ref: { computer, realm, sid: r.id }, title: first ? C.titleOf(first) || null : null, at: Number.isFinite(last) ? last : null });
  }
  return rows.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
}

/** The provider pages reach through kit/agent/conversations (registered in ask/index.ts): a read source on the engine
 *  pinned to the reference. The host's words are the reference's own until a page gives better ones (refresh). */
export const askConversations: ConversationProvider = {
  open(account, ref, at) {
    if (!account) return null;
    const h = openRef(account, ref, at ?? undefined);
    if (!h) return null;
    // `at` names the computer only when it is the reference's own; else the directory resolved it and the handle stands.
    const shown = at && at.name && computerHandle(at) === ref.computer ? at.name : ref.computer;
    const src = engineSource(h, ref, () => ({ computer: shown, realm: ref.realm }));
    return { source: src, release: () => src.release() };
  },
  // The chats of the shown computer (the Board's Picker): one read of its agent's list, no engine opened.
  list(account, at, realm) {
    const computer = computerHandle(at);
    const read = account ? sessionsFor(account, { computer, realm }, at) : null;
    if (!read) return Promise.reject(new Error('computer not named'));
    return read().then((b) => listRows(b, computer, realm));
  },
};
