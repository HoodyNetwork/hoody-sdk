// The pure rules of Settings > Voice: what a save sends (a PATCH replaces `speech` whole), what blocks it, what counts as changed, and the
// words for a refusal (from the agent's code and details, never its text).
import { describe, expect, it } from 'vitest';
import type { SpeechConfig } from './data';
import { audioModelParts, checkSummary, speechPatch, stageKind, stageWords, voiceDirty, voiceFormOf, voiceOffLoss, voiceProblem, voiceRefusalKey, type VoiceForm } from './logic';
import strings from './strings.en.json';

const cfg = (over: Partial<SpeechConfig> = {}): SpeechConfig => ({
  raw: { stt_model: 's/a', tts_model: 't/b', voice: 'v', language: 'en', speed: 1.2, speak_wakes: true, speak_gates: false, stt_prompt: 'names', limits: { tts_chars: 10 } },
  sttModel: 's/a', ttsModel: 't/b', voice: 'v', language: 'en', speed: 1.2, speakWakes: true, speakGates: false,
  ...over,
});
const form = (over: Partial<VoiceForm> = {}): VoiceForm => ({ ...voiceFormOf(cfg()), ...over });

describe('speechPatch', () => {
  it('off sends null: the setting goes and the default voices apply', () => {
    expect(speechPatch(form({ custom: false }), cfg())).toBeNull();
  });
  it('carries over the transcription prompt and the Bot\'s own limits, which the form does not edit', () => {
    expect(speechPatch(form(), cfg())).toEqual({ stt_model: 's/a', tts_model: 't/b', voice: 'v', language: 'en', speed: 1.2, stt_prompt: 'names', speak_wakes: true, speak_gates: false, limits: { tts_chars: 10 } });
  });
  it('leaves out a voice and a speed when there is no speaking model (the agent refuses them)', () => {
    const p = speechPatch(form({ tts: '' }), cfg()) as Record<string, unknown>;
    expect(p).not.toHaveProperty('tts_model');
    expect(p).not.toHaveProperty('voice');
    expect(p).not.toHaveProperty('speed');
  });
  it('leaves out the prompt when there is no listening model (the agent refuses it)', () => {
    expect(speechPatch(form({ stt: '' }), cfg())).not.toHaveProperty('stt_prompt');
  });
  it('sends the transcription prompt the form shows, with any listening model (the person can clear it); cleared sends none', () => {
    expect(speechPatch(form({ stt: 's/other' }), cfg())).toHaveProperty('stt_prompt', 'names');
    expect(speechPatch(form({ sttPrompt: '  Hoody  ' }), cfg())).toHaveProperty('stt_prompt', 'Hoody');
    expect(speechPatch(form({ sttPrompt: '' }), cfg())).not.toHaveProperty('stt_prompt');
  });
  it('a prompt is at most 500 characters', () => {
    expect(voiceProblem(form({ sttPrompt: 'x'.repeat(500) }))).toBeUndefined();
    expect(voiceProblem(form({ sttPrompt: 'x'.repeat(501) }))).toBe('prompt');
    expect(voiceProblem(form({ stt: '', sttPrompt: 'x'.repeat(501) }))).toBeUndefined();
  });
  it('the prompt counts as a change', () => {
    expect(voiceDirty(form({ sttPrompt: 'other' }), cfg())).toBe(true);
  });
  it('sends nothing for what is empty, and the language lower-cased and trimmed', () => {
    const p = speechPatch(form({ voice: '', language: ' PT-BR ', speed: null, sttPrompt: '' }), cfg({ raw: {} })) as Record<string, unknown>;
    expect(p).toEqual({ stt_model: 's/a', tts_model: 't/b', language: 'pt-br', speak_wakes: true, speak_gates: false });
  });
  it('from a Bot with no setting, sends only what was chosen', () => {
    const f = { ...voiceFormOf(null), custom: true, tts: 'x/y' };
    expect(speechPatch(f, null)).toEqual({ tts_model: 'x/y', speak_wakes: false, speak_gates: true });
  });
  it('sends no limits object when the Bot holds none or an empty one', () => {
    expect(speechPatch(form(), cfg({ raw: { limits: {} } }))).not.toHaveProperty('limits');
  });
});

