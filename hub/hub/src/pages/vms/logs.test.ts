// Vitest: the Logs tab's pure rules (logs.ts): which logs a VM offers, how log text is cleaned and bounded, the answer's
// parser (one malformed case per field), the console line's bounds and gates, and the words each refusal maps to.
import { describe, expect, it } from 'vitest';
import { lineBytes, lineHeldReason, lineProblem, lineRefusal, logLines, logSources, parseLog, sendBlock, LOG_LINE_MAX, LOG_TAIL } from './logs';
import { CONSOLE_WRITE_MAX_BYTES } from './routes';
import strings from './strings.en.json';

const spec = { console: true, consoleInput: true, tpm: false, fileSharing: false };

describe('logSources', () => {
  it('console when the VM has one, then the machine and network logs; TPM and shared folder only when it has them', () => {
    expect(logSources(spec)).toEqual(['console', 'qemu', 'passt']);
    expect(logSources({ ...spec, console: false })).toEqual(['qemu', 'passt']);
    expect(logSources({ ...spec, tpm: true, fileSharing: true })).toEqual(['console', 'qemu', 'passt', 'swtpm', 'virtiofsd']);
  });
  it('every log it can offer has a label', () => {
    for (const s of logSources({ ...spec, tpm: true, fileSharing: true })) expect(strings[`logs.src.${s}` as keyof typeof strings]).toBeTruthy();
  });
});

describe('logLines: the VM wrote it, the page shows plain bounded text', () => {
  it('removes escape sequences, controls and invisible characters, keeps the words and other scripts', () => {
    const { lines } = logLines('\u001b[31mred\u001b[0m text\u0007\n‮evil​⁦ x\nМир 世界 ok\n');
    expect(lines).toEqual(['red text', 'evil x', 'Мир 世界 ok']);
  });
  it('an OSC title sequence goes whole, a C1 CSI too', () => {
    expect(logLines('\u001b]0;pwned\u0007a\u009b2Jb').lines).toEqual(['ab']);
  });
  it('keeps at most LOG_TAIL lines, the last ones, and says so', () => {
    const many = Array.from({ length: LOG_TAIL + 50 }, (_, i) => `l${i}`).join('\n');
    const r = logLines(many);
    expect(r.lines).toHaveLength(LOG_TAIL);
    expect(r.lines[0]).toBe('l50');
    expect(r.lines.at(-1)).toBe(`l${LOG_TAIL + 49}`);
    expect(r.cut).toBe(true);
  });
  it('cuts a line over LOG_LINE_MAX characters and marks it', () => {
    const r = logLines('a'.repeat(LOG_LINE_MAX * 3));
    expect(r.lines[0]).toHaveLength(LOG_LINE_MAX);
    expect(r.lines[0]!.endsWith('…')).toBe(true);
    expect(r.cut).toBe(true);
  });
  it('a short log is not cut; CRLF and a closing newline make no extra line; tabs become spaces', () => {
    expect(logLines('a\r\nb\tc\n')).toEqual({ lines: ['a', 'b  c'], cut: false });
    expect(logLines('')).toEqual({ lines: [], cut: false });
  });
});

describe('parseLog', () => {
  const asked = { name: 'web-1', source: 'console' as const };
  const ok = { name: 'web-1', source: 'console', lines: 2, content: 'a\nb' };
  it('reads a log answer', () => {
    expect(parseLog(ok, asked)).toEqual({ name: 'web-1', source: 'console', lines: ['a', 'b'], cut: false });
  });
  it.each([
    ['not an object', 'text'],
    ['an array', [ok]],
    ['another VM', { ...ok, name: 'db-1' }],
    ['a bad name', { ...ok, name: 'Web_1' }],
    ['another log', { ...ok, source: 'qemu' }],
    ['content not text', { ...ok, content: 3 }],
    ['content missing', { name: 'web-1', source: 'console', lines: 2 }],
    ['lines not a count', { ...ok, lines: -1 }],
    ['lines not a number', { ...ok, lines: '2' }],
  ])('refuses %s', (_, wire) => {
    expect(parseLog(wire, asked)).toBeNull();
  });
});

describe('the console line', () => {
  it('counts bytes with the Enter the page adds; 4096 in all is the most', () => {
    expect(lineBytes('ab')).toBe(3);
    expect(lineBytes('é')).toBe(3);
    expect(lineProblem('x'.repeat(CONSOLE_WRITE_MAX_BYTES - 1))).toBeNull();
    expect(lineProblem('x'.repeat(CONSOLE_WRITE_MAX_BYTES))).toBe('tooLong');
    expect(lineProblem('é'.repeat(2048))).toBe('tooLong');
    expect(lineProblem('')).toBe('empty');
  });
  it('is sent only to a running VM that takes console input and has an id, never from a framed Hub', () => {
    const vm = { state: 'Running', vmId: 'id-1', spec: { console: true, consoleInput: true } };
    expect(sendBlock(vm, false)).toBeNull();
    expect(sendBlock(vm, true)).toBe('framed');
    expect(sendBlock({ ...vm, spec: { console: true, consoleInput: false } }, false)).toBe('noInput');
    expect(sendBlock({ ...vm, spec: { console: false, consoleInput: true } }, false)).toBe('noInput');
    expect(sendBlock({ ...vm, state: 'Stopped' }, false)).toBe('notRunning');
    expect(sendBlock({ ...vm, state: 'Paused' }, false)).toBe('notRunning');
    expect(sendBlock({ ...vm, vmId: null }, false)).toBe('noId');
    for (const k of ['framed', 'noInput', 'noId', 'notRunning']) expect(strings[`logs.send.${k}` as keyof typeof strings]).toBeTruthy();
  });
  it('each refusal code has its own words; any other refusal the shared ones', () => {
    const err = (code: string) => ({ kind: 'failed', status: 409, code }) as never;
    expect(lineRefusal(err('OperationInProgress'))).toBe('logs.send.refused.OperationInProgress');
    expect(lineRefusal(err('RequestBodyStalled'))).toBe('logs.send.refused.RequestBodyStalled');
    expect(lineRefusal(err('DisplayInUse'))).toBe('logs.send.refused.other');
    expect(lineRefusal(undefined)).toBe('logs.send.refused.other');
    for (const k of ['BadState', 'OperationInProgress', 'NotFound', 'Orphaned', 'RequestBodyStalled', 'SpecInvalid', 'other']) expect(strings[`logs.send.refused.${k}` as keyof typeof strings]).toBeTruthy();
  });
  it('what the computer said about a held line is kept only for the two console codes', () => {
    const err = (code: string) => ({ kind: 'pending', status: 503, code }) as never;
    expect(lineHeldReason(err('ConsoleUnavailable'))).toBe('logs.held.ConsoleUnavailable');
    expect(lineHeldReason(err('ConsoleDeliveryIndeterminate'))).toBe('logs.held.ConsoleDeliveryIndeterminate');
    expect(lineHeldReason(err('StorageFailed'))).toBeNull();
    expect(lineHeldReason(undefined)).toBeNull();
  });
});
