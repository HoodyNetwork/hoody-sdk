// Edit on the Programs page: a program the person added offers Edit… in its row menu and in the inspector's
// More actions; a system program never does. The drawer shows the stored name and command; one Save is one request
// to the daemon's edit route for that id, with only the changed field; "saved" is said only after the program read
// again shows it; a refusal stays in the drawer; a lost answer shows "may have gone through" with Check again and is
// never sent twice.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import { showToast } from '@kit';
import { routes } from './data';
import { many } from './fixtures';
import { editStore } from './parts/edit';
import { opsStore } from './parts/ops';
import { removeStore } from './parts/remove';
import page from './page';
import { sandboxRoutes } from './sandbox/routes';
import sbStrings from './sandbox/strings.en.json';
import strings from './strings.en.json';

const world = vi.hoisted(() => ({
  name: 'web',
  command: 'node server.js',
  sends: [] as { id: string; body: unknown; computer: string | undefined }[],
  answer: 'ok' as 'ok' | 'lost' | 'refused',
  /** The computer stores what an edit sends (off: a lost answer whose edit a read does not show). */
  apply: true,
}));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      // Program 1 (web) under the world's name and command; every other program as the page's fixtures have it.
      const overview = real.reply(routes.overview, () => real.answers.ok({ ...many, programs: (many.programs ?? []).map((p) => (String(p.id) === '1' ? { ...p, name: world.name } : p)) }));
      const program = real.reply(
        sandboxRoutes.program,
        () => real.answers.ok({ success: true, program: { id: 1, name: world.name, command: world.command, user: 'user', enabled: true, boot: true, hoody_kit: false, environment: { API_TOKEN: 'FAKE-never-shown' } } }),
        { when: (req) => /\/programs\/1(?:\?.*)?$/.test(req.path) },
      );
      const edit = real.reply(
        sandboxRoutes.edit,
        (req) => {
          const body = (req.body ?? {}) as { name?: string; command?: string };
          world.sends.push({ id: '1', body, computer: req.target?.container.id });
          if (world.answer === 'refused') return { status: 400, body: { success: false, error: 'command: refused by the test' } };
          if (world.apply) {
            if (typeof body.name === 'string') world.name = body.name;
            if (typeof body.command === 'string') world.command = body.command;
          }
          return world.answer === 'lost' ? real.answers.pending5xx() : real.answers.ok({ success: true, program: { id: 1, name: world.name, environment: { API_TOKEN: 'FAKE-never-shown' } } });
        },
        // Only Edit's sends (the sandbox save carries `sandbox`, and stays the fixtures').
        { when: (req) => /\/programs\/edit\/1(?:\?.*)?$/.test(req.path) && !('sandbox' in ((req.body ?? {}) as object)) },
      );
      return real.bootFixtureCore({ ...o, rules: [overview, program, edit, ...(o.rules ?? [])] });
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
const of = (key: 'ed.done' | 'ed.unk' | 'ed.refused' | 'ed.title', name = 'web') => strings[key].replace('{{name}}', name);

const pane = () => screen.getByRole('region', { name: 'Details' });
async function moreActions() {
  await userEvent.click(within(pane()).getByRole('button', { name: 'More actions' }));
  return screen.findByRole('menu');
}
const EDIT_WEB = /^Edit web/;
/** Opens Edit from the row menu and waits for the stored command to be read into the drawer. */
async function openEdit() {
  await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: EDIT_WEB }));
  const command = (await screen.findByDisplayValue('node server.js')) as HTMLInputElement;
  const drawer = command.closest('[role="dialog"]') as HTMLElement | null;
  if (!drawer) throw new Error('the command field is not in a dialog');
  return { drawer, command };
}
const save = (drawer: HTMLElement) => userEvent.click(within(drawer).getByRole('button', { name: strings['ed.save'] }));
/** Replaces a field's text: cleared, then pasted in one step (a key per character redraws the page each time). */
async function retype(field: HTMLElement, text: string) {
  await userEvent.clear(field);
  field.focus();
  await userEvent.paste(text);
}
// The page with its inspector and a drawer is heavy to draw: room for a loaded host.
const SLOW = 40000;

beforeEach(() => {
  resetChanges();
  opsStore.reset();
  removeStore.reset();
  editStore.reset();
  world.name = 'web';
  world.command = 'node server.js';
  world.sends = [];
  world.answer = 'ok';
  world.apply = true;
  vi.mocked(showToast).mockClear();
});

