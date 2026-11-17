// The Bots voice data spine. What the agent says about voice is read as it
// is or not at all: an unread capability is unknown (never "no"), a spoken row's connection is kept as sent, a partial
// usage read is no read (never zeros), and a spoken send settles only on its own (conn, utt).
import { renderHook } from '@testing-library/react';
import type * as Core from '@core';
import { describe, expect, it, vi } from 'vitest';
import { logOf, logVoiceOf, registerTargets, speechUsageOf, useVoiceCaps, voiceCapsNow, voiceCapsOf, voiceCheckOf, VOICE_CAPS_UNKNOWN, type LogRow, type VoiceCaps } from './data';
import { micReason, rowForUtterance, speechUsageLine, stageWords, voiceMarkParts, VOICE_CHECK_REASONS } from './logic';
import strings from './strings.en.json';

// The capability read, stood in for: it always holds an earlier answer (as the query does after its computer is gone) and
// records whether the page asked it to read, so the hook is checked on what it does with `enabled`.
const READ = vi.hoisted(() => ({ asked: [] as Array<boolean | undefined>, answer: undefined as unknown }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return {
    ...core,
    fixtureModeActive: () => false, // a live page: a Bot is read only when its computer is a target
    coreSource: (...a: Parameters<typeof core.coreSource>) => {
      const real = core.coreSource(...a);
      return {
        ...real,
        useQuery: (key: string, params?: unknown, o?: { enabled?: boolean }) => {
          if (key !== 'voiceCaps') return (real.useQuery as (k: string, p?: unknown, o?: unknown) => unknown)(key, params, o);
          READ.asked.push(o?.enabled);
          return { data: READ.answer, isError: false };
        },
      };
    },
  };
});

const ALL_CAPS = ['bot_voice_check', 'bot_log_voice', 'bot_voice_refuse_frame', 'bot_voice_play_lead', 'bot_voice_text_key', 'bot_voice_stop_speech', 'bot_speech_usage', 'bot_voice_check_limits'];
const cap = (name: string, supported = true, available = true) => ({ name, supported, available, description: '' });

describe('voiceCapsOf: /version → voice flags', () => {
  it('every listed, supported and available name is true', () => {
    expect(voiceCapsOf({ capabilities: ALL_CAPS.map((n) => cap(n)) })).toEqual({
      check: true, logVoice: true, refuseFrame: true, playLead: true, textKey: true, stopSpeech: true, speechUsage: true, checkLimits: true,
    });
  });
  it('an answered list without a name is false for that name only', () => {
    const c = voiceCapsOf({ capabilities: [cap('bot_voice_check'), cap('completions')] });
    expect(c.check).toBe(true);
    expect(c.textKey).toBe(false);
    expect(c.logVoice).toBe(false);
  });
  it('supported but unavailable, or reported unsupported, is false', () => {
    const c = voiceCapsOf({ capabilities: [cap('bot_voice_check', true, false), cap('bot_log_voice', false, true)] });
    expect(c.check).toBe(false);
    expect(c.logVoice).toBe(false);
  });
  it('an answer without a capability list is no answer: it throws, so the read stays unknown', () => {
    expect(() => voiceCapsOf({ api_version: '1' })).toThrow();
    expect(() => voiceCapsOf(null)).toThrow();
    expect(() => voiceCapsOf({ capabilities: 'bot_voice_check' })).toThrow();
  });
  it('malformed entries are ignored, never counted', () => {
    const c = voiceCapsOf({ capabilities: [null, 'bot_voice_check', { name: 'bot_voice_check' }, { name: 'bot_voice_check', supported: 'true', available: true }, cap('bot_log_voice')] });
    expect(c.check).toBe(false);
    expect(c.logVoice).toBe(true);
  });
  it('a failed read is unknown even after an earlier answer (the query keeps the old data on a failed refetch)', () => {
    const old = voiceCapsOf({ capabilities: [cap('bot_voice_check')] });
    expect(voiceCapsNow({ data: old, isError: false })).toBe(old);
    expect(voiceCapsNow({ data: old, isError: true })).toEqual(VOICE_CAPS_UNKNOWN);
    expect(voiceCapsNow({ data: undefined, isError: false })).toEqual(VOICE_CAPS_UNKNOWN);
  });
  it('a read that is off (its computer no longer reachable) is unknown, even with an earlier answer kept', () => {
    const old = voiceCapsOf({ capabilities: [cap('bot_voice_check')] });
    expect(voiceCapsNow({ data: old, isError: false }, false)).toEqual(VOICE_CAPS_UNKNOWN);
    expect(voiceCapsNow({ data: old, isError: false }, true)).toBe(old);
  });
  it('useVoiceCaps: a Bot whose computer is not a target reads unknown even with an answer kept; one that is shows it', () => {
    const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
    READ.answer = voiceCapsOf({ capabilities: [cap('bot_voice_check')] });
    registerTargets([]);
    READ.asked = [];
    expect(renderHook(() => useVoiceCaps(CHIEF)).result.current).toEqual(VOICE_CAPS_UNKNOWN);
    expect(READ.asked).toEqual([false]);
    registerTargets([{ id: 'c-atlas', server_name: 'n1' }]);
    READ.asked = [];
    expect(renderHook(() => useVoiceCaps(CHIEF)).result.current.check).toBe(true);
    expect(READ.asked).toEqual([true]);
    registerTargets([]);
  });
  it('the unknown value is undefined for every flag, never false', () => {
    for (const v of Object.values(VOICE_CAPS_UNKNOWN)) expect(v).toBeUndefined();
    expect(Object.keys(VOICE_CAPS_UNKNOWN).sort()).toEqual(Object.keys(voiceCapsOf({ capabilities: [] })).sort());
  });
});

