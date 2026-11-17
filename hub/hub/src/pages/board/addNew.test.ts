// Vitest: the number a "new terminal" Add link gets (addNew.ts): the next free one the picker's New session
// would take, over every Board of the realm, its recents and the computer's live sessions.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { newTerminalNumber, readLiveFor } from './addNew';
import type { BoardComputer } from './computers';
import type { RealmBoards, Tile } from './model/boards';
import type * as TermSessions from './termSessions';
import type { TermSession } from './termSessions';

const R = vi.hoisted(() => ({ read: null as null | ((signal?: AbortSignal) => Promise<unknown>) }));
vi.mock('./termSessions', async (orig) => {
  const real = await orig<typeof TermSessions>();
  return { ...real, readSessions: (c: BoardComputer, signal?: AbortSignal) => (R.read ? R.read(signal) : real.readSessions(c, signal)) as ReturnType<typeof real.readSessions> };
});
afterEach(() => { R.read = null; vi.useRealTimers(); });
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')! as unknown as BoardComputer;

const tile = (computer: string, program: 'terminal' | 'display', session: number): Tile => ({ project: 'p', computer, program, session });
const board = (id: string, tiles: Tile[]) => ({ id, name: id, layout: { slot: 's0' }, tiles: Object.fromEntries(tiles.map((t, i) => ['s' + i, t])), active: 's0', max: null }) as unknown as RealmBoards['boards'][number];
const realm = (boards: RealmBoards['boards'], recents: RealmBoards['recents'] = []): RealmBoards => ({ v: 1, active: boards[0]?.id ?? 'b', boards, recents });
const live = (...ns: number[]) => ns.map((n) => ({ n, offered: true }) as unknown as TermSession);

describe('newTerminalNumber', () => {
  it('starts at 2: terminal 1 is the computer\'s own, as the picker counts it', () => {
    expect(newTerminalNumber(realm([board('a', [])]), 'c1', null)).toBe(2);
  });
  it('goes past every terminal of that computer on any Board, in recents and live', () => {
    const st = realm([board('a', [tile('c1', 'terminal', 3)]), board('b', [tile('c1', 'terminal', 12)])], [{ project: 'p', computer: 'c1', program: 'terminal', session: 20 }]);
    expect(newTerminalNumber(st, 'c1', null)).toBe(21);
    expect(newTerminalNumber(st, 'c1', live(4, 30))).toBe(31);
  });
  it('a higher terminal on another Board alone sets the number', () => {
    expect(newTerminalNumber(realm([board('a', [tile('c1', 'terminal', 3)]), board('b', [tile('c1', 'terminal', 40)])], [{ project: 'p', computer: 'c1', program: 'terminal', session: 5 }]), 'c1', live(6))).toBe(41);
  });
  it('counts only that computer\'s terminals', () => {
    const st = realm([board('a', [tile('c2', 'terminal', 40), tile('c1', 'display', 50)])], [{ project: 'p', computer: 'c2', program: 'terminal', session: 60 }]);
    expect(newTerminalNumber(st, 'c1', live(5))).toBe(6);
  });
  it('stays in the Board range: a launch-range number taken elsewhere does not move it there', () => {
    expect(newTerminalNumber(realm([board('a', [tile('c1', 'terminal', 8500)])]), 'c1', live(7))).toBe(8);
  });
  it('null when every Board number is held', () => {
    expect(newTerminalNumber(realm([board('a', [])]), 'c1', live(...Array.from({ length: 8000 }, (_, i) => i + 1)))).toBeNull();
  });
});

describe('readLiveFor', () => {
  it('the live sessions when the read answers in time', async () => {
    R.read = () => Promise.resolve(live(3));
    expect(await readLiveFor(atlas, new AbortController().signal, 1000)).toEqual(live(3));
  });
  it('null when the read fails', async () => {
    R.read = () => Promise.reject(new Error('down'));
    expect(await readLiveFor(atlas, new AbortController().signal, 1000)).toBeNull();
  });
  it('null once waitMs passes unanswered, and the read is aborted', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    R.read = (signal) => { seen = signal; return new Promise((_, no) => signal?.addEventListener('abort', () => no(new Error('aborted')))); };
    const p = readLiveFor(atlas, new AbortController().signal, 500);
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toBeNull();
    expect(seen?.aborted).toBe(true);
  });
  it('null for a computer that is not running, without a read', async () => {
    R.read = () => { throw new Error('read'); };
    expect(await readLiveFor({ ...atlas, status: 'stopped' } as BoardComputer, new AbortController().signal, 500)).toBeNull();
  });
});
