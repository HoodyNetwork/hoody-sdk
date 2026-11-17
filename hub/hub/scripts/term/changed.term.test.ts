// check.ts --changed and the new-versus-already-red view: changed.ts (scope) and red-record.ts (signatures).
import { describe, expect, test } from 'bun:test';
import { changedFiles, directImporters, scopeOf, sourceFiles } from './changed';
import { signatureOf, splitNew, type RedRecord } from './red-record';

describe('changed files', () => {
  test('a changed, an added and a removed file are changed; an equal one is not', () => {
    expect(changedFiles({ a: '1', b: '2', c: '3' }, { a: '1', b: 'x', d: '4' })).toEqual(['b', 'c', 'd']);
  });
  test('importers are confirmed by resolution, never by a mention: prim Text is imported by the prim barrel', () => {
    const files = sourceFiles();
    const imp = directImporters(new Set(['src/term/prim/Text.ts']), files);
    expect(imp.has('src/term/prim/index.ts')).toBe(true);
    const fake = directImporters(new Set(['src/term/prim/Text.ts']), ['src/x.ts'], undefined, () => '// see ./term/prim/Text\nexport const a = 1;\n');
    expect(fake.size).toBe(0);
  }, 120_000);
  test('the scope holds the change, its importers (not through a barrel) and the tests beside it', () => {
    const s = scopeOf(['scripts/term/red-record.ts']);
    expect(s.files).toContain('scripts/term/check.ts');
    expect(s.tests).toContain('scripts/term/changed.term.test.ts');
    expect(scopeOf(['src/nope/gone.ts']).files).toEqual([]);
  }, 120_000);
});

describe('new versus already red', () => {
  const p = (file: string, message: string) => ({ file, rule: 'test', message });
  test('signatures ignore line numbers and counts, not files or words', () => {
    expect(signatureOf('tests', p('a.ts:12', '3 failing: x'))).toBe(signatureOf('tests', p('a.ts:40', '4 failing: x')));
    expect(signatureOf('tests', p('a.ts', 'failing: x'))).not.toBe(signatureOf('tests', p('b.ts', 'failing: x')));
    expect(signatureOf('tests', p('a.ts', 'failing: x'))).not.toBe(signatureOf('tests', p('a.ts', 'failing: y')));
  });
  test('a recorded signature is already red; others are NEW; a gate the record never ran is all NEW; no record = all NEW', () => {
    const rec: RedRecord = { at: 't', tree: {}, gates: { tests: [signatureOf('tests', p('a.ts', 'old'))] } };
    const r = splitNew('tests', [p('a.ts', 'old'), p('a.ts', 'new')], rec);
    expect(r.known.map((x) => x.message)).toEqual(['old']);
    expect(r.fresh.map((x) => x.message)).toEqual(['new']);
    expect(splitNew('types', [p('a.ts', 'old')], rec).fresh.length).toBe(1);
    expect(splitNew('tests', [p('a.ts', 'old')], null).fresh.length).toBe(1);
  });
});
