// A program change Computers sent and holds: core frees a held change on
// Dismiss only for its own sender, so here it is read-only, named as Computers', with a way to Computers and no
// Check or Dismiss of its own; and the row keeps it while core holds it, until Computers frees it.
import { beforeEach, describe, expect, it } from 'vitest';
import { capture, defineMutation, fixtureWorld, heldChanges, programLock, programOp, type Target } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { setRealm } from '@core/ctx';
import kitStrings from '@kit/strings.en.json';
import { links as computersLinks } from '../computers/links';
import * as data from './data';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}

type V = { id: string; port: number | null; target: Target };
// The note and the link name the sending page (core's HeldChange.from).
const NOTE = strings['op.elsewhere'].replace('{{name}}', 'web').replaceAll('{{page}}', strings['page.computers']);
const OPEN = strings['op.openSender'].replace('{{page}}', strings['page.computers']);
// Computers' restart, built through the shared builder exactly as its Programs tab sends it: another sender.
function computersRestart() {
  const restartOf = (v: V) => programOp({ id: v.id, act: 'restart', port: v.port, range: false });
  return defineMutation<V>(data.routes.restart, {
    input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: restartOf(v).body }),
    lock: programLock.restart,
    lockKey: (v) => restartOf(v).identity,
    page: 'computers',
  });
}

async function heldFromComputers() {
  await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
  await screen.findAllByRole('button', { name: 'Restart web' });
  const target = capture().target as Target;
  const computers = computersRestart();
  const v: V = { id: '1', port: null, target };
  const res = await computers.run(v);
  expect(res.outcome).toBe('pending');
  await screen.findAllByText(NOTE);
  return { computers, v, hold: res.hold ?? '' };
}

describe('programs: a change Computers holds', () => {
  beforeEach(() => opsStore.reset());

  it('is read-only here: named as Computers\', a way to Computers, no Check and no Dismiss', async () => {
    await heldFromComputers();
    expect(webOp()).toBeUndefined();
    expect((await screen.findAllByText(NOTE)).length).toBeGreaterThan(0);
    const inspector = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    expect(within(inspector).queryByRole('button', { name: /^(?:close|stop tracking…|hide this note)$/i })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /Check again/ })).toHaveLength(0);
    // A link to this computer's Programs tab on Computers (the shared "held on <page>" link).
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
    if (!atlas) throw new Error('no atlas');
    // The Hub's hash router renders the route behind '#'.
    expect(within(inspector).getByRole('link', { name: OPEN }).getAttribute('href')?.replace(/^#/, '')).toBe(`${computersLinks.item(`atlas.${atlas.id.slice(-4)}`)}&tab=programs`);
  });

  it('the row keeps it while core holds it, and lets go once Computers frees it', async () => {
    const { computers, v, hold } = await heldFromComputers();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryAllByText(NOTE).length).toBeGreaterThan(0);
    expect(heldChanges(programLock.restart)).toHaveLength(1);
    await computers.dismiss(v, hold);
    await waitFor(() => expect(screen.queryAllByText(NOTE)).toHaveLength(0));
  });

  it('shows on mount, with no press here, and every action of that program waits', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    const target = capture().target as Target;
    expect((await computersRestart().run({ id: '1', port: null, target })).outcome).toBe('pending');
    const inspector = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    await within(inspector).findByText(NOTE);
    const acts = within(inspector).queryAllByRole('button', { name: /^(Start|Stop|Restart) web$/ });
    expect(acts.length).toBeGreaterThan(0);
    // Off, and each says why (focusable, so the reason can be read): the kit's reasoned off state.
    for (const b of acts) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription(expect.stringContaining(strings['ports.held']));
    }
    // Nothing of this page's own is recorded: what shows is core's hold, read-only.
    expect(webOp()).toBeUndefined();
  });

  it('stays on a realm switch while core holds it (a kit lock is realm-free)', async () => {
    await heldFromComputers();
    act(() => setRealm('0123456789abcdef01234567'));
    await new Promise((r) => setTimeout(r, 50));
    expect((await screen.findAllByText(NOTE)).length).toBeGreaterThan(0);
    expect(heldChanges(programLock.restart)).toHaveLength(1);
  });

  it('a sender that names no page reads "another page", with no link', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    const target = capture().target as Target;
    const restartOf = (v: V) => programOp({ id: v.id, act: 'restart', port: v.port, range: false });
    const anon = defineMutation<V>(data.routes.restart, {
      input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: restartOf(v).body }),
      lock: programLock.restart,
      lockKey: (v) => restartOf(v).identity,
    });
    expect((await anon.run({ id: '1', port: null, target })).outcome).toBe('pending');
    const inspector = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    await within(inspector).findByText(strings['op.elsewhereAny'].replace('{{name}}', 'web'));
    expect(within(inspector).queryByRole('link', { name: strings['op.openSenderAny'] })).toBeNull();
    expect(within(inspector).queryByRole('button', { name: /^(?:close|stop tracking…|hide this note)$/i })).toBeNull();
  });

  it("this page's own sends are page 'programs' in core, the link another page shows", async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    expect(heldChanges(programLock.restart).map((h) => h.from?.page)).toEqual(['programs']);
  });

  it("this page's own hold keeps its Check and warned Dismiss", async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    expect(webOp()?.from).toBeUndefined();
    const inspector = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    expect(within(inspector).getByRole('button', { name: 'Stop tracking' })).toBeTruthy();
    expect(within(inspector).getByRole('button', { name: /Check again/ })).toBeTruthy();
    expect(within(inspector).queryByRole('link', { name: OPEN })).toBeNull();
  });
});
