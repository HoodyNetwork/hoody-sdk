// The Programs tab's held press, told apart by who sent it (core's shared program lock): one this page
// sent stays its own after a remount (core answers READ_BACK_FIRST: Check again and the warned Dismiss); one the
// Programs page sent (HELD_BY_OTHER) is read-only here, pointing at that page, in both cells and the row menu.
import { chooseComputer, defineMutation, fixtureWorld, programLock, programOp, programRoutes, rememberedComputerId } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { subjectOf, targetOf } from './data';
import page from './page';
import strings from './strings.en.json';

const PATH = '/computers?sel=atlas.00a1&tab=programs';
const web = async () => within(await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 8000 })).findByRole('row', { name: /^web/ });
async function menu(): Promise<HTMLElement> {
  await userEvent.click(within(await web()).getByRole('button', { name: /actions/i }));
  return screen.findByRole('menu');
}
// The row is drawn again on every change: read it afresh each time. The pill shows short words; the full sentence
// is its tooltip.
const shows = (text: string) => waitFor(async () => expect(within(await web()).getByTitle(text)).toBeInTheDocument(), { timeout: 8000 });
async function stop() {
  await userEvent.click(within(await menu()).getByRole('menuitem', { name: strings['prog.stop'] }));
}

describe('computers: a held program press, by its sender', () => {
  it('this page’s own press after a remount keeps Check again and the warned Dismiss', async () => {
    const first = await renderPage(page, { state: 'pendingPrograms', path: PATH });
    await stop();
    await shows(strings['op.pending']);
    // Leave and come back: the tab's own state is gone, core's hold stays; a second Stop is answered READ_BACK_FIRST.
    await act(async () => { await first.router.navigate({ to: '/__elsewhere' as never }); });
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    await act(async () => { await first.router.navigate({ to: page.path as never, search: { sel: 'atlas.00a1', tab: 'programs' } as never }); });
    // Shown from core on mount, before any press; every other action of the program waits too.
    await shows(strings['op.pending']);
    expect(within(await web()).getByRole('button', { name: strings['outcome.check'] })).toBeInTheDocument();
    const m = await menu();
    expect(within(m).getByRole('menuitem', { name: strings['held.dismiss'] })).toBeInTheDocument();
    for (const item of within(m).queryAllByRole('menuitem', { name: new RegExp(`^(${strings['prog.start']}|${strings['prog.stop']}|${strings['prog.restart']})$`) })) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
    }
    // Dismiss after the remount frees this page's own change in core (the warned confirm first).
    await userEvent.click(within(m).getByRole('menuitem', { name: strings['held.dismiss'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(async () => expect(within(await web()).queryByTitle(strings['op.pending'])).toBeNull(), { timeout: 8000 });
  });

  it('a press the Programs page sent is read-only here: no Check again, no Dismiss', async () => {
    await renderPage(page, { state: 'pendingPrograms', path: PATH });
    await web();
    const atlas = fixtureWorld.current;
    const op = programOp({ id: '1', act: 'stop', port: null, range: false });
    const programs = defineMutation<{ id: string }>(programRoutes.stop, {
      input: () => ({ target: targetOf(subjectOf(atlas)), params: { id: '1' }, body: op.body }),
      lock: programLock.stop,
      lockKey: () => op.identity,
      page: 'programs',
    });
    let hold = '';
    await act(async () => { const res = await programs.run({ id: '1' }); expect(res.outcome).toBe('pending'); hold = res.hold ?? ''; });
    expect(hold).not.toBe('');
    // Shown as soon as core holds it, with no press here.
    await shows(strings['op.pendingElsewhere']);
    expect(within(await web()).queryByRole('button', { name: strings['outcome.check'] })).toBeNull();
    const m = await menu();
    expect(within(m).queryByRole('menuitem', { name: strings['held.dismiss'] })).toBeNull();
    // One action per program while any page holds one: Start/Restart wait too.
    for (const item of within(m).queryAllByRole('menuitem', { name: new RegExp(`^(${strings['prog.start']}|${strings['prog.stop']}|${strings['prog.restart']})$`) })) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
    }
    await userEvent.keyboard('{Escape}');
    // The Programs page frees it: the row clears here.
    await act(async () => { expect(await programs.dismiss({ id: '1' }, hold)).toBe(true); });
    await waitFor(async () => expect(within(await web()).queryByTitle(strings['op.pendingElsewhere'])).toBeNull(), { timeout: 8000 });
  });

  it('Check on Programs makes the held computer current first, so the Programs page shows it', async () => {
    await renderPage(page, { state: 'pendingPrograms', path: PATH });
    await web();
    const atlas = fixtureWorld.current;
    const op = programOp({ id: '1', act: 'stop', port: null, range: false });
    const programs = defineMutation<{ id: string }>(programRoutes.stop, {
      input: () => ({ target: targetOf(subjectOf(atlas)), params: { id: '1' }, body: op.body }),
      lock: programLock.stop,
      lockKey: () => op.identity,
      page: 'programs',
    });
    await act(async () => { expect((await programs.run({ id: '1' })).outcome).toBe('pending'); });
    await shows(strings['op.pendingElsewhere']);
    // Another computer is current (the shell's choice); the hold is on atlas, the one shown here.
    await act(async () => { chooseComputer(fixtureWorld.computers.find((c) => c.name === 'cedar')!); });
    expect(rememberedComputerId()).not.toBe(atlas.id);
    await userEvent.click(within(await web()).getByRole('button', { name: strings['op.checkOnPrograms'] }));
    expect(rememberedComputerId()).toBe(atlas.id);
  });
});
