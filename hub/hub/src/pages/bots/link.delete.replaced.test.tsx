// Vitest: Link settings' delete confirm is bound to the link it was opened over. A link deleted and made again from
// another session has another id; a delete confirmed then would remove that new link and burn its label for good. The
// confirm closes when the link under the drawer has another id, does not come back when the link went away and another
// was made, and sends nothing for another link. Over the same link it stays, and its Confirm deletes once.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useState, type ReactElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BotLink, Change } from './data';
import { LimitsDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

const linkOf = (id: string) => ({ id, cors: true, limits: { key_rpm: 60, bot_rpm: 120, key_concurrency: 4, bot_concurrency: 8 } }) as unknown as BotLink;
const change = <R, V>(run: () => Promise<{ outcome: 'done' }>) =>
  ({
    run,
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<R, V>;

function setup() {
  const sent = vi.fn(async () => ({ outcome: 'done' as const }));
  const patch = change<BotLink, { enabled?: boolean }>(async () => ({ outcome: 'done' as const }));
  const remove = change<void, { action: 'deleteLink' }>(sent);
  function Host() {
    const [link, setLink] = useState<BotLink | null>(linkOf('bu_first'));
    return (
      <>
        <button type="button" onClick={() => setLink(linkOf('bu_made_again'))}>made again</button>
        <button type="button" onClick={() => setLink(null)}>gone</button>
        <button type="button" onClick={() => setLink(linkOf('bu_first'))}>same read again</button>
        <LimitsDrawer open onClose={() => undefined} link={link} patch={patch} remove={remove} />
      </>
    );
  }
  return { sent, Host };
}
const press = (name: string) => act(async () => { screen.getByText(name, { ignore: false }).click(); });
const confirm = () => screen.queryByRole('alertdialog', { name: strings['linkSet.deleteTitle'] });
const settle = () => act(async () => new Promise((res) => setTimeout(res, 50)));

async function openDelete(Host: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await userEvent.click(await screen.findByRole('button', { name: strings['linkSet.deleteGo'] }));
  await waitFor(() => expect(confirm()).not.toBeNull());
}

afterEach(cleanup);

it('the confirm closes when the link under the drawer has another id, and nothing was sent', async () => {
  const { sent, Host } = setup();
  await openDelete(Host);
  await press('made again');
  await waitFor(() => expect(confirm()).toBeNull());
  expect(sent).not.toHaveBeenCalled();
}, 30000);

it('the confirm does not come back when the link went away and another was made', async () => {
  const { sent, Host } = setup();
  await openDelete(Host);
  await press('gone');
  await waitFor(() => expect(confirm()).toBeNull());
  await press('made again');
  expect(await screen.findByText(strings['linkSet.title'])).toBeInTheDocument();
  await settle();
  expect(confirm()).toBeNull();
  expect(sent).not.toHaveBeenCalled();
}, 30000);

it('over the same link the confirm stays, and Confirm deletes once', async () => {
  const { sent, Host } = setup();
  await openDelete(Host);
  await press('same read again');
  await settle();
  const dialog = confirm();
  expect(dialog).not.toBeNull();
  await userEvent.click(within(dialog!).getByRole('button', { name: strings['linkSet.deleteGo'] }));
  await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
}, 30000);
