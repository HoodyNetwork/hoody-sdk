// The Scripts list's Computer filter draws each computer's colour mark before its
// name (fixture state colours: atlas blue, borealis a value that is not a hex colour, so no mark). The option names
// and the chip's text are the computer names alone.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('Scripts: the Computer filter shows each computer’s colour', () => {
  it('option rows and the picked chip draw the mark; names and chip text stay the computer name', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'colours', path: '/scripts' });
    // The toolbar's Computer chip (a column header may share its name).
    const chip = () => document.querySelector<HTMLElement>('[data-chip="computer"] button')!;
    await waitFor(() => expect(chip()).not.toBeNull());
    await user.click(chip());
    const menu = await screen.findByRole('menu', { name: strings['filter.computer'] });
    const atlas = within(menu).getByRole('menuitemradio', { name: 'atlas' });
    expect(markIn(atlas)?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(within(menu).getByRole('menuitemradio', { name: 'borealis' }))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
    await user.click(atlas);
    expect(markIn(chip())?.dataset.computerColor).toBe('#3B82F6');
    expect(chip()).toHaveTextContent(new RegExp(`^${strings['filter.computer']}atlas$`));
  });
});
