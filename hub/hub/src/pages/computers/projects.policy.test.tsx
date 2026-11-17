// A project shared with the signed-in account offers each action
// the API allows the caller's level, nothing more. See: Permissions only; Work on: + Rename; Full control: + Delete,
// through the same counted dialog as the owner's (a member reads the project's computers too). For a member it says
// to ask the owner when the API refuses or the count can't be read, and it reads their level again on the press,
// bounded like a count. Just before DELETE the level the list reads then decides: a drop sends nothing. A level
// the Hub can't read keeps today's actions; the owner's dialog reads, sends and says exactly what it did.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { interpolate } from '@kit';
import { act } from '@testing-library/react';
import { isOff, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { PROJECT_READ_MS } from './data';
import { countReads, countServer, held, memberReads, memberServer, projectCalls, projectSends, projectTrace, removeSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import { linesOf } from './parts/projectPerms.logic';

const LAB = fixtureWorld.projects[2]!;
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
const deletes = () => projectSends.filter((x) => x.method === 'DELETE');
const level = (l: 'read' | 'edit' | 'delete') => strings[`pp.lvl.${l}`];
const COUNT = `COUNT ${LAB.id}`;
const DELETE = `DELETE /projects/${LAB.id}`;

/** The row's menu once its member list has answered (whatever the row then shows), as the item labels. */
async function menuOf(name: string) {
  const row = await rowOf(name);
  await waitFor(() => expect(memberReads.length).toBeGreaterThan(0), { timeout: 8000 });
  // The Permissions column has settled: no '—' left for the people fact.
  await waitFor(() => expect(within(row).queryAllByText('—')).toHaveLength(0), { timeout: 8000 });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  const menu = await screen.findByRole('menu');
  return { row, menu, items: within(menu).getAllByRole('menuitem').map((m) => m.textContent ?? '') };
}
const named = (items: string[], keys: readonly (keyof typeof strings)[]) => items.map((x) => keys.map((k) => strings[k]).find((w) => x.includes(w)) ?? x);

async function openDelete(state: string) {
  const r = await renderPage(page, { path: '/computers/projects', state });
  const { menu } = await menuOf(LAB.name);
  await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
  return Object.assign(await screen.findByRole('alertdialog'), { queryClient: r.queryClient, unmount: r.unmount });
}
const goOf = (d: HTMLElement) => within(d).getByRole('button', { name: strings['projx.go'] });
/** Let a held answer's follow-ups run (the count after it, a DELETE it would send): long enough for any of them. */
const settle = () => new Promise((done) => setTimeout(done, 1200));
/** The people list read again now (the live list the dialog reads), as a later refresh would. */
const reread = (d: { queryClient: { invalidateQueries: () => Promise<unknown> } }) => d.queryClient.invalidateQueries();

beforeEach(() => {
  projectSends.length = 0;
  projectTrace.length = 0;
  projectCalls.length = 0;
  memberReads.length = 0;
  countReads.length = 0;
  memberServer.level = {};
  memberServer.fail = false;
  memberServer.holdNext = 0;
  countServer.holdNext = 0;
});
afterEach(() => {
  vi.useRealTimers();
  held.release();
  memberServer.level = {};
  memberServer.fail = false;
  memberServer.holdNext = 0;
  countServer.holdNext = 0;
});

describe('A shared project offers what the caller\'s level allows', () => {
  it.each([
    ['read', ['pp.open']],
    ['edit', ['pp.open', 'proj.rename']],
    ['delete', ['pp.open', 'proj.rename', 'proj.delete']],
  ] as const)('a member at %s gets only the actions it allows, the Shared with you tag and their own level', async (l, want) => {
    await renderPage(page, { path: '/computers/projects', state: `projectMember${l}` });
    const { row, items } = await menuOf(LAB.name);
    expect(named(items, want)).toEqual(want.map((k) => strings[k]));
    expect(within(row).getByText(strings['pp.shared'])).toBeInTheDocument();
    expect(within(row).getByText(interpolate(strings['pp.sharedLevel'], { level: level(l) }))).toBeInTheDocument();
  }, 40000);

  it('past the first 50 shared projects a row still gets the actions of the level it shows', async () => {
    // The list's own search (URL-kept as pq) shows the 55th shared project.
    await renderPage(page, { path: '/computers/projects?pq=Shared%2055', state: 'projectManyShared' });
    const { row, items } = await menuOf('Shared 55');
    expect(within(row).getByText(interpolate(strings['pp.sharedLevel'], { level: level('read') }))).toBeInTheDocument();
    expect(named(items, ['pp.open'])).toEqual([strings['pp.open']]);
  }, 60000);

  it('a level the Hub can\'t read keeps today\'s actions (an unknown level)', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectMemberUnknown' });
    const { row, items } = await menuOf(LAB.name);
    expect(within(row).getByText(strings['pp.shared'])).toBeInTheDocument();
    expect(named(items, ['pp.open', 'proj.rename', 'proj.delete'])).toEqual([strings['pp.open'], strings['proj.rename'], strings['proj.delete']]);
  }, 40000);

  it('projects the caller owns carry no tag and keep their facts', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectMemberedit' });
    const home = await rowOf(fixtureWorld.projects[0]!.name);
    expect(await within(home).findByText(strings['pp.fact.onlyYou'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(home).queryByText(strings['pp.shared'])).toBeNull();
  }, 40000);
});

describe('Delete, as a Full control member', () => {
  it('counts the project\'s computers like the owner, reads their level again, then sends the plain DELETE once', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB.name })));
    const reads = memberReads.length;
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(memberReads.length).toBeGreaterThan(reads);
    expect(projectTrace).toEqual([COUNT, COUNT, DELETE]);
    expect(JSON.stringify(deletes()[0]!.query ?? {})).not.toContain('delete_computers');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  }, 40000);

  it('their count shows computers in it: Delete is not offered in the dialog', async () => {
    const d = await openDelete('projectMemberdeleteFull');
    await waitFor(() => expect(d).toHaveTextContent(new RegExp(`${LAB.name} still holds \\d+ computer`)));
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('their count can\'t be read: no count is guessed, the dialog says to ask the owner, nothing is sent', async () => {
    const d = await openDelete('projectMemberdeleteCountFails');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.unknown'], { name: LAB.name })));
    expect(d).toHaveTextContent(strings['pp.del.memberAsk']);
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('the API refuses a project that still holds computers: "ask the owner", nothing sent again', async () => {
    const d = await openDelete('projectMemberdeleteHas');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberHas']));
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(1);
  }, 40000);

  it('their level dropped after the dialog opened: the press reads it again and sends nothing; a newer read decides again', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.level = { ada: 'read' };
    await userEvent.click(goOf(d));
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberMoved']));
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(0);
    // Full control again by the time the list reads once more: the press's finding no longer stands.
    memberServer.level = {};
    await reread(d);
    await waitFor(() => expect(d).not.toHaveTextContent(strings['pp.del.memberMoved']), { timeout: 8000 });
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
  }, 40000);

  it('a later read of the list shows their level dropped: Delete stops being offered before any press', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.level = { ada: 'edit' };
    await d.queryClient.invalidateQueries();
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberMoved']), { timeout: 8000 });
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('their level can\'t be read at the press: nothing is sent, the dialog unlocks and a second press can send', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.fail = true;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberUnread']));
    expect(deletes()).toHaveLength(0);
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.fail = false;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(deletes()).toHaveLength(1));
  }, 40000);

  it('their level read at the press never answers: after the count\'s own time it says so and unlocks, nothing sent', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    memberServer.holdNext = 1;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(held.waiting).toBe(1));
    expect(isOff(goOf(d))).toBe(true);
    act(() => { vi.advanceTimersByTime(PROJECT_READ_MS + 1); });
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberUnread']));
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    expect(deletes()).toHaveLength(0);
    // The read answers Full control after all: too late, it starts no count and sends nothing.
    held.release();
    await settle();
    expect(projectTrace).toEqual([COUNT]);
    expect(deletes()).toHaveLength(0);
    expect(d).toHaveTextContent(strings['pp.del.memberUnread']);
  }, 40000);

  it.each(['times out', 'fails'])('the list is read again while the press read is out, then that read %s: "couldn\'t check" still shows', async (how) => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    if (how === 'times out') vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    const reads = memberReads.length;
    memberServer.holdNext = 1;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(held.waiting).toBe(1));
    // The same list, read again (identical data, a newer read).
    await reread(d);
    await waitFor(() => expect(memberReads.length).toBeGreaterThan(reads + 1));
    if (how === 'times out') act(() => { vi.advanceTimersByTime(PROJECT_READ_MS + 1); });
    else {
      memberServer.fail = true;
      held.release();
    }
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberUnread']), { timeout: 8000 });
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('their level drops while the press reads it, and the read answers Full control late: nothing is sent', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.holdNext = 1;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(held.waiting).toBe(1));
    memberServer.level = { ada: 'read' };
    await reread(d);
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberMoved']), { timeout: 8000 });
    held.release();
    await settle();
    expect(deletes()).toHaveLength(0);
    expect(d).toHaveTextContent(strings['pp.del.memberMoved']);
    expect(isOff(goOf(d))).toBe(true);
  }, 40000);

  it('a press whose level read answers after the view was left sends nothing, not even its count', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.holdNext = 1;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(held.waiting).toBe(1));
    expect(isOff(within(d).getByRole('button', { name: 'Cancel' }))).toBe(true);
    d.unmount();
    held.release();
    await settle();
    expect(projectTrace).toEqual([COUNT]);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('their level drops while the count before sending is out: nothing is sent', async () => {
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    countServer.holdNext = 1;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(held.waiting).toBe(1));
    memberServer.level = { ada: 'read' };
    await reread(d);
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberMoved']), { timeout: 8000 });
    held.release();
    await settle();
    expect(projectTrace).toEqual([COUNT, COUNT]);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('a lost answer is held: closed and opened again it is still held, a project still there keeps it, never resent', async () => {
    const d = await openDelete('projectMemberdeleteLost');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const { menu } = await menuOf(LAB.name);
    await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const e = await screen.findByRole('alertdialog');
    await waitFor(() => expect(e).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB.name })));
    expect(isOff(goOf(e))).toBe(true);
    await userEvent.click(within(e).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(e).toHaveTextContent(interpolate(strings['held.projectThere'], { name: LAB.name })), { timeout: 8000 });
    expect(isOff(goOf(e))).toBe(true);
    expect(deletes()).toHaveLength(1);
    expect(projectTrace.filter((x) => !x.startsWith('COUNT'))).toEqual([DELETE, `GET /projects/${LAB.id}`]);
  }, 40000);

  it('a lost answer whose project read fails keeps the hold: no Dismiss, nothing resent', async () => {
    const d = await openDelete('projectMemberdeleteLostDown');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await userEvent.click(await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 }));
    await waitFor(() => expect(projectTrace).toContain(`GET /projects/${LAB.id}`), { timeout: 8000 });
    await settle();
    expect(within(d).getByRole('button', { name: strings['held.check'] })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    expect(d).not.toHaveTextContent(interpolate(strings['held.projectThere'], { name: LAB.name }));
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(1);
  }, 40000);

  it('a lost answer whose project read says 404 ends the hold and closes the dialog', async () => {
    const d = await openDelete('projectMemberdeleteLostGone');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    const again = await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    await userEvent.click(again);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), { timeout: 8000 });
    expect(deletes()).toHaveLength(1);
  }, 40000);
});

