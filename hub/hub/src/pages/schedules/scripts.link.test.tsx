// Vitest: "Open in Scripts" on a script schedule opens that script selected on the Scripts page: the
// selected computer's handle and the script's path, as the Scripts page reads them (?sel=, plus ?exec= for a folder other
// than 1). With the computer's name or the script's path unknown there is no such action, never a link to the bare list
// or to another computer's script. links.script itself and its round trip on the Scripts page: scripts/links.script.test.tsx.
import { computerHandle, fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import defaultFixtures from './fixtures';
import { model, type RawSchedules } from './logic';
import page from './page';
import strings from './strings.en.json';

const io = vi.hoisted(() => ({ noName: false, otherComputer: false }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  // The selected computer with its name not known yet: no handle the Scripts page could read.
  // otherComputer: the rows still read for the computer shown before a switch (the first render after it holds the old list).
  return {
    ...real,
    useComputer: () => { const c = real.useComputer(); return io.noName && c.data ? { ...c, data: { ...c.data, name: '' } } : c; },
    useSchedules: () => { const q = real.useSchedules(); return io.otherComputer && q.data ? { ...q, data: { ...q.data, computer: 'c0a71500000000000000ffff' } } : q; },
  };
});

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const scriptRow = model(raw).rows.find((r) => r.ref.script === 'default/1/queue-drain.ts')!;
const handle = computerHandle({ id: fixtureWorld.current.id, name: fixtureWorld.current.name });

async function openMenu() {
  const r = await renderPage(page, { path: `/schedules?sel=${encodeURIComponent(scriptRow.key)}` });
  await screen.findByText(strings['detail.history']);
  const [more] = await screen.findAllByRole('button', { name: /^More\b/ });
  await userEvent.click(more!);
  return r;
}

async function expectNoOpenInScripts() {
  await renderPage(page, { path: `/schedules?sel=${encodeURIComponent(scriptRow.key)}` });
  await screen.findByText(strings['detail.history']);
  // Fewer actions can show without a More menu: the action is neither a button nor, when there is a More menu, an entry.
  const scripts = { name: strings['action.scripts'] };
  expect(screen.queryByRole('button', scripts)).toBeNull();
  for (const more of screen.queryAllByRole('button', { name: /^More\b/ })) {
    await userEvent.click(more);
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.queryByRole('menuitem', scripts)).toBeNull();
    await userEvent.keyboard('{Escape}');
  }
}

beforeEach(() => { io.noName = false; io.otherComputer = false; });

describe('schedules: Open in Scripts', () => {
  it('goes to the script selected on its computer, never to a parameter the Scripts page ignores', async () => {
    expect(scriptRow).toBeDefined();
    const { router } = await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.scripts'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/scripts'));
    const search = router.state.location.search as Record<string, unknown>;
    expect(search).not.toHaveProperty('script');
    expect(search.sel).toBe(`${handle}~queue-drain.ts`);
    expect(search).not.toHaveProperty('exec');
  });

  it('with the computer\'s name not known, a script row offers no Open in Scripts', async () => {
    io.noName = true;
    await expectNoOpenInScripts();
  });

  it('a row read for another computer offers no Open in Scripts on the computer now shown', async () => {
    io.otherComputer = true;
    await expectNoOpenInScripts();
  });
});
