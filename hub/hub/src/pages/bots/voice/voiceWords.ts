// voiceWords.ts: the words for each code the Bot's voice connection can name.
//
// The code lists come from the agent's published getBotVoice contract (x-async-api in the agent's openapi.json), copied
// into voiceCodes.gen.json by voiceWords.spec.test.ts (HUB_VOICE_CODES_REGEN=1 rewrites it; without the flag the test
// fails on any drift). Some lists are enums, some are only named in a field's description (refused.code,
// transcript.final rejected, no_speech and failed). voiceWords.test.ts fails when a listed code has no words here.
// A code a newer agent adds reads as its family's "other" words, never as the raw code.
import { makeT } from '@kit/pure';
import codes from './voiceCodes.gen.json';
import strings from './voiceWords.strings.en.json';

/** Which field a code came from: refused.code, transcript.final rejected/no_speech/failed, error.code, reply.final and
 *  output.stop reason (speech), reply.final failure, text.result code (a message that was refused), text.result reason
 *  (textDropped: a message the Bot took, then dropped before it was posted). */
export type VoiceCodeFamily = 'refused' | 'rejected' | 'noSpeech' | 'failed' | 'error' | 'speech' | 'failure' | 'textResult' | 'textDropped';
export const VOICE_CODES: Readonly<Record<VoiceCodeFamily, readonly string[]>> = codes;

type Translate = ReturnType<typeof makeT<typeof strings>>;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
let shared: Translate | null = null;

/** The words for `code` of `family`: its own words when the published contract lists it, else the family's. */
export function voiceWords(family: VoiceCodeFamily, code: string | undefined, t?: Translate): string {
  const tr = t || (shared ??= makeT(strings));
  const key = `${family}.${code}`;
  // voiceWords.test.ts pins the words to the published lists exactly (none missing, none stray), so a key with words
  // is a listed code.
  const known = typeof code === 'string' && own(strings, key);
  return tr((known ? key : `${family}.other`) as keyof typeof strings);
}
