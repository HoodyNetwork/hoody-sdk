// The shell's "Get a computer" link (links.get, `?get=1`): opens the create drawer when the caller may create,
// and the key is dropped once read, so closing leaves no param and a reload does not reopen it.
import { describe, expect, it } from 'vitest';
import { renderPage, waitFor, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { links } from './links';

describe('?get=1 opens the create drawer', () => {
  it('opens from the link, drops the key, and closes cleanly', async () => {
    const r = await renderPage(page, { path: links.get });
    await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    await waitFor(() => expect(r.router.state.location.href).not.toContain('get='));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull());
    expect(r.router.state.location.href).not.toContain('get=');
  });
});
