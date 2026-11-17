// A realm move that is done must not leave the Import drawer's list behind: the drawer reads its own copy of the
// every-realm list, and a reopened drawer offers rows (and the Realms drawer takes its starting set) from it. A done
// move marks that copy stale, so the drawer reads it again rather than serving the old realms from cache.
// eslint-disable-next-line no-restricted-imports -- a hook harness: the change and the drawer's read side by side, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { useAccountComputers, useComputers, useSetRealms } from './data';
import { computers } from './fixtures';
import { routes } from './routes';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture atlas');
const MOVED = ['0123456789abcdef01234567'];

let moved = false;
const rules = () => [
  reply(routes.setRealms, () => { moved = true; return answers.ok({}); }),
  reply(routes.list, () => answers.ok({ data: { computers: [atlas] } })),
  reply(routes.accountList, () => answers.ok({ data: { computers: [{ ...atlas, realm_ids: moved ? MOVED : atlas.realm_ids }], pagination: { totalPages: 1 } } })),
];

let set!: ReturnType<typeof useSetRealms>;
let shown: string[] | null = null;
function Probe() {
  useComputers();
  set = useSetRealms();
  // The Import drawer open: its every-realm rows, as it would offer them.
  const q = useAccountComputers(true);
  shown = q.data?.rows.find((r) => r.id === atlas!.id)?.realm_ids ?? null;
  return null;
}

describe('computers: a done realm move refreshes the Import drawer\'s list', () => {
  beforeEach(() => { moved = false; shown = null; queryClient.clear(); });
  afterEach(() => cleanup());

  it('after the move, the drawer\'s row shows the new realms (never the cached old set)', async () => {
    bootFixtureCore({ rules: rules() });
    render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(shown).toEqual(atlas.realm_ids));
    let r!: Awaited<ReturnType<typeof set.mutateAsync>>;
    await act(async () => { r = await set.mutateAsync({ id: atlas.id, realmIds: MOVED }); });
    expect(r.outcome).toBe('done');
    await waitFor(() => expect(shown).toEqual(MOVED), { timeout: 3000 });
  });
});
