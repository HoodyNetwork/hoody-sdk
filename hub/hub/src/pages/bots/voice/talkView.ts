// talkView.ts: what the Talk surface shows from the frames of one connection, beside the machine's own state (machine.ts
// holds what decides; this holds only words to draw). Pure: `talkViewStep(view, frame)`.
//   - Captions: the person's words from transcript frames, the Bot's from reply frames. reply.provisional carries new
//     text, reply.invalidate withdraws from a raw position on, reply.final replaces all of it. Each line keeps its last
//     CAPTION_MAX units (the budget is 32 KB per turn).
//   - An utterance's outcome and a reply's outcome are codes, turned into words by the host (voiceWords). A person's own
//     action (barge_in, cancelled) is a neutral note; anything else is a warning.
import type { CaptionLine } from '@kit';
import type { ServerFrame } from './runner';

export const CAPTION_MAX = 8000;

export type TalkActivityNow = 'listening' | 'hearing' | 'thinking' | 'speaking';
export type UttNote = { family: 'noSpeech' | 'rejected' | 'failed'; code: string };
export type ReplyNote = { family: 'speech' | 'failure'; code: string; warn: boolean } | { family: 'unsure'; warn: true };

export interface TalkView {
  you?: CaptionLine;
  bot?: CaptionLine;
  /** The reply the bot line belongs to: another reply's frames start the line again. */
  botTurn?: string;
  /** How many units of the reply's start the bot line no longer holds: reply.invalidate counts from the reply's start. */
  botCut?: number;
  activity: TalkActivityNow;
  utt?: UttNote;
  reply?: ReplyNote;
  /** An announcement of a delegate's gate, spoken: named by the task it waits for when the frame says so. */
  announced?: string;
}

export const TALK_VIEW_START: TalkView = { activity: 'listening' };

const tail = (s: string): string => (s.length > CAPTION_MAX ? s.slice(-CAPTION_MAX) : s);
const NEUTRAL: ReadonlySet<string> = new Set(['barge_in', 'cancelled']);

export function replyNoteOf(f: Extract<ServerFrame, { type: 'reply.final' }>): ReplyNote | undefined {
  if (f.failure) return { family: 'failure', code: f.failure, warn: true };
  if (f.reason) return { family: 'speech', code: f.reason, warn: !NEUTRAL.has(f.reason) };
  return f.spoken === 'unknown' ? { family: 'unsure', warn: true } : undefined;
}

export function talkViewStep(v: TalkView, f: ServerFrame): TalkView {
  switch (f.type) {
    case 'session':
      return TALK_VIEW_START;
    case 'vad.start':
      return { ...v, activity: 'hearing', utt: undefined };
    case 'vad.end':
      return { ...v, activity: 'thinking' };
    case 'transcript.partial':
      return { ...v, you: { text: tail(f.text), final: false } };
    case 'transcript.final': {
      const utt: UttNote | undefined = f.message_id ? undefined
        : f.no_speech !== undefined ? { family: 'noSpeech', code: f.no_speech }
        : f.rejected !== undefined ? { family: 'rejected', code: f.rejected }
        : { family: 'failed', code: f.failed ?? '' };
      return { ...v, you: { text: tail(f.text), final: true }, utt, activity: f.message_id ? 'thinking' : 'listening' };
    }
    case 'reply.provisional': {
      const same = v.botTurn === f.turn_id && v.bot && !v.bot.final;
      const whole = (same ? v.bot!.text : '') + f.text;
      const botCut = (same ? v.botCut ?? 0 : 0) + Math.max(0, whole.length - CAPTION_MAX);
      return { ...v, botTurn: f.turn_id, botCut, bot: { text: tail(whole), final: false }, reply: same ? v.reply : undefined, activity: v.activity === 'speaking' ? 'speaking' : 'thinking' };
    }
    case 'reply.invalidate':
      return v.botTurn === f.turn_id && v.bot && !v.bot.final
        ? { ...v, botCut: Math.min(v.botCut ?? 0, f.from_raw), bot: { text: v.bot.text.slice(0, Math.max(0, f.from_raw - (v.botCut ?? 0))), final: false } }
        : v;
    case 'reply.final':
      return { ...v, botTurn: f.turn_id, bot: { text: tail(f.text), final: true }, reply: replyNoteOf(f), activity: 'listening' };
    case 'output.start':
      return { ...v, activity: 'speaking' };
    case 'output.stop':
      return { ...v, activity: 'listening' };
    case 'gate.announced': {
      const task = f.ref.task ?? f.ref.title;
      return { ...v, announced: typeof task === 'string' ? task : '' };
    }
    case 'own_gate.resolved':
      return v;
    default:
      return v;
  }
}