describe('voiceProblem', () => {
  it('a language is a code or auto', () => {
    expect(voiceProblem(form({ language: 'en' }))).toBeUndefined();
    expect(voiceProblem(form({ language: 'PT-br' }))).toBeUndefined();
    expect(voiceProblem(form({ language: 'auto' }))).toBeUndefined();
    expect(voiceProblem(form({ language: '' }))).toBeUndefined();
    expect(voiceProblem(form({ language: 'english' }))).toBe('language');
    expect(voiceProblem(form({ language: 'e' }))).toBe('language');
  });
  it('a speed is above zero', () => {
    expect(voiceProblem(form({ speed: 0 }))).toBe('speed');
    expect(voiceProblem(form({ speed: -1 }))).toBe('speed');
    expect(voiceProblem(form({ speed: 0.5 }))).toBeUndefined();
    expect(voiceProblem(form({ speed: null }))).toBeUndefined();
  });
  it('a setting being taken away has nothing to check', () => {
    expect(voiceProblem(form({ custom: false, language: 'english', speed: 0 }))).toBeUndefined();
  });
});

describe('voiceDirty', () => {
  it('a form read from the Bot is not changed', () => {
    expect(voiceDirty(voiceFormOf(cfg()), cfg())).toBe(false);
    expect(voiceDirty(voiceFormOf(null), null)).toBe(false);
  });
  it('each field counts, and the language only by its code', () => {
    for (const over of [{ stt: 'z' }, { tts: 'z' }, { voice: 'z' }, { speed: 2 }, { speakWakes: false }, { speakGates: true }, { custom: false }]) expect(voiceDirty(form(over), cfg())).toBe(true);
    expect(voiceDirty(form({ language: ' EN ' }), cfg())).toBe(false);
    expect(voiceDirty(form({ language: 'pt' }), cfg())).toBe(true);
  });
  it('turning on from nothing is a change; fields of a setting that is off are not', () => {
    expect(voiceDirty({ ...voiceFormOf(null), custom: true }, null)).toBe(true);
    expect(voiceDirty({ ...voiceFormOf(null), custom: false, tts: 'x' }, null)).toBe(false);
  });
  it('a prompt kept with no listening model is not a change once the model is gone from what was saved', () => {
    const saved = cfg({ sttModel: '', raw: { tts_model: 't/b', voice: 'v', language: 'en', speed: 1.2, speak_wakes: true, speak_gates: false } });
    expect(voiceDirty(form({ stt: '', sttPrompt: 'names' }), saved)).toBe(false);
    expect(voiceDirty(form({ stt: 's/a', sttPrompt: 'names' }), saved)).toBe(true);
  });
  it('a voice and speed kept with no speaking model are not a change once saved (the save drops them)', () => {
    const saved = cfg({ ttsModel: '', voice: '', speed: null, raw: { stt_model: 's/a', language: 'en', speak_wakes: true, speak_gates: false, stt_prompt: 'names' } });
    expect(voiceDirty(form({ tts: '', voice: 'v', speed: 1.2 }), saved)).toBe(false);
    expect(voiceDirty(form({ tts: 't/b', voice: 'v', speed: 1.2 }), saved)).toBe(true);
    const withTts = cfg();
    expect(voiceDirty(form({ voice: 'other' }), withTts)).toBe(true);
    expect(voiceDirty(form({ speed: 2 }), withTts)).toBe(true);
  });
  it('the prompt is trimmed as the agent trims it: U+0085 goes, U+FEFF stays', () => {
    expect(voiceDirty(form({ sttPrompt: '\u0085names\u3000' }), cfg())).toBe(false);
    expect(voiceDirty(form({ sttPrompt: '\ufeffnames' }), cfg())).toBe(true);
    expect(voiceProblem(form({ sttPrompt: '\u0085' + 'a'.repeat(500) }))).toBeUndefined();
    expect(voiceProblem(form({ sttPrompt: '\ufeff' + 'a'.repeat(500) }))).toBe('prompt');
    expect(speechPatch(form({ sttPrompt: '\u0085 hi \u00a0' }), cfg())?.stt_prompt).toBe('hi');
  });
});