describe('A level not known as the dialog opens (the plain dialog, until the list reads a level)', () => {
  it('the list then reads See: Delete stops being offered, and says nothing was sent', async () => {
    memberServer.fail = true;
    const d = await openDelete('projectMemberread');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.fail = false;
    await reread(d);
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberMoved']), { timeout: 8000 });
    expect(isOff(goOf(d))).toBe(true);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('the list reads See while the count before sending is out: nothing is sent', async () => {
    memberServer.fail = true;
    const d = await openDelete('projectMemberread');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    countServer.holdNext = 1;
    await userEvent.click(goOf(d));
    await waitFor(() => expect(held.waiting).toBe(1));
    memberServer.fail = false;
    await reread(d);
    await waitFor(() => expect(d).toHaveTextContent(strings['pp.del.memberMoved']), { timeout: 8000 });
    held.release();
    await settle();
    expect(projectTrace).toEqual([COUNT, COUNT]);
    expect(deletes()).toHaveLength(0);
  }, 40000);

  it('the list then reads Full control: the member\'s press, with its own read of their level', async () => {
    memberServer.fail = true;
    const d = await openDelete('projectMemberdelete');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    memberServer.fail = false;
    await reread(d);
    await waitFor(() => expect(memberReads.length).toBeGreaterThan(1));
    const reads = memberReads.length;
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(memberReads.length).toBeGreaterThan(reads);
  }, 40000);
});

describe('The owner\'s dialog, and one whose level is not known, is unchanged', () => {
  // The exact words at each step and every request in one ordered trace, each whole (method, path, query, body), as
  // on code without the level check: the opening count, the count again on the press, the plain DELETE; after a refusal
  // one more count; after a lost answer, Check again's one project read. These pass on that code as they do now.
  const n = LAB.name;
  const ask = `Delete ${n}?`;
  const end = 'CancelDelete project';
  const open = `${ask}No computers are listed in ${n}. Deleting it can't be undone.`;
  const people = 'It also ends the membership of 2 people: jane_smith, bob.';
  const lost = `${ask}The project ${n} may already have been deleted. Check again looks whether it still exists. Delete stays off while this is open.Check again`;
  const there = `${lost}Stop tracking${n} was still there at the last check. The earlier delete may still finish. If you stop tracking this, Delete comes back and can be sent again.${end}`;
  const del = { method: 'DELETE', path: `/projects/${LAB.id}`, query: {}, body: null };
  const get = { method: 'GET', path: `/projects/${LAB.id}`, query: {}, body: null };
  const count = { method: 'GET', path: `/projects/${LAB.id}/computers`, query: { page: '1', limit: '1', include_expired: 'true', include_deleting: 'true' }, body: null };
  const text = () => screen.queryByRole('alertdialog')?.textContent ?? null;

  it.each([
    ['projectEmptyPeople', open + people + end],
    ['projectMemberUnknown', open + end],
  ])('%s: these words, then count, count, DELETE, closed', async (state, words) => {
    const d = await openDelete(state);
    await waitFor(() => expect(text()).toBe(words), { timeout: 8000 });
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await waitFor(() => expect(text()).toBeNull(), { timeout: 8000 });
    expect(projectCalls).toEqual([count, count, del]);
  }, 40000);

  it.each(['projectRefused', 'projectMemberUnknownRefused'])('%s: the refusal counts once more and says what that count shows, in the owner\'s words', async (state) => {
    const d = await openDelete(state);
    await waitFor(() => expect(text()).toBe(open + end), { timeout: 8000 });
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    const hidden = `${ask}${n} was not deleted because it still held computers. None are listed for you now: they may have been moved or deleted since, or they may be on a server you can't see. Close this and open Delete again to check. If it is refused again, contact support.${end}`;
    await waitFor(() => expect(text()).toBe(hidden), { timeout: 8000 });
    expect(projectCalls).toEqual([count, count, del, count]);
  }, 40000);

  it.each([
    ['projectPendingPeople', open + people + end],
    ['projectMemberUnknownLost', open + end],
  ])('%s: a lost answer is held, Check again reads the project once and keeps the hold', async (state, words) => {
    const d = await openDelete(state);
    await waitFor(() => expect(text()).toBe(words), { timeout: 8000 });
    await waitFor(() => expect(isOff(goOf(d))).toBe(false));
    await userEvent.click(goOf(d));
    await waitFor(() => expect(text()).toBe(lost + end), { timeout: 8000 });
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(text()).toBe(there), { timeout: 8000 });
    expect(projectCalls).toEqual([count, count, del, get]);
  }, 40000);
});

describe('People, as a member', () => {
  it('a member sees their own level and what it lets them do, and that some of it works by computer ID', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectMemberedit' });
    const { menu } = await menuOf(LAB.name);
    await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['pp.title'], { name: LAB.name }) }, { timeout: 8000 });
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
    expect(await within(d).findByText(interpolate(strings['pp.people.youAre'], { level: level('edit') }), {}, { timeout: 8000 })).toBeInTheDocument();
    // What their level lets them do is the level table's own lines, with why some of it works by computer ID.
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.levels.disclosure'] }));
    for (const k of linesOf('edit')) expect(within(d).getByText(strings[k as keyof typeof strings])).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.levels.byId'])).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.people.owner'])).toBeNull();
  }, 40000);
});

