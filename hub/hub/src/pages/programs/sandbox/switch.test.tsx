// Moving the inspector from one program to another shows one Sandbox panel, the new program's (at 390 px
// too): the panel's key must not equal a sibling's (the Addresses panel takes the row key too), or
// React keeps the old panels, stuck at "Checking…", above the new one.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import page from '../page';

const panels = () => screen.queryAllByRole('heading', { name: 'Sandbox' });

describe('sandbox panel: one per inspector, across program switches', () => {
  it('web, then api (a range program, with its Addresses panel), then web and api again: one Sandbox panel each time', async () => {
    const { router } = await renderPage(page, { path: '/programs?sel=prog%3A1' });
    await waitFor(() => expect(panels()).toHaveLength(1), { timeout: 8000 });
    for (const id of [2, 1, 2]) {
      await act(async () => {
        router.history.push(`/programs?sel=prog%3A${id}`);
      });
      // The inspector shows the program asked for (its header is an h2).
      expect(await screen.findByRole('heading', { name: id === 2 ? 'api' : 'web', level: 2 }, { timeout: 8000 })).toBeInTheDocument();
      // Settled: no panel still "Checking…" (a stale panel stays there for good), and exactly one panel.
      await waitFor(
        () => {
          expect(screen.queryByText('Checking…')).toBeNull();
          expect(panels()).toHaveLength(1);
        },
        { timeout: 8000 },
      );
    }
  }, 40_000);
});
