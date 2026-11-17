// The Storage tab's "Own disk" with usage on: the tab formats bytes, so it gets the disk reading in bytes and shows
// the same size the read sends (never a gigabyte count read as bytes).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { formatBytes, interpolate } from '@kit';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';
import { storageStrings as storage } from '../files/links';

const GB = 1024 ** 3;

describe('computers: the Storage tab disk reading', () => {
  it('names the disk in real sizes, as the stats read sends them', async () => {
    const i = computers.findIndex((x) => x.status === 'running');
    const c = computers[i]!;
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}` });
    const title = await screen.findByRole('heading', { name: strings['ov.status'] }, { timeout: 8000 });
    const section = title.closest('section') as HTMLElement;
    await userEvent.click(within(section).getByRole('switch', { name: strings['usage.show'] }));
    await within(section).findAllByRole('meter', {}, { timeout: 8000 });
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.storage'] }));
    // The page's sample answer for this computer: (4.2871 + its place) GB used of 40 GB, sent in bytes.
    const words = interpolate(storage['glance.disk.n'], { used: formatBytes((4.2871 + i) * GB), total: formatBytes(40 * GB) });
    expect(await screen.findByRole('meter', { name: words }, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);
});
