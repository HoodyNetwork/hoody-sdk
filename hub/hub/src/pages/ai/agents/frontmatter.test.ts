// The settings an agent keeps only in its file: what the Hub reads of them, what it agrees to write, and that a write
// changes one line and nothing else. The bounds are the agent's own (its step limit, compaction cap,
// helper gates and model settings).
import { describe, expect, it } from 'vitest';
import { agentUses, checkInput, durationSeconds, fileValues, readKey, splitFile, writeKey, FILE_KEYS, type FileKey } from './frontmatter';

const FILE = '---\nname: helper\ndescription: Does things: carefully\ntools: none\ntemperature: 0.4\n---\n\nYou help.\n---\nnot a delimiter of the block\n';

describe('the split', () => {
  it('needs `---` as the first line and a later `---` line, byte-strict but for a trailing CR', () => {
    expect(splitFile(FILE)).toMatchObject({ ok: true, close: 5 });
    expect(splitFile('---\r\nname: a\r\n---\r\nbody')).toMatchObject({ ok: true, close: 2 });
    expect(splitFile('name: a\n---\n')).toEqual({ ok: false, why: 'none' });
    expect(splitFile(' ---\nname: a\n---\n')).toEqual({ ok: false, why: 'none' });
    expect(splitFile('--- \nname: a\n---\n')).toEqual({ ok: false, why: 'none' });
    expect(splitFile('---\nname: a\n')).toEqual({ ok: false, why: 'unclosed' });
    expect(splitFile('---\nname: a\n ---\n')).toEqual({ ok: false, why: 'unclosed' });
    expect(splitFile('')).toEqual({ ok: false, why: 'none' });
  });
});

describe('reading a key', () => {
  const split = (s: string) => { const r = splitFile(s); if (!r.ok) throw new Error('split'); return r; };
  it('cuts a line at its first colon and trims both sides; only the settings block is read', () => {
    expect(readKey(split(FILE), 'temperature')).toEqual({ state: 'set', raw: '0.4', line: 4 });
    expect(readKey(split('---\n  temperature :  1.5  \r\n---\n'), 'temperature')).toEqual({ state: 'set', raw: '1.5', line: 1 });
    expect(readKey(split(FILE), 'ask_timeout')).toEqual({ state: 'absent' });
    // A line in the body is not a setting.
    expect(readKey(split('---\nname: a\n---\nask_timeout: 5m\n'), 'ask_timeout')).toEqual({ state: 'absent' });
    // Another key that only starts the same way.
    expect(readKey(split('---\ntemperature_note: 1\n---\n'), 'temperature')).toEqual({ state: 'absent' });
  });
  it('a key on two lines is said as that, never one of them', () => {
    expect(readKey(split('---\ntemperature: 1\ntemperature: 2\n---\n'), 'temperature')).toEqual({ state: 'twice' });
  });
});

describe('what the agent uses (its loader ignores anything else without saying so)', () => {
  const uses = (key: FileKey, yes: string[], no: string[]) => {
    for (const v of yes) expect(agentUses(key, v), `${key}: ${v}`).toBe(true);
    for (const v of no) expect(agentUses(key, v), `${key}: ${v}`).toBe(false);
  };
  it('temperature: a number from 0 to 2', () => uses('temperature', ['0', '2', '0.7', '1e0', '+1', '.5'], ['', '2.01', '-0.1', 'warm', '0.5 # warm', '"1"', 'NaN', 'Infinity', '1,5']));
  it('reply format: json_object only', () => uses('response_format', ['json_object'], ['', 'json', 'JSON_OBJECT', '"json_object"', 'text']));
  it('steps per turn: a whole number from 1', () => uses('max_steps_per_turn', ['1', '50', '+3', '2000000'], ['0', '-1', '1.5', 'ten', '', '99999999999999999999']));
  it('compaction ceiling: a whole number from 8192', () => uses('compaction_max_tokens', ['8192', '131072'], ['8191', '0', '1e5', '']));
  it('wait for an answer: a duration or whole seconds, above zero and at most 24 hours', () => uses('ask_timeout', ['10m', '1h30m', '1.5h', '90', '86400', '24h', '500ms'], ['0', '0s', '-5m', '25h', '86401', '10 m', 'ten', '5x', '']));
  it('a duration reads as seconds', () => {
    expect(durationSeconds('1h30m')).toBe(5400);
    expect(durationSeconds('90')).toBe(90);
    expect(durationSeconds('1.5m')).toBe(90);
    expect(durationSeconds('soon')).toBeNull();
    expect(durationSeconds('1'.repeat(100))).toBeNull();
  });
});

