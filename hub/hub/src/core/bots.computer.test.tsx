// bots.computer.test.tsx: one computer's Bots for the Board's Bots section. parseComputerBots is the one parser
// of the GET /bots answer for it: a row is kept only with an id and realm a Bot key can carry,
// two rows with one key contradict each other, and an answer that is not a list is unknown (null), never "no Bots".
// useComputerBots reads the computer it is given, and a failed or unparseable read is `failed`, never old rows.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { botKeyOf, botsListRoute, parseBotList, parseComputerBots, useComputerBots, type ComputerBot } from './bots';
import type { Target } from './ctx';
import { bootFixtureCore } from './fixture-boot';
import { queryClient } from './query';
import { sourceReads } from './source';
import { reply } from './transport';

const R = '0123456789abcdef01234567';

describe('parseComputerBots', () => {
  it.each<[string, unknown, ComputerBot[] | null]>([
    ['real rows: id, name, realm (24 hex and global)', { items: [{ id: 'chief', name: 'Chief', realm: R, status: 'idle' }, { id: 'scout', name: 'Scout', realm: 'global' }] }, [{ id: 'chief', realm: R, name: 'Chief' }, { id: 'scout', realm: 'global', name: 'Scout' }]],
    ['an empty list', { items: [] }, []],
    ['a name missing, blank or not a string falls back to the id', { items: [{ id: 'a', realm: R }, { id: 'b', realm: R, name: '  ' }, { id: 'c', realm: R, name: 3 }] }, [{ id: 'a', realm: R, name: 'a' }, { id: 'b', realm: R, name: 'b' }, { id: 'c', realm: R, name: 'c' }]],
    ['a name is trimmed', { items: [{ id: 'a', realm: R, name: ' Ann ' }] }, [{ id: 'a', realm: R, name: 'Ann' }]],
    ['a row without an id is dropped', { items: [{ name: 'x', realm: R }, { id: 'a', realm: R }] }, [{ id: 'a', realm: R, name: 'a' }]],
    ['an id with the key separator is dropped', { items: [{ id: 'a~b', realm: R }] }, []],
    ['an id that is not a string is dropped', { items: [{ id: 5, realm: R }] }, []],
    ['a row without a realm is dropped', { items: [{ id: 'a' }] }, []],
    ['a realm that is not global or 24 hex is dropped', { items: [{ id: 'a', realm: 'Personal' }] }, []],
    ['a row that is not an object is dropped', { items: ['a', null, [1]] }, []],
    ['two rows with one key are a contradiction: both dropped', { items: [{ id: 'a', realm: R, name: 'One' }, { id: 'a', realm: R, name: 'Two' }, { id: 'a', realm: 'global' }] }, [{ id: 'a', realm: 'global', name: 'a' }]],
    ['no items list is unknown', { data: [] }, null],
    ['items that are not an array is unknown', { items: {} }, null],
    ['not an object is unknown', 'nope', null],
    ['a row that is not an object is not a Bot, the rows beside it stay', { items: [7, { id: 'a', realm: R }] }, [{ id: 'a', realm: R, name: 'a' }]],
  ])('%s', (_why, raw, want) => {
    expect(parseComputerBots(raw)).toEqual(want);
  });

  it("parseBotList keeps every row object for the Bots page, the Bots a key can carry, and the list's counts", () => {
    const bad = { id: 'a~b', realm: R };
    expect(parseBotList({ items: [{ id: 'a', realm: R }, bad, 'x'], suspended_count: 2, meta: { total: 9 } })).toEqual({
      items: [{ id: 'a', realm: R }, bad], bots: [{ id: 'a', realm: R, name: 'a' }], suspended: 2, hasMore: true, counted: false,
    });
    expect(parseBotList({ items: [], meta: { total: 0 } })).toEqual({ items: [], bots: [], suspended: 0, hasMore: false, counted: false });
    // Counted only when the answer carries both counts as whole numbers and every row is an object.
    expect(parseBotList({ items: [{ id: 'a', realm: R }], meta: { total: 1 }, suspended_count: 0 })?.counted).toBe(true);
    expect(parseBotList({ items: [], meta: { total: 0 }, suspended_count: 1.5 })?.counted).toBe(false);
    expect(parseBotList({ items: 'no' })).toBeNull();
  });

  it('a Bot key is computer~realm~bot, the Bots page form', () => {
    expect(botKeyOf('c1', R, 'chief')).toBe(`c1~${R}~chief`);
  });
});

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); }
const target = (id: string): Target => ({ project: { id: 'p1' }, container: { id, server_name: 's1' } });

