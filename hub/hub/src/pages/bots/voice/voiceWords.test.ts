// Every code voiceCodes.gen.json lists (the published voice contract's codes) has its own words, every family has its
// "other" words for a code a newer agent adds, and the strings hold nothing else.
import { describe, expect, it } from 'vitest';
import { VOICE_CODES, voiceWords, type VoiceCodeFamily } from './voiceWords';
import strings from './voiceWords.strings.en.json';

const families = Object.keys(VOICE_CODES) as VoiceCodeFamily[];

describe('voiceWords', () => {
  it('every listed code has its own words', () => {
    const missing = families.flatMap((f) => VOICE_CODES[f].filter((c) => !(`${f}.${c}` in strings)).map((c) => `${f}.${c}`));
    expect(missing, 'add words for these codes to voiceWords.strings.en.json').toEqual([]);
  });
  it('every family has words for a code it does not know, and the strings name only listed codes', () => {
    for (const f of families) expect(strings, f).toHaveProperty(`${f}.other`);
    const listed = new Set(families.flatMap((f) => [...VOICE_CODES[f].map((c) => `${f}.${c}`), `${f}.other`]));
    expect(Object.keys(strings).filter((k) => !listed.has(k))).toEqual([]);
  });
  it('a listed code reads its own words; an unknown, missing or inherited one reads the family words, never the code', () => {
    expect(voiceWords('rejected', 'frame_loss')).toBe(strings['rejected.frame_loss']);
    expect(voiceWords('refused', 'voice_busy')).toBe(strings['refused.voice_busy']);
    for (const c of ['made_up_code', undefined, '', 'toString', '__proto__', 'other']) {
      expect(voiceWords('speech', c as string | undefined)).toBe(strings['speech.other']);
    }
    expect(voiceWords('error', 'made_up_code')).not.toContain('made_up_code');
  });
  it('the same code in two families reads each family\'s words', () => {
    expect(voiceWords('rejected', 'busy')).toBe(strings['rejected.busy']);
    expect(voiceWords('textResult', 'busy')).toBe(strings['textResult.busy']);
    expect(voiceWords('rejected', 'busy')).not.toBe(voiceWords('textResult', 'busy'));
  });
  // Meaning, which the coverage checks above cannot see.
  it('a refused message never reads as sent: a reused send key says it was not sent', () => {
    const w = voiceWords('textResult', 'idempotency_key_reused');
    expect(w).toMatch(/wasn't sent|was not sent/i);
    expect(w).not.toMatch(/already sent|was sent|delivered/i);
    for (const k of Object.keys(strings).filter((x) => x.startsWith('refused.'))) {
      expect(strings[k as keyof typeof strings], k).not.toMatch(/already sent|was sent|delivered/i);
    }
  });
  it('a dropped message never reads as sent, whatever the reason', () => {
    for (const c of [...VOICE_CODES.textDropped, 'a_reason_added_later', undefined]) {
      const w = voiceWords('textDropped', c);
      expect(w, String(c)).toMatch(/wasn't sent/i);
      expect(w, String(c)).not.toMatch(/already sent|was sent|delivered|a_reason_added_later/i);
    }
    expect(voiceWords('textDropped', 'access_revoked')).not.toMatch(/send it again/i);
  });
  it('the speech limit names both causes: turned off for the Bot, or today\'s limit used up', () => {
    const w = voiceWords('speech', 'speech_limit');
    expect(w).toMatch(/turned off/i);
    expect(w).toMatch(/today's speaking limit/i);
  });
  it('a translator passed in is used', () => {
    expect(voiceWords('failure', 'refusal', ((k: string) => `T:${k}`) as never)).toBe('T:failure.refusal');
  });
});