// host_reinstalled: a project that holds only expired computers (its server was reinstalled, or
// its rental ended) was a dead end: the API refuses a project delete while any computer is there, and the realm's list
// shows none of them. Its owner deletes them one by one in the project's Computers tab (base host), then the project
// itself with the plain DELETE: the Hub still never sends delete_computers.
describe('A project holding only expired computers (host_reinstalled)', () => {
  it('its computers are deleted in its Computers tab, then the project with the plain DELETE', async () => {
    removeSends.length = 0;
    await renderPage(page, { path: '/computers/projects', state: 'projectOnlyExpired' });
    const { menu } = await menuOf(LAB.name);
    await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
    const perms = await screen.findByRole('dialog', { name: interpolate(strings['pp.title'], { name: LAB.name }) }, { timeout: 8000 });
    await userEvent.click(within(perms).getByRole('tab', { name: strings['pp.tab.computers'] }));
    for (const name of ['dune', 'harbor']) {
      // Delete sits in the computer's row menu, and still opens the page's one delete dialog.
      const row = (await within(perms).findAllByRole('row', {}, { timeout: 8000 })).find((r) => r.hasAttribute('data-row-id') && r.textContent?.includes(name))!;
      await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
      await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${interpolate(strings['pp.cx.deleteOf'], { name })}`) }));
      const d = await screen.findByRole('alertdialog', { name: interpolate(strings['delete.title'], { name }) }, { timeout: 8000 });
      await userEvent.type(within(d).getByLabelText(`Type ${name} to confirm`), name);
      await userEvent.click(within(d).getByRole('button', { name: strings['delete.go'] }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), { timeout: 8000 });
    }
    expect(removeSends.map((x) => x.scope)).toEqual(['base', 'base']);
    expect(await within(perms).findByText(strings['pp.cx.empty'], {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: interpolate(strings['pp.title'], { name: LAB.name }) })).toBeNull());
    const again = await menuOf(LAB.name);
    await userEvent.click(within(again.menu).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(isOff(goOf(d))).toBe(false), { timeout: 8000 });
    await userEvent.click(goOf(d));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]!.path).toBe(`/projects/${LAB.id}`);
    expect(JSON.stringify(deletes()[0]!.query ?? {})).not.toContain('delete_computers');
  }, 60000);
});