describe('what the Hub agrees to write', () => {
  it('nothing typed removes the line', () => {
    for (const k of FILE_KEYS) expect(checkInput(k, '  ')).toEqual({ ok: true, value: null });
  });
  it('temperature: a plain decimal from 0 to 2, written as a number', () => {
    expect(checkInput('temperature', ' 0.70 ')).toEqual({ ok: true, value: '0.7' });
    expect(checkInput('temperature', '2')).toEqual({ ok: true, value: '2' });
    expect(checkInput('temperature', '2.5')).toEqual({ ok: false, why: 'tooHigh' });
    expect(checkInput('temperature', '-1')).toEqual({ ok: false, why: 'tooLow' });
    for (const bad of ['warm', '1e0', '.5', '1,5', '0.5 # x', '1\n2']) expect(checkInput('temperature', bad)).toEqual({ ok: false, why: 'notNumber' });
  });
  it('reply format: the one value the agent knows', () => {
    expect(checkInput('response_format', 'json_object')).toEqual({ ok: true, value: 'json_object' });
    expect(checkInput('response_format', 'xml')).toEqual({ ok: false, why: 'notChoice' });
  });
  it('steps per turn: a whole number from 1 to 1,000,000', () => {
    expect(checkInput('max_steps_per_turn', '0050')).toEqual({ ok: true, value: '50' });
    expect(checkInput('max_steps_per_turn', '0')).toEqual({ ok: false, why: 'tooLow' });
    expect(checkInput('max_steps_per_turn', '1000001')).toEqual({ ok: false, why: 'tooHigh' });
    expect(checkInput('max_steps_per_turn', '9'.repeat(30))).toEqual({ ok: false, why: 'tooHigh' });
    expect(checkInput('max_steps_per_turn', '1.5')).toEqual({ ok: false, why: 'notWhole' });
    expect(checkInput('max_steps_per_turn', 'ten')).toEqual({ ok: false, why: 'notNumber' });
    expect(checkInput('max_steps_per_turn', '-3')).toEqual({ ok: false, why: 'tooLow' });
  });
  it('compaction ceiling: a whole number from 8192 to 1,000,000,000', () => {
    expect(checkInput('compaction_max_tokens', '131072')).toEqual({ ok: true, value: '131072' });
    expect(checkInput('compaction_max_tokens', '8191')).toEqual({ ok: false, why: 'tooLow' });
    expect(checkInput('compaction_max_tokens', '1000000001')).toEqual({ ok: false, why: 'tooHigh' });
  });
  it('wait for an answer: a duration or seconds, above zero, at most 24 hours, kept as typed', () => {
    expect(checkInput('ask_timeout', ' 10m ')).toEqual({ ok: true, value: '10m' });
    expect(checkInput('ask_timeout', '600')).toEqual({ ok: true, value: '600' });
    expect(checkInput('ask_timeout', '0')).toEqual({ ok: false, why: 'tooLow' });
    expect(checkInput('ask_timeout', '25h')).toEqual({ ok: false, why: 'tooHigh' });
    expect(checkInput('ask_timeout', 'ten minutes')).toEqual({ ok: false, why: 'notDuration' });
  });
  it('every value it agrees to write is one the agent uses', () => {
    const samples: Record<FileKey, string[]> = {
      temperature: ['0', '0.70', '2', '1.25'], response_format: ['json_object'], max_steps_per_turn: ['1', '007', '1000000'],
      compaction_max_tokens: ['8192', '1000000000'], ask_timeout: ['1s', '24h', '86400', '1h30m', '0.5h'],
    };
    for (const k of FILE_KEYS) for (const v of samples[k]) {
      const c = checkInput(k, v);
      expect(c.ok && c.value !== null && agentUses(k, c.value), `${k}: ${v}`).toBe(true);
    }
  });
});

