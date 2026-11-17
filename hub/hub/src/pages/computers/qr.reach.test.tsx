// Each program address's QR code says what the address reaches: its trust sentence ("Only share it with people you
// trust.") is a kit InfoTip whose note names what that program opens (the Terminal: the whole computer; the Desktop: its
// screen, keyboard and mouse; ...) and, for every other program, that the same key can open the rest, terminal included.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import strings from './strings.en.json';
import page from './page';

// The kit's own words (kit/qr strings), written out: a page test reaches the kit only through @kit.
const TRUST = 'Only share it with people you trust.';
const REST = "The same key can open the computer's other programs too, its terminal included.";

async function noteOf(group: HTMLElement): Promise<string> {
  await userEvent.click(within(group).getByRole('button', { name: 'QR code' }));
  const surface = await screen.findByRole('dialog', {}, { timeout: 3000 });
  await userEvent.click(within(surface).getByRole('button', { name: TRUST }));
  const note = (await screen.findByRole('dialog', { name: TRUST }, { timeout: 3000 })).textContent ?? '';
  await userEvent.click(within(surface).getByRole('button', { name: 'Close' }));
  return note;
}

describe('computers: a program address QR says what it reaches', () => {
  it('Overview tiles: Terminal the whole computer, Desktop its screen, Files its files, Browser, Agent', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    for (const [use, opens, rest] of [
      ['terminal', 'It opens a shell on this computer as its user: the whole computer', false],
      ['screen', "It opens this computer's desktop: its screen, keyboard and mouse.", true],
      ['files', "It opens this computer's files, to read, change and delete them.", true],
      ['browser', 'It opens the web browser on this computer and whatever is open in it.', true],
      ['agent', "It opens this computer's AI agent, which runs commands on the computer.", true],
    ] as const) {
      const group = await screen.findByRole('group', { name: interpolate(strings['use.actions'], { what: strings[`use.${use}.name`] }) }, { timeout: 8000 });
      const note = await noteOf(group);
      expect(note, use).toContain(opens);
      expect(note.includes(REST), use).toBe(rest);
    }
  });

  it('a custom address (alias) says only that it opens this program, nothing about the computer\'s other programs', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    // The alias row: the one table row holding the alias's address (the user's own domain, shown whole).
    const cells = await screen.findAllByText(/shop\.example\.test/, {}, { timeout: 8000 });
    const rows = [...new Set(cells.map((el) => el.closest('tr')).filter((r): r is HTMLTableRowElement => r !== null))];
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    const note = await noteOf(row);
    expect(note).toContain('Anyone with this address can open this program.');
    expect(note).not.toContain(REST);
  });
});
