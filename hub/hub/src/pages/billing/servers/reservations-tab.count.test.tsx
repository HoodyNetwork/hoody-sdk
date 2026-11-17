// Vitest: the Listings | Reservations bar carries no number. The pending count is the list's own "Pending" filter chip,
// right below beside the total ("5 reservations"); a bare "Reservations 2" on the bar read as a second, smaller total.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from '../page';
import strings from './strings.en.json';

describe('reservations tab', () => {
  it('names the tab with no count, while reservations are pending', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations' });
    expect(await screen.findByText(strings['res.count_other'].replace('{{count}}', '5'))).toBeInTheDocument();
    const tab = screen.getByRole('radio', { name: strings['tab.reservations'] });
    expect(tab).not.toHaveAttribute('aria-describedby');
    expect(tab.textContent).toBe(strings['tab.reservations']);
  });
});
