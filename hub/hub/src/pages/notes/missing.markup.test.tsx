// Vitest: a selected note on a computer whose Notes did not answer shows that computer's state and Try again in valid
// markup: GroupNote can draw a block (a warning notice), never inside the empty state's paragraph (React warns, and a
// screen reader reads the paragraph cut short).
import { renderPage, screen, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { describe, expect, it, vi } from 'vitest';
import page from './page';

const idOf = (name: string): string => (fixtureWorld.computers.find((c) => c.name === name) as { id: string }).id;

describe('Notes: a selection on a computer whose Notes did not answer', () => {
  it('draws no block inside a paragraph', async () => {
    const errors = vi.spyOn(console, 'error');
    await renderPage(page, { state: 'mixed', path: `/notes?sel=${idOf('harbor')}~n_1` });
    const pane = await screen.findByRole('region', { name: 'Details' }, { timeout: 8000 });
    expect(await within(pane).findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect([...document.querySelectorAll('p')].filter((p) => p.querySelector('div'))).toEqual([]);
    expect(errors.mock.calls.some((c) => String(c[0]).includes('cannot be a descendant of'))).toBe(false);
  });
});
