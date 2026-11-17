// Vitest: freshOwnerIds, the read sent now that confirms a used owner code before the drawer drops it.
// It is core's refreshFresh with `own` (never a read already out: it may be older than the code), over the Bots page's channel
// reads, and it answers the owners of one app of one Bot; undefined whenever no fresh answer lists that app. (Under a fixture
// transport the page reads its fixture source, which no core read-back reaches, so this is tested at core's seam.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshOwnerIds, type Channel } from './data';

type Fresh = { state: 'fresh' | 'failed' | 'none'; answers: { key: readonly unknown[]; data: unknown }[] };
let answer: () => Promise<Fresh> = async () => ({ state: 'none', answers: [] });
const calls: { match: unknown; o: unknown }[] = [];
vi.mock('@core', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  refreshFresh: (match: unknown, o: unknown) => { calls.push({ match, o }); return answer(); },
}));
afterEach(() => {
  answer = async () => ({ state: 'none', answers: [] });
  calls.length = 0;
});

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const person = (id: string, owner: boolean) => ({ id, platformUser: '1', name: id, rights: [], owner, lang: '' });
const app = (id: string, principals: ReturnType<typeof person>[]) => ({ id, principals }) as unknown as Channel;
const list = (key: string, ...apps: Channel[]) => ({ key: ['channels', key], data: { [key]: { channels: apps } } });

describe('freshOwnerIds: the owners of one app, from a channel read sent now', () => {
  it('asks core for a read of its own, sent now, and answers the app\'s owner ids only', async () => {
    answer = async () => ({ state: 'fresh', answers: [list(KEY, app('ch-sl', []), app('ch-tg', [person('pr-ana', true), person('pr-bo', false)]))] });
    expect(await freshOwnerIds(KEY, 'ch-tg')).toEqual(['pr-ana']);
    expect(await freshOwnerIds(KEY, 'ch-sl')).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.o).toEqual({ own: true });
    expect(typeof calls[0]!.match).toBe('function');
  });

  it('takes the app from this Bot\'s list, never another Bot\'s', async () => {
    const other = 'c-atlas~a1b2c3d4e5f60718293a4b5c~other';
    answer = async () => ({ state: 'fresh', answers: [list(other, app('ch-tg', [person('pr-x', true)])), list(KEY, app('ch-tg', [person('pr-ana', true)]))] });
    expect(await freshOwnerIds(KEY, 'ch-tg')).toEqual(['pr-ana']);
    answer = async () => ({ state: 'fresh', answers: [list(other, app('ch-tg', [person('pr-x', true)]))] });
    expect(await freshOwnerIds(KEY, 'ch-tg')).toBeUndefined();
  });

  it('proves nothing without a fresh answer naming the app: failed, none, thrown, or not listed', async () => {
    answer = async () => ({ state: 'failed', answers: [] });
    expect(await freshOwnerIds(KEY, 'ch-tg')).toBeUndefined();
    answer = async () => ({ state: 'none', answers: [] });
    expect(await freshOwnerIds(KEY, 'ch-tg')).toBeUndefined();
    answer = async () => { throw new Error('no read'); };
    expect(await freshOwnerIds(KEY, 'ch-tg')).toBeUndefined();
    answer = async () => ({ state: 'fresh', answers: [list(KEY, app('ch-sl', []))] });
    expect(await freshOwnerIds(KEY, 'ch-tg')).toBeUndefined();
  });
});
