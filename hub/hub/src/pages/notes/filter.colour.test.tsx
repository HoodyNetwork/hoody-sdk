// The Notes table's Computer filter draws each computer's colour mark before its name
// (fixture state colours: each computer takes its core worldColours value; cedar's is not a hex colour, so no mark).
// The computer list keeps the API colour; the option names and the chip's text are the computer names alone.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { toComputers } from './data';
import page from './page';
import strings from './strings.en.json';

const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('notes: the computer list keeps the API colour', () => {
  it('a computer keeps its colour as the API sends it; none when the API sends none or not a string', () => {
    const one = (extra: Record<string, unknown>) => toComputers({ data: { computers: [{ id: 'c1', name: 'atlas', status: 'running', ...extra }] } })[0]!;
    expect(one({ color: '#3b82f6' }).color).toBe('#3b82f6');
    expect(one({ color: 'red;x:url()' }).color).toBe('red;x:url()');
    expect(one({})).not.toHaveProperty('color');
    expect(one({ color: 7 })).not.toHaveProperty('color');
  });
});

describe('notes: the Computer filter shows each computer’s colour', () => {
  it('option rows and the picked chip draw the mark; names and chip text stay the computer name', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'colours', path: '/notes' });
    // The toolbar's Computer chip (a column header may share its name).
    const chip = () => document.querySelector<HTMLElement>('[data-chip="computer"] button')!;
    await waitFor(() => expect(chip()).not.toBeNull());
    await user.click(chip());
    const menu = await screen.findByRole('menu', { name: strings['filter.computer'] });
    const atlas = within(menu).getByRole('menuitemradio', { name: 'atlas' });
    expect(markIn(atlas)?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(within(menu).getByRole('menuitemradio', { name: 'fjord' }))?.dataset.computerColor).toBe('#10B981');
    expect(markIn(within(menu).getByRole('menuitemradio', { name: 'cedar' }))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
    await user.click(atlas);
    expect(markIn(chip())?.dataset.computerColor).toBe('#3B82F6');
    expect(chip()).toHaveTextContent(new RegExp(`^${strings['filter.computer']}atlas$`));
  });
});