describe('the file\'s values', () => {
  it('says default, set, ignored or twice for each key', () => {
    const r = fileValues('---\nname: a\ntemperature: hot\nmax_steps_per_turn: 40\nask_timeout: 1m\nask_timeout: 2m\n---\nbody\n');
    expect(r).toEqual({ ok: true, values: {
      temperature: { state: 'ignored', raw: 'hot' }, response_format: { state: 'default' }, max_steps_per_turn: { state: 'set', raw: '40' },
      compaction_max_tokens: { state: 'default' }, ask_timeout: { state: 'twice' },
    } });
    expect(fileValues('no block')).toEqual({ ok: false, why: 'none' });
  });
  it('a long junk value is shown cut', () => {
    const r = fileValues(`---\ntemperature: ${'9'.repeat(500)}\n---\n`);
    expect(r.ok && r.values.temperature.state === 'ignored' && r.values.temperature.raw.length <= 64).toBe(true);
  });
});

describe('a write changes one line and nothing else', () => {
  it('replaces the key\'s line in place', () => {
    expect(writeKey(FILE, 'temperature', '1.2')).toEqual({ ok: true, content: FILE.replace('temperature: 0.4', 'temperature: 1.2') });
  });
  it('adds a key that has no line right before the closing `---`', () => {
    expect(writeKey(FILE, 'ask_timeout', '10m')).toEqual({ ok: true, content: FILE.replace('temperature: 0.4\n---\n', 'temperature: 0.4\nask_timeout: 10m\n---\n') });
  });
  it('removes the line when the value is cleared; clearing an absent key changes nothing', () => {
    expect(writeKey(FILE, 'temperature', null)).toEqual({ ok: true, content: FILE.replace('temperature: 0.4\n', '') });
    expect(writeKey(FILE, 'ask_timeout', null)).toEqual({ ok: true, content: FILE });
  });
  it('keeps CRLF line ends, the body and untouched lines byte for byte', () => {
    const crlf = '---\r\nname: a\r\ntools: none\r\n  temperature : 1 \r\n---\r\n\r\nBody  \r\n';
    expect(writeKey(crlf, 'temperature', '0.5')).toEqual({ ok: true, content: crlf.replace('  temperature : 1 \r\n', 'temperature: 0.5\r\n') });
    expect(writeKey(crlf, 'max_steps_per_turn', '9')).toEqual({ ok: true, content: crlf.replace('---\r\n\r\nBody', 'max_steps_per_turn: 9\r\n---\r\n\r\nBody') });
  });
  it('writes nothing into a file with no settings block or with the key on two lines', () => {
    expect(writeKey('You help.\n', 'temperature', '1')).toEqual({ ok: false, why: 'none' });
    expect(writeKey('---\nname: a\n', 'temperature', '1')).toEqual({ ok: false, why: 'unclosed' });
    expect(writeKey('---\ntemperature: 1\ntemperature: 2\n---\n', 'temperature', '1')).toEqual({ ok: false, why: 'twice' });
  });
  it('refuses a value the agent would ignore, or one that would add a line', () => {
    for (const bad of ['3', 'hot', '1\nname: other', ' 1', '1\r']) expect(writeKey(FILE, 'temperature', bad)).toEqual({ ok: false, why: 'value' });
    expect(writeKey(FILE, 'response_format', 'xml')).toEqual({ ok: false, why: 'value' });
    expect(writeKey(FILE, 'compaction_max_tokens', '100')).toEqual({ ok: false, why: 'value' });
  });
  it('what was written reads back as set', () => {
    for (const [k, v] of [['temperature', '0.3'], ['response_format', 'json_object'], ['max_steps_per_turn', '12'], ['compaction_max_tokens', '20000'], ['ask_timeout', '15m']] as Array<[FileKey, string]>) {
      const w = writeKey(FILE, k, v);
      const back = w.ok ? fileValues(w.content) : null;
      expect(back && back.ok && back.values[k]).toEqual({ state: 'set', raw: v });
    }
  });
});