describe('the log row voice field (bot_log_voice)', () => {
  const page = (rows: unknown[]) => logOf({ items: rows });
  it('a spoken row from a voice connection keeps its conn exactly as sent and its utt', () => {
    const [r] = page([{ seq: 4, role: 'user', text: 'hi', at: '2026-11-06T10:00:00Z', voice: { origin: 'ws', duration_ms: 12400, lang: 'en', conn: ' Vc-AB12 ', utt: 3 } }]).rows;
    expect(r!.voice).toEqual({ origin: 'ws', durationMs: 12400, lang: 'en', conn: ' Vc-AB12 ', utt: 3 });
  });
  it('a REST voice message has no conn or utt', () => {
    const [r] = page([{ seq: 5, role: 'user', text: 'hi', voice: { origin: 'rest', duration_ms: 900 } }]).rows;
    expect(r!.voice).toEqual({ origin: 'rest', durationMs: 900, lang: null, conn: null, utt: null });
  });
  it('an origin this Hub does not name is kept as unknown, not dropped', () => {
    expect(logVoiceOf({ origin: 'pager', duration_ms: 1 })?.origin).toBe('unknown');
  });
  it('a utt that is not a safe positive integer is null; a utt without a conn is null', () => {
    expect(logVoiceOf({ origin: 'ws', duration_ms: 1, conn: 'c', utt: 2.5 })?.utt).toBeNull();
    expect(logVoiceOf({ origin: 'ws', duration_ms: 1, conn: 'c', utt: 2 ** 60 })?.utt).toBeNull();
    expect(logVoiceOf({ origin: 'ws', duration_ms: 1, conn: 'c', utt: '3' })?.utt).toBeNull();
    expect(logVoiceOf({ origin: 'ws', duration_ms: 1, utt: 3 })?.utt).toBeNull();
  });
  it('no origin or no duration is no voice field', () => {
    expect(logVoiceOf({ duration_ms: 1 })).toBeNull();
    expect(logVoiceOf({ origin: 'ws' })).toBeNull();
    expect(logVoiceOf({ origin: 'ws', duration_ms: -1 })).toBeNull();
  });
  it('only user rows carry it: a Bot row naming voice gets none', () => {
    const rows = page([{ seq: 6, role: 'bot', text: 'x', voice: { origin: 'ws', duration_ms: 1, conn: 'c', utt: 1 } }, { seq: 7, role: 'user', text: 'y' }]).rows;
    expect(rows.map((r) => r.voice)).toEqual([null, null]);
  });
});

describe('rowForUtterance: exact (conn, utt) only', () => {
  const row = (seq: number, voice: LogRow['voice'], kind: LogRow['kind'] = 'user'): LogRow => ({ seq, kind, text: 'same text', at: '2026-11-06T10:00:00Z', raw: null, delegateTitle: null, sender: null, voice });
  const v = (conn: string, utt: number) => ({ origin: 'ws' as const, durationMs: 1, lang: null, conn, utt });
  const rows = [row(1, v('c1', 1)), row(2, v('c1', 2)), row(3, v('C1', 3)), row(4, null), row(5, v('c2', 3), 'bot')];
  it('finds the row and returns its seq', () => {
    expect(rowForUtterance(rows, 'c1', 2)).toEqual({ row: rows[1], seq: 2 });
  });
  it('the same conn with another utt, another case, or the same text never matches', () => {
    expect(rowForUtterance(rows, 'c1', 3)).toBeNull();
    expect(rowForUtterance(rows, 'c1 ', 1)).toBeNull();
    expect(rowForUtterance(rows, 'c2', 3)).toBeNull();
  });
  it('a missing conn or a bad utt asks nothing', () => {
    expect(rowForUtterance(rows, '', 1)).toBeNull();
    expect(rowForUtterance(rows, 'c1', 0)).toBeNull();
    expect(rowForUtterance(rows, 'c1', 1.5)).toBeNull();
  });
});