describe('programs: Edit a program you added', () => {
  it('the row menu and the inspector menu of a program you added offer Edit…; a system program never does', async () => {
    const first = await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    const menu = await rowMenu('web');
    expect(within(menu).getByRole('menuitem', { name: EDIT_WEB })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(within(await moreActions()).getByRole('menuitem', { name: EDIT_WEB })).toBeTruthy();
    first.unmount();
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A100' });
    await screen.findByRole('region', { name: 'Details' });
    await within(pane()).findAllByText('hoody-agent');
    expect(within(await moreActions()).queryByRole('menuitem', { name: /^Edit/ })).toBeNull();
  }, SLOW);

  it('Edit opens a drawer with the stored name and command; Save is off until something changed, and closing sends nothing', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer } = await openEdit();
    expect(within(drawer).getByText(of('ed.title'))).toBeTruthy();
    expect(within(drawer).getByDisplayValue('web')).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: strings['ed.save'] })).toBeDisabled();
    // The environment's values are never drawn.
    expect(document.body.textContent).not.toContain('FAKE');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByDisplayValue('node server.js')).toBeNull());
    expect(world.sends).toEqual([]);
  }, SLOW);

  it('one Save sends one edit of that id on this computer with only the changed field, and says saved once a read shows it', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer, command } = await openEdit();
    await retype(command, 'node app.js');
    await save(drawer);
    await waitFor(() => expect(toasts()).toEqual([of('ed.done')]));
    expect(world.sends).toHaveLength(1);
    expect(world.sends[0]?.body).toEqual({ command: 'node app.js' });
    expect(world.sends[0]?.computer).toEqual(expect.any(String));
    // The drawer closed, and nothing is held: Edit can be opened again.
    await waitFor(() => expect(screen.queryByDisplayValue('node app.js')).toBeNull());
    const item = within(await rowMenu('web')).getByRole('menuitem', { name: EDIT_WEB });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
  }, SLOW);

  it('a new name is sent alone, and the list shows it', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer } = await openEdit();
    const name = within(drawer).getByDisplayValue('web');
    await retype(name, 'shop');
    await save(drawer);
    await waitFor(() => expect(toasts()).toEqual([of('ed.done', 'shop')]));
    expect(world.sends.map((s) => s.body)).toEqual([{ name: 'shop' }]);
    await screen.findAllByRole('button', { name: 'Restart shop' });
  }, SLOW);

  it('a name another program has is caught in the drawer: nothing is sent', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer } = await openEdit();
    const name = within(drawer).getByDisplayValue('web');
    await retype(name, 'api');
    await save(drawer);
    await within(drawer).findByText(sbStrings['np.err.nameTaken']);
    expect(world.sends).toEqual([]);
    expect(toasts()).toEqual([]);
  }, SLOW);

  it('a refusal stays in the drawer with what was typed, says not saved, and holds nothing', async () => {
    world.answer = 'refused';
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer, command } = await openEdit();
    await retype(command, 'node app.js');
    await save(drawer);
    await within(drawer).findByText(strings['ed.refusedText'].replace('{{text}}', 'command: refused by the test'));
    expect(command.value).toBe('node app.js');
    expect(world.sends).toHaveLength(1);
    expect(toasts()).toEqual([]);
    // Nothing is held: the next Save is sent.
    world.answer = 'ok';
    await save(drawer);
    await waitFor(() => expect(toasts()).toEqual([of('ed.done')]));
    expect(world.sends).toHaveLength(2);
  }, SLOW);

  it('a lost answer a read does not settle: may have gone through with Check again, Edit off, never sent twice, never failed', async () => {
    world.answer = 'lost';
    world.apply = false;
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer, command } = await openEdit();
    await retype(command, 'node app.js');
    await save(drawer);
    await within(pane()).findByText(of('ed.unk'));
    expect(screen.queryByText(of('ed.refused'))).toBeNull();
    expect(toasts()).toEqual([]);
    // The drawer closed; while it is unknown the program's actions wait, Edit included.
    await waitFor(() => expect(screen.queryByDisplayValue('node app.js')).toBeNull());
    expect(within(await moreActions()).queryByRole('menuitem', { name: EDIT_WEB })).toBeNull();
    await userEvent.keyboard('{Escape}');
    const item = within(await rowMenu('web')).getByRole('menuitem', { name: EDIT_WEB });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Escape}');
    // Check again reads only; once the program reads as sent it says saved.
    world.command = 'node app.js';
    await userEvent.click(within(pane()).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(toasts()).toEqual([of('ed.done')]));
    expect(world.sends).toHaveLength(1);
  }, SLOW);
});
