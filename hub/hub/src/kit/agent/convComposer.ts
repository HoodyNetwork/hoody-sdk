// convComposer.ts: a chat
// composer's send and Stop, one implementation for every surface that sends to an open chat (the AI tab's chat, the Board's
// conversation tile). Only files stay with the page (the kit may not read them: @ask/io),
// handed in through `ComposerFiles`.
//
// Attempts bind to their target: the open chat's send and Stop attempts, and its
// draft, kept OUTSIDE the render and bound to the chat they were made for. The target is captured when the person presses
// (account, computer handle, realm, session id); an answer lands on that target, never on whichever chat is shown when it
// arrives, and leaving the chat and coming back shows the attempt again. Memory only (one page life): nothing here is ever
// sent again, and a reload starts empty (the transcript's own rows say what became of a message).
//
// The send: one send and one Stop at a time per chat (a second press, or the same chat opened again, while one is on its way does
// nothing), and an answer lands on the chat it was sent to. `done` clears the draft; a refusal keeps it and offers Send it now
// (a new send); an unknown or a throw clears the box and holds Send for that chat until the person dismisses it, having
// checked the chat: nothing sends that text a second time, and dismissing records nothing as failed (C9).
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { composerCount, composerPlain } from './Composer';
import type { CapFacts } from './capability';
import type { ActiveSource, Draft, SendOutcome } from './source';

/** The commands the agent runs only as the exact text (the agent's own input handling: /clear, /skills, /hooks, /hooks reload);
 *  a draft that is one of them on one line, with nothing but whitespace after, is sent without that whitespace. */
const EXACT = /^\/(?:clear|skills|hooks(?: reload)?)[ \t]*$/u;
/** The text a draft sends. A pick from the "/" menu leaves "/name " in the draft, and the agent runs its exact-match
 *  commands only without it: such a draft goes trimmed. Any other text goes as typed, byte for byte: other "/" text (the agent
 *  passes it to the model, or parses its words itself), anything with a line break (a trailing blank line included), /exit. */
const sendText = (typed: string): string => (EXACT.test(typed) ? typed.trimEnd() : typed);

/** What became of the last message sent from this chat's composer. `sending`: on its way (Send is held). `notSent`: proven
 *  not admitted, the text kept for Send it now. `auto`: sent with "Auto-approve this reply"; Send it now asks for it again. `unknown`: no proof either way; the text left the box and nothing resends it. */
export type SendAttempt =
  | { k: 'sending'; text: string; auto?: true }
  | { k: 'notSent'; text: string; auto?: true }
  | { k: 'unresolved' }
  | { k: 'unknown' }
  | { k: 'dismissed' };
/** A Stop and the turn it was pressed for (`turn`: the running turn's agent id when pressed, null when the agent had not named
 *  it yet). `stopping` and `unknown` are unresolved: Stop stays held for that turn until certain facts show it no longer runs. */
export type StopAttempt = { k: 'stopping'; turn: string | null } | { k: 'unknown'; turn: string | null } | { k: 'refused'; turn: string | null };
export interface ChatAttempts { readonly draft: string; readonly send: SendAttempt | null; readonly stop: StopAttempt | null }

const EMPTY: ChatAttempts = Object.freeze({ draft: '', send: null, stop: null });
const byTarget = new Map<string, ChatAttempts>();
const subs = new Set<() => void>();

/** The chat's identity for its attempts: the account and the chat's own reference. */
export const attemptTarget = (account: string, computer: string, realm: string, sid: string): string => `${account}|${computer}|${realm}|${sid}`;

export function attemptsOf(target: string): ChatAttempts { return byTarget.get(target) ?? EMPTY; }

/** Changes one chat's record; every holder repaints. */
export function setAttempts(target: string, f: (a: ChatAttempts) => ChatAttempts): void {
  const before = attemptsOf(target);
  const after = f(before);
  if (after === before) return;
  if (!after.draft && !after.send && !after.stop) byTarget.delete(target); else byTarget.set(target, after);
  for (const fn of [...subs]) fn();
}

/** Puts a message taken back (Edit under a message the agent did not take) into the chat's draft: into an empty draft as is, after
 *  other text with a blank line, never twice. The draft only: the send and Stop records are the composer's alone. */
export function takeBackToDraft(target: string, text: string): void {
  setAttempts(target, (x) => (x.draft.trim() === '' ? { ...x, draft: text } : x.draft === text ? x : { ...x, draft: x.draft + '\n\n' + text }));
}

