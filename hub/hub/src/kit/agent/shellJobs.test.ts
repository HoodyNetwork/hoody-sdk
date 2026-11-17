// reduceShellJobs: rows from event.bash_job_list / event.bash_job_output, read defensively; output never
// makes a row, a list replaces the set, and a job's age is how long this page has seen it.
import { describe, expect, it } from 'vitest';
import { CHUNK_B64_MAX, MAX_SHELL_JOBS, reduceShellJobs, type ShellJobRow } from './shellJobs';

const list = (jobs: unknown) => ({ type: 'event.bash_job_list', data: { jobs } });
const out = (data: Record<string, unknown>) => ({ type: 'event.bash_job_output', data });
const bin = (b: Uint8Array) => { let x = ''; for (const c of b) x += String.fromCharCode(c); return x; };
const b64 = (s: string) => btoa(bin(new TextEncoder().encode(s)));
const job = (id: string, command = `cmd ${id}`, running = true) => ({ id, command, running, interactive: true });

describe('reduceShellJobs: the list', () => {
  it('makes one row per job, first seen now, the command cleaned (escapes and controls gone) and capped', () => {
    const rows = reduceShellJobs([], list([job('a', '\u001b[31mnpm run dev\u001b[0m\u0007'), job('b', 'x'.repeat(300))]), 1000);
    expect(rows.map((r) => [r.id, r.name, r.running, r.seenAt, r.lastLine])).toEqual([['a', 'npm run dev', true, 1000, ''], ['b', 'x'.repeat(200), true, 1000, '']]);
  });
  it('a later list keeps a known job\'s first-seen time and last line, drops a job it no longer names, and adds a new one at now', () => {
    let rows = reduceShellJobs([], list([job('a'), job('b')]), 1000);
    rows = reduceShellJobs(rows, out({ job_id: 'a', data: b64('ready\n') }), 1500);
    rows = reduceShellJobs(rows, list([job('a'), job('c')]), 9000);
    expect(rows.map((r) => [r.id, r.seenAt, r.lastLine])).toEqual([['a', 1000, 'ready'], ['c', 9000, '']]);
  });
  it('a finished job in the list carries its exit text; a running one none', () => {
    const rows = reduceShellJobs([], list([{ id: 'a', running: false, exit: 'exit 2' }, { id: 'b', running: true, exit: 'stale' }]), 0);
    expect(rows.map((r) => [r.running, r.exit])).toEqual([[false, 'exit 2'], [true, '']]);
  });
  it('skips entries that do not read (no id, not an object, a repeated id) and caps the rows', () => {
    const rows = reduceShellJobs([], list([null, 'x', { command: 'no id' }, job('a'), job('a', 'again')]), 0);
    expect(rows.map((r) => [r.id, r.name])).toEqual([['a', 'cmd a']]);
    const many = reduceShellJobs([], list(Array.from({ length: MAX_SHELL_JOBS + 5 }, (_, i) => job(`j${i}`))), 0);
    expect(many).toHaveLength(MAX_SHELL_JOBS);
  });
  it('jobs: null is the agent\'s empty list: it clears the rows', () => {
    const rows: readonly ShellJobRow[] = reduceShellJobs([], list([job('a'), job('b')]), 0);
    expect(reduceShellJobs(rows, list(null), 5)).toEqual([]);
  });
  it('a list whose jobs is missing or not an array changes nothing', () => {
    const rows: readonly ShellJobRow[] = reduceShellJobs([], list([job('a')]), 0);
    expect(reduceShellJobs(rows, list('x'), 5)).toBe(rows);
    expect(reduceShellJobs(rows, { type: 'event.bash_job_list', data: {} }, 5)).toBe(rows);
    expect(reduceShellJobs(rows, { type: 'event.bash_job_list', data: 'x' }, 5)).toBe(rows);
  });
});

