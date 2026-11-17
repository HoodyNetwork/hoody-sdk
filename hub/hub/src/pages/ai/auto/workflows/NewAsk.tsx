// New workflow with AI: the drawer's first side. It starts an ordinary chat on the shipped workflow-editor agent, in
// the realm and computer the drawer opened on, with the person's words in its first message, then opens that chat. Nothing here saves
// anything: the agent saves through its own tool, on a card in the chat, and the chat owns everything after the press.
// The start is C9, as New chat's (NewChat.tsx): it is sent once, a lost answer is unknown and never failed, Check again only reads, and
// only `opened` leaves this page. The start survives closing the drawer. While a start is unresolved the source form can't be opened (the
// drawer's switch holds it): the chat's opening closes the drawer, which would drop what was typed there. Only a New workflow drawer goes
// to a chat one started (New chat goes to its own, unless this drawer showed it unresolved). A chat an earlier start made that opens while
// this drawer holds words, on the form or in the ask box, waits behind Open it, which leaves through the drawer's guard, so it asks first;
// a start pressed here goes at once (the press set the form aside) until it ends without a chat.
import {
  Band, Button, Link, ReasonButton, Row, RowNote, Stack, TextButton, TextField, useGo, useStarter, useStrings, type StartAt, type StartPhase, type Starter,
} from '@kit';
import { useEffect, useRef, useState } from 'react';
import { hostEnv } from '@core';
import { chatLink, links } from '../../links';
import { firstMessage, roomFor, WORKFLOW_AGENT } from './newAsk';
import strings from './New.strings.en.json';

type Note = 'none' | 'untracked' | 'unlinked' | 'refused';
export interface NewAsk {
  text: string;
  setText(v: string): void;
  phase: StartPhase;
  starter: Starter | null;
  note: Note;
  setNote(n: Note): void;
  /** Why it can't start now, in words; '' when it can. */
  why: string;
  /** A start here is on its way or unresolved: the words are held. */
  busy: boolean;
  press(): void;
  /** The address of an earlier drawer's chat that opened while the source form held words; '' when none. */
  ready: string;
  /** Goes to `ready`, through the drawer's leave guard. */
  open(): void;
  /** Stop tracking an unknown start: settled, and no longer this drawer's. */
  stop(): void;
}

/** `at` null: nowhere to start from (the drawer moved off its computer or realm, or the computer isn't known). `stay`: the source form is
 *  showing (Make a copy… opened while an earlier drawer's start was on its way), so a chat that opens waits for the asking side.
 *  `formWords`: the source form holds what the person typed there. */
export function useNewAsk({ computer, at, stay, formWords, onLeave }: { computer: string; at: StartAt | null; stay: boolean; formWords: boolean; onLeave(): void }): NewAsk {
  const t = useStrings(strings);
  const go = useGo();
  const { starter, state } = useStarter(at, 'workflow');
  const phase = state.phase;
  const [text, setText] = useState('');
  const [note, setNote] = useState<Note>('none');
  const [ready, setReady] = useState('');
  // A start this drawer made, until it ends (its chat settled here, not sent, or Stop tracking): its chat is where the press goes, words or not.
  const mine = useRef(false);
  useEffect(() => { if (phase.k === 'notSent') mine.current = false; }, [phase]);
  // `opened` is the only phase that leaves, as New chat: settled first, so a phase that moved on does nothing.
  useEffect(() => {
    if (!starter || phase.k !== 'opened' || stay) return;
    const href = chatLink(phase.ref);
    // A start not this drawer's while it holds words: going now would close this drawer and drop them unasked.
    const wait = !mine.current && (formWords || text.trim() !== '');
    if (!starter.settle(phase)) return;
    // Settled: this drawer's own start, if it was one, ended here.
    mine.current = false;
    if (wait) { if (href) setReady(href); else setNote('unlinked'); return; }
    setText('');
    if (href) { onLeave(); go(href); } else setNote('unlinked');
  }, [starter, phase, stay, formWords, text, go, onLeave]);
  const busy = phase.k === 'waiting' || phase.k === 'starting' || phase.k === 'unknown';
  const why = !starter ? t('new.start.unavailable', { computer })
    : !state.door.ok ? state.door.why || t('new.start.unavailable', { computer })
      : busy ? t('new.start.busy')
        : text.trim() === '' ? t('new.ai.empty')
          : roomFor(text) < 0 ? t('new.ai.long', { over: String(-roomFor(text)) }) : '';
  const press = () => {
    if (!starter || why !== '') return;
    setNote('none');
    setReady('');
    if (starter.start(firstMessage(text), { agent: WORKFLOW_AGENT, strict: false, askFirst: true })) mine.current = true;
    else setNote('refused');
  };
  // No onLeave: the drawer stays open until the page changes, so its guard asks about the form's words first.
  const open = () => { if (ready) go(ready); };
  const stop = () => { if (starter?.settle(phase)) { mine.current = false; setNote('untracked'); } };
  return { text, setText, phase, starter, note, setNote, why, busy, press, ready, open, stop };
}

