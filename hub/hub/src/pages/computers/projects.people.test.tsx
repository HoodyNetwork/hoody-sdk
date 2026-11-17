// The Permissions drawer's People tab changes who is on a project: add one account (by username or account ID),
// change a member's level, remove a member. Each is confirmed with what it grants or takes away and sent once. A lost
// answer stays held, ONE hold per project: it holds every people write of that project, whichever
// account it names, and none of another project. Check again reads the whole list (every page up to 1,000 rows) and
// says how it reads now, never that the request finished; only a warned Dismiss ends it. Levels are offered only up
// to the caller's own (the API's ceiling).
import { fixtureWorld } from '@core';
import { interpolate } from '@kit';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { memberLate, memberPages, memberReads, memberSends, memberServer } from './fixtures';
import { addTargetOf, heldNow, memberRefusal, membersFrom } from './parts/projectPerms.logic';
import page from './page';
import strings from './strings.en.json';

const first = fixtureWorld.projects[0]!;
const ME = fixtureWorld.account;
const CAROL = 'c'.repeat(24);

async function openPeople(state: string, project = first, rendered = false) {
  if (!rendered) await renderPage(page, { path: '/computers/projects', state });
  const row = (await screen.findByText(project.name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
  const d = await screen.findByRole('dialog', { name: interpolate(strings['pp.title'], { name: project.name }) }, { timeout: 8000 });
  await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
  if (project === first) await within(d).findByRole('table', { name: strings['pp.tab.people'] }, { timeout: 8000 });
  return d;
}

// The People table's body row of one person (the header row carries no row id).
const personRow = (d: HTMLElement, who: string) =>
  within(within(d).getByRole('table', { name: strings['pp.tab.people'] })).getAllByRole('row').find((r) => r.hasAttribute('data-row-id') && r.textContent?.includes(who)) as HTMLElement;
// Remove sits in the person's row menu: the menu item, with the menu left open.
async function removeItem(d: HTMLElement, who: string) {
  await userEvent.click(within(personRow(d, who)).getByRole('button', { name: 'Row actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${interpolate(strings['pp.remove.label'], { person: who })}`) });
}
// A level change sits in the person's row menu too, one item per level the caller may set; the menu is left open.
async function levelItem(d: HTMLElement, who: string, level: string) {
  await userEvent.click(within(personRow(d, who)).getByRole('button', { name: 'Row actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${interpolate(strings['pp.lvl.change.to'], { person: who, level })}`) });
}
const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled === true;

async function addPerson(d: HTMLElement, who: string, level?: string) {
  await userEvent.click(within(d).getByRole('button', { name: strings['pp.add'] }));
  const form = within(d).getByRole('form', { name: strings['pp.add'] });
  await userEvent.type(within(form).getByRole('textbox', { name: strings['pp.add.who'] }), who);
  if (level) await userEvent.click(within(form).getByRole('radio', { name: new RegExp(`^${level}`) }));
  await userEvent.click(within(form).getByRole('button', { name: strings['pp.add.continue'] }));
  return form;
}
const confirmOf = () => screen.findByRole('alertdialog');
const sends = (method: string) => memberSends.filter((x) => x.method === method);

beforeEach(() => {
  memberReads.length = 0;
  memberPages.length = 0;
  memberSends.length = 0;
  memberLate.land = false;
  memberServer.level = {};
  memberServer.fail = false;
});

describe('People writes: logic', () => {
  it('Add takes a username or a 24-hex account ID, refuses the caller and the owner before sending', () => {
    expect(addTargetOf(' carol ', { id: ME.id, username: ME.username })).toEqual({ target: { username: 'carol' } });
    expect(addTargetOf(CAROL.toUpperCase(), { id: ME.id })).toEqual({ target: { user_id: CAROL } });
    expect(addTargetOf(ME.username, { id: ME.id, username: ME.username })).toEqual({ problem: 'pp.add.self' });
    expect(addTargetOf(ME.username.toUpperCase(), { id: ME.id, username: ME.username })).toEqual({ problem: 'pp.add.self' });
    expect(addTargetOf(ME.id, { id: ME.id })).toEqual({ problem: 'pp.add.self' });
    expect(addTargetOf('f'.repeat(24), { id: ME.id }, 'f'.repeat(24))).toEqual({ problem: 'pp.add.owner' });
    for (const bad of ['', 'a b', 'bob@example.com', 'x'.repeat(101)]) expect(addTargetOf(bad, { id: ME.id })).toEqual({ problem: 'pp.add.bad' });
  });

  it('refusals: 409 exists, a 404 only "not found" (never who is or isn\'t on it), 403 refused; else the kit says', () => {
    expect(memberRefusal('add', 409, 'PERMISSION_ALREADY_EXISTS')).toBe('pp.add.exists');
    expect(memberRefusal('add', 404, 'NOT_FOUND')).toBe('pp.add.notFound');
    expect(memberRefusal('set', 404, 'NOT_FOUND')).toBe('pp.member.notFound');
    expect(memberRefusal('remove', 404, 'NOT_FOUND')).toBe('pp.member.notFound');
    expect(memberRefusal('remove', 403, 'FORBIDDEN')).toBe('pp.member.refused');
    expect(memberRefusal('add', 403, undefined)).toBe('pp.add.refused');
    expect(memberRefusal('add', 500, 'SERVER_ERROR')).toBeNull();
    expect(strings['pp.member.notFound']).not.toMatch(/no longer|not on the project|person/i);
    expect(strings['pp.add.notFound']).not.toMatch(/no account|doesn't exist|not on the project/i);
  });

  it('heldNow reads how the list reads now by any name the held write carried: a level, the owner row, absent only from a whole list, else cut', () => {
    const row = (id: string, uid: string, name: string, level: string) => ({ id, user_id: uid, permission_level: level, user: { id: uid, username: name } });
    const whole = membersFrom({ data: { permissions: [row('m1', CAROL, 'carol', 'edit'), row('m2', ME.id, 'ada', 'read')], pagination: { total: 2 } } }, ME.id)!;
    expect(heldNow(whole, { username: 'Carol' })).toBe('edit');
    expect(heldNow(whole, { user_id: CAROL })).toBe('edit');
    expect(heldNow(whole, { mid: 'm1' })).toBe('edit');
    expect(heldNow(whole, { mid: 'm2' })).toBe('owner');
    expect(heldNow(whole, { username: 'dave' })).toBe('absent');
    // A membership removed and made again (a new row id, the same account): the held write's account still finds it.
    expect(heldNow(whole, { mid: 'm-old', account: CAROL })).toBe('edit');
    const cut = membersFrom({ data: { permissions: [row('m1', CAROL, 'carol', 'edit')], pagination: { total: 9 } } })!;
    expect(heldNow(cut, { username: 'dave' })).toBe('cut');
    // Present in a list not read whole: still cut, never its level.
    expect(heldNow(cut, { username: 'carol' })).toBe('cut');
  });
});

describe('People writes: the drawer (owner)', () => {
  it('adds by username through a confirm that says what the level allows; sent once; the list then shows them', async () => {
    const d = await openPeople('projectPeople');
    await addPerson(d, 'carol', strings['pp.lvl.edit']);
    const c = await confirmOf();
    expect(c).toHaveTextContent(interpolate(strings['pp.add.confirm.title'], { person: 'carol', name: first.name, level: strings['pp.lvl.edit'] }));
    expect(within(c).getAllByRole('heading')[0]).toHaveTextContent('carol');
    expect(c).toHaveTextContent(strings['pp.can.power']);
    expect(c).toHaveTextContent(strings['pp.can.see']);
    expect(c).not.toHaveTextContent(strings['pp.can.rules']);
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['pp.add.done'], { person: 'carol', level: strings['pp.lvl.edit'] })));
    expect(sends('POST')).toHaveLength(1);
    expect(sends('POST')[0]!.body).toEqual({ username: 'carol', permission_level: 'edit' });
    await waitFor(() => expect(within(d).getByRole('table', { name: strings['pp.tab.people'] })).toHaveTextContent('carol'));
  }, 40000);

  it('starts at See (least privilege) and adds by account ID as user_id, never showing the ID back', async () => {
    const d = await openPeople('projectPeople');
    await addPerson(d, CAROL);
    const c = await confirmOf();
    expect(c).toHaveTextContent(interpolate(strings['pp.add.confirm.title'], { person: interpolate(strings['pp.add.idName'], { end: CAROL.slice(-4) }), name: first.name, level: strings['pp.lvl.read'] }));
    expect(c.textContent).not.toContain(CAROL);
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await waitFor(() => expect(sends('POST')).toHaveLength(1));
    expect(sends('POST')[0]!.body).toEqual({ user_id: CAROL, permission_level: 'read' });
  }, 40000);

  it('refuses the caller\'s own account and a malformed name before sending anything', async () => {
    const d = await openPeople('projectPeople');
    const form = await addPerson(d, ME.username);
    expect(await within(form).findByText(strings['pp.add.self'])).toBeInTheDocument();
    const box = within(form).getByRole('textbox', { name: strings['pp.add.who'] });
    await userEvent.clear(box);
    await userEvent.type(box, 'not a name');
    await userEvent.click(within(form).getByRole('button', { name: strings['pp.add.continue'] }));
    expect(await within(form).findByText(strings['pp.add.bad'])).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(memberSends).toEqual([]);
  }, 40000);

  it.each([
    ['projectPeopleExists', 'pp.add.exists'],
    ['projectPeopleNotFound', 'pp.add.notFound'],
    ['projectPeopleRefused', 'pp.add.refused'],
  ] as const)('%s: the refusal is said in the confirm and nothing is sent again', async (state, key) => {
    const d = await openPeople(state);
    await addPerson(d, 'carol');
    const c = await confirmOf();
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    expect(await within(c).findByText(strings[key])).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: strings['pp.add.confirm.go'] })).toBeDisabled();
    expect(sends('POST')).toHaveLength(1);
  }, 40000);

  it('a lost add is held: Check again says how the list reads now, never done, and sends nothing again', async () => {
    const d = await openPeople('projectPeopleLostLate');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    expect(await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // The add has not landed yet when this read answers: the list reads "not on the project", and the hold stays.
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    const absent = interpolate(strings['pp.held.now'], { state: strings['pp.held.state.absent'] });
    expect(await within(d).findByText(absent, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.add.held'])).toBeInTheDocument();
    expect(d).not.toHaveTextContent(/didn't go through|Added carol/);
    // It lands later: the next read shows it, still held (the request itself may still be on its way, C9).
    memberLate.land = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    const now = interpolate(strings['pp.held.now'], { state: interpolate(strings['pp.held.state.level'], { level: strings['pp.lvl.read'] }) });
    expect(await within(d).findByText(now, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.add.held'])).toBeInTheDocument();
    // One hold per project: no people write on it is offered while it is held, whichever account it would name.
    // Its band, and the same words as the reason on each action it turns off.
    expect(within(d).getAllByText(strings['pp.held.blocks']).length).toBeGreaterThan(0);
    expect(isOff(within(d).getByRole('button', { name: strings['pp.add'] }))).toBe(true);
    for (const who of ['jane_smith', 'bob']) {
      expect(isOff(await levelItem(d, who, strings[who === 'bob' ? 'pp.lvl.edit' : 'pp.lvl.read']))).toBe(true);
      await userEvent.keyboard('{Escape}');
      expect(isOff(await removeItem(d, who))).toBe(true);
      await userEvent.keyboard('{Escape}');
    }
    expect(sends('POST')).toHaveLength(1);
  }, 60000);

  it('a hold on one project leaves another project\'s people writes offered', async () => {
    const d = await openPeople('projectPeopleLost');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: interpolate(strings['pp.title'], { name: first.name }) })).toBeNull());
    const other = fixtureWorld.projects[1]!;
    const d2 = await openPeople('projectPeopleLost', other, true);
    expect(isOff(await within(d2).findByRole('button', { name: strings['pp.add'] }, { timeout: 8000 }))).toBe(false);
    expect(within(d2).queryByText(strings['pp.add.held'])).toBeNull();
    expect(within(d2).queryByText(strings['pp.held.blocks'])).toBeNull();
  }, 60000);

  it('Check again reads every page: an add that landed past row 100 is found on page 3, and the hold stays', async () => {
    const d = await openPeople('projectPeople250Applied');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 });
    memberPages.length = 0;
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    const now = interpolate(strings['pp.held.now'], { state: interpolate(strings['pp.held.state.level'], { level: strings['pp.lvl.read'] }) });
    expect(await within(d).findByText(now, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(memberPages).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(memberPages).not.toContain(4);
    expect(within(d).getByText(strings['pp.add.held'])).toBeInTheDocument();
  }, 60000);

  it('a later page that fails reads as cut, never absent; the hold stays', async () => {
    const d = await openPeople('projectPeople250PageFails');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 });
    memberPages.length = 0;
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    expect(await within(d).findByText(strings['pp.held.cut'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(memberPages).toContain(2);
    expect(d).not.toHaveTextContent(strings['pp.held.state.absent']);
    expect(within(d).getByText(strings['pp.add.held'])).toBeInTheDocument();
  }, 60000);

  it('past 1,000 rows Check again stops at page 10 and says cut, never absent', async () => {
    const d = await openPeople('projectPeople1200Lost');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 });
    memberPages.length = 0;
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    expect(await within(d).findByText(strings['pp.held.cut'], {}, { timeout: 20000 })).toBeInTheDocument();
    const read = memberPages.filter((n) => n > 1);
    expect(Math.max(...read)).toBe(10);
    expect(memberPages).not.toContain(11);
    expect(d).not.toHaveTextContent(strings['pp.held.state.absent']);
  }, 90000);

  it('a cut list says it can\'t show the person, never absent', async () => {
    const d = await openPeople('projectPeopleCutLost');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 });
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    expect(await within(d).findByText(strings['pp.held.cut'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(d).not.toHaveTextContent(strings['pp.held.state.absent']);
  }, 40000);

  it('Dismiss is warned, then frees the hold; Add may be sent again', async () => {
    const d = await openPeople('projectPeopleLost');
    await addPerson(d, 'carol');
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.add.confirm.go'] }));
    await within(d).findByText(strings['pp.add.held'], {}, { timeout: 8000 });
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.dismiss'] }));
    const warn = await screen.findByRole('alertdialog', { name: strings['pp.held.dismissTitle'] });
    expect(warn).toHaveTextContent(strings['pp.held.dismissBody']);
    await userEvent.click(within(warn).getByRole('button', { name: strings['pp.held.dismissGo'] }));
    await waitFor(() => expect(within(d).queryByText(strings['pp.add.held'])).toBeNull());
    expect(sends('POST')).toHaveLength(1);
  }, 40000);

  it('a lost removal is held: Check again finds the member by their account and says how the list reads, never done', async () => {
    const d = await openPeople('projectPeopleLost');
    await userEvent.click(await removeItem(d, 'jane_smith'));
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.remove.go'] }));
    expect(await within(d).findByText(strings['pp.remove.held'], {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    const now = interpolate(strings['pp.held.now'], { state: interpolate(strings['pp.held.state.level'], { level: strings['pp.lvl.edit'] }) });
    expect(await within(d).findByText(now, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.remove.held'])).toBeInTheDocument();
    expect(d).not.toHaveTextContent(interpolate(strings['pp.remove.done'], { person: 'jane_smith' }));
    expect(isOff(await removeItem(d, 'bob'))).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(sends('DELETE')).toHaveLength(1);
  }, 40000);

  it('a lost level change that landed: Check again reads the new level, and the hold stays until Dismiss', async () => {
    const d = await openPeople('projectPeople250Applied');
    await userEvent.click(await levelItem(d, 'p0', strings['pp.lvl.edit']));
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.lvl.change.go'] }));
    expect(await within(d).findByText(strings['pp.lvl.held'], {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    const now = interpolate(strings['pp.held.now'], { state: interpolate(strings['pp.held.state.level'], { level: strings['pp.lvl.edit'] }) });
    expect(await within(d).findByText(now, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.lvl.held'])).toBeInTheDocument();
    expect(sends('PUT')).toHaveLength(1);
  }, 60000);

  it('changing a level down says what is lost; the PUT carries only the new level', async () => {
    const d = await openPeople('projectPeople');
    await userEvent.click(await levelItem(d, 'jane_smith', strings['pp.lvl.read']));
    const c = await confirmOf();
    expect(c).toHaveTextContent(interpolate(strings['pp.lvl.change.title'], { person: 'jane_smith', level: strings['pp.lvl.read'] }));
    expect(c).toHaveTextContent(interpolate(strings['pp.lvl.change.down'], { person: 'jane_smith' }));
    expect(c).toHaveTextContent(strings['pp.can.workspace']);
    expect(c).not.toHaveTextContent(strings['pp.can.see']);
    expect(c).toHaveTextContent(strings['pp.lvl.change.downAfter']);
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.lvl.change.go'] }));
    await waitFor(() => expect(sends('PUT')).toHaveLength(1));
    expect(sends('PUT')[0]!.body).toEqual({ permission_level: 'read' });
    expect(sends('PUT')[0]!.path).toMatch(/\/permissions\/m0+1$/);
  }, 40000);

  it('removing says what membership removal does and does not do; a 404 says only "not found"', async () => {
    const d = await openPeople('projectPeopleGone');
    await userEvent.click(await removeItem(d, 'bob'));
    const c = await confirmOf();
    expect(c).toHaveTextContent(interpolate(strings['pp.remove.body'], { name: first.name }));
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.remove.go'] }));
    expect(await within(c).findByText(strings['pp.member.notFound'])).toBeInTheDocument();
    expect(sends('DELETE')).toHaveLength(1);
  }, 40000);
});

const chooseLevel = async (d: HTMLElement, person: string, level: string) => {
  await userEvent.click(await levelItem(d, person, level));
};

describe('A level change confirms from a fresh read', () => {
  it('the server moved the member after the list was shown: the confirm says what changes from the level the fresh read shows', async () => {
    const d = await openPeople('projectPeople');
    // Shown at Work on; someone else raised jane_smith to Full control since.
    memberServer.level = { jane_smith: 'delete' };
    await chooseLevel(d, 'jane_smith', strings['pp.lvl.read']);
    const c = await confirmOf();
    expect(c).toHaveTextContent(interpolate(strings['pp.lvl.change.down'], { person: 'jane_smith' }));
    // What Full control granted and See doesn't: the rules line (from Full control) as well as the Work on lines.
    expect(c).toHaveTextContent(strings['pp.can.rules']);
    expect(c).toHaveTextContent(strings['pp.can.workspace']);
    expect(sends('PUT')).toHaveLength(0);
  }, 40000);

  it('already at the chosen level now: nothing to confirm, nothing sent', async () => {
    const d = await openPeople('projectPeople');
    memberServer.level = { jane_smith: 'read' };
    await chooseLevel(d, 'jane_smith', strings['pp.lvl.read']);
    expect(await within(d).findByText(strings['pp.lvl.change.already'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sends('PUT')).toHaveLength(0);
  }, 40000);

  it('a read that fails withholds the confirm', async () => {
    const d = await openPeople('projectPeople');
    memberServer.fail = true;
    await chooseLevel(d, 'jane_smith', strings['pp.lvl.read']);
    expect(await within(d).findByText(strings['pp.lvl.change.unread'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sends('PUT')).toHaveLength(0);
  }, 40000);

  it("the caller's own level dropped since (a member): their ceiling now withholds the confirm", async () => {
    const d = await openPeople('projectPeopleMember');
    // ada (the caller) was at Work on when shown; now at See, which may change nobody.
    memberServer.level = { ada: 'read' };
    await chooseLevel(d, 'bob', strings['pp.lvl.edit']);
    // Nothing proves bob's level moved: the note says the change can't be confirmed, never that a level changed.
    expect(await within(d).findByText(strings['pp.lvl.change.cannot'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.lvl.change.moved'])).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sends('PUT')).toHaveLength(0);
  }, 40000);

  it('the member left since the list was shown: the list changed, nothing to confirm, nothing sent', async () => {
    const d = await openPeople('projectPeople');
    // Someone else removed jane_smith (her row m…1) after the list was shown.
    memberSends.push({ method: 'DELETE', path: `/projects/${first.id}/members/m${'1'.padStart(23, '0')}`, body: undefined, applied: true });
    await chooseLevel(d, 'jane_smith', strings['pp.lvl.read']);
    expect(await within(d).findByText(strings['pp.lvl.change.moved'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.lvl.change.cannot'])).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sends('PUT')).toHaveLength(0);
  }, 40000);
});

describe('Check again states a member only from a whole read', () => {
  const heldSet = async (state: string, person: string) => {
    const d = await openPeople(state);
    await chooseLevel(d, person, strings['pp.lvl.edit']);
    await userEvent.click(within(await confirmOf()).getByRole('button', { name: strings['pp.lvl.change.go'] }));
    expect(await within(d).findByText(strings['pp.lvl.held'], {}, { timeout: 8000 })).toBeInTheDocument();
    return d;
  };
  const anyState = /The list now shows/;

  it('the member is on page 1 and page 2 fails: no level line, the cut text, the hold stays', async () => {
    const d = await heldSet('projectPeople250PageFails', 'p0');
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    expect(await within(d).findByText(strings['pp.held.cut'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(d).not.toHaveTextContent(anyState);
    expect(within(d).getByText(strings['pp.lvl.held'])).toBeInTheDocument();
  }, 60000);

  it('the member is in the first 1,000 rows of a longer list: no level line, the cut text', async () => {
    const d = await heldSet('projectPeople1200Lost', 'q0');
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.held.check'] }));
    expect(await within(d).findByText(strings['pp.held.cut'], {}, { timeout: 20000 })).toBeInTheDocument();
    expect(d).not.toHaveTextContent(anyState);
  }, 90000);
});

describe('People writes: a member at Work on', () => {
  it('offers See and Work on only, and no controls for someone above them', async () => {
    const d = await openPeople('projectPeopleMember');
    const jane = personRow(d, 'jane_smith');
    // No row menu: only the level's help tip, which says why there is nothing to change.
    expect(within(jane).queryByRole('button', { name: 'Row actions' })).toBeNull();
    await userEvent.click(within(jane).getByRole('button'));
    expect(await screen.findByText(strings['pp.people.aboveYou'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.add'] }));
    const form = within(d).getByRole('form', { name: strings['pp.add'] });
    const radios = within(form).getAllByRole('radio').map((r) => r.closest('label')?.textContent ?? '');
    expect(radios.map((x) => x.slice(0, strings['pp.lvl.read'].length))).toContain(strings['pp.lvl.read']);
    expect(radios.some((x) => x.startsWith(strings['pp.lvl.delete']))).toBe(false);
    expect(within(form).getAllByRole('radio')).toHaveLength(2);
  }, 40000);
});
