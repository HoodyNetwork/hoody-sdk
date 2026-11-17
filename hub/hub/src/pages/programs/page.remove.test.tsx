// Remove on the Programs page: a program the person added offers Remove… in its row menu and in the
// inspector's More actions; a system or temporary program never does. The confirm names the program and the computer;
// one confirm is one request to the daemon's remove route for that id; "removed" is said only after the list read
// again no longer has it; a lost answer shows "may have gone through" with Check again and is never sent twice.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import { showToast } from '@kit';
import { routes } from './data';
import { many } from './fixtures';
import { opsStore } from './parts/ops';
import { removeRoute, removeStore } from './parts/remove';
import page from './page';
import strings from './strings.en.json';

const world = vi.hoisted(() => ({ removed: [] as string[], sends: [] as { id: string; computer: string | undefined }[], answer: 'ok' as 'ok' | 'lost' | 'refused', drop: true }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      const overview = real.reply(routes.overview, () => real.answers.ok({ ...many, programs: (many.programs ?? []).filter((p) => !world.removed.includes(String(p.id))) }));
      const remove = real.reply(removeRoute, (req) => {
        const id = /\/programs\/remove\/([^/?]+)/.exec(req.path)?.[1] ?? '';
        world.sends.push({ id, computer: req.target?.container.id });
        if (world.answer === 'refused') return { status: 400, body: { success: false, error: `Failed to remove program with ID ${id}` } };
        if (world.drop) world.removed.push(id);
        return world.answer === 'lost' ? real.answers.pending5xx() : real.answers.ok({ success: true, id: Number(id) });
      });
      return real.bootFixtureCore({ ...o, rules: [overview, remove, ...(o.rules ?? [])] });
    },
  };
});

async function rowMenu(name: string) {
  await screen.findAllByRole('button', { name: `Restart ${name}` });
  const row = screen.getAllByText(name).map((el) => el.closest('tr')).find((tr): tr is HTMLTableRowElement => !!tr);
  if (!row) throw new Error('no row');
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}
// The toasts the page shows (the test render mounts no Toaster): their titles, in order.
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));
const toasts = () => vi.mocked(showToast).mock.calls.map((c) => c[0].title);
const said = (key: 'rm.done') => strings[key].replace('{{name}}', 'web');

const pane = () => screen.getByRole('region', { name: 'Details' });
async function moreActions() {
  await userEvent.click(within(pane()).getByRole('button', { name: 'More actions' }));
  return screen.findByRole('menu');
}
const REMOVE_WEB = /^Remove web/;

beforeEach(() => {
  resetChanges();
  opsStore.reset();
  removeStore.reset();
  world.removed = [];
  world.sends = [];
  world.answer = 'ok';
  world.drop = true;
  vi.mocked(showToast).mockClear();
});

describe('programs: Remove a program you added', () => {
  it('the row menu and the inspector menu of a program you added offer Remove…', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    const menu = await rowMenu('web');
    expect(within(menu).getByRole('menuitem', { name: REMOVE_WEB })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(within(await moreActions()).getByRole('menuitem', { name: REMOVE_WEB })).toBeTruthy();
  });

  it('a system program and a temporary program never offer it', async () => {
    const first = await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A100' });
    await screen.findByRole('region', { name: 'Details' });
    await within(pane()).findAllByText('hoody-agent');
    expect(within(await moreActions()).queryByRole('menuitem', { name: /^Remove/ })).toBeNull();
    first.unmount();
    await renderPage(page, { state: 'many', path: '/programs?sel=temp%3Aquick_1760000000_1' });
    await screen.findByRole('region', { name: 'Details' });
    await within(pane()).findAllByText('http-server');
    const more = within(pane()).queryByRole('button', { name: 'More actions' });
    if (more) {
      await userEvent.click(more);
      expect(within(await screen.findByRole('menu')).queryByRole('menuitem', { name: /^Remove/ })).toBeNull();
    }
    expect(world.sends).toEqual([]);
  });

  it('Remove asks first, naming the program and the computer; Cancel sends nothing', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: REMOVE_WEB }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['rm.title'].replace('{{name}}', 'web'))).toBeTruthy();
    expect(dialog.textContent).toContain('atlas');
    // web runs: the confirm says the removal stops it.
    expect(dialog.textContent).toContain(strings['rm.running']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(world.sends).toEqual([]);
  });

  it('one confirm sends one removal of that id on this computer, and says removed once the list dropped it', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: REMOVE_WEB }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['rm.go'] }));
    await waitFor(() => expect(toasts()).toEqual([said('rm.done')]));
    expect(world.sends).toHaveLength(1);
    expect(world.sends[0]?.id).toBe('1');
    expect(world.sends[0]?.computer).toEqual(expect.any(String));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restart web' })).toBeNull());
  });

  it('a lost answer the list does not settle: may have gone through with Check again, Remove off, never sent twice, never failed', async () => {
    world.answer = 'lost';
    world.drop = false;
    await renderPage(page, { state: 'many', path: '/programs' });
    await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: REMOVE_WEB }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['rm.go'] }));
    await within(pane()).findByText(strings['rm.unk'].replace('{{name}}', 'web'));
    expect(screen.queryByText(strings['rm.refused'].replace('{{name}}', 'web'))).toBeNull();
    expect(toasts()).toEqual([]);
    // While it is unknown the program's actions wait, Remove included: the panel's menu leaves it out, the row's shows it off.
    expect(within(await moreActions()).queryByRole('menuitem', { name: REMOVE_WEB })).toBeNull();
    await userEvent.keyboard('{Escape}');
    const item = within(await rowMenu('web')).getByRole('menuitem', { name: REMOVE_WEB });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Escape}');
    // Check again reads only; once the list has dropped the program it says removed.
    world.removed.push('1');
    await userEvent.click(within(pane()).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(toasts()).toEqual([said('rm.done')]));
    expect(world.sends).toHaveLength(1);
  });

  it('a refusal says not removed, keeps the program, and holds nothing', async () => {
    world.answer = 'refused';
    await renderPage(page, { state: 'many', path: '/programs' });
    await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: REMOVE_WEB }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['rm.go'] }));
    await within(pane()).findByText(strings['rm.refused'].replace('{{name}}', 'web'));
    expect(screen.getAllByRole('button', { name: 'Restart web' }).length).toBeGreaterThan(0);
    expect(world.sends).toHaveLength(1);
    // Nothing is held: Remove can be asked again.
    const item = within(await moreActions()).getByRole('menuitem', { name: REMOVE_WEB });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
  });
});
