// Vitest: the import parser (importEnv.ts). Rows carry names and statuses only; values come back aligned in their own
// array. Every case below is a fixture text.
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, dropImport, expectedMinutes, holdImport, importHeldForTests, parseImport, type ImportParse, type ParseWork } from './importEnv';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

type Ok = Extract<ImportParse, { ok: true }>;
const ok = (text: string): Ok => {
  const r = parseImport(text);
  if (!r.ok) throw new Error(`refused: ${r.why}`);
  return r;
};
/** name → value for the rows that would be sent. */
const sent = (text: string): Record<string, string> => {
  const r = ok(text);
  return Object.fromEntries(r.rows.flatMap((row, i) => (row.status === 'ok' ? [[row.key, r.values[i]!]] : [])));
};

describe('parseImport', () => {
  it.each<[string, string, Record<string, string>]>([
    ['plain pairs', 'A=1\nB=two', { A: '1', B: 'two' }],
    ['comments and blank lines are skipped', '# top\n\nA=1\n   # indented comment\nB=2\n', { A: '1', B: '2' }],
    ['one export prefix is dropped', 'export A=1\nexport   B=2', { A: '1', B: '2' }],
    ['a name called export is still a name', 'export=1', { export: '1' }],
    ['spaces around = are allowed', 'A = 1\n  B=   2  ', { A: '1', B: '2' }],
    ['a leading BOM is dropped', '﻿A=1', { A: '1' }],
    ['CRLF reads as LF', 'A=1\r\nB=2\r\n', { A: '1', B: '2' }],
    ['unquoted: whitespace then # starts a comment', 'A=val # note\nB=x\t# tab note', { A: 'val', B: 'x' }],
    ['unquoted: a # with no space before is the value', 'A=pa#ss\nB=#start', { A: 'pa#ss', B: '#start' }],
    ['unquoted: = inside the value is kept', 'URL=a=b=c', { URL: 'a=b=c' }],
    ['single quotes are literal', "A='x \\n y # z'", { A: 'x \\n y # z' }],
    ['single quotes span lines', "A='line1\nline2'\nB=2", { A: 'line1\nline2', B: '2' }],
    ['double quotes span lines', 'A="one\ntwo"\nB=3', { A: 'one\ntwo', B: '3' }],
    ['double quotes: the escapes', 'A="a\\nb\\tc\\"d\\\\e\\rf"', { A: 'a\nb\tc"d\\e\rf' }],
    ['double quotes: an unknown escape is kept as written', 'A="x\\qy"', { A: 'x\\qy' }],
    ['double quotes: # inside is the value', 'A="v # not a comment" # comment', { A: 'v # not a comment' }],
    ['underscores and digits in names', '_APP_DB_URL_1=v', { _APP_DB_URL_1: 'v' }],
    ['${VAR} is kept literally', 'A=${HOME}/x', { A: '${HOME}/x' }],
  ])('%s', (_n, text, want) => {
    expect(sent(text)).toEqual(want);
  });

  it('reports ${…} once, so the person knows nothing was expanded, in single quotes too', () => {
    expect(ok('A=${X}').interpolation).toBe(true);
    expect(ok('A="${X}"').interpolation).toBe(true);
    expect(ok("A='${TOKEN}'").interpolation).toBe(true);
    expect(sent("A='${TOKEN}'")).toEqual({ A: '${TOKEN}' });
    expect(ok('A=plain').interpolation).toBe(false);
  });

  it('an unclosed quote refuses the whole import, naming the line it opens on', () => {
    expect(parseImport('A=1\nB="never closed\nC=3')).toEqual({ ok: false, why: 'quote', line: 2 });
    expect(parseImport("A=1\n\nB='open")).toEqual({ ok: false, why: 'quote', line: 3 });
  });

  it('the same name twice: the last wins, earlier lines are reported as replaced by it', () => {
    const r = ok('A=first\nB=b\nA=second');
    expect(r.rows.map((x) => [x.line, x.key, x.status, x.replacedBy])).toEqual([
      [1, 'A', 'replaced', 3],
      [2, 'B', 'ok', undefined],
      [3, 'A', 'ok', undefined],
    ]);
    expect(sent('A=first\nB=b\nA=second')).toEqual({ A: 'second', B: 'b' });
    // A replaced row keeps no value.
    expect(r.values[0]).toBe('');
  });

  it('a name must be a .env name first, then a vault key; one that fails keeps no text (line number only); hoody.* fails on its dot', () => {
    const r = ok('bad name=1\nhoody.realm-aliases=2\n' + 'x'.repeat(101) + '=3\n=4\njust words here\napp.db-url=6\n1ST=7\nhoody.SECRET="8"\nGOOD=5');
    expect(r.rows.map((x) => [x.line, x.status, x.problem, x.key])).toEqual([
      [1, 'invalid', 'env', ''],
      [2, 'invalid', 'env', ''],
      [3, 'invalid', 'too_long', ''],
      [4, 'invalid', 'empty', ''],
      [5, 'no_equals', undefined, ''],
      [6, 'invalid', 'env', ''],
      [7, 'invalid', 'env', ''],
      [8, 'invalid', 'env', ''],
      [9, 'ok', undefined, 'GOOD'],
    ]);
    expect(r.values.slice(0, 8)).toEqual(['', '', '', '', '', '', '', '']);
  });

  it('only a row that can be sent or was replaced shows its name; every refused row is its line number and reason only', () => {
    const r = ok('A=1\nA="2"\nEMPTY=\nT="x"y\nB="b"\nZMx1abc9QK=');
    expect(r.rows.map((x) => [x.line, x.key, x.status])).toEqual([
      [1, 'A', 'replaced'],
      [2, 'A', 'ok'],
      [3, '', 'empty'],
      [4, '', 'trailing'],
      [5, 'B', 'ok'],
      [6, '', 'empty'],
    ]);
    // A refused line still wins over an earlier good one of its name; the earlier one is replaced (named), the later not.
    const w = ok('A="1"\nA=');
    expect(w.rows.map((x) => [x.key, x.status, x.replacedBy])).toEqual([
      ['A', 'replaced', 2],
      ['', 'empty', undefined],
    ]);
    expect(sent('A="1"\nA=')).toEqual({});
  });

  it('text after a closing quote refuses that row, so no cut value is ever sent', () => {
    for (const text of ["A='it's here'", 'A="say "hi" now"', 'A="abc"def']) {
      const r = ok(text);
      expect(r.rows.map((x) => [x.key, x.status])).toEqual([['', 'trailing']]);
      expect(r.values).toEqual(['']);
    }
    // A second assignment on the line that closes a multi-line value: A is refused, B never becomes a row of its own.
    const m = ok('A="l1\nl2" B=2\nC=3');
    expect(m.rows.map((x) => [x.line, x.key, x.status])).toEqual([
      [1, '', 'trailing'],
      [3, 'C', 'ok'],
    ]);
    expect(sent('A="l1\nl2" B=2\nC=3')).toEqual({ C: '3' });
    // Whitespace and a # comment after the quote are fine.
    expect(sent('A="one" \nB=\'two\'  # note\nC="three"#c')).toEqual({ A: 'one', B: 'two', C: 'three' });
  });

  it('key material after an unquoted value: the value is refused as cut, the material lines by line number only', () => {
    const pem = 'KEY=-----BEGIN KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu==\nKUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==\n-----END KEY-----\nNEXT=1';
    const r = ok(pem);
    expect(r.rows.map((x) => [x.line, x.key, x.status, x.next])).toEqual([
      [1, '', 'continued', 2],
      [2, '', 'continuation', undefined],
      [3, '', 'continuation', undefined],
      [4, '', 'no_equals', undefined],
      [5, 'NEXT', 'ok', undefined],
    ]);
    expect(sent(pem)).toEqual({ NEXT: '1' });
    // A base64 run (16+, mixed case) followed by == is material, never an entry; a line without = right after a value
    // cuts it.
    expect(ok('abcdEFGHijklMNOP==').rows.map((x) => [x.key, x.status])).toEqual([['', 'continuation']]);
    expect(ok('A=abc\ndef\nB=1').rows.map((x) => x.status)).toEqual(['continued', 'no_equals', 'ok']);
    // An empty assignment alone is just empty; blank lines and comments do not end what a value may go on over.
    expect(ok('TOKEN=\nB=1').rows.map((x) => x.status)).toEqual(['empty', 'ok']);
    expect(ok('A=abc\n\n# note\ndef').rows.map((x) => [x.status, x.next])).toEqual([
      ['continued', 4],
      ['no_equals', undefined],
    ]);
  });

  it('an unquoted value is cut only by a next line that is not a name: no =, key material, or a name failing the .env rule', () => {
    // An invalid assignment: the first line alone would be a cut value.
    const inv = 'KEY=first line\nmore secret text=continued';
    expect(ok(inv).rows.map((x) => [x.line, x.key, x.status, x.next])).toEqual([
      [1, '', 'continued', 2],
      [2, '', 'invalid', undefined],
    ]);
    expect(sent(inv)).toEqual({});
    // A hoody.* name fails the .env rule on its dot, and = with no name before it fails too: both cut.
    expect(ok('A=x\nhoody.K=1').rows.map((x) => x.status)).toEqual(['continued', 'invalid']);
    expect(ok('A=x\n=4').rows.map((x) => x.status)).toEqual(['continued', 'invalid']);
    // A line with a valid .env name and = is its own row, never a cut, even refused.
    const placeholder = 'DB_HOST=localhost\nREDIS_URL=\nPORT=1';
    expect(ok(placeholder).rows.map((x) => [x.line, x.key, x.status])).toEqual([
      [1, 'DB_HOST', 'ok'],
      [2, '', 'empty'],
      [3, 'PORT', 'ok'],
    ]);
    expect(sent(placeholder)).toEqual({ DB_HOST: 'localhost', PORT: '1' });
    expect(sent('DB_HOST=localhost\nredis_url=')).toEqual({ DB_HOST: 'localhost' });
    expect(ok('A=x\nB="1"2').rows.map((x) => x.status)).toEqual(['ok', 'trailing']);
    expect(ok('A=x\n' + 'X'.repeat(101) + '=1').rows.map((x) => [x.status, x.problem])).toEqual([
      ['ok', undefined],
      ['invalid', 'too_long'],
    ]);
    // A duplicate is replaced, not cut. A quoted value never goes on.
    expect(ok('A=x\nA=y').rows.map((x) => x.status)).toEqual(['replaced', 'ok']);
    expect(ok('A="x"\nbad name=1').rows.map((x) => x.status)).toEqual(['ok', 'invalid']);
    // Letters and digits, not starting with a digit, ending in one = is a valid .env name with an empty value: its own
    // refused, unnamed row. These two lines cannot be one padded base64 value (65 characters, not a multiple of 4), so
    // the value before it is sent; a real wrapped body's tail cuts it (the cut-tail test below).
    const b64 = 'KEY=MIIBOgIBAAJBAKj34Gkx\nFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu=';
    expect(ok(b64).rows.map((x) => [x.key, x.status])).toEqual([
      ['KEY', 'ok'],
      ['', 'empty'],
    ]);
    // base64 with + or /, or a leading digit, fails the .env rule (or is key material) and still cuts.
    expect(ok('KEY=abc\nFhD90vcN+LYLInFEX6/Ppy1t=').rows.map((x) => x.status)).toEqual(['continued', 'continuation']);
    expect(ok('KEY=abc\n9hD90vcNLYLInFEX6Ppy1t=').rows.map((x) => x.status)).toEqual(['continued', 'invalid']);
  });

  describe('NAME followed only by = signs', () => {
    const shape = (text: string) => ok(text).rows.map((x) => [x.line, x.key, x.status]);
    it('a short name, or an upper-case one of at most 64, is an entry whose value is the = signs, and cuts nothing', () => {
      expect(sent('A==')).toEqual({ A: '=' });
      expect(sent('TOKEN==')).toEqual({ TOKEN: '=' });
      expect(sent('TOKEN===')).toEqual({ TOKEN: '==' });
      expect(sent('MY_LONG_SECRET_NAME==')).toEqual({ MY_LONG_SECRET_NAME: '=' });
      const caps64 = 'A'.repeat(64);
      expect(sent(`${caps64}==`)).toEqual({ [caps64]: '=' });
      // After an unquoted value: the value before it is kept whole and sent.
      expect(shape('X=abc def\nA==')).toEqual([
        [1, 'X', 'ok'],
        [2, 'A', 'ok'],
      ]);
      expect(sent('X=abc def\nA==')).toEqual({ X: 'abc def', A: '=' });
      expect(sent('X=abc def\nTOKEN==')).toEqual({ X: 'abc def', TOKEN: '=' });
    });

    it('any other such line is key material: refused, unnamed, and it still cuts the value before it', () => {
      const cut = (line: string) => {
        expect(shape(`X=abc\n${line}`)).toEqual([
          [1, '', 'continued'],
          [2, '', 'continuation'],
        ]);
        expect(sent(`X=abc\n${line}`)).toEqual({});
      };
      // 16+ characters with no _ and mixed case: a base64 body.
      cut('abcdEFGHijklMNOP==');
      // A base64url body of 64 characters, mixed case with _ (the alphabet a .env name shares).
      const url64 = 'aZ_9Qw'.repeat(11).slice(0, 64);
      expect(url64).toHaveLength(64);
      cut(`${url64}==`);
      // A camelCase name of 16 or more, and an upper-case name over 64: refused (fail safe; renamed after import).
      cut('myVeryLongSettingName==');
      cut(`${'A'.repeat(65)}==`);
      // Standalone too (no value open before it).
      expect(shape('abcdEFGHijklMNOP==')).toEqual([[1, '', 'continuation']]);
      expect(shape(`${url64}==`)).toEqual([[1, '', 'continuation']]);
      expect(shape('myVeryLongSettingName==')).toEqual([[1, '', 'continuation']]);
    });

    it('right after an open unquoted value: material when that value looks like a base64 body or the name mixes cases', () => {
      const cutAfter = (text: string) => {
        const r = ok(text);
        expect(r.rows.map((x) => [x.key, x.status])).toEqual([
          ['', 'continued'],
          ['', 'continuation'],
        ]);
        expect(sent(text)).toEqual({});
      };
      // The short last line of a wrapped base64 body (a certificate, a key) is never a name and never cuts it silently.
      cutAfter('CERT=MIIBkTCB+wIJAKHHIGx0aBc1MA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnVu\ndGVzdA==');
      cutAfter('KEY=c2VjcmV0LXZhbHVlLWEtdGFp\nbA==');
      // A single-case short name after a base64-looking value: still material (the old ABCD== case).
      cutAfter('KEY=c2VjcmV0LXZhbHVlLWEtdGFp\nABCD==');
      // A mixed-case name after any open value, short or with a space (renamed after import if it was a real name).
      cutAfter('KEY=abc\naGVsbG8gd29ybGQ==');
      cutAfter('KEY=abc\nZw==');
      cutAfter('X=abc def\nMyName==');
      // Otherwise the standalone rule stands: a single-case name after a short or spaced value is an entry, cutting nothing.
      expect(sent('KEY=abc\nQQ==')).toEqual({ KEY: 'abc', QQ: '=' });
      expect(sent('X=abc def\nA==')).toEqual({ X: 'abc def', A: '=' });
      expect(sent('TOKEN==')).toEqual({ TOKEN: '=' });
    });

    it('a wrapped body of three or more lines: its short == tail is still key material, never a name', () => {
      // 64-column lines of a base64 body: the first holds + and /, the middle one neither (a no_equals line).
      const l1 = 'MIIBkTCB+wIJAKHHIGx0aBc1MA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnVu';
      const plain = 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3QgbGluZSBvZiBiYXNlNjQgdGV4dGFi';
      const slashy = 'Y2VydGlm+aWNhdGUgYm9keSBsaW5lIHR3byB3aXRo/IGEgc2xhc2gvYW5kIHBsdXMr';
      const allRefused = (text: string, n: number) => {
        const r = ok(text);
        expect(r.rows.map((x) => x.key)).toEqual(Array(n).fill(''));
        expect(r.rows[0]!.status).toBe('continued');
        expect(r.rows.slice(1).every((x) => x.status !== 'ok')).toBe(true);
        expect(r.rows[n - 1]!.status).toBe('continuation');
        expect(sent(text)).toEqual({});
      };
      // Three lines, the middle one no_equals (no + or /): the tail dGVzdA== is refused.
      allRefused(`KEY=${l1}\n${plain}\ndGVzdA==`, 3);
      // Three lines, the middle one a continuation.
      allRefused(`KEY=${l1}\n${slashy}\nQUJD==`, 3);
      // Four lines.
      allRefused(`KEY=${l1}\n${slashy}\n${plain}\nZw==`, 4);
      // A blank line and a comment before the tail keep the body open, as they keep an open value.
      allRefused(`KEY=${l1}\n${plain}\n\n# end\ndGVzdA==`, 3);
      // An all-caps short tail after a body line too (the standalone rule alone would take QQ== as an entry).
      allRefused(`KEY=${l1}\n${slashy}\nQQ==`, 3);
      // Unchanged: no refused line before them, so the standalone rule and the base64-body check decide.
      expect(sent('TOKEN==')).toEqual({ TOKEN: '=' });
      expect(sent('A==')).toEqual({ A: '=' });
      expect(sent('X=abc def\nA==')).toEqual({ X: 'abc def', A: '=' });
      expect(sent('KEY=abc\nQQ==')).toEqual({ KEY: 'abc', QQ: '=' });
      // A real name after the body ends it: the next NAME== line is judged on its own again.
      expect(sent(`KEY=${l1}\n${plain}\nOTHER=x\nQQ==`)).toEqual({ OTHER: 'x', QQ: '=' });
    });

    it('a real wrapped base64 body whose last line is a valid name with one =: the value is refused as cut', () => {
      // Real encodings (Buffer.from(bytes).toString('base64') of fixed bytes), wrapped at 64, 76 and 128 columns: each
      // last line is a valid .env name ending in one =, so it reads as an empty NAME= (at 128, a name too long).
      const w64 = ['tq5Ia4lq6dInFqN0GhpK2axuQtEy+qYvHaw7Rr9bGCfcXxGZ+Ozo1VszMgbkNwqD', 'k28='];
      const w76 = ['SX9zAibug6U4sj1d6OVilGGisK7uLJMaEN6rGmLXAVMtYQkUyyZXZrwRIdiKBXkHXUFH71yOCPXK', 'LUiw3YTge16C8LsC15vxitaFfpw='];
      const w128 = [
        'NV4Bag3sqRs0LpiHECwIYbg/y54vpOPjXsPhr9M9/kg8uPpnoWq4o2Vmlp76qY7xZ+QO2HsHl53OkhfGfZoH/aGdRcOUB6/V44GDWhH8edERgJ29gbXuDaguuU0uebKP',
        'nufXF5wbBcrlVVdUC3xCGu7tceb6BmFMInG836AwdxZpbar7cv8ymaW8CSOigWDkNgKB6pxSZ3J2MhoSiRnNqTsHtgfOCq9bWo2RYIxkTEchl8ZjIPJ5l9o=',
      ];
      const cutBy = (text: string, tail: string) => {
        const r = ok(text);
        expect(r.rows.map((x) => [x.key, x.status])).toEqual([
          ['', 'continued'],
          ['', tail],
        ]);
        expect(sent(text)).toEqual({});
      };
      // Never the first line alone sent as KEY (and shown sent, then saved).
      cutBy(`KEY=${w64.join('\n')}`, 'empty');
      cutBy(`KEY=${w76.join('\n')}`, 'empty');
      cutBy(`KEY=${w64.join('\r\n')}`, 'empty');
      cutBy(`KEY=${w64[0]}\n\n# end\n${w64[1]}`, 'empty');
      cutBy(`KEY=${w64[0]}\n${w64[1]} # pad`, 'empty');
      cutBy(`KEY=${w128.join('\n')}`, 'invalid');
      // Ordinary tokens before an empty placeholder still import: the pair cannot be one padded base64 value.
      expect(sent('CLIENT_ID=3f2b8c1e-9a4d-4e7b-b6c2-1d5e8f0a7c39\nCLIENT_SECRET=')).toEqual({ CLIENT_ID: '3f2b8c1e-9a4d-4e7b-b6c2-1d5e8f0a7c39' });
      const hex = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
      expect(sent(`SIGNING_KEY=${hex}\nSENTRY_DSN=`)).toEqual({ SIGNING_KEY: hex });
      const sk = fake('sk-', 'proj-Q7vR2mXk9LpT4wZs8NbY1cHd6FgJ3eUa5iOq0rWt');
      expect(sent(`OPENAI_API_KEY=${sk}\nANTHROPIC_API_KEY=`)).toEqual({ OPENAI_API_KEY: sk });
      const ghp = fake('ghp_', '8hT2kLm9QwXz4RvB7nYc1sDf6GjP3aUe0Ki5');
      expect(sent(`GITHUB_TOKEN=${ghp}\nNPM_TOKEN=`)).toEqual({ GITHUB_TOKEN: ghp });
      // 22 + 5 + 1 = 28 is a multiple of 4, but R carries no pad bits: not a tail.
      expect(sent('T=sk0123456789abcdef0123\nOTHER=')).toEqual({ T: 'sk0123456789abcdef0123' });
      // Unchanged: a short or spaced value, a quoted value (closed), a quoted empty value, a named value after it.
      expect(sent('KEY=abc\nEMPTY=')).toEqual({ KEY: 'abc' });
      expect(sent('X=abc def\nEMPTY=')).toEqual({ X: 'abc def' });
      expect(sent(`KEY="${w64[0]}"\n${w64[1]}`)).toEqual({ KEY: w64[0] });
      expect(sent(`KEY=${w64[0]}\nk28=""`)).toEqual({ KEY: w64[0] });
      expect(sent(`KEY=${w64[0]}\nOTHER=x`)).toEqual({ KEY: w64[0], OTHER: 'x' });
    });
  });

  it('parsing 64 KB of quoted lines is linear: work counted per line and per character, and no copy of the lines per value', () => {
    const big = Array.from({ length: 7000 }, (_, i) => `K${i}="v${i}"`)
      .join('\n')
      .slice(0, IMPORT_MAX_BYTES - 64);
    const lineCount = big.split('\n').length;
    // Every Array map during the parse, by the size of the array it walks (a per-value copy of the lines walks them all).
    let mapped = 0;
    const real = Array.prototype.map;
    const spy = vi.spyOn(Array.prototype, 'map').mockImplementation(function (this: unknown[], ...a: Parameters<typeof real>) {
      mapped += this.length;
      return real.apply(this, a);
    });
    const work: ParseWork = { steps: 0 };
    let r: ReturnType<typeof parseImport> | undefined;
    try {
      r = parseImport(big, work);
    } finally {
      spy.mockRestore();
    }
    // Over the row cap (refused with the count), but every line was parsed to count it.
    expect(r).toMatchObject({ ok: false, why: 'rows' });
    expect(lineCount).toBeGreaterThan(4000);
    expect(work.steps).toBeGreaterThan(0);
    expect(work.steps).toBeLessThanOrEqual(2 * big.length);
    expect(mapped).toBeLessThanOrEqual(lineCount);
  });

  it('an empty value is refused per row, not the whole import', () => {
    const r = ok('A=\nB=""\nC="ok"\nD= # only a comment');
    expect(r.rows.map((x) => [x.line, x.key, x.status])).toEqual([
      [1, '', 'empty'],
      [2, '', 'empty'],
      [3, 'C', 'ok'],
      [4, '', 'empty'],
    ]);
  });

  it('a later empty value of a name still wins (and is refused); the earlier line is replaced', () => {
    const r = ok('A=1\nB="2"\nA=');
    expect(r.rows.map((x) => x.status)).toEqual(['replaced', 'ok', 'empty']);
  });

  it('text over 64 KB is refused before parsing (its size only)', () => {
    const big = 'A=' + 'x'.repeat(IMPORT_MAX_BYTES);
    expect(parseImport(big)).toEqual({ ok: false, why: 'size', bytes: IMPORT_MAX_BYTES + 2 });
    expect(parseImport('A=' + 'x'.repeat(IMPORT_MAX_BYTES - 2)).ok).toBe(true);
  });

  it('more than 200 rows of any status is refused with the count; 200 is taken', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `K${i}=v${i}`).join('\n');
    expect(ok(lines(IMPORT_MAX_ROWS)).rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(parseImport(lines(IMPORT_MAX_ROWS + 1))).toEqual({ ok: false, why: 'rows', count: IMPORT_MAX_ROWS + 1 });
    // Refused rows count too: the preview lists them all.
    expect(parseImport(lines(IMPORT_MAX_ROWS - 1) + '\nbad name=1\nE=')).toEqual({ ok: false, why: 'rows', count: IMPORT_MAX_ROWS + 1 });
    expect(ok(lines(IMPORT_MAX_ROWS - 2) + '\nbad name=1\nE=').rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(parseImport('x\n'.repeat(32000))).toEqual({ ok: false, why: 'rows', count: 32000 });
  });

  it('nothing to import', () => {
    expect(parseImport('# only comments\n\n')).toEqual({ ok: false, why: 'nothing' });
    expect(parseImport('')).toEqual({ ok: false, why: 'nothing' });
  });
});

describe('expectedMinutes', () => {
  it('20 writes a minute: 200 rows take 10 minutes; 20 or fewer, under a minute', () => {
    expect(expectedMinutes(200)).toBe(10);
    expect(expectedMinutes(21)).toBe(2);
    expect(expectedMinutes(20)).toBe(0);
    expect(expectedMinutes(1)).toBe(0);
  });
});

describe('the import holder', () => {
  it('drop empties the values and the password and forgets it', () => {
    const h = holdImport(['a', 'b']);
    h.password = 'pw';
    expect(importHeldForTests()).toEqual({ values: 2, passwords: 1 });
    dropImport(h);
    expect(h.values).toEqual([]);
    expect(h.password).toBe('');
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
  });
});
