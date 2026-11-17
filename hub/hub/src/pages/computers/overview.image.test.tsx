// The Overview's Image fact reads the API's computer_image through core
// imageWords: the distro's mark, then "Debian 13", the term's tip quoting the stored name; not known = "—" with a tip
// saying so, never a blank; an unknown image is its own name with the neutral Linux mark.
import { definePage } from '@kit';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { computers } from './fixtures';
import { Overview } from './parts/Overview';
import strings from './strings.en.json';
import type { Computer } from './types';

const T = 15000;

async function mount(node: ReactNode) {
  const Harness = () => <>{node}</>;
  const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
  await renderPage(p, { path: '/computers' });
}
const base = computers.find((x) => x.status === 'running') ?? computers[0]!;
const overview = (c: Computer) => <Overview c={c} projects={undefined} realms={undefined} usageOn={false} onUsageOn={() => {}} canStart={false} onStart={() => {}} />;
const imageCell = async () => (await screen.findByText(strings['fact.image'], { selector: 'dt' }, { timeout: T })).nextElementSibling as HTMLElement;
const markPath = (cell: HTMLElement) => cell.querySelector('svg path')?.getAttribute('d') ?? '';

describe('the Overview Image fact', () => {
  it('debian/13 reads "Debian 13" with the Debian mark, and the tip quotes the stored name', async () => {
    await mount(overview({ ...base, computer_image: 'debian/13' }));
    const cell = await imageCell();
    expect(within(cell).getByText('Debian 13')).toBeInTheDocument();
    expect(cell.textContent).not.toContain('debian/13');
    expect(markPath(cell)).toMatch(/^M13\.88 12\.685/);
    await userEvent.click(within(cell).getByRole('button'));
    expect(await screen.findByText(strings['fact.imageTip'].replace('{{raw}}', 'debian/13'), undefined, { timeout: T })).toBeInTheDocument();
  }, 60000);

  it('the fixture computers show their image (the wire field), never "—"', async () => {
    await mount(overview(base));
    const cell = await imageCell();
    expect(cell.textContent).toContain('Debian 13');
  }, 60000);

  it('an unknown image is its own name with the Linux mark', async () => {
    await mount(overview({ ...base, computer_image: 'my-golden-image' }));
    const cell = await imageCell();
    expect(within(cell).getByText('my-golden-image')).toBeInTheDocument();
    expect(markPath(cell)).toMatch(/^M12\.504 0c/);
  }, 60000);

  it('no image reads "—" with a tip saying it is not known, never a blank', async () => {
    const { computer_image: _gone, ...bare } = base;
    await mount(overview(bare));
    const cell = await imageCell();
    expect(cell.textContent?.trim()).toBe('—');
    expect(cell.querySelector('svg path')).toBeNull();
    await userEvent.click(within(cell).getByRole('button'));
    expect(await screen.findByText(strings['fact.imageUnknown'], undefined, { timeout: T })).toBeInTheDocument();
  }, 60000);

  it('a long custom name is cut in the tip so the tip stays within the kit bound', async () => {
    const long = 'x'.repeat(400);
    await mount(overview({ ...base, computer_image: long }));
    const cell = await imageCell();
    await userEvent.click(within(cell).getByRole('button'));
    const tip = await screen.findByText(new RegExp(`^${strings['fact.imageTip'].replace('{{raw}}', '')}x+…$`), undefined, { timeout: T });
    expect(tip.textContent!.length).toBeLessThanOrEqual(200);
  }, 60000);
});