describe('voiceRefusalKey', () => {
  it('maps the agent\'s code, field and reason to words that exist', () => {
    for (const [code, field, reason] of [
      ['model_unavailable', 'speech.tts_model', 'not_tts'],
      ['model_unavailable', 'speech.tts_model', 'provider_refused'],
      ['model_unavailable', 'speech.stt_model', 'not_stt'],
      ['model_unavailable', 'speech.stt_model', 'unknown_model'],
      ['bad_request', 'speech.voice', ''],
      ['bad_request', 'speech.language', ''],
      ['bad_request', 'speech.speed', ''],
      ['bad_request', 'speech.stt_prompt', ''],
      ['bad_request', 'speech.limits.tts_chars', ''],
      ['bad_request', 'speech.limits.stt_seconds', ''],
    ] as const) {
      const k = voiceRefusalKey(code, { field, reason });
      expect(k, `${code} ${field}`).toBeDefined();
      expect(Object.keys(strings)).toContain(k);
    }
  });
  it('an unknown reason on a model falls back to the unknown-model words; anything else names nothing', () => {
    expect(voiceRefusalKey('model_unavailable', { field: 'speech.tts_model', reason: 'something_new' })).toBe('voice.refused.tts_model.unknown_model');
    expect(voiceRefusalKey('internal_error', undefined)).toBeUndefined();
    expect(voiceRefusalKey('bad_request', { field: 'speech.limits.tts_chars' })).toBe('voice.refused.limits');
    expect(voiceRefusalKey('bad_request', { field: 'speech.limits' })).toBeUndefined();
    expect(voiceRefusalKey(undefined, undefined)).toBeUndefined();
  });
});

describe('what a check stage says', () => {
  const st = (over: Partial<{ ok: boolean; code: string; reason: string }> = {}) => ({ ok: false, model: 'm', voice: '', code: '', reason: '', message: '', retryable: null, ...over });
  it('a stage the agent could not ask about is inconclusive, never failed', () => {
    expect(stageKind(st({ ok: true }))).toBe('ok');
    expect(stageKind(st({ code: 'service_unavailable', reason: 'check_timeout' }))).toBe('unknown');
    expect(stageKind(st({ code: 'service_unavailable', reason: 'check_failed' }))).toBe('unknown');
    expect(stageKind(st({ code: 'speech_unavailable', reason: 'no_credentials' }))).toBe('failed');
    expect(stageKind(st({ code: 'service_unavailable', reason: 'no_session' }))).toBe('failed');
  });
  it('the whole check is ready, not ready (a stage failed) or unknown (nothing failed, something could not be asked)', () => {
    const ok = st({ ok: true });
    const lost = st({ code: 'service_unavailable', reason: 'check_timeout' });
    const bad = st({ code: 'speech_unavailable', reason: 'no_credentials' });
    expect(checkSummary({ stt: ok, tts: ok })).toBe('ready');
    expect(checkSummary({ stt: ok, tts: lost })).toBe('unknown');
    expect(checkSummary({ stt: lost, tts: lost })).toBe('unknown');
    expect(checkSummary({ stt: lost, tts: bad })).toBe('notReady');
    expect(checkSummary({ stt: ok, tts: bad })).toBe('notReady');
    expect(checkSummary({ stt: null, tts: null })).toBe('unknown');
  });
});

