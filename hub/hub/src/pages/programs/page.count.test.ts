// A range program counts its parts against every port of its range
// (8000-8003 is 4 ports), not against the parts that happen to be listed.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { opsStore } from './parts/ops';
import page from './page';

describe('programs: range counts', () => {
  beforeEach(() => opsStore.reset());

  it('the row and the inspector count 2 of the 4 ports of 8000-8003 running', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A2' });
    // The list's row (the inspector's Ports table is named after api too: its rows are ports).
    const row = await within(await screen.findByRole('table', { name: 'Programs' })).findByRole('row', { name: /api/ });
    expect(within(row).getByText(/ · 2\/4 up$/)).toBeInTheDocument();
    expect(await screen.findByText('2 of 4 ports running')).toBeInTheDocument();
  });

  it('the system Restart confirm does not promise a start', async () => {
    const strings = (await import('./strings.en.json')).default as Record<string, string>;
    expect(strings['ask.restartFoot']).toBeDefined();
    expect(strings['ask.restartFoot']).not.toMatch(/start it again/i);
  });
});
