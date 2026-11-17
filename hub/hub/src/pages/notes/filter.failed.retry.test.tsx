// Vitest: the Computer filter on one computer whose Notes could not be read (others did answer) offers Try again,
// which reads that computer again; it is not the "nothing matches" state with only Clear filters.
import { renderPage, screen, waitFor } from '@app/testing';
import { fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import page from './page';

const idOf = (name: string): string => (fixtureWorld.computers.find((c) => c.name === name) as { id: string }).id;

describe('Notes: one computer filtered, its read failed', () => {
  it('says so with Try again', async () => {
    await renderPage(page, { state: 'mixed', path: `/notes?computer=${idOf('harbor')}` });
    expect(await screen.findByText('harbor gave no full list of notes.', undefined, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument());
  });
});
