// Vitest: Link settings' delete confirm belongs to one opening of the drawer. Asked, then the drawer goes without an
// answer (Back, another Bot), the next opening shows the settings, never that confirm.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import type { BotLink, Change } from './data';
import { LimitsDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

const link = { cors: true, limits: { key_rpm: 60, bot_rpm: 120, key_concurrency: 4, bot_concurrency: 8 } } as unknown as BotLink;
const idle = <R, V>() =>
  ({
    run: async () => ({ outcome: 'done' as const }),
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<R, V>;
const patch = idle<BotLink, { enabled?: boolean }>();
const remove = idle<void, { action: 'deleteLink' }>();

function Host() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>go away</button>
      <button type="button" onClick={() => setOpen(true)}>open again</button>
      <LimitsDrawer open={open} onClose={() => setOpen(false)} link={link} patch={patch} remove={remove} />
    </>
  );
}

afterEach(cleanup);

it('a delete confirm left open when the drawer went does not come back on the next opening', async () => {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await userEvent.click(await screen.findByRole('button', { name: strings['linkSet.deleteGo'] }));
  expect(await screen.findByText(strings['linkSet.deleteTitle'])).toBeInTheDocument();
  await act(async () => { screen.getByText('go away', { ignore: false }).click(); });
  expect(screen.queryByText(strings['linkSet.deleteTitle'])).toBeNull();
  await act(async () => { screen.getByText('open again', { ignore: false }).click(); });
  expect(await screen.findByText(strings['linkSet.title'])).toBeInTheDocument();
  expect(screen.queryByText(strings['linkSet.deleteTitle'])).toBeNull();
}, 30000);
