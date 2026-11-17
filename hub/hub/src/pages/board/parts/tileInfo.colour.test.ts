// Which computer: a tile's info carries its computer's own colour (core
// computerColor, from the row as the API gives it: computerOf keeps it raw) and, in All realms only, its realm as
// text. A web address tile has neither. Realm names over 13 characters are cut in the middle.
import { describe, expect, it } from 'vitest';
import type { RealmRow } from '@core';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import { addTile, freshRealm, isRefusal, type Board, type TileRef } from '../model/boards';
import strings from '../strings.en.json';
import { boardInfo, cutMiddle, groupLabel, infoFor, realmOfTile, type InfoCtx, type RealmCtx } from './tileInfo';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const R1 = 'f1f1f1f1f1f1f1f1f1f1f1f1', R2 = 'f2f2f2f2f2f2f2f2f2f2f2f2', R3 = 'f3f3f3f3f3f3f3f3f3f3f3f3';
const rows: RealmRow[] = [
  { id: R1, name: { kind: 'alias', text: 'Acme Production' }, tint: 'teal', computers: null },
  { id: R2, name: { kind: 'alias', text: 'Acme Product QA' }, tint: 'orange', computers: null },
  { id: R3, name: { kind: 'none' }, tint: '', computers: null },
];
const raw = (id: string, name: string, color: unknown, realm_ids: string[]) => ({ id, name, status: 'running', project_id: 'p1', server_name: 'n12', realm_ids, color });
const atlas = computerOf(raw('c1', 'atlas', '#3b82f6', [R1]))!;
const borealis = computerOf(raw('c2', 'borealis', '#abc', ['ffffffffffffffffffffffff', R2]))!;
const hostile = computerOf(raw('c3', 'cedar', 'red;x:url()', [R1]))!;
const ctx: InfoCtx = { computers: [atlas, borealis, hostile], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const one: RealmCtx = { selected: R1, rows };
const all: RealmCtx = { selected: 'all', rows };
const tile = (computer: string): TileRef => ({ project: 'p1', computer, program: 'terminal', session: 1 });

describe('tile info: which computer', () => {
  it('the Board row keeps the API colour as given; the info normalises it (raw values never pass)', () => {
    expect(atlas.color).toBe('#3b82f6');
    expect(hostile.color).toBe('red;x:url()');
    expect(computerOf(raw('c4', 'x', 7, []))).not.toHaveProperty('color');
    expect(infoFor('s', tile('c1'), ctx, one).color).toBe('#3B82F6');
    expect(infoFor('s', tile('c2'), ctx, one).color).toBe('#AABBCC');
    expect(infoFor('s', tile('c3'), ctx, one).color).toBeNull();
  });

  it('two computers in one realm: two colours, no realm text (the realm is the page’s)', () => {
    const a = infoFor('s', tile('c1'), ctx, one), b = infoFor('s', tile('c2'), ctx, one);
    expect(a.color).not.toBe(b.color);
    expect([a.realm, b.realm]).toEqual([null, null]);
    expect(groupLabel(a, t)).toBe('terminal-1 · atlas');
  });

  it('All realms: the first of the computer’s realms that the list has, as text; the accessible name ends with it', () => {
    expect(infoFor('s', tile('c1'), ctx, all).realm).toEqual({ name: 'Acme Production', tint: 'teal' });
    // borealis' first realm is not in the list: the next one that is.
    expect(infoFor('s', tile('c2'), ctx, all).realm).toEqual({ name: 'Acme Product QA', tint: 'orange' });
    expect(groupLabel(infoFor('s', tile('c1'), ctx, all), t)).toBe('terminal-1 · atlas, realm Acme Production');
    // A realm with no alias reads as Global; a computer in no listed realm has no realm text.
    expect(realmOfTile(computerOf(raw('c5', 'g', '#000', [R3])), all, t)).toEqual({ name: 'Global', tint: '' });
    expect(realmOfTile(computerOf(raw('c6', 'n', '#000', ['eeeeeeeeeeeeeeeeeeeeeeee'])), all, t)).toBeNull();
    expect(realmOfTile(atlas, { selected: 'all', rows: null }, t)).toBeNull();
  });

  it('the duplicate-session suffix stays where it was; the realm comes after it', () => {
    let b: Board = freshRealm(() => 0.5).boards[0] as Board;
    for (const x of [tile('c1'), tile('c1')]) { const r = addTile(b, x, Math.random); if (!isRefusal(r)) b = r.board; }
    const infos = boardInfo(b, ctx, all);
    expect(infos.map((i) => i.label)).toEqual(['terminal-1 · atlas', 'terminal-1 · atlas (2)']);
    expect(infos.map((i) => groupLabel(i, t))).toEqual(['terminal-1 · atlas, realm Acme Production', 'terminal-1 · atlas (2), realm Acme Production']);
  });

  it('a web address tile and an empty slot have no colour and no realm', () => {
    const web = infoFor('s', { url: 'https://example.com/x' } as never, ctx, all);
    expect(web).toMatchObject({ color: null, realm: null });
    expect(groupLabel(web, t)).toBe(web.label);
    expect(infoFor('s', null, ctx, all)).toMatchObject({ color: null, realm: null });
  });

  it('long realm names are cut in the middle, so two that share a start still differ', () => {
    expect(cutMiddle('Acme Production')).toBe('Acme Pr…ction');
    expect(cutMiddle('Acme Product QA')).toBe('Acme Pr…ct QA');
    expect(cutMiddle('Acme Product')).toBe('Acme Product');
    expect(cutMiddle('1234567890123')).toBe('1234567890123');
    expect(cutMiddle('x'.repeat(64))).toHaveLength(13);
  });
});
