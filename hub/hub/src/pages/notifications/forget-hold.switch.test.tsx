// Vitest: the "nothing was dismissed" line belongs to the notice whose Forget it answered. Opening another notice (or
// another one becoming the single pending row) shows that notice's own Forget, never the earlier line.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import type * as Data from './data';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

// Every Forget answers "nothing was dismissed" (its hold was already gone), so the line is what is under test.
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return { ...data, useMarkRead: () => ({ ...data.useMarkRead(), forget: () => Promise.resolve(false) }) };
});

const table = async () => screen.findByRole('table', {}, { timeout: 8000 });
const rowEl = async (id: string) =>
  waitFor(() => {
    const r = document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`);
    if (!r) throw new Error('no row');
    return r;
  });
const idOf = (b: HTMLElement) => b.closest('tr')!.getAttribute('data-row-id')!;
const detail = () => screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
async function open(id: string) {
  const row = await rowEl(id);
  row.focus();
  await userEvent.keyboard('{Enter}');
}
async function twoHeld() {
  await renderPage(page, { state: 'ack-lost' });
  const [a, b] = await within(await table()).findAllByRole('button', { name: strings.read });
  const ids = [idOf(a!), idOf(b!)] as const;
  await userEvent.click(a!);
  await userEvent.click(b!);
  await waitFor(() => expect(screen.getAllByText(/may have|Pending|pending/i).length).toBeGreaterThan(0));
  return ids;
}
const forgetIn = async (scope: HTMLElement | null) => {
  const buttons = screen.getAllByRole('button', { name: strings['forgetOne.button'] }).filter((b) => (scope ? scope.contains(b) : !b.closest('[role="region"]')));
  await userEvent.click(buttons[0]!);
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['forgetOne.confirm'] }));
};

describe('the "nothing was dismissed" line stays with its notice', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it("the inspector's line does not move to the next notice opened", async () => {
    const [a, b] = await twoHeld();
    await open(a);
    await forgetIn(await detail());
    expect(await screen.findByText(strings['forget.nothing'])).toBeInTheDocument();
    await open(b);
    await waitFor(() => expect(screen.queryByText(strings['forget.nothing'])).toBeNull());
    expect(within(await detail()).getByRole('button', { name: strings['forgetOne.button'] })).toBeInTheDocument();
  });

  it("the row notice's line does not move to the next pending notice", async () => {
    const [a, b] = await twoHeld();
    await open(b);
    await forgetIn(null);
    expect(await screen.findByText(strings['forget.nothing'])).toBeInTheDocument();
    await open(a);
    await waitFor(() => expect(screen.queryByText(strings['forget.nothing'])).toBeNull());
    expect(screen.getAllByRole('button', { name: strings['forgetOne.button'] }).length).toBeGreaterThan(0);
  });
});
