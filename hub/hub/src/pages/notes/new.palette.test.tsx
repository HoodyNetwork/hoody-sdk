// Vitest: the command palette's New note (/notes?new=1) opens the New note form once the notes have been read, then drops the key.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('New note from the command palette', () => {
  it('opens the New note form and removes ?new from the address', async () => {
    const { router } = await renderPage(page, { path: '/notes?new=1' });
    expect(await screen.findByRole('dialog', { name: strings['new.title'] }, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.searchStr).not.toMatch(/new=/));
  });

  it('opens nothing and drops the key when no computer can take a note', async () => {
    const { router } = await renderPage(page, { state: 'noPlace', path: '/notes?new=1' });
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    await waitFor(() => expect(router.state.location.searchStr).not.toMatch(/new=/));
    expect(screen.queryByRole('dialog', { name: strings['new.title'] })).toBeNull();
  });
});
