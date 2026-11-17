// Vitest: the header line under Logs agrees with what the page shows. A failed read with no rows says there is
// nothing to show; a failed read that still shows rows never says "nothing".
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, sentence } from './logic';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = (k: string) => table[k] ?? k;
const base = { v: DEFAULT_VIEW, err: true, loading: false, stats: null, kinds: null, moreRows: false, t, clock: () => '' };

describe('Logs header line on a failed read', () => {
  it('with no rows: nothing to show', () => {
    expect(sentence({ ...base, rows: 0 })).toBe(table['sum.err']);
  });

  it('with rows still on screen: says only part could be read, never "nothing"', () => {
    expect(sentence({ ...base, rows: 6 })).toBe(table['sum.errSome']);
  });
});

describe('Logs header line with nothing to show', () => {
  const ok = { ...base, err: false, rows: 0 };

  it('no search and no filter: nothing happened', () => {
    expect(sentence(ok)).toBe(table['sum.none']);
    expect(sentence({ ...ok, stats: { total: 0, failed: 0, problems: 0 } })).toBe(table['sum.none']);
  });

  it('a search with no match says nothing matches, never that nothing happened', () => {
    const v = { ...DEFAULT_VIEW, search: 'zzzz' };
    expect(sentence({ ...ok, v })).toBe(table['sum.noneMatching']);
    expect(sentence({ ...ok, v, stats: { total: 0, failed: 0, problems: 0 } })).toBe(table['sum.noneMatching']);
    expect(table['sum.noneMatching']).toMatch(/matching/);
  });

  it('a How it went filter or a chip with no match says the same', () => {
    expect(sentence({ ...ok, v: { ...DEFAULT_VIEW, severity: 'failed' } })).toBe(table['sum.noneMatching']);
    expect(sentence({ ...ok, narrowed: true })).toBe(table['sum.noneMatching']);
  });
});

describe('Logs sentences that state a fact', () => {
  it('program output: the Hub adds no times; it does not say the output has none', () => {
    expect(table['prog.notTimed']).not.toMatch(/has no times/);
    expect(table['prog.notTimed']).toMatch(/adds no times/);
  });

  it('redaction is described as recognized forms, never as complete', () => {
    for (const k of ['ex.size', 'ex.sizeProgram', 'explain.scrubbed']) {
      expect(table[k]).toMatch(/[Rr]ecognized/);
      expect(table[k]).toMatch(/[Cc]heck the (file|text)/);
      expect(table[k]).not.toMatch(/Secrets are removed|already hidden/);
    }
  });

  it('limits and spans are named as they are', () => {
    expect(table['stop.cut']).not.toMatch(/size/);
    expect(table['live.idle']).not.toMatch(/without use/);
    expect(table['live.overflow']).not.toMatch(/^More than/);
    expect(table['spike']).not.toMatch(/few minutes/);
    expect(table['ex.all']).not.toMatch(/^Everything/);
    expect(table['st.update']).toMatch(/Guide/);
  });
});
