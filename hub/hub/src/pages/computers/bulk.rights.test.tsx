// Bulk Start / Stop / Restart offer only what this sign-in may do, and run only on the selected computers whose state
// allows it: no bulk Restart without the right; a running and a stopped computer selected, Stop
// asks for one computer and stops only the running one.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';
import type { Computer } from './types';
import type * as OpsModule from './parts/ops';

const runs = vi.hoisted(() => [] as [string, string][]);
vi.mock('./parts/ops', async (orig) => {
  const m = await orig<typeof OpsModule>();
  return {
    ...m,
    useLifecycleOps: (reload: () => Promise<unknown>) => {
      const o = m.useLifecycleOps(reload);
      return { ...o, run: (c: Computer, op: Parameters<typeof o.run>[1]) => { runs.push([c.name, op]); return o.run(c, op); } };
    },
  };
});

/** The List presentation's row of a computer (not a card). */
async function listRow(name: string): Promise<HTMLElement> {
  const cells = await screen.findAllByText(name, {}, { timeout: 20000 });
  return cells.map((e) => e.closest('[data-row-id]')).find((r) => r && r.tagName !== 'ARTICLE' && !r.querySelector('article')) as HTMLElement;
}

async function openList(state?: string) {
  await renderPage(page, { path: '/computers', ...(state ? { state } : {}) });
  await screen.findAllByText('ember', {}, { timeout: 20000 });
  await userEvent.click(screen.getByRole('radio', { name: /^List$/i }));
}

const select = async (name: string) => userEvent.click(within(await listRow(name)).getByRole('checkbox'));

describe('computers: bulk changes follow rights and state', () => {
  it('a sign-in without restart offers no bulk Restart (Stop, which it may do, stays)', async () => {
    await openList('noRestart');
    await select('ember');
    await select('borealis');
    expect(await screen.findByRole('button', { name: strings['bulk.stop'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['bulk.restart'] })).toBeNull();
  }, 60000);

  it('a running and a stopped computer selected: Stop asks for one computer and stops only the running one', async () => {
    runs.length = 0;
    await openList();
    await select('borealis'); // running
    await select('cedar'); // stopped
    await userEvent.click(await screen.findByRole('button', { name: strings['bulk.stop'] }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(interpolate(strings['bulk.stop.title_one'], { count: 1 }))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['menu.stop'] }));
    expect(runs.filter(([, op]) => op === 'stop')).toEqual([['borealis', 'stop']]);
  }, 60000);
});