function harness(t: Target | null, status = 200) {
  const w = { status, body: { items: [{ id: 'chief', realm: R, name: 'Chief' }] } as unknown, asked: [] as string[] };
  bootFixtureCore({
    rules: [reply(botsListRoute, (req) => { w.asked.push(req.target?.container.id ?? ''); return { status: w.status, body: w.status === 200 ? w.body : {} }; })],
  });
  queryClient.clear();
  let last: ReturnType<typeof useComputerBots> | undefined;
  function Probe() { last = useComputerBots(t); return null; }
  render(<Probe />, { wrapper: wrap });
  return { w, now: () => last! };
}

describe('useComputerBots', () => {
  it("reads the Bots of the computer it is given, and only that one", async () => {
    const h = harness(target('c7'));
    await flush();
    expect(h.now().bots).toEqual([{ id: 'chief', realm: R, name: 'Chief' }]);
    expect(h.now().failed).toBe(false);
    expect(new Set(h.w.asked)).toEqual(new Set(['c7']));
  });

  it('no computer: no read, nothing known', async () => {
    const h = harness(null);
    await flush();
    expect(h.w.asked).toEqual([]);
    expect(h.now().bots).toBeUndefined();
    expect(h.now().failed).toBe(false);
  });

  it('a failed read is failed with no rows; Try again that answers shows the Bots', async () => {
    const h = harness(target('c1'), 500);
    await flush();
    expect(h.now()).toMatchObject({ bots: undefined, failed: true });
    h.w.status = 200;
    await act(async () => { h.now().retry(); });
    await flush();
    expect(h.now()).toMatchObject({ bots: [{ id: 'chief', realm: R, name: 'Chief' }], failed: false });
  });

  it("is the Bots page's own per-computer read: its refresh and its failure are what this reader shows", async () => {
    const h = harness(target('c1'));
    await flush();
    expect(h.now().bots).toEqual([{ id: 'chief', realm: R, name: 'Chief' }]);
    const keys = queryClient.getQueryCache().findAll({ predicate: (q) => sourceReads('bots', 'computerBots', { computer: 'c1' })(q.queryKey) });
    expect(keys).toHaveLength(1);
    // The Bots page deletes chief and re-reads its list (its invalidate(['computerBots'])): the reader drops chief.
    h.w.body = { items: [] };
    await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => sourceReads('bots', ['computerBots'])(q.queryKey) }); });
    await flush();
    expect(h.now()).toMatchObject({ bots: [], failed: false });
    // The page's next read fails: so does this reader's, with no rows kept as current.
    h.w.status = 500;
    await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => sourceReads('bots', ['computerBots'])(q.queryKey) }); });
    await flush();
    expect(h.now()).toMatchObject({ bots: undefined, failed: true });
  });

  it("a computer change shows only the new computer's answer, even when the old one answers late", async () => {
    const held: Record<string, () => void> = {};
    bootFixtureCore({
      rules: [reply(botsListRoute, async (req) => {
        const id = req.target?.container.id ?? '';
        if (id === 'c1') await new Promise<void>((r) => { held.c1 = r; });
        return { status: 200, body: { items: [{ id: 'bot-' + id, realm: R }] } };
      })],
    });
    queryClient.clear();
    let last: ReturnType<typeof useComputerBots> | undefined;
    function Probe({ id }: { id: string }) { last = useComputerBots(target(id)); return null; }
    const v = render(<Probe id="c1" />, { wrapper: wrap });
    await flush();
    expect(last!.bots).toBeUndefined();
    v.rerender(<Probe id="c2" />);
    await flush();
    expect(last!.bots).toEqual([{ id: 'bot-c2', realm: R, name: 'bot-c2' }]);
    await act(async () => { held.c1?.(); });
    await flush();
    expect(last!.bots).toEqual([{ id: 'bot-c2', realm: R, name: 'bot-c2' }]);
  });

  it('an answer that is not a list after good rows is failed, never the old rows', async () => {
    const h = harness(target('c1'));
    await flush();
    expect(h.now().bots).toHaveLength(1);
    h.w.body = { items: 'nope' };
    await act(async () => { h.now().retry(); });
    await flush();
    expect(h.now()).toMatchObject({ bots: undefined, failed: true });
  });
});
