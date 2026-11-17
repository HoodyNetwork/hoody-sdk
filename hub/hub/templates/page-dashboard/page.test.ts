// Vitest: the __ID__ page's logic and its interaction in the fixture states it renders. Add a case for each state you add.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { runsToday } from './logic';
import page from './page';
import strings from './strings.en.json';

describe('__ID__ logic', () => {
  it('sums the runs of the last 24 hours', () => {
    expect(runsToday({ running: 1, failed: 0, perHour: [1, 2, 3] })).toBe(6);
    expect(runsToday({ running: 0, failed: 0, perHour: [] })).toBe(0);
  });
});

describe('__ID__ page', () => {
  it('shows every widget', async () => {
    await renderPage(page, {});
    expect(await screen.findByRole('list', { name: strings['recent.list'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['failed.restart'] })).toBeInTheDocument();
  });

  it('shows the compact empty state of each widget', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['recent.empty'])).toBeInTheDocument();
    expect(screen.getByText(strings['failed.empty'])).toBeInTheDocument();
  });

  it('shows a compact error per widget', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByText(strings['recent.error'])).toBeInTheDocument();
  });
});
