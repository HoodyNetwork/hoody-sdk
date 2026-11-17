// C9: a held change another page sent links to that page only while this load serves it. A
// hidden sender page gets no link at all (there is no other Hub to send it to):
// the Held band offers Check again instead (nothing on a Dismiss-only band), and the Programs tab drops its
// "Check on Programs" actions. Served, the link stays.
import { computerLifecycle, defineMutation, fixtureWorld, programLock, programOp, programRoutes } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as kitModule from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { subjectOf, targetOf } from './data';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

// The pages this load hides (the real shell answers from its served list; a page test has none, so every page
// counts as served). A hidden page gets no link, as the shell gives it.
const hidden = new Set<string>();
vi.mock('@kit', async (importOriginal) => {
  const orig = await importOriginal<typeof kitModule>();
  return {
    ...orig,
    usePageVisible: (id: string) => !hidden.has(id),
    usePageLink: (id: string) => (hidden.has(id) ? null : orig.usePageLink(id)),
  };
});
afterEach(() => hidden.clear());

const atlas = fixtureWorld.current;
const open = (name: string) => strings['held.open'].replace('{{page}}', name);
const linkTo = (name: string) => screen.queryByRole('link', { name: open(name) }) ?? screen.queryByRole('button', { name: open(name) });

async function scriptsSentSsh() {
  await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=connect' });
  const scripts = defineMutation<{ id: string }>(routes.setSshKey, {
    input: (v) => ({ params: { id: v.id }, body: { ssh_public_key: 'ssh-ed25519 AAAAscripts page' } }),
    lock: 'computer.ssh_key',
    lockKey: (v) => ({ computer: v.id }),
    page: 'scripts',
  });
  await act(async () => { expect((await scripts.run({ id: atlas.id })).outcome).toBe('pending'); });
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^(${strings['ssh.key.replace']}|${strings['ssh.key.set']})$`) }, { timeout: 8000 }));
  return screen.findByRole('dialog');
}

describe('a held change from a hidden sender page', () => {
  it('Held band: a hidden Scripts sender gets no link, only Check again', async () => {
    hidden.add('scripts');
    const dlg = await scriptsSentSsh();
    expect(await within(dlg).findByText(strings['held.elsewhere'].replace('{{page}}', strings['held.from.scripts']))).toBeInTheDocument();
    expect(linkTo(strings['held.from.scripts'])).toBeNull();
    expect(within(dlg).getByRole('button', { name: strings['held.check'] })).toBeInTheDocument();
    expect(within(dlg).queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
  });

  it('Held band: a served Scripts sender keeps its link', async () => {
    const dlg = await scriptsSentSsh();
    expect(await within(dlg).findByRole('link', { name: open(strings['held.from.scripts']) })).toBeInTheDocument();
  });

  it('Dismiss-only band (lifecycle restart): a hidden Board sender shows no link and nothing else', async () => {
    hidden.add('board');
    await renderPage({ ...page, load: () => import('./widget') }, { state: 'pendingOps' });
    await act(async () => { expect((await computerLifecycle.forPage('board').run({ id: atlas.id, op: 'restart' })).outcome).toBe('pending'); });
    expect(await screen.findByText(strings['held.elsewhere'].replace('{{page}}', strings['held.from.board']), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(linkTo(strings['held.from.board'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['held.check'] })).toBeNull();
  });

  it('Dismiss-only band (lifecycle restart): a served Board sender keeps its link', async () => {
    await renderPage({ ...page, load: () => import('./widget') }, { state: 'pendingOps' });
    await act(async () => { expect((await computerLifecycle.forPage('board').run({ id: atlas.id, op: 'restart' })).outcome).toBe('pending'); });
    expect(await screen.findByRole('link', { name: open(strings['held.from.board']) }, { timeout: 8000 })).toBeInTheDocument();
  });

  const PATH = '/computers?sel=atlas.00a1&tab=programs';
  const web = async () => within(await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 8000 })).findByRole('row', { name: /^web/ });
  async function programsSentStop() {
    await renderPage(page, { state: 'pendingPrograms', path: PATH });
    await web();
    const op = programOp({ id: '1', act: 'stop', port: null, range: false });
    const programs = defineMutation<{ id: string }>(programRoutes.stop, {
      input: () => ({ target: targetOf(subjectOf(atlas)), params: { id: '1' }, body: op.body }),
      lock: programLock.stop,
      lockKey: () => op.identity,
      page: 'programs',
    });
    await act(async () => { expect((await programs.run({ id: '1' })).outcome).toBe('pending'); });
    await waitFor(async () => expect(within(await web()).getByTitle(strings['op.pendingElsewhere'])).toBeInTheDocument(), { timeout: 8000 });
  }
  const menu = async () => {
    await userEvent.click(within(await web()).getByRole('button', { name: /actions/i }));
    return screen.findByRole('menu');
  };

  it('Programs tab: a hidden Programs page gets no Check on Programs, inline or in the row menu', async () => {
    hidden.add('programs');
    await programsSentStop();
    expect(within(await web()).queryByRole('button', { name: strings['op.checkOnPrograms'] })).toBeNull();
    expect(within(await menu()).queryByRole('menuitem', { name: strings['op.checkOnPrograms'] })).toBeNull();
  });

  it("Programs tab: a served Programs page keeps Check on Programs as the row's inline action, shown once", async () => {
    await programsSentStop();
    expect(within(await web()).getByRole('button', { name: strings['op.checkOnPrograms'] })).toBeInTheDocument();
    // A kit row action is declared once and drawn once: inline, so not again in the row menu.
    expect(within(await menu()).queryByRole('menuitem', { name: strings['op.checkOnPrograms'] })).toBeNull();
  });
});
