// C9: every Dismiss on this page frees the send the band showed when its question was opened,
// through real core. A later send of the same change (H2, same sender) that takes H1's place while the question is
// open stays held, and the legitimate Dismiss frees exactly its own hold. Run's band, the drawer/dialog bands
// (runner.ts) and the Programs row menu all go through it.
import { CoreQueryProvider, fixtureWorld, heldChanges, programLock } from '@core';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { subjectOf, useProgramAction, useRename, useRunCommand } from './data';
import page from './page';
import strings from './strings.en.json';

const wrapper = CoreQueryProvider;
const named = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const holds = (lock: string) => heldChanges(lock).map((h) => h.hold);
/** The shown hold goes (its sender proves it) and the same page sends again: H2 takes H1's place. */
async function replace(lock: string, free: (hold: string) => Promise<unknown>, send: () => Promise<unknown>) {
  const h1 = heldChanges(lock)[0]?.hold;
  expect(h1).toBeDefined();
  await act(async () => { await free(h1!); await send(); });
  const h2 = heldChanges(lock)[0]?.hold;
  expect(h2).toBeDefined();
  expect(h2).not.toBe(h1);
  return h2!;
}

describe('Dismiss frees the shown hold only', () => {
  it('Run: a question opened on H1 and confirmed after H2 took its place leaves H2 held', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=run' });
    const direct = renderHook(() => useRunCommand(), { wrapper });
    const vars = { ...subjectOf(named('atlas')), command: '', cwd: '' };
    await userEvent.type(await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 }), 'uptime');
    await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    const go = await screen.findByRole('button', { name: strings['held.dismissGo'] });
    // Confirmed: Dismiss is now at its awaited step (the digest) while H1 is replaced by H2.
    act(() => { fireEvent.click(go); });
    const h2 = await replace('computer.run', (h) => direct.result.current.complete(vars, h), () => direct.result.current.mutateAsync({ ...vars, command: 'uptime' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(holds('computer.run')).toEqual([h2]);
  });

  it('Run: the legitimate Dismiss frees its own hold', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=run' });
    await userEvent.type(await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 }), 'uptime');
    await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(holds('computer.run')).toHaveLength(0), { timeout: 8000 });
  });

  const openRename = async () => {
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'cedar') }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.rename'] }));
    return screen.findByRole('alertdialog', {}, { timeout: 8000 });
  };
  const sendRename = async () => {
    const dlg = await openRename();
    await userEvent.type(within(dlg).getByRole('textbox', { name: strings['rename.label'] }), '-2');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['rename.go'] }));
    await within(dlg).findByText(/may already have gone through/i, {}, { timeout: 8000 });
    return dlg;
  };

  it('Rename (runner.ts): the Dismiss frees its own hold', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    const dlg = await sendRename();
    expect(holds('computer.rename')).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['held.dismiss'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(holds('computer.rename')).toHaveLength(0), { timeout: 8000 });
  });

  it('Rename (runner.ts): a question opened on H1 and confirmed after H2 took its place leaves H2 held', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    const direct = renderHook(() => useRename(), { wrapper });
    const dlg = await sendRename();
    const vars = { id: named('cedar').id, name: 'cedar-2' };
    await userEvent.click(within(dlg).getByRole('button', { name: strings['held.dismiss'] }));
    const go = await screen.findByRole('button', { name: strings['held.dismissGo'] });
    const h2 = await replace('computer.rename', (h) => direct.result.current.complete(vars, h), () => direct.result.current.mutateAsync(vars));
    await userEvent.click(go);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(holds('computer.rename')).toEqual([h2]);
  });

  it('Programs: a question opened on H1 and confirmed after H2 took its place leaves H2 held', async () => {
    await renderPage(page, { state: 'pendingPrograms', path: '/computers?sel=atlas.00a1&tab=programs' });
    const direct = renderHook(() => useProgramAction(), { wrapper });
    const vars = { ...subjectOf(named('atlas')), program: '1', act: 'stop' as const };
    const row = async () => within(await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 8000 })).findByRole('row', { name: /^web/ });
    await userEvent.click(within(await row()).getByRole('button', { name: /actions/i }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: strings['prog.stop'] }));
    await waitFor(() => expect(holds(programLock.stop)).toHaveLength(1), { timeout: 8000 });
    await userEvent.click(within(await row()).getByRole('button', { name: /actions/i }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: strings['held.dismiss'] }));
    const go = await screen.findByRole('button', { name: strings['held.dismissGo'] });
    const h2 = await replace(programLock.stop, (h) => direct.result.current.complete(vars, 'stop', h), () => direct.result.current.mutateAsync(vars));
    await userEvent.click(go);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(holds(programLock.stop)).toEqual([h2]);
  });
});
