// Composer.tsx: the dock's composer. The box, its keys, the chips and the counter are the kit's (kit/agent/Composer);
// this file is the adapter that reads the engine's snapshot and says, in the dock's words, what the kit draws:
// when Send works (ready, room, no gate-blocked follow-up, files that fit), the notes above the box, the files' lines,
// the Approve automatically switch. Text that arrives from elsewhere (prefill, suggestions) only fills the draft;
// nothing sends itself. Files are registered with the engine at once (Send waits for them) and read after the one
// before, so they keep their order and each read knows how much room the draft has left.
// A message with an image cannot join a running turn (a follow-up carries text): Send queues it instead of refusing it
// (kit/agent/queuedSend.ts). The queued message is the draft and its chips, still editable; it goes once, by the engine's own
// send, when the turn is over and nothing waits, and never from a composer that was closed meanwhile.
//
// The switch writes the conversation's yolo setting, which Details → Session changes too. Both keep their change in one
// store (kit useApproval's attempts, by computer|realm|conversation): the switch takes the conversation's attempt before
// it sends and settles it from the engine's answer; while either surface holds one, the switch sends nothing and says
// why, and a change that may have gone through offers Check again (one read, nothing resent).
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Composer as KitComposer, ConfirmDialog, IconButton, TextButton, composerPlain, formatBytes, formatNumber, queuedIsCommand, queuedOf, setQueued, useQueuedSend, useStrings, type ComposerNote } from '@kit';
import { checkApprovalAttempt, takeApprovalAttempt, useApprovalAttempt } from '@kit/agent/useApproval';
import type { Target } from '@core';
import * as A from './attach';
import { readFiles } from './attachio';
import * as C from './conv';
import { targetOf, type AskEngine, type Snapshot } from './engine';
import { MAX_TEXT } from './logic';
import strings from './strings.en.json';

/** The dock's Stop for the running turn, drawn by the working bar only (the composer draws none, as on the AI page): only for a turn
 *  the agent named. `bar`: also none while the chat is catching up (nothing is proven running then). */
export function stopFor(snap: Snapshot, onPress: () => void, bar = false): { busy: boolean; unknown?: boolean; onPress: () => void } | null {
  const t0 = C.current(snap.conv);
  if (!t0 || !C.running(t0) || !t0.s.turnId || (bar && snap.catchingUp)) return null;
  // A Stop whose answer was lost stays held (never sent again), and the bar does not say the turn is stopping (C9).
  return t0.s.stopUnsure ? { busy: true, unknown: true, onPress } : { busy: !!t0.s.stopping, onPress };
}

export interface ComposerProps {
  eng: AskEngine;
  snap: Snapshot;
  computer: string;
  draft: string;
  setDraft: (v: string) => void;
  /** The prefill note ("From Logs · edit it, then press Enter"), or null. */
  note: string | null;
  onDismissNote: () => void;
  flash: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onTyping: (v: boolean) => void;
}

/** The conversation the switch writes, as Details → Session names it: null until its session exists. */
function approvalOwner(eng: AskEngine): { target: Target; realm: string; session: string } | null {
  const rec = eng.record ?? null;
  const slot = eng.slot;
  return rec?.s && slot ? { target: targetOf(slot.project, slot.computer, slot.server), realm: rec.r, session: rec.s } : null;
}

/**
 * The switch's change, sent through the engine under the conversation's shared attempt. False when it held back: another
 * change is unsettled, or the engine sent nothing (then the unsent attempt is dropped). The attempt ends with THIS write's
 * own end as the engine tells it, exactly once (engine setAuto: its answer, or a reset of the conversation under it), never
 * with another write's (the send path writes too): answered drops it, anything else leaves it "may have gone through".
 */
function setAutoShared(eng: AskEngine, want: boolean): boolean {
  const own = approvalOwner(eng);
  if (!own) {
    eng.setAuto(want);
    return true;
  }
  const h = takeApprovalAttempt(own.target, own.realm, own.session, { field: 'yolo', value: want });
  if (!h) return false;
  const sent = eng.setAuto(want, (o) => (o === 'answered' ? h.settle() : h.unknown()));
  if (!sent) h.settle();
  return sent;
}

