// Vitest: the side inspector of a tunnel that is no longer listed draws a bare state with no header, so no close
// button: it offers "Back to the list" itself, which closes the inspector.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('Tunnels: a selection that is no longer listed', () => {
  it('offers a way back that closes the inspector', async () => {
    expect(strings['detail.back']).toBe('Back to the list');
    await renderPage(page, { path: '/tunnels?sel=gone-row' });
    const pane = await screen.findByRole('region', { name: 'Details' });
    await within(pane).findByText(strings['detail.notFound']);
    await userEvent.click(within(pane).getByRole('button', { name: 'Back to the list' }));
    await waitFor(() => expect(screen.queryByText(strings['detail.notFound'])).toBeNull());
  });
});
