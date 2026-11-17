// Edit and another tab (view.tsx, Edit's `blocked`): while another tab's Stop or removal of a program is out, this
// tab opens no Edit drawer for that program: two changes in flight leave neither outcome
// readable. Another program is not held. The two-tab setting is sandbox/busy.sending.test.ts's: tab A's request stays
// out, then this tab is a fresh registry on the same storage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { programLock } from '@core';
import * as C from '@core/changes';
import { snapshot } from '@core/ctx';
import { routes } from './data';
import { many } from './fixtures';
import { editStore } from './parts/edit';
import { opsStore } from './parts/ops';
import { REMOVE_LOCK, removeStore } from './parts/remove';
import page from './page';
import { sandboxRoutes } from './sandbox/routes';

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

const outs: Array<() => void> = [];
/** Tab A sends a change of program 1 on the computer shown and its request stays out; this tab then knows it only
 *  from storage (a fresh registry), as another tab would. */
async function outInA(lock: string, identity: Record<string, unknown>) {
  const at = snapshot();
  const target = at.target as NonNullable<typeof at.target>;
  const meta = { base: 'lock:' + lock, target: { project: { id: target.project.id }, container: { id: target.container.id } }, realm: at.realm, identity, by: 'q:test@' + lock };
  let open: (v: { outcome: 'pending'; idem: string }) => void = () => {};
  const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; });
  outs.push(() => open({ outcome: 'pending', idem: 'K-after' }));
  const send = vi.fn((_k: string | undefined) => p);
  void C.guarded(C.realmScoped(`${lock}|1`), 'd', send, meta as never);
  for (let i = 0; i < 20 && !send.mock.calls.length; i++) await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => { C.reloadChangesForTests(); });
  expect(C.sendingChanges(lock).some((c) => c.attributed)).toBe(true);
}

async function rowMenu(name: string) {
  await screen.findAllByRole('button', { name: `Restart ${name}` });
  const row = screen.getAllByText(name).map((el) => el.closest('tr')).find((tr): tr is HTMLTableRowElement => !!tr);
  if (!row) throw new Error('no row');
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}
const EDIT_WEB = /^Edit web/;
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const SLOW = 40000;

beforeEach(() => {
  C.resetChanges();
  opsStore.reset();
  removeStore.reset();
  editStore.reset();
});
afterEach(async () => { for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('programs: Edit while another tab changes the program', () => {
  for (const [what, lock, identity] of [
    ['Stop', programLock.stop, { id: '1', port: null, all: false }],
    ['removal', REMOVE_LOCK, { id: '1', name: 'web' }],
  ] as const) {
    it(`another tab's ${what} of the program is out: Edit opens no drawer`, async () => {
      await renderPage(page, { state: 'many', path: '/programs' });
      await screen.findAllByRole('button', { name: 'Restart web' });
      await outInA(lock, identity);
      const item = within(await rowMenu('web')).queryByRole('menuitem', { name: EDIT_WEB });
      // Offered or not while that change is out, pressing it opens nothing.
      if (item && item.getAttribute('aria-disabled') !== 'true') await userEvent.click(item);
      // The drawer shows the stored command once its read answers (the control below): time for it, then none.
      await pause(500);
      expect(screen.queryByDisplayValue('node server.js')).toBeNull();
    }, SLOW);
  }

  it('control: with nothing out, Edit opens the drawer with the stored command', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    await userEvent.click(within(await rowMenu('web')).getByRole('menuitem', { name: EDIT_WEB }));
    const command = await screen.findByDisplayValue('node server.js');
    expect(command.closest('[role="dialog"]')).not.toBeNull();
  }, SLOW);
});
