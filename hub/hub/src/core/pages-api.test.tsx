// pages-api.test.tsx: the page-facing helpers: the name suggester (hub-names.js), the current computer
// (choose, pickDefault) and the realm list with names.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import namesSource from '../../../public/auth/hub-names.js?raw';
import { chooseComputer, computerState, pickComputer, rememberedComputerId, resetComputer, useCurrentComputer } from './computer';
import { setIdentity, snapshot } from './ctx';
import { nameWords, NAME_MAX, suggestedNameValid, suggestName } from './names';
import { resetPrefs } from './prefs';
import { load, pin, setTint } from './realm';
import { realmsView, useRealms } from './realms';
import { clearAuthTokens } from './session';
import { boot, onFetch, OTHER, R1, R2, UID } from './test/env';

afterEach(() => { resetComputer(); resetPrefs(); });

describe('suggestName: the same names as hub-names.js', () => {
  const win = { crypto: undefined as unknown };
  new Function('window', namesSource)(win);
  const ref = (win as unknown as { HubNames: { suggest(r?: (n: number) => number): string; valid(s: unknown): boolean; MAX: number; words: Record<string, string[]> } }).HubNames;
  const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]!; };
  it('the word lists and the limit are the old ones', () => {
    expect({ adjectives: [...nameWords.adjectives], colors: [...nameWords.colors], animals: [...nameWords.animals] }).toEqual(ref.words);
    expect(NAME_MAX).toBe(ref.MAX);
  });
  it.each([[[0, 0, 0]], [[1, 0, 2]], [[47, 42, 61]], [[0, 1, 0, 3, 4, 5]], [[-1]], [[0.5, 1, 1]], [[99, 0, 0]]])('rand %j', (xs) => {
    expect(suggestName(seq(xs))).toBe(ref.suggest(seq(xs)));
  });
  it('amber-amber is skipped; a broken source gives no suggestion', () => {
    // amber, amber: skipped; the next draw is agile, azure, otter.
    expect(suggestName(seq([1, 0, 0, 0, 1, 0]))).toBe('agile-azure-otter');
    expect(suggestName(() => NaN)).toBe('');
  });
  it('the default source gives a valid name', () => {
    const n = suggestName();
    expect(suggestedNameValid(n)).toBe(true);
    for (const s of ['ab', 'a'.repeat(41), 'Bad-name', 'x--y', 'ok-name', 7]) expect(suggestedNameValid(s)).toBe(ref.valid(s));
  });
});

describe('the current computer', () => {
  const C = (id: string, status: string, realm = R1) => ({ id, project_id: 'p' + id, status, realm_ids: [realm] });
  it('the four buckets', () => {
    expect(['running', 'stopped', 'paused', 'creating', 'restarting', 'failed', 'weird', ''].map(computerState)).toEqual(['running', 'stopped', 'stopped', 'starting', 'starting', 'attention', 'attention', 'attention']);
  });
  it('the pick rule: remembered (even stopped) while listed; else running, starting, failed; never stopped on its own', () => {
    boot({ realm: R1 });
    const list = [C('a', 'stopped'), C('b', 'failed'), C('c', 'creating'), C('d', 'running'), C('e', 'running', R2)];
    expect(pickComputer(list, { remembered: 'a' })!.id).toBe('a');
    expect(pickComputer(list, { remembered: 'gone' })!.id).toBe('d');
    expect(pickComputer(list.filter((c) => c.id !== 'd'), { remembered: null })!.id).toBe('c');
    expect(pickComputer([C('a', 'stopped'), C('b', 'failed')], { remembered: null })!.id).toBe('b');
    expect(pickComputer([C('a', 'stopped'), C('p', 'paused')], { remembered: null })).toBeNull();
    // the selected realm's rows only: R2's running computer is not R1's pick
    expect(pickComputer([C('e', 'running', R2)], { remembered: 'e' })).toBeNull();
    expect(pickComputer([C('e', 'running', R2)], { realm: 'all', remembered: null })!.id).toBe('e');
  });
  it('choosing moves the target, re-renders, and is remembered per account; sign-out forgets it', () => {
    boot({ realm: R1 });
    const seen: (string | undefined)[] = [];
    function Probe() { seen.push(useCurrentComputer()?.container.id); return null; }
    render(<Probe />);
    act(() => { expect(chooseComputer({ id: 'd', project_id: 'pd', server_name: 'sv' })).toBe(true); });
    expect(seen.at(-1)).toBe('d');
    expect(snapshot().target).toEqual({ project: { id: 'pd' }, container: { id: 'd', server_name: 'sv' } });
    expect(rememberedComputerId()).toBe('d');
    expect(localStorage.getItem(`hub_active_computer:${UID}`)).toBe('d');
    setIdentity({ id: OTHER, banned: false });
    expect(rememberedComputerId()).toBeNull();
    setIdentity({ id: UID, banned: false });
    expect(pickComputer([C('a', 'running'), C('d', 'stopped')])!.id).toBe('d');
    clearAuthTokens();
    expect(localStorage.getItem(`hub_active_computer:${UID}`)).toBeNull();
  });
  it('a bad row is refused', () => {
    boot();
    expect(chooseComputer({ id: '' })).toBe(false);
  });
});

describe('the realm list with names', () => {
  const realms = (ids: string[], aliases: Record<string, string> = {}) => onFetch((c) => (c.url.includes('/realms')
    ? { status: 200, body: { data: { realm_ids: ids, usage: { [R1]: { computers: 2 }, [R2]: { computers: 3 } } } } }
    : c.url.includes('/vault/keys') ? { status: 200, body: { data: { value: JSON.stringify(aliases) } } } : { status: 404, body: {} }));
  it('null until the list arrives; then names (alias, else short id, never the full id), tints and counts', async () => {
    boot({ realm: R1 });
    expect(realmsView().rows).toBeNull();
    realms([R1, R2], { [R2]: 'Work' });
    await load();
    const v = realmsView();
    expect(v.selected).toBe(R1);
    expect(v.pinned).toBeNull();
    expect(v.rows!.map((r) => [r.id, r.name, r.computers])).toEqual([[R1, { kind: 'short', text: R1.slice(0, 4) + '…' + R1.slice(-4) }, 2], [R2, { kind: 'alias', text: 'Work' }, 3]]);
    expect(JSON.stringify(v.rows!.map((r) => r.name))).not.toContain(R1);
    expect(realmsView()).toBe(v);
  });
  it('useRealms re-renders on a colour change and on the list', async () => {
    boot({ realm: 'all' });
    realms([R1]);
    const seen: (string | null)[] = [];
    function Probe() { const v = useRealms(); seen.push(v.rows ? v.rows.map((r) => r.tint).join(',') : null); return null; }
    render(<Probe />);
    await act(async () => { await load(); });
    const before = seen.at(-1);
    act(() => { setTint(R1, before === 'teal' ? 'pink' : 'teal'); });
    expect(seen.at(-1)).not.toBe(before);
  });
  it('a token session pinned to one realm has that one row', () => {
    boot({ realm: R1 });
    pin(R2);
    expect(realmsView()).toMatchObject({ pinned: R2, rows: [{ id: R2 }] });
  });
});
