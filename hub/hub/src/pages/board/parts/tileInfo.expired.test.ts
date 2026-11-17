// infoFor with InfoCtx.expired: a tile whose computer the whole list lacks is "gone" only when the read that includes
// computers whose server's rental ended lacks it too. Found there it is the subscription card's computer (status
// 'expired', state 'attention', never framed, no Start); that read unanswered is 'loading'; failed or partial is 'unknown'.
import { describe, expect, it } from 'vitest';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { expiredComputerOf, type BoardComputer } from '../computers';
import type { TileRef } from '../model/boards';
import strings from '../strings.en.json';
import { powerOp } from './lifecycle';
import { infoFor, type InfoCtx, type RealmCtx } from './tileInfo';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const pc = (id: string, name: string, status: string) => ({ id, name, status, project_id: 'p1', server_name: 'n12', realm_ids: [] }) as unknown as BoardComputer;
const ctx: InfoCtx = { computers: [pc('c1', 'atlas', 'running')], failed: false, complete: true, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const one: RealmCtx = { selected: '0123456789abcdef01234567', rows: null };
const tile: TileRef = { project: 'p1', computer: 'c9', program: 'terminal', session: 1 };
const ended = pc('c9', 'cedar', 'expired');
const whole = { rows: [ended], complete: true, failed: false };

describe('infoFor: a computer the list lacks, with the read that includes ended rentals', () => {
  it('found there: the subscription card (attention, status expired), no address', () => {
    const i = infoFor('s', tile, { ...ctx, expired: whole }, one);
    expect(i).toMatchObject({ state: 'attention', url: null, shareUrl: null, computerName: 'cedar' });
    expect(i.computer?.status).toBe('expired');
  });
  it('found there even when that read is a first page of a longer list', () => {
    expect(infoFor('s', tile, { ...ctx, expired: { ...whole, complete: false } }, one).state).toBe('attention');
  });
  it('a row of the same id under another project is not the tile\'s computer', () => {
    const other = { ...ended, project_id: 'p2' } as BoardComputer;
    expect(infoFor('s', tile, { ...ctx, expired: { ...whole, rows: [other] } }, one).state).toBe('gone');
  });
  it('the whole read lacks it too: gone', () => {
    expect(infoFor('s', tile, { ...ctx, expired: { rows: [], complete: true, failed: false } }, one)).toMatchObject({ state: 'gone', url: null });
  });
  it('that read has not answered: loading, neither claim', () => {
    expect(infoFor('s', tile, { ...ctx, expired: { rows: null, complete: false, failed: false } }, one).state).toBe('loading');
  });
  it('that read failed, or is not the whole list: unknown, neither claim', () => {
    expect(infoFor('s', tile, { ...ctx, expired: { rows: null, complete: false, failed: true } }, one).state).toBe('unknown');
    expect(infoFor('s', tile, { ...ctx, expired: { rows: [], complete: true, failed: true } }, one).state).toBe('unknown');
    expect(infoFor('s', tile, { ...ctx, expired: { rows: [], complete: false, failed: false } }, one).state).toBe('unknown');
  });
  it('without that read the answer is as before; a listed computer is never looked up there', () => {
    expect(infoFor('s', tile, ctx, one).state).toBe('gone');
    const live = infoFor('s', { ...tile, computer: 'c1' }, { ...ctx, expired: { rows: [pc('c1', 'atlas', 'expired')], complete: true, failed: false } }, one);
    expect(live.state).toBe('live');
  });
  it('a list that failed or is partial stays unknown whatever that read says', () => {
    expect(infoFor('s', tile, { ...ctx, complete: false, expired: { rows: [], complete: true, failed: false } }, one).state).toBe('unknown');
  });
});

describe('expiredComputerOf', () => {
  const row = { id: 'c9', name: 'cedar', status: 'stopped', project_id: 'p1', server_name: 'n12', realm_ids: [], server_expired: true };
  it('stopped with server_expired reads as expired, and offers no Start', () => {
    const c = expiredComputerOf(row);
    expect(c?.status).toBe('expired');
    expect(c && powerOp(c)).toBeNull();
  });
  it('another status keeps its word; a row without server_expired is not an ended rental', () => {
    expect(expiredComputerOf({ ...row, status: 'host_reinstalled' })?.status).toBe('host_reinstalled');
    expect(expiredComputerOf({ ...row, server_expired: false })).toBeNull();
    expect(expiredComputerOf({ ...row, server_expired: undefined })).toBeNull();
    expect(expiredComputerOf(null)).toBeNull();
  });
});
