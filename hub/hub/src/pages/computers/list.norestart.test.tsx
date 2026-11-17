// A failed computer whose sign-in may not restart it: its row offers Restart switched off, with the reason, never a bare
// cell. With the right, the same row offers Restart as a working button.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// The row (a table or list row, or a card) that names the computer.
const rowOf = async (name: string) => (await screen.findAllByText(name, {}, { timeout: 20000 })).map((e) => e.closest('[data-row-id], article')).find(Boolean) as HTMLElement;

describe('computers list: a failed computer without restart rights', () => {
  it('shows Restart off, saying why, and pressing it sends nothing', async () => {
    await renderPage(page, { path: '/computers', state: 'noRestart' });
    const row = await rowOf('ember');
    const restart = within(row).getByRole('button', { name: strings['menu.restart'] });
    expect(restart).toHaveAttribute('aria-disabled', 'true');
    expect(restart).toHaveAccessibleDescription(strings['row.restart.noRight']);
    await userEvent.click(restart);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }, 40000);

  it('the List presentation says it in words in its Actions cell', async () => {
    await renderPage(page, { path: '/computers', state: 'noRestart' });
    await rowOf('ember');
    await userEvent.click(screen.getByRole('radio', { name: /^List$/i }));
    const row = (await screen.findAllByText('ember', {}, { timeout: 20000 })).map((e) => e.closest('[data-row-id]')).find((r) => r && r.tagName !== 'ARTICLE' && !r.querySelector('article')) as HTMLElement;
    expect(within(row).getByText(strings['row.restart.noRightShort'])).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: strings['menu.restart'] })).toBeNull();
  }, 40000);

  it('with the right, the failed row offers a working Restart', async () => {
    await renderPage(page, { path: '/computers', state: 'limited' });
    const row = await rowOf('ember');
    const restart = within(row).getByRole('button', { name: strings['menu.restart'] });
    expect(restart).not.toHaveAttribute('aria-disabled', 'true');
  }, 40000);
});
