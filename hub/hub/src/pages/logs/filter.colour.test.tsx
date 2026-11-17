// The Logs toolbar's Computer filter draws the shown computer's colour mark before its
// name (the chip shows once a computer is picked in the URL). The live read keeps the shell's colour for the chosen computer (none when the shell has none); fixture state
// colours gives atlas its blue. The option's name is the computer name alone.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import type { ShellData } from '@kit';
import { liveComputer } from './data';
import page from './page';
import strings from './strings.en.json';

const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');
const target = { project: { id: 'p1' }, container: { id: 'c1' } };
const shell = (color?: string) => ({ realms: [], realmId: 'r1', computers: [{ id: 'c1', name: 'atlas', ...(color === undefined ? {} : { color }) }] }) as ShellData;

describe('Logs: the shown computer keeps the shell’s colour', () => {
  it('the chosen computer carries the shell’s colour; none when the shell has none', () => {
    expect(liveComputer(target, shell('#3b82f6')).data).toMatchObject({ id: 'c1', name: 'atlas', color: '#3b82f6' });
    expect(liveComputer(target, shell()).data).not.toHaveProperty('color');
  });
});

describe('Logs: the Computer filter shows the computer’s colour', () => {
  it('with the computer picked (?computer), the chip and its option row draw the mark; text and name stay the name', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'colours', path: '/logs?computer=atlas' });
    const chip = () => document.querySelector<HTMLElement>('[data-chip="computer"] button')!;
    await waitFor(() => expect(chip()).not.toBeNull());
    expect(markIn(chip())?.dataset.computerColor).toBe('#3B82F6');
    expect(chip()).toHaveTextContent(new RegExp(`^${strings['f.computer']}atlas$`));
    await user.click(chip());
    // React Aria names a trigger's menu by the trigger (aria-labelledby wins over aria-label), so an active chip's
    // menu is "Computer atlas"; the mark adds nothing to it (its place is aria-hidden).
    const menu = await screen.findByRole('menu', { name: `${strings['f.computer']} atlas` });
    expect(markIn(within(menu).getByRole('menuitemradio', { name: 'atlas' }))?.dataset.computerColor).toBe('#3B82F6');
  });
});