export function AskPrimary({ ask, moved, computer }: { ask: NewAsk; moved: boolean; computer: string }) {
  const t = useStrings(strings);
  const why = moved ? t('new.moved', { computer }) : ask.why;
  if (why) return <ReasonButton variant="primary" reason={why}>{t('new.ai.write')}</ReasonButton>;
  return <Button variant="primary" onPress={ask.press}>{t('new.ai.write')}</Button>;
}

export function AskBody({ ask, computer, moved }: { ask: NewAsk; computer: string; moved: boolean }) {
  const t = useStrings(strings);
  // The dialog takes focus as it opens; the question is where the person starts, and where they land coming back from the form.
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A web page: the textarea inside the field, a frame after the dialog's own focus. The terminal has no frames or DOM
    // query (both trapped there); its drawer focuses its first field itself.
    if (hostEnv().browserPage !== true) return;
    const f = window.requestAnimationFrame(() => field.current?.querySelector('textarea')?.focus());
    return () => window.cancelAnimationFrame(f);
  }, []);
  return (
    <Stack gap={4}>
      {moved && <Band tone="warn" size="table" /* noDetails: nothing was asked of the agent; the words say what changed */>{t('new.moved', { computer })}</Band>}
      <div ref={field}>
        <TextField
          label={t('new.ai.ask')}
          value={ask.text}
          onChange={ask.setText}
          multiline
          rows={5}
          isDisabled={ask.busy}
          description={t('new.ai.body', { computer })}
        />
      </div>
      {!moved && <StartBand ask={ask} computer={computer} />}
      <Row gap={1} wrap>
        <RowNote>{t('new.ai.agent', { agent: WORKFLOW_AGENT })}</RowNote>
        <Link href={links.agent(WORKFLOW_AGENT)}>{t('new.ai.agentEdit')}</Link>
      </Row>
    </Stack>
  );
}

/** What this start's phase says, in New chat's meanings. */
function StartBand({ ask, computer }: { ask: NewAsk; computer: string }) {
  const t = useStrings(strings);
  const { phase, starter, note } = ask;
  if (phase.k === 'waiting') return <Band tone="neutral" size="table" /* noDetails: nothing has left yet */>{t('new.start.waiting', { computer })}</Band>;
  if (phase.k === 'starting') return <Band tone="neutral" size="table" /* noDetails: on its way, nothing came back */>{t('new.start.starting', { computer })}</Band>;
  if (phase.k === 'notSent') {
    return (
      <Band tone="warn" size="table" /* noDetails: the agent's words are the sentence */ actions={<TextButton isDisabled={ask.why !== ''} onPress={ask.press}>{t('new.start.again')}</TextButton>}>
        {phase.why ? t('new.start.notSentWhy', { why: phase.why }) : t('new.start.notSent')}
      </Band>
    );
  }
  if (phase.k === 'unknown') {
    return (
      <Band
        tone="warn"
        size="table"
        // noDetails: the answer was lost, so nothing came back to show; Check again reads, it never sends
        actions={<>
          <TextButton onPress={() => starter?.check()}>{t('new.check')}</TextButton>
          <TextButton onPress={ask.stop}>{t('new.stop')}</TextButton>
        </>}
      >
        {phase.taken ? `${t('new.start.unknown', { computer })} ${t('new.start.unknownNoText')}` : t('new.start.unknown', { computer })}
      </Band>
    );
  }
  if (ask.ready) {
    return (
      <Band tone="neutral" size="table" /* noDetails: the chat was made; Open it goes there, asking first */ actions={<TextButton onPress={ask.open}>{t('new.open')}</TextButton>}>
        {t('new.start.ready', { computer })}
      </Band>
    );
  }
  if (note === 'refused') return <Band tone="warn" size="table" /* noDetails: the starter refused before anything left */>{t('new.start.notSent')}</Band>;
  if (note === 'untracked') return <Band tone="neutral" size="table" /* noDetails: the person stopped tracking; nothing came back */>{t('new.start.untracked')}</Band>;
  if (note === 'unlinked') return <Band tone="neutral" size="table" /* noDetails: the chat exists; it has no address this page can open */>{t('new.start.unlinked')}</Band>;
  return null;
}