export function subscribeAttempts(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/** Tests only (imported from this module, never through the kit's index): the raw writer above and this reset could wipe an
 *  unknown send's hold, so no surface may reach them. */
export function resetAttemptsForTests(): void { byTarget.clear(); }

/** The longest message a chat composer takes, in characters of the typed text. */
export const CONV_MAX = 4000;
/** "Auto-approve this reply" for one send (the Send menu). */
export const CONV_AUTO = { autoApproveTurn: true } as const;
/** Could the turn a Stop was pressed for be the one running now? Only two different agent ids on certain facts say no: facts not
 *  yet agreeing with the agent's state (a reopened chat's stored turn) may show another id for the very turn pressed. */
const sameTurn = (pressed: string | null, now: string | null, certain: boolean): boolean => !certain || pressed === null || now === null || pressed === now;

/** The page's files for a send (the kit reads none). `take` is asked at the press, after the text and the capability passed:
 *  null holds the send (a read is still on, or the files cannot go with this text); otherwise the parts that go with it, and
 *  `drop`, called when the outcome took them or left no proof either way (done, unknown, a throw), never on a refusal. */
export interface ComposerFiles {
  take(text: string, via: 'turn' | 'command'): { parts: Pick<Draft, 'images' | 'files'>; drop(): void } | null;
}

export interface ConvComposer {
  attempts: ChatAttempts;
  /** The source's facts as this hook read them (one subscription: the page reads them here, not again). */
  facts: CapFacts;
  /** Send or follow up (a turn runs or a gate waits). */
  action: 'send' | 'followUp';
  /** The source's own answer for `action` and for Stop. */
  cap: ReturnType<ActiveSource['can']>;
  stopCap: ReturnType<ActiveSource['can']>;
  /** The draft as plain text. */
  plain: string;
  /** A send of this chat is on its way. */
  sending: boolean;
  /** An earlier message of this chat may have gone through: Send waits until the person has checked and dismissed it. */
  held: boolean;
  /** Send could take the typed text now (files aside: the page ANDs its own reasons). */
  canSendText: boolean;
  /** A Stop of the running turn is unresolved: Stop is held for that turn. */
  stopHeld: boolean;
  /** The transcript itself says a Stop's answer never came (a `stop` line): the page adds no Stop note of its own beside it. */
  stopShown: boolean;
  setDraft(d: string): void;
  send(pick?: typeof CONV_AUTO, only?: string): void;
  stop(): void;
  /** The unknown send: the person checked the chat (Stop tracking). */
  dismiss(): void;
}

/** The composer's send and Stop for `source`, bound to `target` (attemptTarget). */
export function useConvComposer(source: ActiveSource, target: string, files?: ComposerFiles): ConvComposer {
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  const read = useCallback(() => attemptsOf(target), [target]);
  const a: ChatAttempts = useSyncExternalStore(subscribeAttempts, read, read);
  const f = snap.facts;
  const action = f.turn || f.gate !== 'none' ? 'followUp' : 'send';
  const cap = source.can(action);
  const plain = composerPlain(a.draft);
  const sending = a.send?.k === 'sending';
  // An earlier message of this chat may have gone through: Send waits until the person has checked and dismissed it.
  const held = a.send?.k === 'unknown';
  const canSendText = cap.ok && !sending && !held && plain.trim() !== '' && composerCount(plain) <= CONV_MAX;
  const stopCap = source.can('stopTurn');
  // The running turn as the agent named it (the source's turn id; a transcript row's key is no turn identity).
  const turnNow = snap.turnId ?? null;
  // A Stop whose answer is still out, or never came, holds Stop for the turn it was pressed for: a second press,
  // a reopened chat or a recreated engine never sends another cancellation while the first is unresolved.
  const st0 = a.stop;
  // Certain facts that the turn is over settle the earlier Stop, its answer still out or not (a late answer then finds another
  // record and is dropped): nothing runs, or another NAMED turn runs; a missing id proves nothing. Certain means reachable, not
  // loading, and agreeing with the agent's own state read since this source opened (a reopened chat first shows its stored record).
  // A Stop pressed before the agent named its turn settles only when nothing runs (which turn it reached cannot be told).
  // The captured turn shown ended, by its own id, settles it too (that end is the agent's own evidence).
  const certain = f.reach === 'ok' && f.state !== 'loading' && !!snap.turnConfirmed;
  // An unnamed running turn may still be the captured one (a provisional send can hide it), so it is held too; so is any turn
  // while the facts are not certain (the same gate as the settling below).
  const stopHeld = !!st0 && (st0.k === 'stopping' || st0.k === 'unknown') && f.turn && sameTurn(st0.turn, turnNow, certain);
  const stopShown = snap.blocks.some((b) => b.k === 'line' && b.stop === true);
  useEffect(() => {
    if (!st0) return;
    const ended = st0.turn !== null && snap.endedTurnId === st0.turn;
    if (ended || (certain && (!f.turn || (st0.turn !== null && turnNow !== null && st0.turn !== turnNow)))) setAttempts(target, (x) => (x.stop === st0 ? { ...x, stop: null } : x));
  }, [st0, certain, f.turn, turnNow, snap.endedTurnId, target]);
  const setDraft = useCallback((d: string) => { setAttempts(target, (x) => (x.draft === d ? x : { ...x, draft: d })); }, [target]);

  // `pick`: "Auto-approve this reply" for this one send (the Send menu); kept on the attempt, so Send it now asks for it again.
  // `only`: the retry's own text. The policy rides only while the draft still is that text, never on text written after.
  const send = useCallback((pick?: typeof CONV_AUTO, only?: string) => {
    // The target is captured here; everything after answers to it, whatever chat is shown by then.
    const at = target;
    const now = attemptsOf(at);
    if (now.send?.k === 'sending' || now.send?.k === 'unknown') return;
    const typed = composerPlain(now.draft);
    const text = sendText(typed);
    // The limits are the typed draft's, as Send's own rule (canSendText) and the page's attachment check read it.
    if (!source.can(action).ok || !text.trim() || composerCount(typed) > CONV_MAX) return;
    const took = files ? files.take(typed, action === 'followUp' ? 'command' : 'turn') : { parts: {}, drop: () => {} };
    if (!took) return;
    const d: Draft = { text, ...took.parts };
    const o = pick && (only === undefined || only === text) ? pick : undefined;
    const auto = o ? { auto: true as const } : {};
    setAttempts(at, (x) => ({ ...x, send: { k: 'sending', text, ...auto } }));
    const settle = (o: SendOutcome) => {
      let next: SendAttempt | null;
      if (o.k === 'done') next = null;
      else if (o.k === 'refused') next = o.code === 'duplicate_held' ? { k: 'unresolved' } : { k: 'notSent', text, ...auto };
      else next = { k: 'unknown' };
      // Taken, or no proof either way: the text leaves the box (unless the person already wrote something else there).
      const clear = o.k !== 'refused';
      setAttempts(at, (x) => ({ ...x, send: next, draft: clear && composerPlain(x.draft) === typed ? '' : x.draft }));
      if (clear) took.drop();
    };
    let p: Promise<SendOutcome>;
    try { p = o ? source.send(d, o) : source.send(d); } catch { p = Promise.resolve({ k: 'unknown' }); }
    void p.then(settle, () => settle({ k: 'unknown' }));
  }, [target, source, action, files]);

  const stop = useCallback(() => {
    const at = target;
    const turn = turnNow;
    const prev = attemptsOf(at).stop;
    if (prev && (prev.k === 'stopping' || prev.k === 'unknown') && sameTurn(prev.turn, turn, certain)) return;
    if (!source.can('stopTurn').ok) return;
    const mine: StopAttempt = { k: 'stopping', turn };
    setAttempts(at, (x) => ({ ...x, stop: mine }));
    const settle = (o: SendOutcome) => {
      // An answer that names nothing new (stop_pending: one is already on its way; no_turn: nothing runs) leaves the record as
      // the transcript will settle it, never as failed; only a definite refusal says the turn was not stopped.
      const next: StopAttempt | null = o.k === 'unknown' ? { k: 'unknown', turn }
        : o.k === 'refused' && (o.code === 'stop_pending' || o.code === 'no_turn') ? { k: 'unknown', turn }
          : o.k === 'refused' ? { k: 'refused', turn } : null;
      // Only this press's record: a later turn's Stop pressed meanwhile (or a settled record) is never overwritten by a late answer.
      setAttempts(at, (x) => (x.stop === mine ? { ...x, stop: next } : x));
    };
    let p: Promise<SendOutcome>;
    try { p = source.stop('turn'); } catch { p = Promise.resolve({ k: 'unknown' }); }
    void p.then(settle, () => settle({ k: 'unknown' }));
  }, [target, source, turnNow, certain]);

  const dismiss = useCallback(() => { setAttempts(target, (x) => ({ ...x, send: { k: 'dismissed' } })); }, [target]);
  return { attempts: a, facts: f, action, cap, stopCap, plain, sending, held, canSendText, stopHeld: !!stopHeld, stopShown, setDraft, send, stop, dismiss };
}
