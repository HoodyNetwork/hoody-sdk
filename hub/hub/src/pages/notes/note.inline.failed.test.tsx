// Vitest: a selected note while the computers list failed to read: the detail says so with Try again (the list's own error surface is
// hidden behind the detail on a phone); it never says "Reading the notes…" for ever, nor that the note is absent.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';

const world = vi.hoisted(() => ({ refetch: vi.fn(), pending: false }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useComputers: () => ({ data: undefined, isPending: world.pending, isError: !world.pending, error: new Error('network'), refetch: world.refetch }),
  };
});

import page from './page';

describe('a selected note while the computers list could not be read', () => {
  it('says the read failed, offers Try again, and does not claim to be reading or the note absent', async () => {
    world.pending = false;
    world.refetch.mockClear();
    await renderPage(page, { path: '/notes?sel=c1~0a1b2c3d4e5f6a7b8c9d0e1fff' });
    await screen.findAllByRole('button', { name: 'Try again' }, { timeout: 8000 });
    expect(screen.queryByText('Reading the notes…')).toBeNull();
    expect(screen.queryByText('This note is not among the recent notes of its computer.')).toBeNull();
    expect(screen.queryByText("This note's computer is not in this list.")).toBeNull();
    // The table's error surface and the detail's own.
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(1);
    const again = screen.getAllByRole('button', { name: 'Try again' });
    await userEvent.click(again[again.length - 1] as HTMLElement);
    await waitFor(() => expect(world.refetch).toHaveBeenCalled());
  });

  it('while the list is still being read it says it is reading', async () => {
    world.pending = true;
    await renderPage(page, { path: '/notes?sel=c1~0a1b2c3d4e5f6a7b8c9d0e1fff' });
    expect(await screen.findByText('Reading the notes…', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('This note is not among the recent notes of its computer.')).toBeNull();
  });
});
