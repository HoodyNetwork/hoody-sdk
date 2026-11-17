// Vitest: the Bare metal listings put their chip filters in the table's second tier, one flush bar under the search
// row, while the kind switch stays in the search row.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from '../page';
import strings from './strings.en.json';

const WAIT = { timeout: 8000 };

describe('the listings filter bar', () => {
  it('the chip filters sit in one bar under the search row', async () => {
    await renderPage(page, { path: '/billing?view=servers' });
    const table = await screen.findByRole('table', { name: strings['tab.listings'] }, WAIT);
    await within(table).findByRole('row', { name: /Frankfurt L/ }, WAIT);
    const bar = document.querySelector<HTMLElement>('[data-toolbar-tier="2"]');
    expect(bar, 'a second tier holds the chip filters').not.toBeNull();
    expect(within(bar!).getAllByRole('button').length, 'the chips are in it').toBeGreaterThan(1);
    expect(within(bar!).queryByRole('radiogroup'), 'the kind switch stays in the search row').toBeNull();
  }, 20_000);
});
