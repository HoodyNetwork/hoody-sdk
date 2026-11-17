// Vitest: a New Bot create held for a computer the Bots page does not list is freed once that computer is proved gone (its
// own base-host read answered 404 under the session the check began in). Then Home's Needs-you list (changesOverview)
// and the sign-out count (signOutHolds) drop it. Anything else keeps it: the computer there, a refusal (403), a lost
// read, a computer the list shows, and a token session (its calls go to its pinned realm's host, so its 404 proves
// nothing: no read is sent). The real core and the page's own create hook run over a fake fetch; every create's answer
// is lost (502).
// eslint-disable-next-line no-restricted-imports -- a router harness, as newbot.dismiss.test.tsx; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@app/testing';
import { changesOverview, CoreQueryProvider, queryClient } from '@core';
import type * as Core from '@core';
import { signOutHolds } from '@core/shell';
import { boot, calls, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTargets, useCreateBot, type Change, type NewBotResult, type NewBotVars } from './data';
import { GoneCreates } from './parts/GoneCreates';

// useRealms().pinned says a token session; the rest of core is real.
const over = vi.hoisted(() => ({ pinned: null as string | null }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    useRealms: () => {
      const v = real.useRealms();
      return over.pinned === null ? v : { ...v, pinned: over.pinned };
    },
  };
});

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
// The computer the create was sent to, which no list shows any more; and one the list shows.
const GONE = 'c9c9c9c9c9c9c9c9c9c9c9c9';
const LISTED = [{ id: 'c1c1c1c1c1c1c1c1c1c1c1c1' }];
const vars: NewBotVars = { name: 'Support', computerId: GONE, model: '', instructions: '', withLink: false, label: '', yolo: true };

let create!: Change<NewBotResult, NewBotVars>;
function Page({ listed }: { listed: readonly { id: string }[] }) {
  create = useCreateBot(GONE);
  return <GoneCreates listed={listed} />;
}
async function show(listed: readonly { id: string }[] = LISTED): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Page listed={listed} /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
}
// A call's url may be relative (same-origin): resolve it against a fixed origin before reading its path.
const isComputerRead = (c: Call) => c.method === 'GET' && new URL(c.url, 'http://hub.test').pathname.endsWith(`/computers/${GONE}`);
/** Every create's answer is lost; the computer's own read answers `read`; everything else is an empty 200. */
const answer = (read: Reply) => onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : isComputerRead(c) ? read : { status: 200, body: { data: {} } }));
const computerReads = () => calls.filter(isComputerRead).length;
/** The held creates Home lists (every realm). */
const homeHeld = () => changesOverview({ realm: 'all' }).filter((c) => c.held && typeof c.base === 'string' && c.base.startsWith('l:bots.createBot.')).length;
/** The create sent, its answer lost, then the checks given their turn. */
async function pressAndSettle() {
  let r: Awaited<ReturnType<Change<NewBotResult, NewBotVars>['run']>> | undefined;
  await act(async () => {
    r = await create.run(vars);
    await settle();
  });
  await act(async () => {
    await settle();
  });
  return r!;
}

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  over.pinned = null;
  registerTargets([{ id: GONE, project_id: 'p1', server_name: 'srv-gone' }, { id: LISTED[0]!.id, project_id: 'p1', server_name: 'srv-c1' }]);
});
afterEach(() => cleanup());

describe('New Bot: a create held for a computer that is gone', () => {
  it('its computer answers 404 on the base host: the hold is freed, so Home and the sign-out count drop it', async () => {
    answer({ status: 404, body: { error: 'Computer not found' } });
    await show();
    expect((await pressAndSettle()).outcome).toBe('pending');
    expect(computerReads()).toBe(1);
    expect(homeHeld()).toBe(0);
    expect(signOutHolds()).toHaveLength(0);
  });

  it.each([
    ['the computer is there (200)', { status: 200, body: { data: { id: GONE } } }],
    ['the read is refused (403)', { status: 403, body: { error: 'Forbidden' } }],
    ['the read is lost (network)', { status: 0, network: true }],
  ] as Array<[string, Reply]>)('%s: the hold stays', async (_what, read) => {
    answer(read);
    await show();
    expect((await pressAndSettle()).outcome).toBe('pending');
    expect(computerReads()).toBe(1);
    expect(homeHeld()).toBe(1);
    expect(signOutHolds()).toHaveLength(1);
  });

  it('a computer the list shows is not read, and its hold stays', async () => {
    answer({ status: 404, body: {} });
    await show([...LISTED, { id: GONE }]);
    expect((await pressAndSettle()).outcome).toBe('pending');
    expect(computerReads()).toBe(0);
    expect(homeHeld()).toBe(1);
  });

  it("a token session reads nothing (its 404 would be a realm host's) and the hold stays", async () => {
    over.pinned = R1;
    answer({ status: 404, body: {} });
    await show();
    expect((await pressAndSettle()).outcome).toBe('pending');
    expect(computerReads()).toBe(0);
    expect(homeHeld()).toBe(1);
    expect(signOutHolds()).toHaveLength(1);
  });
});
