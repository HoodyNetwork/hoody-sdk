// Edit and another change of the same program starting while the drawer is open (parts/EditProgram.tsx): a drawer
// with something typed stays open with what was typed, its Save waits (soft-disabled, with its reason and a line in
// the footer) and is available again once that change settles; a drawer with nothing typed closes, as before.
// The other change here is another tab's Stop (the two-tab setting of page.edit.xtab.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { programLock } from '@core';
import { CHANGE_STORE_KEY } from '@core/change-store';
import * as C from '@core/changes';
import { snapshot } from '@core/ctx';
import { routes } from './data';
import { many } from './fixtures';
import { editStore } from './parts/edit';
import { opsStore } from './parts/ops';
import { removeStore } from './parts/remove';
import page from './page';
import { sandboxRoutes } from './sandbox/routes';
import strings from './strings.en.json';

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      // Program 1 is "web", a program the person added (page.edit.test.tsx's world).
      const overview = real.reply(routes.overview, () => real.answers.ok({ ...many, programs: (many.programs ?? []).map((p) => (String(p.id) === '1' ? { ...p, name: 'web' } : p)) }));
      const program = real.reply(
        sandboxRoutes.program,
        () => real.answers.ok({ success: true, program: { id: 1, name: 'web', command: 'node server.js', user: 'user', enabled: true, boot: true, hoody_kit: false } }),
        { when: (req) => /\/programs\/1(?:\?.*)?$/.test(req.path) },
      );
      return real.bootFixtureCore({ ...o, rules: [overview, program, ...(o.rules ?? [])] });
    },
  };
});

type Answer = { outcome: 'pending' | 'done'; idem?: string };
const outs: Array<() => void> = [];
/** Tab A sends a Stop of program 1 on the computer shown and its request stays out; this tab then knows it only from
 *  storage (a fresh registry), as another tab would. `answer` lets tab A's request end. */
async function stopOutInA() {
  const lock = programLock.stop;
  const at = snapshot();
  const target = at.target as NonNullable<typeof at.target>;
  const meta = { base: 'lock:' + lock, target: { project: { id: target.project.id }, container: { id: target.container.id } }, realm: at.realm, identity: { id: '1', port: null, all: false }, by: 'q:test@' + lock };
  let open: (v: Answer) => void = () => {};
  const p = new Promise<Answer>((r) => { open = r; });
  outs.push(() => open({ outcome: 'pending', idem: 'K-after' }));
  const send = vi.fn((_k: string | undefined) => p);
  const done = C.guarded(C.realmScoped(`${lock}|1`), 'd', send, meta as never);
  for (let i = 0; i < 20 && !send.mock.calls.length; i++) await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => { C.reloadChangesForTests(); });
  expect(C.sendingChanges(lock).some((c) => c.attributed)).toBe(true);
  return {
    /** Tab A's Stop is answered as done; this tab hears of it as another tab does (the storage event). */
    answer: async () => {
      open({ outcome: 'done' });
      await done;
      await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); });
    },
  };
}

async function rowMenu(name: string) {
  await screen.findAllByRole('button', { name: `Restart ${name}` });
  const row = screen.getAllByText(name).map((el) => el.closest('tr')).find((tr): tr is HTMLTableRowElement => !!tr);
  if (!row) throw new Error('no row');
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}
/** Opens Edit from the row menu and waits for the stored command to be read into the drawer. */
async function openEdit() {
  await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: /^Edit web/ }));
  const command = (await screen.findByDisplayValue('node server.js')) as HTMLInputElement;
  const drawer = command.closest('[role="dialog"]') as HTMLElement | null;
  if (!drawer) throw new Error('the command field is not in a dialog');
  return { drawer, command };
}
/** Replaces a field's text: cleared, then pasted in one step. */
async function retype(field: HTMLElement, text: string) {
  await userEvent.clear(field);
  field.focus();
  await userEvent.paste(text);
}
const saveOf = (drawer: HTMLElement) => within(drawer).getByRole('button', { name: strings['ed.save'] });
const WAITS = strings['ed.waits'].replace('{{name}}', 'web');
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const SLOW = 40000;

beforeEach(() => {
  C.resetChanges();
  opsStore.reset();
  removeStore.reset();
  editStore.reset();
});
afterEach(async () => { for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('programs: an open Edit drawer when another change of the program starts', () => {
  it('something typed: the drawer stays with what was typed, and Save waits with its reason', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer, command } = await openEdit();
    await retype(command, 'node app.js');
    expect(saveOf(drawer).getAttribute('aria-disabled')).not.toBe('true');
    await stopOutInA();
    await pause(300);
    // What was typed is still there, in the same drawer.
    const kept = screen.getByDisplayValue('node app.js');
    expect(kept.closest('[role="dialog"]')).toBe(drawer);
    // Save is soft-disabled (focusable, aria-disabled) and the footer says why.
    expect(saveOf(drawer).getAttribute('aria-disabled')).toBe('true');
    expect(within(drawer).getAllByText(WAITS).length).toBeGreaterThan(0);
  }, SLOW);

  it('something typed: Save is available again once the other change settles, with the text still there', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const { drawer, command } = await openEdit();
    await retype(command, 'node app.js');
    const a = await stopOutInA();
    await waitFor(() => expect(saveOf(drawer).getAttribute('aria-disabled')).toBe('true'));
    await a.answer();
    await waitFor(() => expect(saveOf(drawer).getAttribute('aria-disabled')).not.toBe('true'));
    expect(within(drawer).queryByText(WAITS)).toBeNull();
    expect(screen.getByDisplayValue('node app.js').closest('[role="dialog"]')).toBe(drawer);
  }, SLOW);

  it('nothing typed: the drawer closes, as before', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    await openEdit();
    await stopOutInA();
    await waitFor(() => expect(screen.queryByDisplayValue('node server.js')).toBeNull());
  }, SLOW);
});