/** The engine's own number, for the key its queued message is kept under (an engine is one account, computer and realm). */
const dockIds = new WeakMap<AskEngine, number>();
let dockSeq = 0;
function dockId(eng: AskEngine): number {
  let id = dockIds.get(eng);
  if (id === undefined) { id = ++dockSeq; dockIds.set(eng, id); }
  return id;
}

export function Composer({ eng, snap, computer, draft, setDraft, note, onDismissNote, flash, inputRef, onTyping }: ComposerProps) {
  const t = useStrings(strings);
  // A new conversation starts with Approve automatically On; Off is one press, and On again (by hand) names its effect first.
  const [askOn, setAskOn] = useState(false);
  const own = approvalOwner(eng);
  const held = useApprovalAttempt(own?.target ?? null, own?.realm ?? null, own?.session ?? null);
  const setAuto = (want: boolean) => { setAutoShared(eng, want); };
  const checkHeld = () => {
    if (!own || held?.kind !== 'pending') return;
    void checkApprovalAttempt(own.target, own.realm, own.session).then(() => eng.checkMode());
  };
  const plain = composerPlain(draft);
  const over = [...plain].length > MAX_TEXT;
  const t0 = C.current(snap.conv);
  const running = C.running(t0);
  const route = C.routeFor(snap.conv);
  const followBlocked = route === 'command' && !snap.followUps;
  const more = C.canSendMore(snap.conv);
  // Why Send cannot take the attached files with this text now (images wait for a turn; the whole must fit).
  // Images wait for a turn of their own: that one reason queues the message (below), judged as the turn it will be.
  const attNow = eng.attBlock(plain);
  const waits = attNow === 'ask.attImgLater';
  const attWhy = waits ? A.sendBlock(plain, snap.att.items, 'turn') : attNow;
  const qKey = `dock|${dockId(eng)}|${snap.conv.sid ?? ''}`;
  const queued = useQueuedSend(qKey);
  // A page's text owes a new conversation, but a first message that may exist still stands: nothing goes over it (its Check lives here).
  const freshHeld = snap.freshHeld === true;
  const canGo = !!plain.trim() && !over && snap.sendable && more && (waits || !followBlocked) && !attWhy && !freshHeld;
  // Already queued and still waiting: a second press has nothing to add (the queued message is this draft).
  const canSend = canGo && !(waits && queued === 'on');
  // Files are read off the event; the draft they are measured against is the one standing when the read ends.
  const plainNow = useRef(plain);
  plainNow.current = plain;
  const chain = useRef<Promise<void>>(Promise.resolve());
  const addFiles = (files: readonly File[]) => {
    if (!files.length) return;
    const token = eng.beginRead();
    chain.current = chain.current
      .then(() => readFiles(files, eng.attRoom()))
      .then((list) => eng.attach(list, plainNow.current, token), () => eng.attach([], plainNow.current, token));
  };
  const att = snap.att;
  // The computer this chat runs on (the engine's own slot), for a screenshot of one of its displays; none while its server is not known.
  const slot = eng.slot;
  const shotProject = slot ? slot.project : '', shotComputer = slot ? slot.computer : '', shotServer = slot ? slot.server : undefined;
  // A screenshot asked for in a conversation that is only now being created (its first message is on its way) stays with
  // the conversation it becomes; any other change of conversation ends it.
  const sidNow = snap.conv.sid ?? '';
  const [shotChat, setShotChat] = useState({ sid: sidNow, n: 0 });
  if (shotChat.sid !== sidNow) setShotChat({ sid: sidNow, n: shotChat.sid === '' ? shotChat.n : shotChat.n + 1 });
  const shotTarget = useMemo(() => (shotServer ? targetOf(shotProject, shotComputer, shotServer) : null), [shotProject, shotComputer, shotServer]);
  const send = (anyway = false) => {
    if (!canSend) return;
    if (waits) { setQueued(qKey, 'on'); return; }
    setQueued(qKey, null);
    if (eng.send(plain, anyway)) setDraft('');
  };
  const dup = snap.dup && snap.dup.text === plain ? snap.dup : null;
  const why = !snap.sendable ? t('ask.sendsWhenReady', { computer }) : followBlocked && !waits ? t('ask.followUnsupported') : freshHeld ? t('ask.freshWaitsCheck') : more ? '' : t(C.sendHeldBy(snap.conv) === 'unknown' ? 'ask.checkLastFirst' : 'ask.waitEarlier');
  const attNotes = att.refused.map((r) => t(r.key as 'ask.attNotText', { name: r.name, size: r.size === undefined ? '' : formatBytes(r.size) }));
  if (att.dropped) attNotes.push(t(att.dropped as 'ask.attDropped'));
  const autoMsg = snap.auto.err;
  const shown = eng.autoShown();
  const notes: ComposerNote[] = [];
  if (note) notes.push({ key: 'note', text: note, end: <IconButton icon="x" size="sm" label={t('ask.dismiss')} onPress={onDismissNote} /> });
  if (dup) notes.push({ key: 'dup', text: t(dup.earlier ? 'ask.dupEarlier' : 'ask.dupSame'), warn: true, status: true, end: <TextButton onPress={() => send(true)}>{t('ask.sendAnyway')}</TextButton> });
  if (running && plain.trim() && !followBlocked && !waits && (snap.gate || more)) {
    // Only an approval card has Deny: a question waits for its answer.
    const l = snap.gate ? t(snap.gate.kind === 'question' ? 'ask.afterQuestionNote' : 'ask.afterGateNote') : t('ask.followUp');
    notes.push({ key: l, text: l });
  }
  if (snap.needLogin && route === 'create') notes.push({ key: 'login', text: t('ask.signInNote') });
  // An unsettled change (from here or Details) speaks for the switch: its own "may not have changed" is the same fact.
  if (held?.kind === 'pending') notes.push({ key: 'autoHeld', text: t('ask.autoMaybe'), warn: true, status: true, end: <TextButton onPress={checkHeld}>{t('ask.checkAgain')}</TextButton> });
  else if (held && !snap.auto.busy) notes.push({ key: 'autoHeld', text: t('ask.autoHeld'), status: true });
  // A switch whose state is not known reads it again here, gate or not (the dock's Check again shows only beside a parked gate).
  else if (autoMsg) notes.push({ key: 'autoErr', text: t(autoMsg as 'ask.autoOnDone'), warn: true, error: snap.auto.errE, ...(autoMsg === 'ask.autoUnknown' && !snap.auto.busy ? { end: <TextButton onPress={() => eng.checkMode()}>{t('ask.checkAgain')}</TextButton> } : {}) });
  if (attNotes.length > 0) {
    notes.push({ key: 'attNotes', text: attNotes, warn: true, status: true, end: <IconButton icon="x" size="sm" label={t('ask.dismiss')} onPress={() => eng.clearAttNotes()} /> });
  }
  // The queued message goes once, when the turn is over and no request waits; the mark is cleared before the send, so nothing sends
  // it again, and what became of the send is the row's own state. A read still on is waited for. When Send cannot take it, it stays.
  // "Over" is the agent's own word: its last state read (since this engine opened) names no running turn. A conversation that only
  // LOOKS idle (a lost stream, a reopened page not yet read) sends nothing by itself; the message stays queued until that read.
  const turnOver = route === 'turn' && !running && !snap.gate && snap.stateTurn === null;
  const nothing = !plain.trim() && att.items.length === 0;
  const isCommand = queuedIsCommand(plain);
  const noWhy = isCommand ? t('ask.queuedNext.command') : why || (!plain.trim() ? t('ask.queuedNext.empty') : over ? t('ask.queuedNext.long') : attWhy ? t(attWhy as 'ask.attTooLong') : t('ask.queuedNext.press'));
  useEffect(() => {
    if (queued !== 'on' || !turnOver || attNow === 'ask.attReading' || queuedOf(qKey) !== 'on') return;
    setQueued(qKey, null);
    if (canGo && !isCommand && eng.send(plain)) setDraft('');
    else if (!nothing) setQueued(qKey, { no: noWhy });
  }, [queued, turnOver, attNow, qKey, canGo, isCommand, eng, plain, setDraft, nothing, noWhy]);
  // A composer that goes (the dock closed, another conversation) sends nothing later: said when it is back.
  useEffect(() => () => { if (queuedOf(qKey) === 'on') setQueued(qKey, 'left'); }, [qKey]);
  // The queued note's own action is a row action at the kit's button size, as on the AI page.
  const unqueue = <Button size="sm" variant="ghost" onPress={() => setQueued(qKey, null)}>{t(queued === 'on' ? 'ask.queuedNext.cancel' : 'ask.dismiss')}</Button>;
  if (queued === 'on') notes.push({ key: 'queued', text: t(snap.gate ? 'ask.queuedNext.onGate' : 'ask.queuedNext.on'), status: true, describes: true, end: unqueue });
  else if (queued === 'left' || queued === 'gone') notes.push({ key: 'queued', text: t('ask.queuedNext.left'), warn: true, status: true, end: unqueue });
  else if (queued) notes.push({ key: 'queued', text: [t('ask.queuedNext.kept'), queued.no], warn: true, status: true, end: unqueue });
  else if (waits && canGo) notes.push({ key: 'queueHint', text: t(snap.gate ? 'ask.queuedNext.hintGate' : 'ask.queuedNext.hint'), describes: true });
  if (attWhy) notes.push({ key: 'attWhy', text: t(attWhy as 'ask.attImgLater'), warn: attWhy !== 'ask.attReading', status: true });
  return (
    <>
    <KitComposer
      draft={draft}
      setDraft={setDraft}
      inputRef={inputRef}
      placeholder={t('ask.placeholder', { computer })}
      max={MAX_TEXT}
      canSend={canSend}
      onSend={() => send(false)}
      sendWhy={why || (waits && queued === 'on' ? t('ask.queuedNext.sendWhy') : '')}
      sendQuiet={!!snap.gate || !canSend}
      notes={notes}
      attachments={att.items.map((a) => ({
        id: a.id,
        kind: a.kind,
        name: a.name,
        url: a.kind === 'image' ? a.url : null,
        meta: a.kind === 'text'
          ? t('ask.attLines', { count: a.lines, n: formatNumber(a.lines) })
          : a.resized
            ? t('ask.attResized', { from: formatBytes(a.resized.from), to: formatBytes(a.resized.to) })
            : formatBytes(a.bytes),
      }))}
      onAddFiles={addFiles}
      // The dock's chat runs on the engine's own computer: a screenshot comes from there, whatever the page beside it shows.
      screenshot={{ chat: `dock|${dockId(eng)}|${shotChat.n}`, target: shotTarget, computer, room: A.IMG_MAX - att.items.filter((x) => x.kind === 'image').length, max: A.IMG_MAX, noTarget: t('ask.shotNoServer', { computer }) }}
      onRemoveAttachment={(id) => eng.unattach(id)}
      // Stop is drawn once, at the end of the working bar (or the Needs-you bar) under the transcript (DockSession), as the AI page
      // draws it: never a second one in the box.
      stop={null}
      auto={snap.auto.cap ? { shown, busy: snap.auto.busy || !!held, onChange: (v) => (v ? setAskOn(true) : setAuto(false)) } : null}
      flash={flash}
      onTyping={onTyping}
    />
    <ConfirmDialog
      isOpen={askOn}
      onOpenChange={setAskOn}
      title={t('ask.autoConfirmTitle')}
      body={t('ask.autoConfirmBody')}
      confirmLabel={t('ask.autoConfirmGo')}
      onConfirm={() => { setAskOn(false); setAuto(true); }}
    />
    </>
  );
}
