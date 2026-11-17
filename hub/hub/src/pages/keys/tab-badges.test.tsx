// Keys page: the API keys and Shared access tabs carry their count badges whichever tab is open. Before, each tab
// knew only its own count, so the other badges vanished when the person switched tabs.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const tab = (name: string) => screen.findByRole('tab', { name: new RegExp(`^${name}`) });
const badgeOf = async (name: string) => {
  const el = await tab(name);
  return el.textContent ?? '';
};

describe('keys: tab badges on every tab', () => {
  it('the API keys count shows on the SSH and Shared access tabs too', async () => {
    await renderPage(page);
    // The count as the API keys tab draws it once its list is in.
    await screen.findByRole('tab', { name: new RegExp(`${strings['tab.keys']}.*\\d`) }, { timeout: 8000 });
    const onKeys = (await badgeOf(strings['tab.keys'])).replace(/\D/g, '');
    expect(onKeys).not.toBe('');
    for (const other of [strings['tab.ssh'], strings['tab.shared']]) {
      await userEvent.click(await tab(other));
      await screen.findByRole('tab', { name: new RegExp(`${strings['tab.keys']}.*\\d`) }, { timeout: 8000 });
      expect((await badgeOf(strings['tab.keys'])).replace(/\D/g, '')).toBe(onKeys);
    }
  }, 40000);

  it('the Shared access count shows on the API keys and SSH tabs once the list is in', async () => {
    await renderPage(page);
    await userEvent.click(await tab(strings['tab.shared']));
    await screen.findByRole('tab', { name: new RegExp(`${strings['tab.shared']}.*\\d`) }, { timeout: 8000 });
    const onShared = (await badgeOf(strings['tab.shared'])).replace(/\D/g, '');
    for (const other of [strings['tab.keys'], strings['tab.ssh']]) {
      await userEvent.click(await tab(other));
      await screen.findByRole('tab', { name: new RegExp(`${strings['tab.shared']}.*\\d`) }, { timeout: 8000 });
      expect((await badgeOf(strings['tab.shared'])).replace(/\D/g, '')).toBe(onShared);
    }
  }, 40000);
});