describe('voice/check: the speaking limit (bot_voice_check_limits)', () => {
  const stage = (over: Record<string, unknown>) => ({ ok: true, model: 'm', voice: 'v', code: '', reason: '', message: '', ...over });
  it('a working speaking stage with a positive limit carries it', () => {
    expect(voiceCheckOf({ ready: true, stt: stage({}), tts: stage({ max_input_chars: 182 }) }).tts?.maxInputChars).toBe(182);
  });
  it('missing, zero, negative, fractional, on a failed stage or on the listening stage: not known', () => {
    for (const m of [undefined, 0, -5, 1.5, '182']) expect(voiceCheckOf({ ready: true, tts: stage({ max_input_chars: m }) }).tts?.maxInputChars).toBeNull();
    expect(voiceCheckOf({ ready: false, tts: stage({ ok: false, max_input_chars: 182 }) }).tts?.maxInputChars).toBeNull();
    expect(voiceCheckOf({ ready: true, stt: stage({ max_input_chars: 182 }) }).stt?.maxInputChars).toBeNull();
  });
  it('an answer without ready is no answer', () => {
    expect(() => voiceCheckOf({ stt: stage({}) })).toThrow();
  });
});

describe('speech_usage (bot_speech_usage): complete or null, never zeros', () => {
  const full = {
    day: '2026-11-06', resets_at: '2026-11-07T00:00:00Z', tts_chars: 1200, stt_seconds: 95,
    limits: { tts_chars: 200000, stt_seconds: 14400, source: { tts_chars: 'default', stt_seconds: 'bot' } },
    realm_used: { tts_chars: 5000, stt_seconds: 300 }, realm_limits: { tts_chars: 1000000, stt_seconds: 72000 },
  };
  it('a complete read is parsed', () => {
    expect(speechUsageOf(full)).toEqual({
      day: '2026-11-06', resetsAt: '2026-11-07T00:00:00Z', used: { ttsChars: 1200, sttSeconds: 95 },
      limits: { ttsChars: 200000, sttSeconds: 14400, source: { ttsChars: 'default', sttSeconds: 'bot' } },
      realmUsed: { ttsChars: 5000, sttSeconds: 300 }, realmLimits: { ttsChars: 1000000, sttSeconds: 72000 },
    });
  });
  it('any required field missing, not a number, negative or not finite: null', () => {
    const drop = (path: string[]) => {
      const c = structuredClone(full) as Record<string, unknown>;
      let o = c;
      for (const k of path.slice(0, -1)) o = o[k] as Record<string, unknown>;
      delete o[path[path.length - 1]!];
      return c;
    };
    for (const p of [['day'], ['resets_at'], ['tts_chars'], ['stt_seconds'], ['limits'], ['limits', 'tts_chars'], ['limits', 'stt_seconds'], ['realm_used'], ['realm_used', 'stt_seconds'], ['realm_limits'], ['realm_limits', 'tts_chars']])
      expect(speechUsageOf(drop(p)), p.join('.')).toBeNull();
    expect(speechUsageOf({ ...full, tts_chars: -1 })).toBeNull();
    expect(speechUsageOf({ ...full, stt_seconds: '95' })).toBeNull();
    expect(speechUsageOf({ ...full, resets_at: 'tomorrow' })).toBeNull();
    expect(speechUsageOf({ ...full, resets_at: '1' })).toBeNull();
    expect(speechUsageOf({ ...full, day: 'today' })).toBeNull();
    // Shape alone is not a date: a day or reset that is not on the calendar, or a clock past 23:59:59, is null.
    for (const day of ['2026-99-99', '2026-02-30', '2026-13-01', '2026-00-10']) expect(speechUsageOf({ ...full, day }), day).toBeNull();
    for (const resets_at of ['2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-11-07T24:00:00Z', '2026-11-07T23:60:00Z', '2026-11-07T00:00:00+25:00', '2026-04-31T10:00:00+08:00'])
      expect(speechUsageOf({ ...full, resets_at }), resets_at).toBeNull();
    expect(speechUsageOf({ ...full, day: '2028-02-29', resets_at: '2028-03-01T00:00:00Z' })?.day).toBe('2028-02-29');
    expect(speechUsageOf({ ...full, resets_at: '2026-11-07T00:00:00.000+00:00' })?.resetsAt).toBe('2026-11-07T00:00:00.000+00:00');
    expect(speechUsageOf(undefined)).toBeNull();
  });
  it('a value that throws when read is no read: null, never a throw', () => {
    const boom = (): never => {
      throw new Error('read');
    };
    const getterDay = Object.defineProperty({ ...full }, 'day', { get: boom, enumerable: true });
    const getterInLimits = { ...full, limits: Object.defineProperty({ ...full.limits }, 'stt_seconds', { get: boom, enumerable: true }) };
    const revoked = Proxy.revocable({ ...full }, {});
    revoked.revoke();
    const revokedRealm = Proxy.revocable({ ...full.realm_used }, {});
    revokedRealm.revoke();
    for (const [name, raw] of [
      ['a throwing getter at the top', getterDay],
      ['a throwing getter inside limits', getterInLimits],
      ['a revoked proxy', revoked.proxy],
      ['a revoked proxy as realm_used', { ...full, realm_used: revokedRealm.proxy }],
    ] as const) {
      let out: unknown = 'threw';
      try {
        out = speechUsageOf(raw);
      } catch {
        /* recorded as 'threw' */
      }
      expect(out, name).toBeNull();
    }
  });
  it('an unknown limit source is null, not a guess', () => {
    expect(speechUsageOf({ ...full, limits: { ...full.limits, source: { tts_chars: 'realm' } } })?.limits.source).toEqual({ ttsChars: null, sttSeconds: null });
  });
  it('the line: characters, whole minutes (a started minute shows) and the UTC reset time; null without a read', () => {
    expect(speechUsageLine(speechUsageOf(full))).toEqual({ tts: { used: 1200, limit: 200000 }, sttMinutes: { used: 2, limit: 240 }, resetsUtc: '00:00' });
    expect(speechUsageLine(null)).toBeNull();
  });
});

