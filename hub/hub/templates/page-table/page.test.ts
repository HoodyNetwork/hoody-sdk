// Vitest: the __ID__ page's logic and its interaction in the fixture states it renders. Add a case for each state you add.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type { Item } from './data';
import { attentionRank, summarize } from './logic';
import page from './page';
import strings from './strings.en.json';

describe('__ID__ logic', () => {
  it('ranks attention first', () => {
    expect(attentionRank('failed')).toBeLessThan(attentionRank('paused'));
    expect(attentionRank('paused')).toBeLessThan(attentionRank('active'));
  });

  it('sums every row for the stat strip', () => {
    const row = (status: Item['status'], sizeBytes: number): Item => ({ id: 'x', name: 'atlas', status, owner: 'Ada', updatedAt: '2026-10-22T12:00:00Z', sizeBytes });
    expect(summarize([row('failed', 10), row('active', 5)])).toEqual({ count: 2, failed: 1, sizeBytes: 15 });
    expect(summarize([])).toEqual({ count: 0, failed: 0, sizeBytes: 0 });
  });
});

describe('__ID__ page', () => {
  it('lists items and opens the edit drawer with the keyboard', async () => {
    const { router } = await renderPage(page, { path: '/__ID__?sort=name' });
    const table = await screen.findByRole('table', { name: strings.title });
    await within(table).findByRole('row', { name: /atlas-1\b/ });
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(5);
    const first = rows[1];
    if (!first) throw new Error('no data row');
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.search).toMatchObject({ edit: 'item-01' });
  });

  it('shows the empty state', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('opens the drawer of a deep-linked item', async () => {
    await renderPage(page, { path: '/__ID__?edit=item-02' });
    expect(await screen.findByRole('dialog', { name: strings['edit.title'] })).toBeInTheDocument();
  });
});
