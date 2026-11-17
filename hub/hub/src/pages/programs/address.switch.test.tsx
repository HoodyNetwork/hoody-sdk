// The address follows the computer shown: after a computer switch, and after a realm switch with
// the computer the shell then picks, the inspector shows and copies the new computer's address, never the old one's
// (each port's whole address is in its Ports row's expanded part).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import { switchTo } from '@core/realm';
import { opsStore } from './parts/ops';
import page from './page';

const named = (n: string) => {
  const c = fixtureWorld.computers.find((x) => x.name === n);
  if (!c) throw new Error(`no ${n}`);
  return c;
};
const atlas = named('atlas');
const borealis = named('borealis');
// Written out here (not through core) so a wrong builder fails.
const address = (c: { project_id: string; id: string; server_name: string }, port: number) => `https://${c.project_id}-${c.id}-http-${port}.${c.server_name}.fixture.invalid`;

let written: string[] = [];
beforeEach(() => {
  opsStore.reset();
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => vi.restoreAllMocks());

const pageText = () => document.body.textContent ?? '';
// A program address shows only its scheme and bullets, so the page cannot be read for the computer's ids: Copy takes the
// whole address, and it must name the computer now shown (and neither computer's ids ever show on screen).
const settleOn = async (now: { project_id: string; id: string; server_name: string }, old: { id: string }, port: number) => {
  await waitFor(async () => expect(await copyPort(port)).toBe(address(now, port)), { timeout: 8000 });
  expect(pageText()).not.toContain(now.id);
  expect(pageText()).not.toContain(old.id);
};

/** Copy of a port's whole address: in its Ports row's expanded part, opened here when it is not open yet. */
async function copyPort(port: number): Promise<string> {
  written = [];
  let copy = screen.queryByRole('button', { name: `Copy port ${port}` });
  if (!copy) {
    const row = await waitFor(() => {
      const r = screen.getAllByRole('row').find((x) => x.querySelector('td')?.textContent?.trim() === String(port));
      if (!r) throw new Error(`no Ports row for ${port}`);
      return r;
    }, { timeout: 8000 });
    await userEvent.click(within(row).getByRole('button', { name: 'Show details' }));
    copy = await screen.findByRole('button', { name: `Copy port ${port}` }, { timeout: 8000 });
  }
  await userEvent.click(copy);
  await waitFor(() => expect(written).toHaveLength(1));
  return written[0] as string;
}

describe('programs: the address follows the computer shown', () => {
  it('a computer switch: the inspector shows and copies the new computer’s address', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    expect(await copyPort(3000)).toBe(address(atlas, 3000));
    await act(async () => {
      chooseComputer(borealis);
    });
    await settleOn(borealis, atlas, 3000);
    expect(await copyPort(3000)).toBe(address(borealis, 3000));
    await userEvent.click(screen.getByRole('button', { name: 'Open port 3000 in a new tab' }));
    expect(open.mock.calls).toEqual([[address(borealis, 3000), '_blank', 'noopener']]);
  });

  it('a range program after a computer switch: every port’s address names the new computer', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A2' });
    expect(await copyPort(8003)).toBe(address(atlas, 8003));
    await act(async () => {
      chooseComputer(borealis);
    });
    await settleOn(borealis, atlas, 8000);
    for (const port of [8000, 8001, 8002, 8003]) expect(await copyPort(port)).toBe(address(borealis, port));
  });

  it('a realm switch, then the computer the shell picks there: the new computer’s address, never the old one’s', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    expect(await copyPort(3000)).toBe(address(atlas, 3000));
    const acme = fixtureWorld.realm('Acme client').id;
    await act(async () => {
      expect(await switchTo(acme)).toBe(true);
    });
    await act(async () => {
      chooseComputer(borealis);
    });
    await settleOn(borealis, atlas, 3000);
    expect(await copyPort(3000)).toBe(address(borealis, 3000));
  });
});
