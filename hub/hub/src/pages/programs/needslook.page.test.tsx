// The needs-a-look note on the page: a program the computer did not report (fixture 'many', mystery) offers Refresh,
// and Refresh is the list's own: the overview is read again. A program that ended with an error says its code. Either
// way the page shows one Logs of the program (the inspector header's ⋯ menu's), never a second in the note.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { routes } from './data';
import { many } from './fixtures';
import { opsStore } from './parts/ops';
import page from './page';

// Every overview read the fixture API receives, answered with the 'many' overview.
const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      // data.ts and fixtures.ts import '@core' themselves, so routes and many are read here, at boot.
      const record = real.reply(routes.overview, () => {
        reads.n++;
        return real.answers.ok(many);
      });
      return real.bootFixtureCore({ ...o, rules: [record, ...(o.rules ?? [])] });
    },
  };
});

/** The Logs items of the inspector header's ⋯ menu (More actions), opened here. */
async function headerLogs(name: string): Promise<HTMLElement[]> {
  const pane = screen.getByRole('region', { name: 'Details' });
  await userEvent.click(within(pane).getByRole('button', { name: 'More actions' }));
  return within(await screen.findByRole('menu')).getAllByRole('menuitem', { name: `Logs of ${name}` });
}

describe('the needs-a-look note on the page', () => {
  beforeEach(() => {
    opsStore.reset();
    reads.n = 0;
  });

  it("can't tell: Refresh reads the list again", async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A9' });
    const text = await screen.findByText("We can't tell what mystery is doing right now.");
    const band = text.closest('[role="alert"]') as HTMLElement;
    await waitFor(() => expect(reads.n).toBeGreaterThan(0));
    const before = reads.n;
    await userEvent.click(within(band).getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(reads.n).toBe(before + 1));
    expect(within(band).getAllByRole('button')).toHaveLength(1);
    // The inspector has one Logs of the program, the header menu's; the note's own stack adds no Logs button.
    expect(within(band.parentElement as HTMLElement).queryAllByRole('button', { name: 'Logs of mystery' })).toEqual([]);
    expect(await headerLogs('mystery')).toHaveLength(1);
  });

  it('ended with an error: says its code and points at the log', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A4' });
    const text = await screen.findByText('nightly-sync ended with code 2. Its log usually says why.');
    expect(within(text.closest('[role="alert"]') as HTMLElement).queryByRole('button')).toBeNull();
    expect(within((text.closest('[role="alert"]') as HTMLElement).parentElement as HTMLElement).queryAllByRole('button', { name: 'Logs of nightly-sync' })).toEqual([]);
    expect(await headerLogs('nightly-sync')).toHaveLength(1);
  });
});
