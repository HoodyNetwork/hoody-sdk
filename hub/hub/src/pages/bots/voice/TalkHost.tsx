// TalkHost: Talk in the Bot's composer: the kit's MicButton, TalkBar and
// CaptionStrip fed by the session, as the Composer's three slots plus its notes. Every words line here is one a state of
// Talk names; a maybe-sent note stays until a log row names it exactly.
import { CaptionStrip, MicButton, TalkBar, useStrings, useTalkShortcuts, type ComposerNote, type TalkActivity } from '@kit';
import { isFramed } from '@core';
import { useRef, type ReactElement } from 'react';
import { useLog, useBotView, useVoiceCaps, type BotView } from '../data';
import { micReason } from '../logic';
import strings from './talk.strings.en.json';
import { useBotVoice } from './useBotVoice';
import { voiceWords } from './voiceWords';

const OFF = new Set(['off']);
/** A band with a way on and nothing live: it sits above the draft box, and Send and the Mic stay (the text composer stays). */
const BAND_ONLY = new Set(['notReady', 'checkUnknown', 'denied', 'noDevice', 'busyElsewhere', 'budget', 'connectFailed', 'playbackBlocked', 'ended']);
const NO_CHECK = { stt: null, tts: null };

export interface TalkSlots {
  mic: ReactElement;
  talk: ReactElement | null;
  /** Talk's band when nothing is live: above the composer, whose Send and Mic stay. */
  band: ReactElement | null;
  captions: ReactElement | null;
  notes: ComposerNote[];
}

export function useTalkSlots(bot: BotView, botKey: string, onOpenSettings: () => void): TalkSlots {
  const t = useStrings(strings);
  const caps = useVoiceCaps(botKey);
  const logQ = useLog(botKey);
  const viewQ = useBotView(botKey);
  const refetchView = useRef(viewQ.refetch);
  refetchView.current = viewQ.refetch;
  const { session, snap } = useBotVoice(botKey, caps, logQ.page?.rows, () => void refetchView.current());
  const v = snap.voice;
  const on = !OFF.has(v.phase);
  const liveNow = v.phase === 'live' || v.phase === 'muting' || v.phase === 'muted';
  const stopping = !!v.stop && !v.stop.outcome;
  // The turn Stop answer would act on: the reply open on this connection, else the one the Bot view names.
  const turnId = v.reply?.turnId ?? (bot.turnRunning ? bot.turnId : null);
  const canStopAnswer = liveNow && turnId !== null;
  const canStopSpeaking = liveNow && v.speak && v.caps.stopSpeech && !!v.reply && !v.reply.speechStopped && !stopping;
  const stopAnswer = () => { if (turnId !== null) session.stopAnswer(turnId); };
  const stopNow = canStopSpeaking ? () => session.stopSpeaking() : canStopAnswer && !stopping ? stopAnswer : null;

  const micBox = useRef<HTMLSpanElement>(null);
  useTalkShortcuts({
    enabled: true,
    focus: () => micBox.current?.querySelector('button')?.focus(),
    ...(liveNow ? { toggleMute: () => (v.phase === 'muted' ? session.unmute() : session.mute()) } : {}),
    ...(stopNow ? { stop: stopNow } : {}),
  });

  const reason = micReason({ framed: isFramed(), caps, check: bot.speech?.ready === false ? { ready: false, ...NO_CHECK } : undefined });
  const mic = (
    <span ref={micBox}>
      <MicButton reason={reason === 'unknownYet' || reason === null ? undefined : reason} busy={v.phase === 'starting'} onPress={() => session.press()} />
    </span>
  );

  const heldNow = v.mic === 'ptt-held' || v.mic === 'latched';
  const activity: TalkActivity = heldNow ? 'hearing' : snap.view.activity;
  const talk = on ? (
    <TalkBar
      phase={v.phase}
      mode={v.mode}
      mic={v.mic}
      activity={activity}
      handsFree={snap.handsFree}
      level={snap.level}
      canStopAnswer={canStopAnswer}
      canStopSpeaking={canStopSpeaking}
      stopping={stopping}
      {...(snap.check ? { notReadyStage: t(snap.check.stt?.ok === false ? 'stage.stt' : 'stage.tts') } : {})}
      {...(v.ended ? { ended: v.ended } : {})}
      {...(snap.overflow ? { overflow: snap.overflow } : {})}
      inputs={snap.inputs}
      {...(snap.input ? { input: snap.input } : {})}
      outputs={snap.outputs}
      {...(snap.output ? { output: snap.output } : {})}
      canChooseOutput={snap.canChooseOutput}
      onPttDown={() => session.pttDown()}
      onPttUp={() => session.pttUp()}
      onMode={(m) => session.mode(m)}
      onMute={() => session.mute()}
      onUnmute={() => session.unmute()}
      onStopAnswer={stopAnswer}
      onStopSpeaking={() => session.stopSpeaking()}
      onEnd={() => session.end()}
      onInput={(id) => session.chooseInput(id)}
      onOutput={(id) => session.chooseOutput(id)}
      onRetry={() => session.press()}
      onTryAnyway={() => session.tryAnyway()}
      onTakeOver={() => session.takeOver()}
      onOpenSettings={onOpenSettings}
      onEnableSound={() => session.enableSound()}
    />
  ) : null;

  const captions = liveNow ? <CaptionStrip {...(snap.view.you ? { you: snap.view.you } : {})} {...(snap.view.bot ? { bot: { ...snap.view.bot, name: bot.name } } : {})} /> : null;

  const notes: ComposerNote[] = [];
  const open = v.notes.filter((n) => n.kind === 'uncorrelated' || !n.settled);
  if (open.some((n) => n.kind === 'maybeSent' && !snap.restored.has(`${n.conn}#${n.utt}`))) notes.push({ key: 'talk-may', text: t('note.maySent'), warn: true });
  if (open.some((n) => n.kind === 'maybeSent' && snap.restored.has(`${n.conn}#${n.utt}`))) notes.push({ key: 'talk-restored', text: t('note.notConfirmed'), warn: true });
  if (open.some((n) => n.kind === 'uncorrelated')) notes.push({ key: 'talk-some', text: t('note.someSpeech'), warn: true });
  if (liveNow) {
    if (snap.view.utt) notes.push({ key: 'talk-utt', text: voiceWords(snap.view.utt.family, snap.view.utt.code), warn: true, status: true });
    const r = snap.view.reply;
    if (r) notes.push({ key: 'talk-reply', text: r.family === 'unsure' ? t('note.unsure') : voiceWords(r.family, r.code), warn: r.warn, status: true });
    if (snap.damaged) notes.push({ key: 'talk-damaged', text: t('note.damaged'), warn: true, status: true });
    if (snap.suspended) notes.push({ key: 'talk-suspended', text: t('note.suspended'), warn: true, status: true });
    if (v.stop?.outcome) notes.push({ key: 'talk-stop', text: t(`stop.${v.stop.outcome}`), warn: v.stop.outcome === 'mayNotHaveStopped', status: true });
    if (snap.view.announced !== undefined) notes.push({ key: 'talk-announced', text: snap.view.announced ? t('note.announced', { task: snap.view.announced }) : t('note.announcedBare'), status: true });
  }
  if (v.refusal && (v.phase === 'connectFailed' || v.phase === 'notReady')) notes.push({ key: 'talk-refused', text: voiceWords('refused', v.refusal.code), warn: true, status: true });
  return BAND_ONLY.has(v.phase) ? { mic, talk: null, band: talk, captions, notes } : { mic, talk, band: null, captions, notes };
}
