// Vitest: how the Inbox tells unread from read. An unread row carries the table's ink row mark (the edge bar and wash
// the kit draws) and still announces "Unread" as a named image; a read row has neither and its title and message take
// the quiet text class (its sheet rules: margins.css.test.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore } from '@core';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const dataRows = (table: HTMLElement) => Array.from(table.querySelectorAll<HTMLElement>('tr[data-row-id]'));

describe('Inbox unread mark', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('every unread row has the ink row mark and one image named Unread', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    await waitFor(() => expect(dataRows(table).length).toBeGreaterThan(0));
    for (const row of dataRows(table)) {
      expect(row.getAttribute('data-mark')).toBe('ink');
      expect(within(row).getAllByRole('img', { name: strings.unreadDot })).toHaveLength(1);
      expect(row.querySelector('[data-read-text]')).toBeNull();
    }
  });

  it('a read row has no mark and no Unread image, and its title and message are quiet', async () => {
    await renderPage(page, { path: '/notifications?box=archive' });
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    await waitFor(() => expect(dataRows(table).length).toBeGreaterThan(0));
    for (const row of dataRows(table)) {
      expect(row.hasAttribute('data-mark')).toBe(false);
      expect(within(row).queryByRole('img', { name: strings.unreadDot })).toBeNull();
      expect(row.querySelectorAll('[data-read-text]').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('a read row\'s error or warning mark takes the quiet tone', async () => {
    const sevMarks = (table: HTMLElement) =>
      dataRows(table).flatMap((row) => within(row).queryAllByRole('img').filter((i) => [strings['sev.ERROR'], strings['sev.WARNING']].includes(i.getAttribute('aria-label') ?? '')));
    await renderPage(page, { path: '/notifications?box=archive' });
    const read = await screen.findByRole('table', {}, { timeout: 8000 });
    await waitFor(() => expect(sevMarks(read).length).toBeGreaterThan(0));
    for (const m of sevMarks(read)) expect(m.getAttribute('class') ?? '').toMatch(/Quiet/);
  });

  it('an unread row\'s error or warning mark keeps the full tone', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    const marks = () => dataRows(table).flatMap((row) => within(row).queryAllByRole('img').filter((i) => [strings['sev.ERROR'], strings['sev.WARNING']].includes(i.getAttribute('aria-label') ?? '')));
    await waitFor(() => expect(marks().length).toBeGreaterThan(0));
    for (const m of marks()) expect(m.getAttribute('class') ?? '').not.toMatch(/Quiet/);
  });
});