describe('micReason', () => {
  const caps = (check: boolean | undefined): VoiceCaps => ({ ...VOICE_CAPS_UNKNOWN, check });
  const ready = { ready: true, stt: null, tts: null };
  const notReady = { ready: false, stt: null, tts: null };
  it('framed wins over everything', () => {
    expect(micReason({ framed: true, caps: caps(false), check: notReady })).toBe('ownTab');
    expect(micReason({ framed: true, caps: caps(true), check: ready })).toBe('ownTab');
  });
  it('an agent that answered without bot_voice_check is too old', () => {
    expect(micReason({ framed: false, caps: caps(false), check: undefined })).toBe('agentOld');
  });
  it('an unknown capability is never "too old": unknownYet', () => {
    expect(micReason({ framed: false, caps: caps(undefined), check: ready })).toBe('unknownYet');
    expect(micReason({ framed: false, caps: VOICE_CAPS_UNKNOWN, check: undefined })).toBe('unknownYet');
  });
  it('a check that said not ready: not set up; one not yet read: unknownYet', () => {
    expect(micReason({ framed: false, caps: caps(true), check: notReady })).toBe('notSetUp');
    expect(micReason({ framed: false, caps: caps(true), check: undefined })).toBe('unknownYet');
  });
  it('known able and ready: no reason', () => {
    expect(micReason({ framed: false, caps: caps(true), check: ready })).toBeNull();
  });
});

describe('voice words', () => {
  it('every origin has a mark word', () => {
    for (const o of ['ws', 'realtime', 'twilio', 'rest', 'mcp', 'unknown'] as const) expect((strings as Record<string, string>)[`voice.origin.${o}`], o).toBeTruthy();
  });
  it('voiceMarkParts: the origin key, m:ss and the language', () => {
    expect(voiceMarkParts({ origin: 'ws', durationMs: 12400, lang: 'en', conn: 'c', utt: 1 })).toEqual({ originKey: 'voice.origin.ws', duration: '0:12', lang: 'en' });
    expect(voiceMarkParts({ origin: 'twilio', durationMs: 125999, lang: null, conn: null, utt: null })).toEqual({ originKey: 'voice.origin.twilio', duration: '2:05', lang: null });
  });
  it('every voice/check reason has plain words (a new reason without words fails here)', () => {
    for (const reason of VOICE_CHECK_REASONS) {
      const w = (strings as Record<string, string>)[`voice.why.${reason}`];
      expect(w, reason).toBeTruthy();
      expect(stageWords({ reason, code: 'x', message: 'speech.tts_model is not set' })).toBe(w);
    }
  });
});
