// Vitest: the __ID__ page's logic and its interaction in the fixture states it renders. Add a case for each state you add.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { attentionRank } from './logic';
import page from './page';
import strings from './strings.en.json';

describe('__ID__ logic', () => {
  it('ranks attention first', () => {
    expect(['active', 'failed', 'paused'].map((s) => attentionRank(s as 'active')).sort()).toEqual([0, 1, 2]);
    expect(attentionRank('failed')).toBeLessThan(attentionRank('active'));
  });
});

describe('__ID__ page', () => {
  it('lists items and opens one with the keyboard', async () => {
    const { router } = await renderPage(page, { path: '/__ID__?sort=name' });
    const table = await screen.findByRole('table', { name: strings.title });
    await within(table).findByRole('row', { name: /atlas-1\b/ });
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(5);
    const first = rows[1];
    if (!first) throw new Error('no data row');
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.search).toMatchObject({ sel: 'item-01' });
  });

  it('shows the empty state', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows the detail of a deep-linked item', async () => {
    await renderPage(page, { path: '/__ID__?sel=item-02' });
    expect(await screen.findByText(strings['detail.facts'])).toBeInTheDocument();
  });
});
