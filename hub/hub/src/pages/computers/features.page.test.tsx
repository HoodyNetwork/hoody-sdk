// The Features switches on the real Computers page: the Overview's computer is a row of the page's own computers read,
// so a change that went through must show on the switch (the page's read is read again), and a second press then sends
// the opposite value, never the same one twice.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { featureLanded } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const section = async () => (await screen.findByRole('heading', { name: strings['feat.title'] }, { timeout: 8000 })).closest('section') as HTMLElement;
const theSwitch = async (id: 'ai' | 'ramdisk' | 'autostart') => within(await section()).getByRole('switch', { name: strings[`feat.${id}`] });

afterEach(() => {
  for (const k of Object.keys(featureLanded)) delete featureLanded[k];
});

describe('computers: a Features switch on the page follows its change', () => {
  for (const id of ['ai', 'autostart'] as const) {
    it(`${id}: off shows Off, and the next press turns it on again`, async () => {
      await renderPage(page, { path: '/computers?sel=atlas.00a1' });
      expect(await theSwitch(id)).toBeChecked();
      await userEvent.click(await theSwitch(id));
      await waitFor(async () => expect(await theSwitch(id)).not.toBeChecked(), { timeout: 8000 });
      expect(Object.values(featureLanded).map((v) => v[id])).toEqual([false]);
      await waitFor(async () => expect(await theSwitch(id)).not.toBeDisabled(), { timeout: 8000 });
      await userEvent.click(await theSwitch(id));
      await waitFor(async () => expect(await theSwitch(id)).toBeChecked(), { timeout: 8000 });
      expect(Object.values(featureLanded).map((v) => v[id])).toEqual([true]);
    }, 40000);
  }

  it('RAM disk: confirmed off shows Off', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    expect(await theSwitch('ramdisk')).toBeChecked();
    await userEvent.click(await theSwitch('ramdisk'));
    await userEvent.click(await screen.findByRole('button', { name: strings['feat.ask.ramdiskOff.go'] }, { timeout: 8000 }));
    await waitFor(async () => expect(await theSwitch('ramdisk')).not.toBeChecked(), { timeout: 8000 });
  }, 40000);
});
