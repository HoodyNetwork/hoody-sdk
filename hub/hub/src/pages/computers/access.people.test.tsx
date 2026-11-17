// "Only people or keys I pick" in the access drawer (C9): adding a key link or a person asks first, saying
// what it means; it sends one step at a time (the group, each program, everyone else kept out, last), each with
// If-Match on the version a fresh read after the previous answer gave (the API's step answers carry no version).
// The password or key is made here, sent only with its group step, shown once, and never kept: not in a held
// change, the page's storage or the page itself while masked. A lost answer holds the change: Check again runs the
// step's read-back, never sends that step again, and once it proves it, Finish adding sends only what is missing.
import { heldChanges, queryClient as coreQueryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness: another tab's sender on the same core, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { refreshAccess, useSetAccess } from './data';
import { accessAddElsewhere, accessSends, accessStepSends, computers, resetAccess } from './fixtures';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [ATLAS, , THIRD] = computers;
const LOGS_ONLY_NOTE = strings['acc.p.pickOneKey'];
if (!ATLAS || !THIRD) throw new Error('fixture computers');
// Both waits are 30 s, to allow for a slow test machine.
const SLOW = { timeout: 30000 };
const COLD = { timeout: 30000 };

// The last page render (its router: Back, the address).
let shown: Awaited<ReturnType<typeof openPermissions>>['rendered'];
async function openPeople(c: (typeof computers)[number], state?: string) {
  const d = await openPermissions(c, state);
  shown = d.rendered;
  await within(d).findByText(/^Now:/, undefined, COLD);
  await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.people']) }));
  // The add form and the new secret are in a drawer over the tab: the tests look at the whole page.
  return document.body;
}

/** The same, reached through the tabs (Overview, then back), so the page has a history entry to go Back to. */
async function fill(d: HTMLElement, add: 'acc.p.addKey' | 'acc.p.addPerson', name: string, picks: readonly (keyof typeof strings)[]) {
  await userEvent.click(within(d).getByRole('button', { name: strings[add] }));
  // The form is in its own drawer; the confirm asks over it.
  const f = await screen.findByRole('dialog');
  await userEvent.type(within(f).getByRole('textbox', { name: strings['acc.p.name'] }), name);
  for (const p of picks) await userEvent.click(within(f).getByRole('checkbox', { name: strings[p] }));
  await userEvent.click(within(f).getByRole('button', { name: strings['acc.p.continue'] }));
  return screen.findByRole('alertdialog');
}

// The new secret shows in the drawer; Done waits for the add's steps to end.
const pressDone = async () => {
  const done = () => screen.getByRole('button', { name: strings['acc.p.secretDone'] });
  await waitFor(() => expect(done()).not.toHaveAttribute('aria-disabled', 'true'), SLOW);
  await userEvent.click(done());
};
const confirmIn = (c: HTMLElement, label: keyof typeof strings) => userEvent.click(within(c).getByRole('button', { name: strings[label] }));
// The entries are one table; Remove sits in each row's menu.
const table = (d: HTMLElement) => within(d).getByRole('table', { name: strings['acc.p.title'] });
const entryRow = (d: HTMLElement, name: string) =>
  within(table(d)).getAllByRole('row').find((r) => r.hasAttribute('data-row-id') && r.textContent?.includes(name)) as HTMLElement;
async function removeEntry(d: HTMLElement, name: string) {
  await userEvent.click(within(entryRow(d, name)).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${strings['acc.p.removeLabel'].replace('{{name}}', name)}`) }));
}
/* eslint-disable no-restricted-globals -- the test reads the browser's storage to show a secret never reached it */
const kept = (secret: string) => {
  const all = [...Object.values(localStorage), ...Object.values(sessionStorage), JSON.stringify(heldChanges('computer.access', {}))].join('\n');
  return all.includes(secret);
};
/* eslint-enable no-restricted-globals */

/** Another tab's sender of a whole-document save, on the same core: its lost answer holds the computer's rules. */
let otherSet: ReturnType<typeof useSetAccess> | null = null;
function OtherTab() {
  otherSet = useSetAccess();
  return null;
}

describe('computers: access, only people or keys I pick', () => {
  beforeEach(() => resetAccess());

  // The file's first render pays the page's cold start: its own budget leaves room for it.
  it('a key link: the confirm says where the link ends up and how to take it back; four steps, in order, each on the last version', { timeout: 45000 }, async () => {
    const d = await openPeople(THIRD);
    expect(d).toHaveTextContent(strings['acc.p.none']);
    const c = await fill(d, 'acc.p.addKey', 'Build bot', ['acc.p.prog.terminal', 'acc.p.logs']);
    expect(c).toHaveTextContent(strings['acc.p.confirmKey']);
    expect(c).toHaveTextContent(/browser history.*Referer.*Share it only.*remove the key/s);
    expect(c).toHaveTextContent(strings['acc.p.confirmKeepOut']);
    expect(accessStepSends).toHaveLength(0);
    await confirmIn(c, 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, { timeout: 20000 });
    expect(accessStepSends.map((x) => [x.path.replace(/^.*\/proxy\/permissions/, ''), x.ifMatch])).toEqual([
      ['/groups/hub-key-build-bot/token', 'file:v0'],
      ['/permissions/hub-key-build-bot', 'file:v1'],
      ['/permissions/hub-key-build-bot', 'file:v2'],
      ['/default', 'file:v3'],
    ]);
    expect(accessStepSends.slice(1).map((x) => x.body)).toEqual([{ program: 'terminal', access: true }, { program: 'logs', access: true }, { default: 'deny' }]);
    const key = (accessStepSends[0]?.body as { param: string; value: string });
    expect(key.param).toBe('hub_key');
    expect(key.value).toMatch(/^[A-Za-z2-9]{32}$/);
    // Shown once, masked: the page holds bullets until Show; the key is in no store and no held change.
    await within(d).findByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.terminal']), undefined, SLOW);
    expect(d.innerHTML).not.toContain(key.value);
    expect(kept(key.value)).toBe(false);
    expect(d).toHaveTextContent('build-bot');
    expect(entryRow(d, 'build-bot')).toHaveTextContent('Terminal, Logs');
    // Done drops it for good.
    await pressDone();
    expect(within(d).queryByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.terminal']))).toBeNull();
  });

  it('a person: their sign-in name is the entry name, the password is made here (never 64 hex) with its own salt', async () => {
    const d = await openPeople(THIRD);
    const c = await fill(d, 'acc.p.addPerson', 'Ana Lopez', ['acc.p.prog.files']);
    expect(c).toHaveTextContent(strings['acc.p.confirmPerson'].replace('{{name}}', 'ana-lopez'));
    await confirmIn(c, 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    const b = accessStepSends[0]?.body as { username: string; password: string; salt: string };
    expect(accessStepSends[0]?.path).toMatch(/\/groups\/hub-person-ana-lopez\/password$/);
    expect(b.username).toBe('ana-lopez');
    expect(b.password).toMatch(/^[A-Za-z2-9]{20}$/);
    expect(b.password).not.toMatch(/^[0-9a-f]{64}$/);
    expect(b.salt).toMatch(/^[A-Za-z2-9]{16}$/);
    expect(within(d).getByText(strings['acc.p.signInName'])).toBeTruthy();
    expect(d.innerHTML).not.toContain(b.password);
    expect(kept(b.password)).toBe(false);
  });

  it('a lost answer holds the change: nothing more is sent, Check again never resends, and an unproved step stays held', async () => {
    const d = await openPeople(THIRD, 'accessStepLost');
    const c = await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']);
    await confirmIn(c, 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.held.step'], undefined, SLOW);
    expect(accessStepSends).toHaveLength(2);
    const secret = (accessStepSends[0]?.body as { value: string }).value;
    // The held change names the step, never the key.
    expect(JSON.stringify(heldChanges('computer.access', {}))).toContain('hub-key-ci');
    expect(kept(secret)).toBe(false);
    // The key stays on screen (it was stored): "not known yet whether saved" is not a failure.
    expect(d).toHaveTextContent(strings['acc.p.secretMaybe']);
    // The held step's band is in the secret's drawer, in reach: Check again never needs the key put away first.
    const secretDialog = screen.getByRole('dialog');
    expect(within(secretDialog).getByText(strings['acc.held.step'])).toBeInTheDocument();
    expect(within(secretDialog).getByRole('button', { name: strings['acc.held.check'] })).toBeInTheDocument();
    expect(screen.getAllByText(strings['acc.held.step'])).toHaveLength(1);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.check'] }));
    await waitFor(() => expect(d).toHaveTextContent(strings['acc.held.step']));
    expect(accessStepSends).toHaveLength(2);
    expect(within(d).queryByRole('button', { name: strings['acc.p.resume'] })).toBeNull();
    // Every other access change waits too, the key put away or not; the whole-document band never claims the step.
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.private']) })).toBeDisabled();
    expect(d).not.toHaveTextContent(strings['acc.held.other']);
    // While the step is unknown nothing calls the change cut short.
    expect(d).not.toHaveTextContent(strings['acc.p.unfinishedNothing'].replace('{{names}}', 'ci'));
    expect(d).not.toHaveTextContent(strings['acc.p.unfinishedOpen']);
    await pressDone();
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.private']) })).toBeDisabled();
    expect(within(d).getByRole('button', { name: strings['acc.p.addKey'] })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a held group step: the held change names the group and never the key it carried', async () => {
    const d = await openPeople(THIRD, 'accessStepLostFirst');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.held.step'], undefined, SLOW);
    expect(accessStepSends).toHaveLength(1);
    const secret = (accessStepSends[0]?.body as { value: string }).value;
    expect(JSON.stringify(heldChanges('computer.access', {}))).toContain('hub-key-ci');
    expect(kept(secret)).toBe(false);
  });

  it('a group step that met changed rules was never stored: its key goes, and nothing offers to send the group again without it', async () => {
    const d = await openPeople(THIRD, 'accessStepStaleFirst');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.p.stale'], undefined, SLOW);
    expect(within(d).queryByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.files']))).toBeNull();
    await waitFor(() => expect(within(d).queryByRole('button', { name: strings['acc.p.resume'] })).toBeNull());
    expect(accessStepSends).toHaveLength(1);
  });

  it('leaving mid-change is refused: the tab and the drawer stay, the drawer says to wait, and the run sends its remaining steps', async () => {
    const d = await openPeople(THIRD, 'accessStepSlow');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await waitFor(() => expect(accessStepSends).toHaveLength(2));
    // The drawer keeps the tabs out of reach of a pointer; a navigation still arrives (Back, a typed address), and is
    // held. The kit's own tests cover the browser's Back; the test router has no popstate, so another page stands in.
    shown.router.history.push('/home');
    await within(screen.getByRole('dialog')).findByText(/^Wait until this finishes/, undefined, SLOW);
    expect(shown.router.state.location.pathname).toBe('/computers');
    await waitFor(() => expect(accessStepSends).toHaveLength(3), { timeout: 15000 });
  }, 60000);

  it('once a fresh read proves the lost step, Finish adding sends only what is still missing', async () => {
    const d = await openPeople(THIRD, 'accessStepLostApplied');
    const c = await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files', 'acc.p.prog.terminal']);
    await confirmIn(c, 'acc.p.confirmGo');
    // Core's automatic read-back after the lost answer proves the held step; the band may already be gone.
    const check = within(d).queryAllByRole('button', { name: strings['acc.held.check'] })[0];
    if (check) await userEvent.click(check).catch(() => undefined);
    await userEvent.click(await within(d).findByRole('button', { name: strings['acc.p.resume'] }, SLOW));
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    expect(accessStepSends.map((x) => [x.path.replace(/^.*\/proxy\/permissions/, ''), (x.body as { program?: string }).program ?? null, x.ifMatch])).toEqual([
      ['/groups/hub-key-ci/token', null, 'file:v0'],
      ['/permissions/hub-key-ci', 'files', 'file:v1'],
      ['/permissions/hub-key-ci', 'terminal', 'file:v2'],
      ['/default', null, 'file:v3'],
    ]);
  });

  it('removing an entry asks first; the last one leaves the computer private', async () => {
    const d = await openPeople(THIRD);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    await pressDone();
    await removeEntry(d, 'ci');
    const c = await screen.findByRole('alertdialog');
    expect(c).toHaveTextContent(strings['acc.p.removeKey']);
    expect(c).toHaveTextContent(strings['acc.p.removeLast']);
    const before = accessStepSends.length;
    await confirmIn(c, 'acc.p.removeGo');
    await within(d).findByText(strings['acc.now.private'], undefined, SLOW);
    expect(accessStepSends.slice(before).map((x) => x.path.replace(/^.*\/proxy\/permissions/, ''))).toEqual(['/groups/hub-key-ci']);
  });

  it('a held step written only after the automatic read-back: Check again proves it and frees the drawer (a plain re-read would not)', async () => {
    const d = await openPeople(THIRD, 'accessStepLostLate');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.held.step'], undefined, SLOW);
    // The write lands after the automatic read-back; a plain re-read after it shows it, yet the hold stands.
    await new Promise((r) => setTimeout(r, 900));
    await pressDone();
    expect(d).toHaveTextContent(strings['acc.held.step']);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.check'] }));
    await waitFor(() => expect(d).not.toHaveTextContent(strings['acc.held.step']), SLOW);
    await userEvent.click(await within(d).findByRole('button', { name: strings['acc.p.resume'] }, SLOW));
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    // The held grant was never sent again: group, grant (lost), then everyone else kept out.
    expect(accessStepSends.map((x) => x.path.replace(/^.*\/proxy\/permissions/, ''))).toEqual(['/groups/hub-key-ci/token', '/permissions/hub-key-ci', '/default']);
  });

  it('a done answer no read has shown yet blocks every send, keeps the key, and only a newer read lets Finish adding send what is missing', async () => {
    const d = await openPeople(THIRD, 'accessStepReadFails');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.p.unreadWait'], undefined, SLOW);
    expect(accessStepSends).toHaveLength(1);
    const secret = (accessStepSends[0]?.body as { value: string }).value;
    expect(within(d).queryByRole('button', { name: strings['acc.p.resume'] })).toBeNull();
    expect(within(d).getByRole('button', { name: strings['acc.p.addKey'] })).toHaveAttribute('aria-disabled', 'true');
    // The failed re-read shows, and the key stays on screen beside it.
    expect(d).toHaveTextContent(strings['acc.error']);
    expect(d).toHaveTextContent(strings['acc.p.secretMaybe']);
    expect(kept(secret)).toBe(false);
    // A read that works shows the group in place: only its program and "everyone else kept out" go, on its version.
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.check'] }));
    await userEvent.click(await within(d).findByRole('button', { name: strings['acc.p.resume'] }, SLOW));
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    expect(accessStepSends.map((x) => [x.path.replace(/^.*\/proxy\/permissions/, ''), x.ifMatch])).toEqual([
      ['/groups/hub-key-ci/token', 'file:v0'],
      ['/permissions/hub-key-ci', 'file:v1'],
      ['/default', 'file:v2'],
    ]);
    expect(within(d).getByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.files']))).toBeInTheDocument();
  });

  it('from Only my IP: the add removes the address rule before keeping everyone else out, and the drawer stays on people throughout', async () => {
    const d = await openPeople(ATLAS);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    // Atlas already keeps everyone else out: no default step; the address group goes after the program.
    expect(accessStepSends.map((x) => [x.path.replace(/^.*\/proxy\/permissions/, ''), x.ifMatch])).toEqual([
      ['/groups/hub-key-ci/token', 'file:v4'],
      ['/permissions/hub-key-ci', 'file:v5'],
      ['/groups/hub-my-ip', 'file:v6'],
    ]);
    expect(within(d).getByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.files']))).toBeInTheDocument();
    expect(d).not.toHaveTextContent(strings['acc.p.unfinishedMyIp']);
  });

  it('rules that turn Advanced partway (another writer adds a hook) keep the panel and its key; each step goes once, on the version a fresh read gave', async () => {
    const d = await openPeople(THIRD, 'accessStepForeign');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.advanced'], undefined, SLOW);
    expect(within(d).getByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.files']))).toBeInTheDocument();
    await waitFor(() => expect(accessStepSends).toHaveLength(3), SLOW);
    expect(accessStepSends.map((x) => [x.path.replace(/^.*\/proxy\/permissions/, ''), x.ifMatch])).toEqual([
      ['/groups/hub-key-ci/token', 'file:v0'],
      ['/permissions/hub-key-ci', 'file:v2'],
      ['/default', 'file:v3'],
    ]);
    // Done puts the key away; the drawer then shows the rules as Advanced, sending nothing more.
    await pressDone();
    await waitFor(() => expect(within(d).queryByRole('button', { name: strings['acc.p.addKey'] })).toBeNull());
    expect(accessStepSends).toHaveLength(3);
  });

  it('leaving while the new key is on screen asks first: Keep editing keeps the tab, the drawer and the key', async () => {
    const d = await openPeople(THIRD);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    const label = strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.files']);
    await within(d).findByText(label, undefined, SLOW);
    await waitFor(() => expect(screen.getByRole('button', { name: strings['acc.p.secretDone'] })).not.toHaveAttribute('aria-disabled', 'true'), SLOW);
    const sends = accessStepSends.length;
    shown.router.history.push('/home');
    const drawer = screen.getByRole('dialog');
    await within(drawer).findByText(strings['acc.p.secretClose'], undefined, SLOW);
    await userEvent.click(within(drawer).getByRole('button', { name: /^Keep editing/ }));
    expect(shown.router.state.location.pathname).toBe('/computers');
    expect(within(d).getByText(label)).toBeInTheDocument();
    expect(accessStepSends).toHaveLength(sends);
    // Done is the way out.
    await pressDone();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
  }, 60000);

  it('the first entry: the secret drawer never says there are no entries yet', async () => {
    const d = await openPeople(THIRD);
    expect(d).toHaveTextContent(strings['acc.p.none']);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    expect(dialog).not.toHaveTextContent(strings['acc.p.none']);
    expect(dialog).toHaveTextContent(strings['perm.secretOnce']);
    await pressDone();
  });

  it('a dismissed lost group step: the key stays, and nothing of the change goes again until the rules read newer', async () => {
    const d = await openPeople(THIRD, 'accessStepLostFirst');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.held.step'], undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.dismiss'] }));
    await confirmIn(await screen.findByRole('alertdialog'), 'acc.held.dismissGo');
    await within(d).findByText(strings['acc.p.heldWait'], undefined, SLOW);
    expect(within(d).queryByRole('button', { name: strings['acc.p.resume'] })).toBeNull();
    expect(d).toHaveTextContent(strings['acc.p.secretMaybe']);
    expect(accessStepSends).toHaveLength(1);
  });

  it('a group step refused because another tab made a key of that name: the add is dropped, never finished for that key', async () => {
    const d = await openPeople(THIRD, 'accessStepStaleOther');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.p.stale'], undefined, SLOW);
    // The other tab's key reads in: it is listed, and nothing offers to send this add's programs for it.
    await within(d).findByText('ci', undefined, SLOW);
    await new Promise((r) => setTimeout(r, 200));
    expect(within(d).queryByRole('button', { name: strings['acc.p.resume'] })).toBeNull();
    expect(accessStepSends).toHaveLength(1);
  });

  it('each question names its entry and the computer', async () => {
    const d = await openPeople(THIRD);
    await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']);
    const add = await screen.findByRole('alertdialog', { name: strings['acc.p.confirmKeyTitle'].replace('{{key}}', 'ci').replace('{{computer}}', THIRD.name) });
    await confirmIn(add, 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    await pressDone();
    await removeEntry(d, 'ci');
    expect(await screen.findByRole('alertdialog', { name: strings['acc.p.removeTitle'].replace('{{name}}', 'ci').replace('{{computer}}', THIRD.name) })).toBeInTheDocument();
    for (const k of ['acc.p.confirmKeyTitle', 'acc.p.confirmPersonTitle', 'acc.p.removeTitle', 'acc.p.finishTitle'] as const) expect(strings[k]).toContain('{{computer}}');
  });

  it('an entry removed elsewhere while its Remove question is open: the question closes and nothing is sent', async () => {
    const d = await openPeople(THIRD);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    await pressDone();
    await removeEntry(d, 'ci');
    await screen.findByRole('alertdialog');
    // The rules as another tab left them: the entry is gone (the fixture's own document again).
    resetAccess();
    await refreshAccess();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(accessStepSends).toHaveLength(0);
  });

  it('a Save question asked over rules that read newer since (another entry added elsewhere) closes unanswered: nothing is written over it', async () => {
    const d = await openPeople(THIRD);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    await pressDone();
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.private']) }));
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.save'] }));
    await screen.findByRole('alertdialog', { name: strings['acc.confirm.title'].replace('{{name}}', THIRD.name) });
    // Another tab adds a key link: Private is still a change the Hub could write, but over rules nobody was asked about.
    accessAddElsewhere(THIRD.id, 'hub-key-zed');
    await refreshAccess();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(accessSends).toHaveLength(0);
    // Asked again, the question is over the rules as they read now.
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.save'] }));
    await confirmIn(await screen.findByRole('alertdialog'), 'acc.confirm.go');
    await waitFor(() => expect(accessSends).toHaveLength(1), SLOW);
    expect(accessSends[0]?.ifMatch).not.toBe('file:v0');
  }, 60000);

  it('a change held by another tab while the add form is open: Continue says why it is off and asks nothing', async () => {
    const d = await openPeople(THIRD, 'accessLost');
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addKey'] }));
    const f = await screen.findByRole('dialog');
    await userEvent.type(within(f).getByRole('textbox', { name: strings['acc.p.name'] }), 'ci');
    await userEvent.click(within(f).getByRole('checkbox', { name: strings['acc.p.prog.files'] }));
    const go = within(f).getByRole('button', { name: strings['acc.p.continue'] });
    expect(go).not.toHaveAttribute('aria-disabled', 'true');
    // Another tab saves Private and its answer is lost: the computer's rules are held, and nothing may be added here.
    render(createElement(QueryClientProvider, { client: coreQueryClient }, createElement(OtherTab)));
    await act(async () => {
      await otherSet!.mutateAsync({ id: THIRD.id, want: { kind: 'private' }, from: 0, body: { computer: THIRD.id, groups: {}, permissions: {}, default: 'deny' } }).catch(() => undefined);
    });
    await waitFor(() => expect(heldChanges('computer.access')[0]?.hold).toBeTruthy(), SLOW);
    await waitFor(() => expect(within(f).getByRole('button', { name: new RegExp(`^${strings['acc.p.continue']}`) })).toHaveAttribute('aria-disabled', 'true'), SLOW);
    await userEvent.click(within(f).getByRole('button', { name: new RegExp(`^${strings['acc.p.continue']}`) }));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(accessStepSends).toHaveLength(0);
  }, 40000);

  it('an entry removed and made again elsewhere under the same name while its Remove question is open: the question closes, and the new entry is not removed', async () => {
    const d = await openPeople(THIRD);
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    await pressDone();
    await waitFor(() => expect(accessStepSends.length).toBeGreaterThan(0));
    const sent = accessStepSends.length;
    await removeEntry(d, 'ci');
    await screen.findByRole('alertdialog');
    // Another tab stores the group again (another key under the same name), one version on: the row reads the same.
    accessAddElsewhere(THIRD.id, 'hub-key-ci');
    await refreshAccess();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(entryRow(d, 'ci')).toBeTruthy();
    expect(accessStepSends).toHaveLength(sent);
  }, 40000);

  it('a name taken elsewhere while the confirm is open: nothing is sent (never a grant to that entry); the form says the name is taken', async () => {
    const d = await openPeople(THIRD);
    await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.terminal']);
    accessAddElsewhere(THIRD.id, 'hub-key-ci');
    await refreshAccess();
    // The question was asked over rules that have moved on: it closes unanswered, back to the form.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    await within(d).findByText(strings['acc.p.nameTaken'], undefined, SLOW);
    await new Promise((r) => setTimeout(r, 300));
    expect(accessStepSends).toHaveLength(0);
    expect(within(d).queryByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.terminal']))).toBeNull();
  });

  it('from Only my IP, cut before the address was removed: removing a key says that address still gets in', async () => {
    const d = await openPeople(ATLAS, 'accessStepStaleLast');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.p.stale'], undefined, SLOW);
    await pressDone();
    await removeEntry(d, 'ci');
    const c = await screen.findByRole('alertdialog');
    expect(c).toHaveTextContent(strings['acc.p.removeMyIp']);
    expect(c).not.toHaveTextContent(strings['acc.p.removeKey']);
  });

  it('a computer with no address yet: a key cannot be made (no link to give); a person can', async () => {
    const d = await openPeople(THIRD, 'noServer');
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addKey'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ci');
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.prog.files'] }));
    expect(d).toHaveTextContent(strings['acc.p.noAddress']);
    expect(within(d).getByRole('button', { name: strings['acc.p.continue'] })).toHaveAttribute('aria-disabled', 'true');
    // Cancel on a started form asks, as the drawer's own close does.
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.cancel'] }));
    await userEvent.click(await within(d).findByRole('button', { name: /^Discard/ }, SLOW));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addPerson'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ana');
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.prog.files'] }));
    expect(within(d).getByRole('button', { name: strings['acc.p.continue'] })).not.toHaveAttribute('aria-disabled');
  });

  it('removing while everyone else is still let in says the links keep opening, never that they stop working', async () => {
    const d = await openPeople(THIRD, 'accessStepStaleLast');
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.p.stale'], undefined, SLOW);
    await pressDone();
    await removeEntry(d, 'ci');
    const c = await screen.findByRole('alertdialog');
    expect(c).toHaveTextContent(strings['acc.p.removeKeyOpen']);
    expect(c).not.toHaveTextContent(strings['acc.p.removeKey']);
    expect(c).not.toHaveTextContent(strings['acc.p.removeLast']);
  });

  it('the verdict plate says what the rules do now; the entries are a table (Name, Kind, Can open) under "People and key links", with the adds in its head', async () => {
    const d = await openPeople(THIRD);
    // The Now line is the body's verdict plate, said once; what the rules cover is the choice's own help.
    expect(within(d).getByRole('group', { name: strings['acc.verdict'] })).toHaveTextContent(/Now:/);
    expect(within(d).getAllByText(/^Now:/)).toHaveLength(1);
    expect(within(d).getByText(strings['acc.lede'])).toBeInTheDocument();
    expect(within(d).getByRole('radiogroup', { name: strings['acc.choice'] })).toBeInTheDocument();
    const head = within(d).getByRole('group', { name: strings['acc.p.title'] });
    expect(within(head).getByRole('button', { name: strings['acc.p.addPerson'] })).toBeInTheDocument();
    await confirmIn(await fill(d, 'acc.p.addKey', 'ci', ['acc.p.prog.files']), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    await pressDone();
    const row = entryRow(d, 'ci');
    expect(row).toHaveTextContent(strings['acc.p.key']);
    expect(row).toHaveTextContent(strings['acc.p.prog.files']);
    // No loose Remove button: it is in the row menu, with the same confirm.
    expect(within(d).queryByRole('button', { name: /^Remove/ })).toBeNull();
    await removeEntry(d, 'ci');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(strings['acc.p.removeKey']);
  });

  it('a half-filled form asks before it closes: Discard drops it, nothing is sent, and the form is empty when opened again', async () => {
    const d = await openPeople(THIRD);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addPerson'] }));
    const f = await screen.findByRole('dialog');
    await userEvent.type(within(f).getByRole('textbox', { name: strings['acc.p.name'] }), 'ana');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await within(f).findByRole('button', { name: /^Discard/ }, SLOW));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addPerson'] }));
    expect(within(await screen.findByRole('dialog')).getByRole('textbox', { name: strings['acc.p.name'] })).toHaveValue('');
    expect(accessStepSends).toHaveLength(0);
  });

  it('a key needs a program: Logs alone cannot continue (it would leave no link to give); a person may have Logs alone', async () => {
    const d = await openPeople(THIRD);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addKey'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ci');
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.logs'] }));
    expect(d).toHaveTextContent(LOGS_ONLY_NOTE);
    expect(within(d).getByRole('button', { name: strings['acc.p.continue'] })).toHaveAttribute('aria-disabled', 'true');
    // Cancel on a started form asks, as the drawer's own close does.
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.cancel'] }));
    await userEvent.click(await within(d).findByRole('button', { name: /^Discard/ }, SLOW));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addPerson'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ana');
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.logs'] }));
    expect(within(d).getByRole('button', { name: strings['acc.p.continue'] })).not.toHaveAttribute('aria-disabled');
  });

  it('a name already used, or with nothing usable, cannot continue; nor can an empty pick', async () => {
    const d = await openPeople(THIRD);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addPerson'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), '!!!');
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.prog.files'] }));
    expect(d).toHaveTextContent(strings['acc.p.nameBad']);
    expect(within(d).getByRole('button', { name: strings['acc.p.continue'] })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(within(d).getByRole('textbox', { name: strings['acc.p.name'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ana');
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.prog.files'] }));
    expect(d).toHaveTextContent(strings['acc.p.pickOne']);
    expect(within(d).getByRole('button', { name: strings['acc.p.continue'] })).toHaveAttribute('aria-disabled', 'true');
    // Off with its reason, the button stays focusable but a press asks nothing: no confirm opens.
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.continue'] }));
    expect(screen.queryByRole('button', { name: strings['acc.p.confirmGo'] })).toBeNull();
  });

  it('All programs: one "*" rule (allowed, nothing else), logs still their own; the single programs show covered and locked; a link for each program', async () => {
    const d = await openPeople(THIRD);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addKey'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ci');
    await userEvent.click(within(d).getByRole('checkbox', { name: new RegExp(`^${strings['acc.p.all']}`) }));
    for (const p of ['agent', 'terminal', 'screen', 'files', 'browser'] as const) {
      const box = within(d).getByRole('checkbox', { name: strings[`acc.p.prog.${p}`] });
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['acc.p.logs'] }));
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.continue'] }));
    await confirmIn(await screen.findByRole('alertdialog'), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    expect(accessStepSends.slice(1, 3).map((x) => x.body)).toEqual([{ program: '*', access: true }, { program: 'logs', access: true }]);
    expect(accessStepSends).toHaveLength(4);
    expect(table(d)).toHaveTextContent(`${strings['acc.adv.everyProgram']}, Logs`);
    for (const p of ['agent', 'terminal', 'files', 'browser'] as const) {
      expect(within(d).getByText(strings['acc.p.secretKey'].replace('{{program}}', strings[`acc.p.prog.${p}`]))).toBeTruthy();
    }
  });

  it('the programs go in the order they were ticked; ticking then unticking All programs brings back the ones picked before', async () => {
    const d = await openPeople(THIRD);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addKey'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'order');
    const box = (p: 'agent' | 'terminal' | 'files') => within(d).getByRole('checkbox', { name: strings[`acc.p.prog.${p}`] });
    await userEvent.click(box('files'));
    await userEvent.click(box('terminal'));
    const all = within(d).getByRole('checkbox', { name: new RegExp(`^${strings['acc.p.all']}`) });
    await userEvent.click(all);
    expect(box('agent')).toBeChecked();
    await userEvent.click(all);
    expect(box('files')).toBeChecked();
    expect(box('terminal')).toBeChecked();
    expect(box('agent')).not.toBeChecked();
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.continue'] }));
    await confirmIn(await screen.findByRole('alertdialog'), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.now.people'], undefined, SLOW);
    expect(accessStepSends.slice(1, 3).map((x) => x.body)).toEqual([{ program: 'files', access: true }, { program: 'terminal', access: true }]);
  });

  it('an API that does not take "*" yet refuses that step: the refusal shows, nothing more is sent, and the group already made stays', async () => {
    const d = await openPeople(THIRD, 'accessWildOld');
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.addKey'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['acc.p.name'] }), 'ci');
    await userEvent.click(within(d).getByRole('checkbox', { name: new RegExp(`^${strings['acc.p.all']}`) }));
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.p.continue'] }));
    await confirmIn(await screen.findByRole('alertdialog'), 'acc.p.confirmGo');
    await within(d).findByText(strings['acc.p.refused'], undefined, SLOW);
    expect(accessStepSends).toHaveLength(2);
    // The key was stored with its group: it stays on screen, and is never called unknown.
    expect(within(d).getByText(strings['acc.p.secretKey'].replace('{{program}}', strings['acc.p.prog.files']))).toBeTruthy();
    expect(d).not.toHaveTextContent(strings['acc.p.secretMaybe']);
    expect(d).not.toHaveTextContent(strings['acc.now.people']);
  });
});
