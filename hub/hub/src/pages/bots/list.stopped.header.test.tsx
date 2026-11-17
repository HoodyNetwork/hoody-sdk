// Vitest (axe empty-table-header): when no computer runs, the Bots page offers the stopped computers in a small
// table whose second column holds each Start button. Every column header has a visible name: the Start column says Start,
// never an empty header.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

describe('bots: the stopped computers table when none runs', () => {
  it.each(['noRunning', 'noRunningLong', 'startUnknown'])('%s: every column header is named; the Start column says Start', async (state) => {
    await renderPage(page, { state });
    const table = await screen.findByRole('table', { name: strings['list.noRunning.title'] });
    const heads = within(table).getAllByRole('columnheader');
    expect(heads.map((h) => (h.textContent ?? '').trim())).toEqual([strings['col.computer'], strings['list.startShort']]);
    // The Start buttons are still each named by their computer.
    expect(within(table).getAllByRole('button', { name: /^Start / }).length).toBeGreaterThan(0);
  });
});