describe('the check\'s words', () => {
  it('known reasons become plain guidance, whatever the agent\'s message says', () => {
    const w = stageWords({ message: 'Set the Bot\'s speech.stt_model or audio.relay_default; GET /api/v1/agent/audio/models', reason: 'not_configured', code: 'speech_unavailable' });
    expect(w).not.toMatch(/speech\.|audio\.|GET |\/api\//);
    expect(w.length).toBeGreaterThan(10);
  });
  it('an unknown reason shows the agent\'s message only when it names no setting, route or command', () => {
    expect(stageWords({ message: 'The provider is down for maintenance.', reason: 'brand_new', code: 'x' })).toBe('The provider is down for maintenance.');
    expect(stageWords({ message: 'Pick one from GET /api/v1/agent/audio/voices', reason: 'brand_new', code: 'x' })).not.toMatch(/GET|\/api\//);
    expect(stageWords({ message: 'Set speech.tts_model first', reason: 'brand_new', code: 'x' })).not.toMatch(/speech\./);
  });
  it('ordinary words that sound like a command are kept; only command and route syntax is hidden', () => {
    expect(stageWords({ message: 'Get a new key from your provider.', reason: 'brand_new', code: 'x' })).toBe('Get a new key from your provider.');
    expect(stageWords({ message: 'Pick one from GET /api/v1/agent/audio/voices', reason: 'brand_new', code: 'x' })).not.toMatch(/GET|\/api\//);
  });
  it('an unknown reason\'s message is made plain, scrubbed and cut; with no message, the reason or the code in words', () => {
    expect(stageWords({ message: 'No key sk-abcdefghijklmnop1234 here\u0000.', reason: 'r', code: 'c' })).not.toMatch(/sk-abcdefghijklmnop1234|\u0000/);
    expect(stageWords({ message: '', reason: 'weird_thing', code: 'speech_unavailable' })).toBe('weird thing');
    expect(stageWords({ message: '', reason: '', code: 'speech_unavailable' })).toBe('speech unavailable');
    expect(stageWords({ message: 'x'.repeat(500), reason: '', code: '' }).length).toBeLessThanOrEqual(200);
  });
  it('a model id is split at the first slash', () => {
    expect(audioModelParts('openai/gpt-4o/mini')).toEqual({ provider: 'openai', name: 'gpt-4o/mini' });
    expect(audioModelParts('bare')).toEqual({ provider: '', name: 'bare' });
  });
});

describe('voice words and the typed voice', () => {
  it('a technical name glued to an underscore is not shown as the reason', () => {
    for (const msg of ['Set default_stt_model first', 'HOODY_AUDIO_STT_MODEL is not set', 'missing bot_tts_model']) {
      expect(stageWords({ message: msg, reason: '', code: '' })).toBe(strings['voice.why.other']);
    }
    // plain words still show
    expect(stageWords({ message: 'No credentials for the speaking model.', reason: '', code: '' })).toBe('No credentials for the speaking model.');
  });
  it('a typed voice is sent trimmed, and spaces around it are no change', () => {
    expect((speechPatch(form({ voice: '  my voice ' }), cfg()) as Record<string, unknown>).voice).toBe('my voice');
    expect(voiceDirty(form({ voice: ' v ' }), cfg())).toBe(false);
    expect(voiceDirty(form({ voice: 'v 2' }), cfg())).toBe(true);
    expect(speechPatch(form({ voice: '   ' }), cfg())).not.toHaveProperty('voice');
  });
});

describe('voiceOffLoss: what turning the Bot\'s own voice settings off takes away', () => {
  const cfg = (raw: Record<string, unknown>) => ({ raw, sttModel: '', ttsModel: '', voice: '', language: '', speed: null, speakWakes: false, speakGates: true });
  it('nothing held, or only the models: nothing to say', () => {
    expect(voiceOffLoss(null)).toBeNull();
    expect(voiceOffLoss(cfg({ stt_model: 'a', tts_model: 'b' }))).toBeNull();
    expect(voiceOffLoss(cfg({ stt_prompt: '   ', limits: {} }))).toBeNull();
  });
  it('a prompt, own limits, and a limit of 0 (off) are each named', () => {
    expect(voiceOffLoss(cfg({ stt_prompt: 'Hoody' }))).toEqual({ prompt: true, limits: false, speechOff: false, listenOff: false });
    expect(voiceOffLoss(cfg({ limits: { tts_chars: 5000 } }))).toEqual({ prompt: false, limits: true, speechOff: false, listenOff: false });
    expect(voiceOffLoss(cfg({ limits: { tts_chars: 0 } }))).toEqual({ prompt: false, limits: true, speechOff: true, listenOff: false });
    expect(voiceOffLoss(cfg({ stt_prompt: 'x', limits: { tts_chars: 0, stt_seconds: 0 } }))).toEqual({ prompt: true, limits: true, speechOff: true, listenOff: true });
  });
  it('limits it would not carry (not an object) are not named', () => {
    expect(voiceOffLoss(cfg({ limits: [0] }))).toBeNull();
    expect(voiceOffLoss(cfg({ limits: null }))).toBeNull();
  });
});