describe('reduceShellJobs: output', () => {
  const start = () => reduceShellJobs([], list([job('a')]), 0);
  it('keeps the last non-empty line, cleaned of escapes and carriage returns', () => {
    const rows = reduceShellJobs(start(), out({ job_id: 'a', data: b64('one\r\n\u001b[32mtwo  \u001b[0m\r\n\n  \n') }), 1);
    expect(rows[0]!.lastLine).toBe('two');
  });
  it('a chunk with no visible line keeps the line before it', () => {
    const a = reduceShellJobs(start(), out({ job_id: 'a', data: b64('first\n') }), 1);
    expect(reduceShellJobs(a, out({ job_id: 'a', data: b64('\u001b[2K\r\n') }), 2)[0]!.lastLine).toBe('first');
  });
  const feedAll = (chunks: (string | Uint8Array)[], extra: Record<string, unknown> = {}) =>
    chunks.reduce<readonly ShellJobRow[]>((rows, c) => reduceShellJobs(rows, out({ job_id: 'a', data: typeof c === 'string' ? b64(c) : btoa(bin(c)), ...extra }), 1), start())[0]!;
  it('a line split across chunks reads whole once it ends; until then the newest text shows', () => {
    const rows1 = reduceShellJobs(start(), out({ job_id: 'a', data: b64('server lis') }), 1);
    expect(rows1[0]!.lastLine).toBe('server lis');
    expect(reduceShellJobs(rows1, out({ job_id: 'a', data: b64('tening on :3000\n') }), 2)[0]!.lastLine).toBe('server listening on :3000');
  });
  it('an escape sequence split across chunks is still removed', () => {
    expect(feedAll(['\u001b[', '31mred\u001b[0m\n']).lastLine).toBe('red');
  });
  it('a character split across chunks decodes whole', () => {
    const euro = new TextEncoder().encode('cost 5€\n');
    expect(feedAll([euro.slice(0, 7), euro.slice(7)]).lastLine).toBe('cost 5€');
  });
  it('a progress line redrawn with carriage returns shows its newest state', () => {
    expect(feedAll(['45%\r', '46%\r']).lastLine).toBe('46%');
  });
  it('a long OSC sequence (a title) never shows its payload; the visible line before it does', () => {
    expect(feedAll([`visible\n\u001b]0;${'T'.repeat(5000)}\u0007\n`]).lastLine).toBe('visible');
  });
  it('thousands of blank lines after the last text still find it', () => {
    expect(feedAll([`latest status\n${'\n'.repeat(5000)}`]).lastLine).toBe('latest status');
  });
  it('a whole OSC longer than the kept carry still disappears, leaving the text beside it', () => {
    expect(feedAll(['before\n', `visible\u001b]0;${'T'.repeat(9000)}\u0007`]).lastLine).toBe('visible');
  });
  it('an open OSC longer than the kept carry: the text before it shows, its payload never does, the next line does', () => {
    const r = feedAll(['before\n', `shown\u001b]0;${'T'.repeat(9000)}`]);
    expect(r.lastLine).toBe('shown');
    const r2 = reduceShellJobs([r], out({ job_id: 'a', data: b64(`${'T'.repeat(1000)}\u0007\n`) }), 2)[0]!;
    expect(r2.lastLine).toBe('shown');
    expect(reduceShellJobs([r2], out({ job_id: 'a', data: b64('after\n') }), 3)[0]!.lastLine).toBe('after');
  });
  it('an open OSC shorter than the bound, after more than the bound of text, is kept open across compaction', () => {
    const r = feedAll(['before\n', `${' '.repeat(9000)}x\u001b]0;TITLE`]);
    expect(r.lastLine).toBe('x');
    expect(reduceShellJobs([r], out({ job_id: 'a', data: b64('MORE\u0007 end\n') }), 2)[0]!.lastLine).toBe('x end');
  });
  it('carriage-return progress past the kept carry keeps showing its newest state, and later redraws too', () => {
    const rows = feedAll(['before\n', `${'working\r'.repeat(1100)}done\r`]);
    expect(rows.lastLine).toBe('done');
    const next = reduceShellJobs([rows], out({ job_id: 'a', data: b64('still working\r') }), 2)[0]!;
    expect(next.lastLine).toBe('still working');
  });
  it('an escape inside an open OSC (ESC or C1) is part of its payload across compaction: the payload never shows', () => {
    for (const inner of ['\u001b[31', '\u009b31']) {
      const r = feedAll(['before\n', `${' '.repeat(9000)}shown\u001b]0;TITLE${inner}`]);
      expect(r.lastLine).toBe('shown');
      expect(reduceShellJobs([r], out({ job_id: 'a', data: b64('mPAYLOAD\u0007 end\n') }), 2)[0]!.lastLine).toBe('shown end');
    }
  });
  it('visible text ending in the probe character does not hide an open sequence (OSC, inner ESC or C1, split CSI, lone ESC)', () => {
    const cases: [string, string, string][] = [
      ['\u001b]0;TITLE', 'PAYLOAD\u0007 end\n', 'statusX end'],
      ['\u001b]0;TITLE\u001b[31', 'mPAYLOAD\u0007 end\n', 'statusX end'],
      ['\u001b]0;TITLE\u009b31', 'mPAYLOAD\u0007 end\n', 'statusX end'],
      ['\u001b[31', 'mred\n', 'statusXred'],
      ['\u001b', ']0;PAYLOAD\u0007 end\n', 'statusX end'],
    ];
    for (const [open, rest, shown] of cases) {
      const r = feedAll(['before\n', `${' '.repeat(9000)}statusX${open}`]);
      expect(r.lastLine, open).toBe('statusX');
      expect(reduceShellJobs([r], out({ job_id: 'a', data: b64(rest) }), 2)[0]!.lastLine, open).toBe(shown);
    }
  });
  it('an open OSC with more inner escapes than are tried is cleaned away and cut: its payload never shows, the next line does', () => {
    const r = feedAll(['before\n', `${' '.repeat(9000)}shown\u001b]0;${'\u001b[1'.repeat(40)}`]);
    expect(r.lastLine).toBe('shown');
    const r2 = reduceShellJobs([r], out({ job_id: 'a', data: b64('mPAYLOAD\u0007 tail\n') }), 2)[0]!;
    expect(r2.lastLine).toBe('shown');
    expect(reduceShellJobs([r2], out({ job_id: 'a', data: b64('after\n') }), 3)[0]!.lastLine).toBe('after');
  });
  it('text followed by more than the kept carry of blanks still shows, with or without a long OSC between, and later text stays apart', () => {
    expect(feedAll(['before\n', `ready\u001b]0;${'T'.repeat(9000)}\u0007${' '.repeat(300)}`]).lastLine).toBe('ready');
    const r = feedAll(['before\n', `shown${' '.repeat(9000)}`]);
    expect(r.lastLine).toBe('shown');
    expect(reduceShellJobs([r], out({ job_id: 'a', data: b64('more\n') }), 2)[0]!.lastLine).toBe(`shown${' '.repeat(195)}`);
  });
  it('compaction never keeps half of a character outside the basic plane', () => {
    const line = feedAll(['before\n', `${'a'.repeat(9000)}\u{1F600}${'b'.repeat(199)}`]).lastLine;
    expect(line).toBe('b'.repeat(199));
    expect(line.charCodeAt(0)).not.toBe(0xde00);
  });
  it('a gap with no bytes (data absent or empty) ends the line before it, pending character bytes included', () => {
    for (const gapEv of [{ job_id: 'a', gap: true }, { job_id: 'a', gap: true, data: '' }]) {
      let rows = reduceShellJobs(start(), out({ job_id: 'a', data: b64('ok\n') }), 1);
      rows = reduceShellJobs(rows, out({ job_id: 'a', data: btoa('abc\xe2\x82') }), 2);
      rows = reduceShellJobs(rows, out(gapEv), 3);
      rows = reduceShellJobs(rows, out({ job_id: 'a', data: btoa('\xactail\n') }), 4);
      expect(rows[0]!.lastLine).toBe('abc');
      rows = reduceShellJobs(rows, out({ job_id: 'a', data: b64('next\n') }), 5);
      expect(rows[0]!.lastLine).toBe('next');
    }
  });
  it('a line longer than the kept carry shows its newest visible part, then continues', () => {
    const r = feedAll(['before\n', 'z'.repeat(70_000)]);
    expect(r.lastLine).toBe('z'.repeat(200));
    expect(reduceShellJobs([r], out({ job_id: 'a', data: b64('\rdone\n') }), 2)[0]!.lastLine).toBe('done');
  });
  it('a chunk past the read bound (more than the agent sends) is cut from the front; its cut first line is never shown', () => {
    const over = (CHUNK_B64_MAX / 4) * 3 + 3000; // bytes past the bound
    expect(feedAll([`old line\n${'x'.repeat(over)}\nnew\n`]).lastLine).toBe('new');
    expect(feedAll(['before\n', `cut away\n${'\n'.repeat(over)}`]).lastLine).toBe('before');
    expect(feedAll(['before\n', `kept\n${'\n'.repeat(over - 6000)}`]).lastLine).toBe('kept');
  });
  it('without a gap the next chunk continues the line; after a gap the cut line is not shown or joined', () => {
    const abc = reduceShellJobs(start(), out({ job_id: 'a', data: b64('abc') }), 1);
    expect(reduceShellJobs(abc, out({ job_id: 'a', data: b64('tail\n') }), 2)[0]!.lastLine).toBe('abctail');
    expect(reduceShellJobs(abc, out({ job_id: 'a', data: b64('tail\n'), gap: true }), 2)[0]!.lastLine).toBe('abc');
    expect(reduceShellJobs(abc, out({ job_id: 'a', data: b64('tail\nnext\n'), gap: true }), 2)[0]!.lastLine).toBe('next');
  });
  it('eof finishes the job with its exit text and keeps its last line', () => {
    const a = reduceShellJobs(start(), out({ job_id: 'a', data: b64('done\n') }), 1);
    const b = reduceShellJobs(a, out({ job_id: 'a', eof: true, exit: '0' }), 2);
    expect([b[0]!.running, b[0]!.exit, b[0]!.lastLine]).toEqual([false, '0', 'done']);
  });
  it('output for a job no list named makes no row', () => {
    const rows = start();
    expect(reduceShellJobs(rows, out({ job_id: 'zz', data: b64('hello\n') }), 1)).toBe(rows);
    expect(reduceShellJobs([], out({ job_id: 'a', data: b64('hello\n') }), 1)).toEqual([]);
  });
  it('bytes that are not base64, or not UTF-8, never throw: bad base64 changes nothing, bad UTF-8 shows replacement characters', () => {
    const rows = start();
    expect(reduceShellJobs(rows, out({ job_id: 'a', data: '%%%not base64' }), 1)).toBe(rows);
    const bad = reduceShellJobs(rows, out({ job_id: 'a', data: btoa('ok \xff\xfe\n') }), 1);
    expect(bad[0]!.lastLine).toBe('ok ��');
  });
  it('a long last line is capped', () => {
    const rows = reduceShellJobs(start(), out({ job_id: 'a', data: b64(`${'y'.repeat(500)}\n`) }), 1);
    expect(rows[0]!.lastLine).toBe('y'.repeat(200));
  });
});

describe('reduceShellJobs: anything else', () => {
  it('another event type, or a payload that is not an object, returns the same rows', () => {
    const rows = reduceShellJobs([], list([job('a')]), 0);
    for (const ev of [{ type: 'event.tool_call', data: { jobs: [] } }, { type: 'event.bash_job_list' }, null, 'x', { type: 'event.bash_job_output', data: [] }]) {
      expect(reduceShellJobs(rows, ev, 1)).toBe(rows);
    }
  });
});
