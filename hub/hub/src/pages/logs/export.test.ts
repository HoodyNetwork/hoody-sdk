/**
 * HubLogsExport (export.ts): the browser port of the agent's logexport
 * writer and the record mapping.
 *   - Byte equality with the Go-generated goldens the agent tree carries
 *     (hub-export-{vectors.json,golden.jsonl,golden.txt}): the
 *     vectors go through the Hub writer, scrub included, and must come out as Go wrote them.
 *     A missing golden FAILS, it never skips; HOODY_AGENT_TREE points at another agent tree.
 *   - Bounds (8,000 rows / 8 MiB, end line always written), scrub whole then cut, the source
 *     mappers, the program-output file and the agent-export end-line check.
 *   - The AI helper's export through a bounded download (injected here; core's in the page):
 *     the end line checked on the download's tail, then the whole file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it as test } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import * as X from './export';
import { predicate } from './rules';
import { HubLogsScrub as S } from './scrub';

// Outside the monorepo there are no goldens to compare with: the golden group is skipped. Inside it a missing file fails.
const AGENT = monorepoPath(process.env.HOODY_AGENT_TREE, 'hoody-kit', 'hoody-agent');
const golden = (name: string): string => (AGENT === null ? '' : AGENT + '/internal/logexport/testdata/' + name);
const FILES = { vectors: golden('hub-export-vectors.json'), jsonl: golden('hub-export-golden.jsonl'), txt: golden('hub-export-golden.txt') };
const byteLength = (s: string): number => new TextEncoder().encode(s).length;

const R = '[REDACTED]';
const present = Object.values(FILES).every(existsSync);
interface GoldenRecord { entry: X.Entry; attrs: Record<string, unknown> }
interface Vectors { records: GoldenRecord[]; filenames: { source: string; format: string; now: string; out: string }[]; summary: X.EndSummary }
const V: Vectors = present ? JSON.parse(readFileSync(FILES.vectors, 'utf8')) : { records: [], filenames: [], summary: { rows: 0, gap: false, partial: false } };

function writeAll(format: X.Format, records: GoldenRecord[], sum: X.EndSummary) {
  const w = X.createWriter(format);
  for (const r of records) expect(w.add({ ...r.entry, attrs: r.attrs })).toBe(true);
  return w.finish(sum);
}
const lines = (s: string) => s.split('\n');

describe.skipIf(AGENT === null)('golden: byte-equal with the agent\'s WriteEntry / WriteTerminator / FilenameFor', () => {
  test('the goldens are present (a missing file is a failure, not a skip)', () => {
    for (const f of Object.values(FILES)) expect(existsSync(f)).toBe(true);
    expect(V.records.length).toBe(11);
  });

  for (const format of ['jsonl', 'txt'] as const) {
    test(`${format}: the vectors written by the Hub writer equal the Go file byte for byte`, () => {
      const want = present ? readFileSync(FILES[format], 'utf8') : '\u0000';
      const got = writeAll(format, V.records, V.summary);
      expect(got.parts.join('')).toBe(want);
      expect(got.rows).toBe(V.records.length);
      expect(got.bytes).toBe(byteLength(want));
    });
    test(`${format}: each record line on its own`, () => {
      const want = present ? lines(readFileSync(FILES[format], 'utf8')) : [];
      V.records.forEach((r, i) => {
        const e = X.prepare({ ...r.entry, attrs: r.attrs });
        expect((format === 'txt' ? X.textLine(e) : X.entryJSON(e))).toBe(want[i] + '\n');
      });
    });
  }

  test('filenames', () => {
    expect(V.filenames.length).toBe(5);
    for (const c of V.filenames) expect(X.filename(c.source, c.format, Date.parse(c.now))).toBe(c.out);
  });

  test('the goldens\' own validators accept them (txt keeps U+2028 raw and still counts by \\n)', () => {
    if (!present) throw new Error('golden missing');
    expect(X.validateEnd(readFileSync(FILES.jsonl, 'utf8'), 'jsonl')).toEqual({ rows: 11, gap: true, partial: false });
    const txt = readFileSync(FILES.txt, 'utf8');
    expect(txt).toContain('\u2028');
    expect(X.validateEnd(txt, 'txt')).toEqual({ rows: 11, gap: true, partial: false });
  });
});

describe('Go encodings the port reproduces', () => {
  test('HTML-safe JSON strings: \\u003c \\u003e \\u0026 \\u2028 \\u2029, \\b \\f named, controls lowercase, DEL C1 RLO raw', () => {
    expect(X.goJSON('<a href="x">&\u2028\u2029')).toBe('"\\u003ca href=\\"x\\"\\u003e\\u0026\\u2028\\u2029"');
    expect(X.goJSON('\b\f\n\r\t\u0000\u001b\u001f\\')).toBe('"\\b\\f\\n\\r\\t\\u0000\\u001b\\u001f\\\\"');
    expect(X.goJSON('\u007f\u009b‮')).toBe('"\u007f\u009b‮"');
    expect(X.goJSON('a\uD800b\uDC00')).toBe('"a\\ufffdb\\ufffd"');
  });

  test('object keys in UTF-8 byte order, not UTF-16 order; -0 kept', () => {
    expect(X.goJSON({ 'Ａ': 1, '\u{1F600}': 2, 'b': 3, 'é': [true, null, -0] })).toBe('{"b":3,"é":[true,null,-0],"Ａ":1,"\u{1F600}":2}');
  });

  test('attr numbers are full decimals with no exponent', () => {
    const t: [number, string][] = [[0, '0'], [-0, '-0'], [-3, '-3'], [1.5, '1.5'], [1e21, '1000000000000000000000'], [1.5e22, '15000000000000000000000'],
      [1e-7, '0.0000001'], [-2.5e-9, '-0.0000000025'], [123456789012, '123456789012'], [9007199254740993, '9007199254740992'], [0.1, '0.1']];
    for (const [n, s] of t) expect(X.attrString(n)).toBe(s);
    expect(X.attrString(true)).toBe('true');
    expect(X.attrString(null)).toBe(null);
    expect(X.attrString({ b: 1e21, a: '<' })).toBe('{"a":"\\u003c","b":1e+21}');
  });

  test('upper-casing without special casing, padding by code points', () => {
    expect(X.upper('ßtrace ﬁ warn ſ')).toBe('ßTRACE ﬁ WARN S');
    expect(X.pad('\u{1F600}', 8)).toBe('\u{1F600}       ');
    expect(X.pad('ERROR!', 5)).toBe('ERROR!');
  });

  test('sanitize.Label: escape forms, controls, bidi, invalid text', () => {
    expect(X.label('\u001b[31mred\u001b[0m')).toBe('red');
    expect(X.label('a\u001b[éémb')).toBe('ab'); // CSI runs over non-ASCII to its final byte
    expect(X.label('a\u001b]0;t\u0007b\u001bPq\u001b\\c\u001b_x')).toBe('abc'); // BEL / ST / unterminated
    expect(X.label('a\u001bPq\u0007b')).toBe('ab'); // BEL ends a DCS too
    expect(X.label('x\u001b\u{1F600}y\u001b\u001bz\u001b')).toBe('xyz'); // ESC + one character; a trailing ESC
    expect(X.label('t\tn\nr\rd\u007fc\u0085b‪e⁦f‏g؜h\uD800i')).toBe('t n rdcbefghi');
    expect(X.label('ls\u2028ps\u2029 � ok')).toBe('ls\u2028ps\u2029 � ok');
  });

  test('end lines', () => {
    expect(X.endLine('jsonl', { rows: 0, gap: false, partial: true })).toBe('{"_hoody_export":{"rows":0,"gap":false,"partial":true,"complete":true}}\n');
    expect(X.endLine('txt', { rows: 8000, gap: true, partial: false })).toBe('# export: rows=8000 gap=true partial=false\n');
  });
});

describe('bounds: 8,000 rows or 8 MiB, the end line always written', () => {
  const row = (i: number, msg = 'GET 200') => ({ seq: i + 1, time: '2026-10-21T00:00:00.000Z', level: 'info', source: 'web', message: msg });

  test('row cap: the 8,001st row is refused, the file says partial', () => {
    const w = X.createWriter('jsonl');
    for (let i = 0; i < 8000; i++) expect(w.add(row(i))).toBe(true);
    expect(w.add(row(8000))).toBe(false);
    expect(w.add(row(8001))).toBe(false);
    const s = w.finish({ gap: false });
    expect(s.rows).toBe(8000);
    expect(s.partial).toBe(true);
    expect(X.validateEnd(s.parts.join(''), 'jsonl')).toEqual({ rows: 8000, gap: false, partial: true });
  });

  test('byte cap: the whole file, end line included, stays within 8 MiB', () => {
    const w = X.createWriter('txt');
    const big = 'x'.repeat(15000) + 'é'.repeat(500);
    let n = 0;
    while (w.add(row(n, big))) n++;
    const s = w.finish({});
    const out = s.parts.join('');
    expect(s.partial).toBe(true);
    expect(byteLength(out)).toBe(s.bytes);
    expect(s.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(s.bytes).toBeGreaterThan(8 * 1024 * 1024 - 20000);
    expect(X.validateEnd(out, 'txt')!.rows).toBe(n);
  });

  test('the end line always fits: no size of row pushes the file past maxBytes; a refused row ends the file', () => {
    for (let len = 1; len < 400; len += 7) {
      const w = X.createWriter('jsonl', { maxBytes: 1000 });
      let n = 0;
      while (w.add(row(n, 'm'.repeat(len)))) n++;
      expect(w.add(row(n, ''))).toBe(false); // even a smaller row: no hole in the file
      const s = w.finish({});
      expect(byteLength(s.parts.join(''))).toBeLessThanOrEqual(1000);
      expect(X.validateEnd(s.parts.join(''), 'jsonl')).toEqual({ rows: n, gap: false, partial: true });
    }
  });

  test('a file that fits is not partial unless the drain says so', () => {
    const w = X.createWriter('jsonl');
    w.add(row(0));
    expect(w.finish({ gap: true }).partial).toBe(false);
    const w2 = X.createWriter('jsonl');
    expect(w2.finish({ partial: true })).toMatchObject({ rows: 0, partial: true });
  });
});

describe('scrub the whole record, then cut each field to 16 KiB', () => {
  test('a secret straddling the cut is gone; the record says attrs.cut', () => {
    const msg = 'x'.repeat(16350) + ' Bearer abcdefghijklmnopqrstuvwxyz0123456789 ' + 'y'.repeat(100);
    const e = X.prepare({ time: 't', level: 'info', source: 'web', message: msg, attrs: { path: '/a' } });
    expect(e.message.length).toBe(16384);
    expect(e.message).toContain('Bearer ' + R + ' yyy');
    expect(e.message).not.toContain('abcdefghij');
    expect(e.attrs).toEqual({ path: '/a', cut: 'true' });
  });

  test('credential keys, header values and keys holding secrets are scrubbed before encoding', () => {
    const e = X.prepare({ time: 't', level: 'info', source: 'bots', message: 'm', attrs: {
      bot_limit: { token: 'zzz', scope: 'key' }, error: 'Authorization: Basic Zm9vOmJhcg==', path: '/x?access_token=abc123' } });
    expect(e.attrs!.bot_limit).toBe('{"scope":"key","token":"' + R + '"}');
    expect(e.attrs!.error).toBe('Authorization: ' + R);
    expect(e.attrs!.path).toBe('/x?access_token=' + R);
    expect(e.attrs!.cut).toBeUndefined();
  });

  test('undefined and null attrs are left out; no attrs object when none remain', () => {
    const e = X.prepare({ time: 't', level: 'info', source: 'web', message: 'm', attrs: { a: undefined, b: null } });
    expect(e.attrs).toBeUndefined();
    expect(X.entryJSON(e)).toBe('{"time":"t","level":"info","source":"web","message":"m"}\n');
  });
});

describe('record mapping', () => {
  const visit = { id: 7, traceId: '0af7651916cd43dd8448eb211c80319c', tsMs: 1, tsIso: '2026-10-21T03:04:05.123Z', kind: 'request', level: 'warn',
    serviceName: 'files', serviceIndex: 2, method: 'GET', url: '/a', clientIp: '203.0.113.7', status: 404, durationMs: 12, bytesSent: 10, userAgent: 'UA', source: 'edge' };

  test('visit: program name, comp with index, the visitor address only when asked', () => {
    expect(X.map.visit(visit)).toEqual({ seq: 7, time: visit.tsIso, level: 'warn', source: 'web', comp: 'files-2', message: 'Files GET 404 12ms',
      attrs: { path: '/a', status: 404, method: 'GET', duration_ms: 12, bytes: 10, request_id: visit.traceId } });
    const withIp = X.map.visit({ ...visit, serviceIndex: undefined }, { ips: true, program: () => 'My files' });
    expect(withIp.attrs!.ip).toBe('203.0.113.7');
    expect(withIp.comp).toBe('files');
    expect(withIp.message).toBe('My files GET 404 12ms');
    expect(JSON.stringify(X.map.visit(visit))).not.toContain('UA');
  });

  test('bot call: the allowlist only, bot_limit as sorted JSON, null caller left out', () => {
    const row = { ...visit, serviceName: 'bots', data: { bot_door: 'openai', bot_result: 'ok', bot_caller: null, bot_exposure: 'bu_1', bot_limit: { scope: 'key', kind: 'rate', max: 5, retry_at: null }, body: 'secret body' } };
    const e = X.prepare(X.map.bot(row));
    expect(e.message).toBe('openai ok');
    expect(e.attrs).toEqual({ status: '404', duration_ms: '12', request_id: visit.traceId, bot_door: 'openai', bot_result: 'ok', bot_url: 'bu_1',
      bot_limit: '{"kind":"rate","max":5,"retry_at":null,"scope":"key"}' });
    expect(X.map.bot(row, { ips: true }).attrs!.ip).toBe('203.0.113.7');
    // The downloaded file names this column by what the person sees (a Bot URL); the row's field name stays.
    expect(Object.keys(e.attrs!)).not.toContain('bot_exposure');
  });

  test('change, script execution, account activity', () => {
    expect(X.map.change({ id: 'e1', event_type: 'container.started', resource_type: 'container', resource_id: 'c1', created_at: 'T', payload: { x: 1 } }, { sentence: () => 'The computer started.' }))
      .toEqual({ time: 'T', level: 'info', source: 'changes', comp: 'container', message: 'The computer started.', attrs: { event_type: 'container.started', resource_id: 'c1' } });
    expect(X.map.change({ event_type: 'a.b' }).message).toBe('a.b');
    const ex = { executionId: 'x1', receivedAt: 'T', method: 'POST', path: '/run', status: 200, durationMs: 87 };
    expect(X.map.script(ex, { scriptPath: 'jobs/a.ts' })).toEqual({ time: 'T', level: 'info', source: 'scripts', comp: 'jobs/a.ts', message: 'POST 200 87ms',
      attrs: { execution_id: 'x1', path: '/run', status: 200, error: undefined } });
    expect(X.map.script({ ...ex, status: 500 }).level).toBe('error');
    expect(X.map.script({ ...ex, error: 'boom' }).level).toBe('error');
    expect(X.map.script({ ...ex, status: 404 }).level).toBe('info');
    const acc = (s: number) => X.map.account({ id: 'a', method: 'POST', path: '/users/auth/login', status_code: s, ip_address: '1.2.3.4', created_at: 'T' });
    expect(acc(401)).toEqual({ time: 'T', level: 'warn', source: 'account', message: 'POST 401', attrs: { path: '/users/auth/login', status: 401 } });
    expect([acc(200).level, acc(399).level, acc(400).level, acc(499).level, acc(500).level]).toEqual(['info', 'info', 'warn', 'warn', 'error']);
  });
});

describe('program output and agent exports', () => {
  const NOW = Date.parse('2026-10-21T03:04:05Z');

  test('txt: a header line, one record per line, never timed, always partial, the window edge scrubbed', () => {
    const snap = 'MIIEfake\n-----END RSA PRIVATE KEY-----\nlistening on :8080\r\nGET / 200\n';
    const s = X.programExport(snap, { program: 'web', port: 8080, channel: 'stderr', format: 'txt', nowMs: NOW });
    expect(s.parts.join('')).toBe('# recent output, may be incomplete\n' +
      '       program  [web:8080] ' + R + '  · channel=stderr\n' +
      '       program  [web:8080] listening on :8080  · channel=stderr\n' +
      '       program  [web:8080] GET / 200  · channel=stderr\n' +
      '# export: rows=3 gap=false partial=true\n');
    expect(s.filename).toBe('hoody-logs-program-web8080-stderr-20261021-030405.txt');
  });

  test('jsonl: the note rides the first record only; an empty snapshot is still a valid partial file', () => {
    const s = X.programExport('a\nb', { program: 'web', channel: 'stdout', format: 'jsonl', nowMs: NOW });
    const ls = lines(s.parts.join(''));
    expect(ls[0]).toBe('{"time":"","level":"","source":"program","comp":"web","message":"a","attrs":{"channel":"stdout","note":"recent output, may be incomplete"}}');
    expect(ls[1]).toBe('{"time":"","level":"","source":"program","comp":"web","message":"b","attrs":{"channel":"stdout"}}');
    expect(s.filename).toBe('hoody-logs-program-web-stdout-20261021-030405.jsonl');
    const empty = X.programExport('', { program: 'web', channel: 'stdout', format: 'jsonl', nowMs: NOW });
    expect(empty.parts.join('')).toBe('{"_hoody_export":{"rows":0,"gap":false,"partial":true,"complete":true}}\n');
  });

  test('every line of the 10,000 the read asks for is in the file, the newest included; of more, the newest are kept', () => {
    const snap = (n: number) => Array.from({ length: n }, (_, i) => 'line ' + i).join('\n');
    const s = X.programExport(snap(10000), { program: 'p', channel: 'stdout', format: 'txt', nowMs: NOW });
    expect(s.rows).toBe(10000);
    expect(s.parts.join('')).toContain('] line 9999  ·');
    const over = X.programExport(snap(10500), { program: 'p', channel: 'stdout', format: 'jsonl', nowMs: NOW });
    expect(over.rows).toBe(10000);
    expect(over.partial).toBe(true);
    const text = over.parts.join('');
    expect(text).toContain('"line 10499"');
    expect(text).not.toContain('"line 499"');
  });

  test('a file that would fill by size is refused whole: the newest lines are never the ones dropped', () => {
    // 10,000 lines fit the read, but JSON-safe escaping of < and > grows them past the file's 8 MiB.
    const snap = Array.from({ length: 10000 }, (_, i) => '<div></div>'.repeat(30) + i).join('\n');
    for (const format of ['jsonl', 'txt'] as const) {
      let got: unknown = null;
      try { got = X.programExport(snap, { program: 'p', channel: 'stdout', format, nowMs: NOW }); } catch (e) { got = e; }
      if (format === 'jsonl') expect(got).toEqual({ code: 'too_large' });
      // Plain text does not grow: every line is there, the newest included.
      else expect((got as { rows: number }).rows).toBe(10000);
    }
  });

  test('agent export end line: accepted only when valid and its rows match the lines before it', () => {
    const rec = '{"time":"t","level":"info","source":"daemon","message":"m"}\n';
    const end = (r: number, c = 'true') => `{"_hoody_export":{"rows":${r},"gap":false,"partial":false,"complete":${c}}}\n`;
    expect(X.validateEnd(rec + rec + end(2), 'jsonl')).toEqual({ rows: 2, gap: false, partial: false });
    expect(X.validateEnd(end(0), 'jsonl')).toEqual({ rows: 0, gap: false, partial: false });
    expect(X.validateEnd(rec + rec + end(3), 'jsonl')).toBe(null); // rows disagree
    expect(X.validateEnd(rec + end(1, 'false'), 'jsonl')).toBe(null);
    expect(X.validateEnd(rec + end(1).slice(0, -1), 'jsonl')).toBe(null); // no final newline
    expect(X.validateEnd(rec + rec, 'jsonl')).toBe(null); // cut before the end line
    expect(X.validateEnd(rec + end(1) + rec, 'jsonl')).toBe(null); // the end line is not last
    expect(X.validateEnd(rec + '{"_hoody_export":{"rows":1,"gap":false,"partial":false,"complete":true,"x":1}}\n', 'jsonl')).toBe(null);
    expect(X.validateEnd(rec + end(1), 'txt')).toBe(null);
    expect(X.validateEnd('a\u2028b\n# export: rows=1 gap=false partial=true\n', 'txt')).toEqual({ rows: 1, gap: false, partial: true });
    expect(X.validateEnd('a\r\n# export: rows=1 gap=false partial=true\r\n', 'txt')).toBe(null);
    expect(X.validateEnd('# export: rows=01 gap=false partial=true\n', 'txt')).toBe(null);
    expect(X.validateEnd('', 'txt')).toBe(null);
    expect(X.validateEnd('# export: rows=0 gap=false partial=truee', 'txt')).toBe(null); // no final newline
    expect(X.validateEnd(rec + end(1), 'csv' as 'txt')).toBe(null);
  });
});

// ── the snapshot is plain text before it is scrubbed ──
describe('program output: a key split over two lines by an escape never survives, txt or jsonl', () => {
  const NOW = Date.parse('2026-10-21T03:04:05Z');
  test('API_<escape>KEY="first\\nsecond": neither half in either format', () => {
    for (const format of ['txt', 'jsonl'] as const) {
      const out = X.programExport('API_\u001b[31mKEY="first\nsecond"', { program: 'web', channel: 'stdout', format, nowMs: NOW }).parts.join('');
      expect(out).not.toContain('first');
      expect(out).not.toContain('second');
      expect(out).toContain(R);
    }
  });
  test('jsonl keeps no escape or control from the snapshot; a tab is a space', () => {
    const out = X.programExport('a\u001b[1mb\u001b[0m\tc\u0007\r\nd', { program: 'web', channel: 'stdout', format: 'jsonl', nowMs: NOW }).parts.join('');
    expect(lines(out).slice(0, 2).map((l) => JSON.parse(l).message)).toEqual(['ab c', 'd']);
    expect(out).not.toContain('\\u001b');
  });
  test('label is plain text on one line: the same as HubLogsScrub.plain with \\n as a space', () => {
    for (const s of ['a\nb\tc', 'x\u001b[31my\u001b]0;t\u0007z', 'b‮i\ud800d\u0085i', 'q\u001b(Br'])
      expect(X.label(s)).toBe(S.plain(s).replace(/\n/g, ' '));
  });
});

// ── what plain() alone would expose stays redacted in both formats ──
describe('program output: nothing the raw text would redact leaks, txt or jsonl', () => {
  const NOW = Date.parse('2026-10-21T03:04:05Z');
  const LEAKS: Array<[string, string[]]> = [
    ['\u001b<private>synthetic-hidden-value</private>', ['synthetic-hidden-value']],
    ['\u001b-----BEGIN PRIVATE KEY-----\nfakebodyAAAA\n\u001b-----END PRIVATE KEY-----', ['fakebodyAAAA']],
    ['API_KEY="first\\\r\\"middle\nsecond"', ['first', 'middle', 'second']],
    ['API_KEY="first\\\u0000\\"middle\nsecond"', ['first', 'middle', 'second']],
    ['x\u001b[REDACTED]y', ['xEDACTED']],
    // A marker or a tag inside an escape, a lone surrogate
    ['API_\u001b]0;[REDACTED]\u0007KEY="first\nsecond"', ['first', 'second']],
    ['API_\u001b]0;[REDACTED]\u001b\\KEY="first\nsecond"', ['first', 'second']],
    ['API_\u001b]0;<private>synthetic</private>\u0007KEY="first\nsecond"', ['first', 'second', 'synthetic']],
    ['API_\u001b]0;<private>synthetic</private>\u001b\\KEY="first\nsecond"', ['first', 'second', 'synthetic']],
    ['API_\ud800KEY="first\nsecond"', ['first', 'second']],
    // A marker ending a CSI
    ['prefix to\u001b[31mken="CANARY123\u001b[1;[REDACTED]\nCANARY456"', ['ANARY123', 'ANARY456']],
    ['\u001b[1;[REDACTED]pass\u001b[31mword="UNIQUECANARY123\nSECONDVALUE456"', ['NIQUECANARY', 'ECONDVALUE']],
  ];
  test('each leak case in txt and jsonl', () => {
    for (const [snap, gone] of LEAKS) for (const format of ['txt', 'jsonl'] as const) {
      const out = X.programExport(snap, { program: 'web', channel: 'stdout', format, nowMs: NOW }).parts.join('');
      for (const g of gone) expect(out).not.toContain(g);
      expect(out).toContain(R);
    }
  });
});

// ── text normalization before the final scrub ──
describe('txt export: escapes are dropped before the last scrub, so split secrets cannot re-join', () => {
  const split = 'hbk_' + 'A'.repeat(15) + '\u001b[31m' + 'B'.repeat(15);
  const joined = 'hbk_' + 'A'.repeat(15) + 'B'.repeat(15);

  test('a key split by an ANSI escape in the message, an attr value or an attr key is redacted in the line', () => {
    const w = X.createWriter('txt', {});
    w.add({ time: 't', level: 'info', source: 'web', message: 'm ' + split, attrs: { path: split, ['k' + split]: 'v' } });
    const out = w.finish({}).parts.join('');
    expect(out).not.toContain(joined);
    expect(out).not.toContain('hbk_');
    expect(out).toContain(R);
  });

  test('upper-casing the level cannot make a key either', () => {
    const w = X.createWriter('txt', {});
    w.add({ time: 't', level: 'akia' + '1'.repeat(16), source: 'web', message: 'm' });
    expect(w.finish({}).parts.join('')).not.toContain('AKIA' + '1'.repeat(16));
  });

  test('keys that become equal after normalization are both kept', () => {
    const e = X.prepare({ time: 't', level: 'info', source: 'web', message: 'm', attrs: { a: '1', 'a\u001b[0m': '2' } }, 'txt');
    expect(Object.keys(e.attrs!).sort()).toEqual(['a', 'a#2']);
    expect(Object.values(e.attrs!).sort()).toEqual(['1', '2']);
  });

  test('JSONL keeps the escape escaped and the bytes otherwise unchanged', () => {
    const w = X.createWriter('jsonl', {});
    w.add({ time: 't', level: 'info', source: 'web', message: 'm' });
    expect(w.finish({}).parts[0]).toBe('{"time":"t","level":"info","source":"web","message":"m"}\n');
    expect(X.prepare({ time: 't', level: 'info', source: 'web', message: split })).toMatchObject({ message: split });
  });

  test('a multiline quoted secret in program output leaves nothing behind in either format', () => {
    for (const format of ['txt', 'jsonl'] as const) {
      const sum = X.programExport('start\nAPI_KEY="first\nsecond"\nAuthorization: Basic Zm9v\n OmJhcg==\nok\n', { program: 'web', channel: 'stdout', format, nowMs: 0 });
      const out = sum.parts.join('');
      expect(out).not.toContain('second');
      expect(out).not.toContain('OmJhcg');
      expect(out).toContain('ok');
    }
  });

  test('an escaped quote inside a multiline secret leaves nothing behind in the final export', () => {
    for (const format of ['txt', 'jsonl'] as const) {
      const out = X.programExport('start\nAPI_KEY="first\\"\nsecond"\nok\nTOKEN="cont\\\nnued"\ndone\n', { program: 'web', channel: 'stdout', format, nowMs: 0 }).parts.join('');
      expect(out).not.toContain('second');
      expect(out).not.toContain('first');
      expect(out).not.toContain('nued'); // a backslash-newline continuation
      expect(out).toContain('ok');
      expect(out).toContain('done');
    }
  });

  test('an attr named "__proto__" is exported as a key, not dropped', () => {
    const e = JSON.parse('{"time":"t","level":"info","source":"web","message":"m","attrs":{"__proto__":"v","a":"b"}}');
    expect(Object.keys(X.prepare(e, 'txt').attrs!)).toEqual(['__proto__', 'a']);
    const w = X.createWriter('jsonl', {});
    w.add(e);
    expect(w.finish({}).parts[0]).toContain('"attrs":{"__proto__":"v","a":"b"}');
  });
});

// ── the AI helper's export ──────────────────────────────────
const MiB = 1024 * 1024;
const END_TXT = (rows: number, gap = false, partial = false) => `# export: rows=${rows} gap=${gap} partial=${partial}\n`;
const END_JSONL = (rows: number, gap = false, partial = false) => `{"_hoody_export":{"rows":${rows},"gap":${gap},"partial":${partial},"complete":true}}\n`;
const TXT = '2026-10-21T00:00:00.000Z WARN  agent    disk low\n2026-10-21T00:00:01.000Z ERROR agent    disk full\n' + END_TXT(2);

describe('tailEnd: the end-line check on the download\'s last 64 KiB', () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  test('the last line must be the format\'s end line, newline included', () => {
    expect(X.tailEnd('txt')(enc(TXT))).toBe(true);
    expect(X.tailEnd('txt')(enc(END_TXT(0)))).toBe(true);
    expect(X.tailEnd('jsonl')(enc('{"a":1}\n' + END_JSONL(1, true, true)))).toBe(true);
    expect(X.tailEnd('jsonl')(enc(TXT))).toBe(false);
    expect(X.tailEnd('txt')(enc('{"a":1}\n' + END_JSONL(1)))).toBe(false);
    expect(X.tailEnd('txt')(enc(TXT.slice(0, -1)))).toBe(false);
    expect(X.tailEnd('txt')(enc(TXT.slice(0, -1) + '!'))).toBe(false);
    expect(X.tailEnd('txt')(enc(TXT + '\n'))).toBe(false);
    expect(X.tailEnd('txt')(enc(TXT + 'x\n'))).toBe(false);
    expect(X.tailEnd('txt')(enc('x' + END_TXT(1)))).toBe(false);
    expect(X.tailEnd('jsonl')(enc(END_JSONL(1).replace('true}}', 'false}}')))).toBe(false);
    expect(X.tailEnd('csv' as 'txt')(enc(TXT))).toBe(false);
    expect(X.tailEnd('txt')(new Uint8Array(0))).toBe(false);
    expect(X.tailEnd('txt')(enc('\n'))).toBe(false);
  });
  test('a tail that starts inside a multi-byte character or holds one in its last line', () => {
    const t = enc('é' + TXT);
    expect(X.tailEnd('txt')(t.subarray(1))).toBe(true);
    expect(X.tailEnd('txt')(enc(TXT.replace('rows=2', 'rows=２')))).toBe(false);
  });
});

describe('helperExport: agent /logs/export through the bounded download, accepted only with a valid end line', () => {
  const NOW = Date.parse('2026-10-21T03:04:05Z');
  const view = (source = 'helper') => predicate({ source }, NOW);
  const P = (() => { const r = view(); if (!r.ok) throw new Error('predicate'); return r.P; })();
  type Opts = { maxBytes: number; validateEnd: (tail: Uint8Array) => boolean; signal?: AbortSignal };
  const download = (text: string, seen: { path?: string; opts?: Opts; calls: number } = { calls: 0 }) => async (path: string, opts: Opts) => {
    seen.calls++;
    seen.path = path;
    seen.opts = opts;
    return { parts: [new Blob([text])], bytes: byteLength(text) };
  };

  test('a finished txt export: GET limit 8000, the end line checked on the tail, the summary read back', async () => {
    const seen = { calls: 0 } as { path?: string; opts?: Opts; calls: number };
    const r = await X.helperExport(P, { download: download(TXT, seen), nowMs: NOW });
    expect(seen.path).toContain('/logs/export?');
    expect(seen.path).toContain('limit=8000');
    expect(seen.path).toContain('format=txt');
    expect(seen.opts?.maxBytes).toBe(8 * MiB);
    expect(seen.opts?.validateEnd(new TextEncoder().encode(TXT))).toBe(true);
    expect([r.rows, r.gap, r.partial, r.format, r.name]).toEqual([2, false, false, 'txt', 'hoody-logs-helper-20261021-030405.txt']);
  });

  test('jsonl: gap and partial come from its end line; an unknown format is txt', async () => {
    const body = '{"time":"t","level":"info","source":"agent","message":"m"}\n' + END_JSONL(1, true, true);
    const r = await X.helperExport(P, { format: 'jsonl', download: download(body) });
    expect([r.rows, r.gap, r.partial, r.format]).toEqual([1, true, true, 'jsonl']);
    const seen = { calls: 0 } as { path?: string; opts?: Opts; calls: number };
    await X.helperExport(P, { format: 'csv', download: download(TXT, seen) });
    expect(seen.path).toContain('format=txt');
  });

  test('aborted before, or no longer alive: cancelled, nothing sent', async () => {
    const seen = { calls: 0 } as { path?: string; opts?: Opts; calls: number };
    const ac = new AbortController();
    ac.abort();
    await expect(X.helperExport(P, { download: download(TXT, seen), signal: ac.signal })).rejects.toEqual({ code: 'cancelled' });
    await expect(X.helperExport(P, { download: download(TXT, seen), alive: () => false })).rejects.toEqual({ code: 'cancelled' });
    expect(seen.calls).toBe(0);
  });

  test('the context lost during the download or while the file is read: cancelled, no parts', async () => {
    let live = true;
    const slow = async () => { live = false; throw { kind: 'stale', stale: true }; };
    await expect(X.helperExport(P, { download: slow, alive: () => live })).rejects.toEqual({ code: 'cancelled' });
    live = true;
    const whileReading = async () => ({ parts: [new Blob([TXT])], bytes: TXT.length });
    let reads = 0;
    await expect(X.helperExport(P, { download: whileReading, alive: () => ++reads < 2 })).rejects.toEqual({ code: 'cancelled' });
  });

  test('no end line, a cut one, rows that disagree, the other format\'s end line, or past 8 MiB: "unfinished", no file', async () => {
    for (const text of [TXT.slice(0, -1), '', TXT.replace('rows=2', 'rows=3'), END_JSONL(2), TXT + 'x\n']) {
      await expect(X.helperExport(P, { download: download(text) })).rejects.toEqual({ code: 'unfinished' });
    }
    const big = async () => { throw { kind: 'too_large', status: 0, code: 'too_large' }; };
    await expect(X.helperExport(P, { download: big })).rejects.toEqual({ code: 'unfinished' });
  });

  test('other refusals pass through as the kit gave them', async () => {
    const refused = { kind: 'refused', status: 403, code: 'FORBIDDEN' };
    await expect(X.helperExport(P, { download: async () => { throw refused; } })).rejects.toBe(refused);
  });

  test('another source sends nothing', async () => {
    const r = view('visits');
    if (!r.ok) throw new Error('predicate');
    const seen = { calls: 0 } as { path?: string; opts?: Opts; calls: number };
    await expect(X.helperExport(r.P, { download: download(TXT, seen) })).rejects.toEqual({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    expect(seen.calls).toBe(0);
  });
});
