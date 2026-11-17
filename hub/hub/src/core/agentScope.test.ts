// agentScopeFacts: what a "Use with your agent" prompt names, from the page's live context.
import { describe, expect, it } from 'vitest';
import { agentScopeFacts, filterComputer, scopeRows } from './agentScope';

const P = 'f1f1f1f1f1f1f1f1f1f1f1f1', A = 'f2f2f2f2f2f2f2f2f2f2f2f2', L = 'f3f3f3f3f3f3f3f3f3f3f3f3';
const alias = (id: string) => ({ [P]: 'Personal', [A]: 'Acme client' })[id] ?? null;
const atlas = { id: 'c0a7150000000000000000a1', name: 'atlas', server_name: 'n12', realm_ids: [P] };

describe('agentScopeFacts', () => {
  it('a selected realm is named by its nickname and full id; All realms is none', () => {
    expect(agentScopeFacts(P, null, undefined, alias)).toEqual({ realm: { id: P, name: 'Personal' }, computer: null });
    expect(agentScopeFacts('all', null, undefined, alias)).toEqual({ realm: null, computer: null });
  });

  it('a realm with no nickname has no name (its full id names it), never the short id', () => {
    expect(agentScopeFacts(L, null, undefined, alias).realm).toEqual({ id: L, name: null });
  });

  it('the computer is its row: own name, full id, and the selected realm it is in', () => {
    expect(agentScopeFacts(P, atlas.id, [atlas], alias).computer).toEqual({ computer: { id: atlas.id, name: 'atlas' }, realm: { id: P, name: 'Personal' } });
  });

  it('under All realms the computer is named in its only realm; in several realms, by its id alone', () => {
    expect(agentScopeFacts('all', atlas.id, [atlas], alias).computer?.realm).toEqual({ id: P, name: 'Personal' });
    const two = { ...atlas, realm_ids: [P, A] };
    expect(agentScopeFacts('all', atlas.id, [two], alias).computer).toEqual({ computer: { id: atlas.id, name: 'atlas' }, realm: null });
    expect(agentScopeFacts(A, atlas.id, [two], alias).computer?.realm).toEqual({ id: A, name: 'Acme client' });
  });

  it('a row with no name never falls back to its routing node; a row not in the list is named by its id, no realm guessed', () => {
    const nameless = { ...atlas, name: '' };
    expect(agentScopeFacts(P, atlas.id, [nameless], alias).computer?.computer).toEqual({ id: atlas.id, name: null });
    expect(JSON.stringify(agentScopeFacts(P, atlas.id, [nameless], alias))).not.toContain('n12');
    expect(agentScopeFacts(P, atlas.id, [], alias).computer).toEqual({ computer: { id: atlas.id, name: null }, realm: null });
    expect(agentScopeFacts(P, atlas.id, undefined, alias).computer).toEqual({ computer: { id: atlas.id, name: null }, realm: null });
  });

  it('junk realm ids on a row are ignored', () => {
    const junk = { ...atlas, realm_ids: ['nope', 7, P] };
    expect(agentScopeFacts('all', atlas.id, [junk], alias).computer?.realm).toEqual({ id: P, name: 'Personal' });
  });
});

// A page's computer filter in its prompt: the filter is never dropped and never widened to the page's
// unfiltered set while it is held.
describe('filterComputer', () => {
  it('no filter names none; a filter the list resolved names that row', () => {
    expect(filterComputer(null, undefined)).toEqual({ computer: null, ask: false });
    expect(filterComputer(undefined, undefined)).toEqual({ computer: null, ask: false });
    expect(filterComputer('atlas.00a1', atlas.id)).toEqual({ computer: atlas.id, ask: false });
  });

  it('a full computer id the list cannot resolve (not read yet, read failed, another realm, past page one) is still named by that id', () => {
    expect(filterComputer(atlas.id, undefined)).toEqual({ computer: atlas.id, ask: false });
    expect(filterComputer(atlas.id, null)).toEqual({ computer: atlas.id, ask: false });
  });

  it('a value that is not a full id (a handle not yet rewritten, junk) asks which computer, never the unfiltered set', () => {
    expect(filterComputer('atlas.00a1', undefined)).toEqual({ computer: null, ask: true });
    expect(filterComputer('C0A7150000000000000000A1', undefined)).toEqual({ computer: null, ask: true });
    expect(filterComputer('x', null)).toEqual({ computer: null, ask: true });
  });
});

describe('scopeRows', () => {
  it('a refetch that failed keeps the last good rows, so a computer named before stays named (by name and realm)', () => {
    const list = { data: { rows: [atlas] }, isError: true };
    expect(scopeRows(true, list)).toEqual([atlas]);
    expect(agentScopeFacts(P, atlas.id, scopeRows(true, list), alias).computer).toEqual({ computer: { id: atlas.id, name: 'atlas' }, realm: { id: P, name: 'Personal' } });
  });

  it('a first read that failed has no rows: the computer is named by its full id alone, no realm guessed', () => {
    const list = { data: undefined, isError: true };
    expect(scopeRows(true, list)).toBeUndefined();
    expect(agentScopeFacts(P, atlas.id, scopeRows(true, list), alias).computer).toEqual({ computer: { id: atlas.id, name: null }, realm: null });
  });

  it('no computer named: no rows, whatever the list holds', () => {
    expect(scopeRows(false, { data: { rows: [atlas] } })).toBeUndefined();
  });
});
