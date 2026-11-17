// Vitest: the Confirm of Link settings' delete sends only for the link the confirm was opened over. The confirm closes one
// render after the read shows another link (link.delete.replaced.test.tsx); this pins the render in between, where the
// dialog is still drawn over the new link: its Confirm sends nothing. The dialog is replaced by a recorder of what each
// render gave it, so the Confirm of that one render can be pressed.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor } from '@app/testing';
import { CoreQueryProvider } from '@core';
import type * as Kit from '@kit';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BotLink, Change } from './data';
import { LimitsDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

type Drawn = { isOpen: boolean; onConfirm: () => void };
const drawn: Drawn[] = [];
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    ConfirmDialog: (p: { overlayId?: string; isOpen: boolean; onConfirm: () => void }) => {
      if (p.overlayId === 'bots-link-limits-delete') drawn.push({ isOpen: p.isOpen, onConfirm: p.onConfirm });
      return null;
    },
  };
});

const linkOf = (id: string) => ({ id, cors: true, limits: { key_rpm: 60, bot_rpm: 120, key_concurrency: 4, bot_concurrency: 8 } }) as unknown as BotLink;
const change = <R, V>(run: () => Promise<{ outcome: 'done' }>) =>
  ({
    run,
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<R, V>;

async function openDelete() {
  const sent = vi.fn(async () => ({ outcome: 'done' as const }));
  const patch = change<BotLink, { enabled?: boolean }>(async () => ({ outcome: 'done' as const }));
  const remove = change<void, { action: 'deleteLink' }>(sent);
  function Host() {
    const [link, setLink] = useState<BotLink | null>(linkOf('bu_first'));
    return (
      <>
        <button type="button" onClick={() => setLink(linkOf('bu_made_again'))}>made again</button>
        <LimitsDrawer open onClose={() => undefined} link={link} patch={patch} remove={remove} />
      </>
    );
  }
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await userEvent.click(await screen.findByRole('button', { name: strings['linkSet.deleteGo'] }));
  await waitFor(() => expect(drawn.at(-1)?.isOpen).toBe(true));
  return sent;
}
const lastOpen = (from = 0) => drawn.slice(from).filter((d) => d.isOpen).at(-1);

afterEach(() => {
  cleanup();
  drawn.length = 0;
});

it('the Confirm of the render that still shows the dialog over another link sends nothing', async () => {
  const sent = await openDelete();
  const before = drawn.length;
  await act(async () => { screen.getByText('made again', { ignore: false }).click(); });
  await waitFor(() => expect(drawn.at(-1)?.isOpen).toBe(false));
  // The render between the new link and the close: the dialog was drawn open once more, over the new link.
  const between = lastOpen(before);
  expect(between, 'a render with the dialog open over the new link').toBeDefined();
  await act(async () => { between!.onConfirm(); });
  expect(sent).not.toHaveBeenCalled();
}, 30000);

it('over the same link that Confirm deletes', async () => {
  const sent = await openDelete();
  await act(async () => { lastOpen()!.onConfirm(); });
  expect(sent).toHaveBeenCalledTimes(1);
  expect(sent).toHaveBeenCalledWith({ action: 'deleteLink' });
}, 30000);
