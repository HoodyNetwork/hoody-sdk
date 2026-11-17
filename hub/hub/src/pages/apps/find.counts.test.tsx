// Vitest: each search source's chip counts the rows it adds to the list as shown, so the chips add up to the
// list's total: a row found in two sources counts once (where it is listed), a hidden row counts only once shown, and
// a catalogue app counts on the "Ready to install" chip.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type Candidate, type Find, type FindResult, type Starter, classify, findView } from './logic';
import { SourceStrip } from './parts/SourceStrip';

const cand = (c: Partial<Candidate> & { title: string; provider: Candidate['provider'] }): Candidate => ({
  app: 'q', setId: 's', candidateId: `${c.provider}:${c.title}:${c.attr ?? ''}`, description: '', kind: 'any', source: '', version: '', attr: '', path: '', tags: [], ...c,
});
const done = (rows: Candidate[]): Find[keyof Find] => ({ state: 'done', rows: rows.map(classify), partial: false, warming: false });
const all = (o: Partial<Find> = {}): Find => ({ ...Object.fromEntries((['system', 'registry', 'nix', 'pkgx', 'appimage', 'oci'] as const).map((k) => [k, done([])])), ...o }) as Find;
const jl: Starter = { id: 'jupyterlab', name: 'JupyterLab', description: '', opensIn: 'web', available: true, shares: false };

const find = (o: Partial<Find> = {}) =>
  all({
    system: done([cand({ title: 'firefox', provider: 'system', path: '/usr/bin/firefox' })]),
    nix: done([
      cand({ title: 'firefox', provider: 'nix', attr: 'firefox' }),
      cand({ title: 'firefox-esr', provider: 'nix', attr: 'firefox-esr', kind: 'gui' }),
      cand({ title: 'firefox-vim', provider: 'nix', attr: 'vimPlugins.firefox-vim' }),
    ]),
    registry: done([
      cand({ title: 'JupyterLab', provider: 'registry', starterId: 'jupyterlab', starterOpens: 'web' }),
      cand({ title: 'Krita', provider: 'registry', starterId: 'krita', starterOpens: 'screen' }),
    ]),
    ...o,
  });
const countOf = (v: FindResult, source: string) => v.statuses.find((x) => x.source === source)?.count;
const sum = (v: FindResult) => v.statuses.reduce((n, x) => n + x.count, 0) + v.catalogue;

describe('find counts', () => {
  it('counts the rows each source adds to the list as shown, and the chips add up to the total', () => {
    const v = findView('fire', [jl], find());
    expect(v.list.map((i) => i.name)).toEqual(expect.arrayContaining(['JupyterLab', 'Krita', 'firefox', 'firefox-esr']));
    expect(v.list).toHaveLength(4);
    // The installed firefox folds its Nix twin: one row, counted where it is listed (this computer).
    expect(countOf(v, 'system')).toBe(1);
    expect(countOf(v, 'nix')).toBe(1);
    // A registry result that is a catalogue app is the catalogue's row; one that is not becomes a starter of its own.
    expect(countOf(v, 'registry')).toBe(1);
    expect(v.catalogue).toBe(1);
    expect(countOf(v, 'pkgx')).toBe(0);
    expect(v.hidden).toBe(1);
    expect(sum(v)).toBe(v.list.length);
  });

  it('a hidden row counts once it is shown; the sum still matches', () => {
    const v = findView('fire', [jl], find(), { all: true });
    expect(v.list).toHaveLength(5);
    expect(countOf(v, 'nix')).toBe(2);
    expect(sum(v)).toBe(v.list.length);
  });

  it('a row two sources both return counts once, for the first source that lists it', () => {
    const twice = cand({ title: 'gimp', provider: 'nix', attr: 'gimp', kind: 'gui' });
    const v = findView('gimp', [], all({ nix: done([twice]), pkgx: done([{ ...twice, provider: 'nix' }]) }));
    expect(v.list).toHaveLength(1);
    expect(countOf(v, 'nix')).toBe(1);
    expect(countOf(v, 'pkgx')).toBe(0);
    expect(sum(v)).toBe(1);
  });

  it('a source still searching or that failed counts nothing yet', () => {
    const v = findView('fire', [], find({ nix: { state: 'searching', rows: [], partial: false, warming: false }, oci: { state: 'failed', rows: [], partial: false, warming: false } }));
    expect(countOf(v, 'nix')).toBe(0);
    expect(countOf(v, 'oci')).toBe(0);
    expect(sum(v)).toBe(v.list.length);
  });
});

describe('the source chips', () => {
  const strip = (v: FindResult) => render(<SourceStrip view={v} showAll={false} onToggleAll={() => undefined} onRetry={() => undefined} />);

  it('a done source shows its count, 0 included; a running one says searching; a failed one keeps its words', () => {
    const v = findView('fire', [jl], find({ pkgx: { state: 'searching', rows: [], partial: false, warming: false }, oci: { state: 'failed', rows: [], partial: false, warming: false } }));
    strip(v);
    expect(screen.getByText('On this computer: 1')).toBeTruthy();
    expect(screen.getByText('Nix: 1')).toBeTruthy();
    expect(screen.getByText('Program index: 1')).toBeTruthy();
    expect(screen.getByText('AppImage: 0')).toBeTruthy();
    expect(screen.getByText('pkgx: searching…')).toBeTruthy();
    expect(screen.getByText("Docker: Didn't answer")).toBeTruthy();
    expect(screen.getByText('Ready to install: 1')).toBeTruthy();
  });

  it('a failed source with rows kept, and a source getting ready with rows: each shows its count with its words, and the chips add up', () => {
    const kept = classify(cand({ title: 'firefox-kept', provider: 'nix', attr: 'firefox-kept', kind: 'gui' }));
    const warm = classify(cand({ title: 'firefox-warm', provider: 'pkgx', kind: 'gui' }));
    const v = findView('fire', [], find({ nix: { state: 'failed', rows: [kept], partial: false, warming: false }, pkgx: { state: 'done', rows: [warm], partial: false, warming: true } }));
    strip(v);
    expect(screen.getByText("Nix: 1 (Didn't answer)")).toBeTruthy();
    expect(screen.getByText('pkgx: 1 (Getting ready)')).toBeTruthy();
    const shown = screen.getAllByText(/: \d+( \(|$)/).map((el) => Number(/: (\d+)/.exec(el.textContent ?? '')![1]));
    expect(shown.reduce((a, c) => a + c, 0)).toBe(v.list.length);
  });

  it('no catalogue app listed: no Ready to install chip', () => {
    strip(findView('fire', [], find()));
    expect(screen.queryByText(/^Ready to install:/)).toBeNull();
  });
});
