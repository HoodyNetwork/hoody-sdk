// A realm change whose answer was lost is proved only by a fresh read that shows exactly the set sent. A computer
// moved OUT of the realm in view leaves that realm's list, so only the every-realm list can show it. The page keeps
// the Import drawer mounted while closed; its every-realm read must not stand in for that proof (a closed drawer
// reads nothing), so Check again reads the every-realm list itself and proves the move.
// eslint-disable-next-line no-restricted-imports -- a hook harness: the change and the closed drawer side by side, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { useComputers, useSetRealms } from './data';
import { computers } from './fixtures';
import { ImportDrawer } from './parts/Drawers';
import { routes } from './routes';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture atlas');
const MOVED = ['0123456789abcdef01234567'];

/** Whether the move landed: the every-realm list shows atlas in the new set from then on. */
let landed = false;
let accountReads = 0;
const rules = () => [
  reply(routes.setRealms, answers.pending5xx(502)),
  // The realm in view: atlas has left it once the move landed.
  reply(routes.list, () => answers.ok({ data: { computers: landed ? [] : [atlas] } })),
  reply(routes.accountList, () => { accountReads += 1; return answers.ok({ data: { computers: [{ ...atlas, realm_ids: landed ? MOVED : atlas.realm_ids }], pagination: { totalPages: 1 } } }); }),
];

let set!: ReturnType<typeof useSetRealms>;
let listed = false;
function Probe() {
  const q = useComputers();
  listed = !!q.data;
  set = useSetRealms();
  return <ImportDrawer isOpen={false} realms={[]} onClose={() => undefined} onPick={() => undefined} />;
}
// Lets the read-back taken right after the send finish, so Check again sends its own read.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 150)); });
const mount = () => render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);

describe('computers: a realm move out of the realm in view is proved by the every-realm list', () => {
  beforeEach(() => { landed = false; accountReads = 0; listed = false; queryClient.clear(); });
  afterEach(() => cleanup());

  it('Check again reads the every-realm list (the closed Import drawer reads nothing) and proves the move', async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    await waitFor(() => expect(listed).toBe(true));
    let r!: Awaited<ReturnType<typeof set.mutateAsync>>;
    await act(async () => { r = await set.mutateAsync({ id: atlas.id, realmIds: MOVED }); });
    expect(r.outcome).toBe('pending');
    await settle();
    landed = true;
    const before = accountReads;
    let proved: boolean | undefined;
    await act(async () => { proved = await set.readBack(); });
    expect(accountReads).toBeGreaterThan(before);
    expect(proved).toBe(true);
  });

  it('a read that still shows the old set proves nothing: the move stays held', async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    await waitFor(() => expect(listed).toBe(true));
    await act(async () => { await set.mutateAsync({ id: atlas.id, realmIds: MOVED }); });
    await settle();
    let proved: boolean | undefined;
    await act(async () => { proved = await set.readBack(); });
    expect(proved).toBe(false);
    expect(set.pending).toBe(true);
  });
});
