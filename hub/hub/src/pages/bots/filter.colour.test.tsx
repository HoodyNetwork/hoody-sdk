// The Bots table's Computer filter draws each computer's colour mark before its name,
// in the option rows and on the chip once picked (fixture state colours: atlas blue, cinder a value that is not a hex
// colour, so no mark). The option names and the chip's text are the computer names alone.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('bots: the Computer filter shows each computer’s colour', () => {
  it('option rows and the picked chip draw the mark; names and chip text stay the computer name', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'colours', path: '/bots' });
    // The Computer chip (a column header may share its name). Bots has six facets, so they stay behind the Filters
    // button (kit rule, more than 3 chip facets): the chip is in its panel, opened first (and again if it closed).
    // The assertions hold for the chip inside the Filters panel.
    const chip = () => document.querySelector<HTMLElement>('[data-chip="computer"] button')!;
    const openPanel = async () => {
      if (!chip()) await user.click(document.querySelector<HTMLElement>('[data-filters-trigger]')!);
    };
    await waitFor(() => expect(document.querySelector('[data-filters-trigger]')).not.toBeNull());
    await openPanel();
    await waitFor(() => expect(chip()).not.toBeNull());
    await user.click(chip());
    const menu = await screen.findByRole('menu', { name: strings['filter.computer'] });
    const atlas = within(menu).getByRole('menuitemradio', { name: 'atlas' });
    expect(markIn(atlas)?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(within(menu).getByRole('menuitemradio', { name: 'cinder' }))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
    await user.click(atlas);
    await openPanel();
    await waitFor(() => expect(chip()).not.toBeNull());
    expect(markIn(chip())?.dataset.computerColor).toBe('#3B82F6');
    expect(chip()).toHaveTextContent(new RegExp(`^${strings['filter.computer']}atlas$`));
  });
});
