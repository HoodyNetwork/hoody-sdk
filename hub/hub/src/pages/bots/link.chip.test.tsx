// Vitest: the Details panel's link status ("Active") is a button that opens the Bot's Link and keys tab, by pointer and from
// the keyboard (Enter and Space); a Bot with no link keeps "Give it a link". The panel opens from the header.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = () => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&details=1` });

describe('the Details panel link status', () => {
  it('is a button named for what it opens, and pressing it goes to the Link and keys tab', async () => {
    const { router } = await open();
    const chip = await screen.findByRole('button', { name: strings['rail.linkOpen'].replace('{{status}}', strings['link.status.active']) });
    expect(chip).toHaveTextContent(strings['link.status.active']);
    // React Aria opens a tooltip on hover once the pointer is the input in use (as after any mouse move in a browser).
    await userEvent.click(document.body);
    await userEvent.hover(chip);
    expect(await screen.findByRole('tooltip', {}, { timeout: 3000 })).toHaveTextContent(strings['rail.linkOpenTip']);
    await userEvent.click(chip);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).tab).toBe('link'));
  });

  const chipName = () => strings['rail.linkOpen'].replace('{{status}}', strings['link.status.active']);

  it.each(['{Enter}', ' '])('the key %j on the status opens the Link and keys tab', async (key) => {
    const { router } = await open();
    const side = await screen.findByRole('complementary', { name: strings['rail.details'] });
    const chip = await within(side).findByRole('button', { name: chipName() });
    chip.focus();
    expect(chip).toHaveFocus();
    await userEvent.keyboard(key);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).tab).toBe('link'));
  });
});
