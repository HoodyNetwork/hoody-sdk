// Vitest: "New VM" over its fixture states (fixtures.create.ts). One press sends one create holding only what was
// changed; an accepted create opens the VM's own screen; a create whose answer is not known is held, never sent again,
// and settled by a read of the VM list; a refusal says why and keeps the form; a Hub shown inside another page sends
// nothing.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld, heldChanges } from '@core';
import { setTarget } from '@core/ctx';
import kitStrings from '@kit/strings.en.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATE_LOCK } from './create';
import './fixtures'; // first: the state files below are loaded by it (an import cycle the other way round)
import { createLog, resetCreateFixtures, revealHiddenVms } from './fixtures.create';
import page from './page';
import strings from './strings.en.json';

const mocked = vi.hoisted(() => ({ framed: false }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), isFramed: () => mocked.framed }));

// Every case types into the form and most draw a second screen: far over the default budget on a loaded host.
vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 15000 };
const LONG = { timeout: 20000 };
const NEW = '/vms?new=1';
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const drawer = () => screen.findByRole('dialog', { name: /^New VM inside / }, WAIT);
const createButton = (d: HTMLElement) => within(d).getByRole('button', { name: strings['create.go'] });
/** Opens the form, names the VM and picks an empty disk (the one source that needs nothing else). */
async function fill(state: string, name = 'new-1'): Promise<HTMLElement> {
  await renderPage(page, { state, path: NEW });
  const d = await drawer();
  await userEvent.type(within(d).getByRole('textbox', { name: strings['create.name'] }), name);
  await userEvent.click(within(d).getByRole('radio', { name: strings['create.source.blank'] }));
  return d;
}
// Each case that may leave a create held uses a name of its own: the lock is per name, and a hold outlives its test.
const heldText = (name: string) => new RegExp(`A VM named ${name} may have been created inside `);

beforeEach(() => {
  mocked.framed = false;
  resetCreateFixtures();
});

describe('New VM: the form', () => {
  it('the list offers it and ?new=1 opens it', async () => {
    await renderPage(page, { state: 'create-ok' });
    await userEvent.click(await screen.findByRole('button', { name: strings['create.open'] }, WAIT));
    const d = await drawer();
    expect(within(d).getByText(strings['create.sum.label'])).toBeInTheDocument();
    expect(within(d).getByText(strings['create.next.nameEmpty'])).toBeInTheDocument();
  });

  it('Create with a field missing sends nothing and names the field', async () => {
    await renderPage(page, { state: 'create-ok', path: NEW });
    const d = await drawer();
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(strings['create.error.nameEmpty'], undefined, WAIT)).toBeInTheDocument();
    expect(createLog).toEqual([]);
  });

  it('a name a VM has already is refused before anything is sent', async () => {
    const d = await fill('create-ok', 'web-1');
    expect(await within(d).findByText(strings['create.error.nameTaken'], undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(createButton(d));
    expect(createLog).toEqual([]);
  });

  it('a computer without UEFI cannot pick Windows, and says why', async () => {
    await renderPage(page, { state: 'create-bare', path: NEW });
    const d = await drawer();
    expect(within(d).getByRole('radio', { name: new RegExp(`^${strings['create.system.windows-11']}`) })).toBeDisabled();
    expect(within(d).getAllByText(strings['create.system.needsUefi']).length).toBeGreaterThan(0);
    expect(within(d).getByRole('radio', { name: strings['create.system.linux'] })).not.toBeDisabled();
    // No template on this computer: the source is not offered.
    expect(within(d).queryByRole('radio', { name: strings['create.source.template'] })).toBeNull();
  });

  it('an image store that cannot be read says so and offers a file instead', async () => {
    await renderPage(page, { state: 'create-images-error', path: NEW });
    const d = await drawer();
    expect(await within(d).findByText(strings['create.imagesFail'], undefined, WAIT)).toBeInTheDocument();
    expect(within(d).getByRole('radio', { name: strings['create.imageFrom.path'] })).toBeInTheDocument();
  });
});

describe('New VM: the create', () => {
  it('sends one create with only what was changed, then opens the VM being made', async () => {
    const d = await fill('create-ok');
    await userEvent.click(createButton(d));
    await waitFor(() => expect(createLog).toHaveLength(1), WAIT);
    expect(createLog[0]).toEqual({ name: 'new-1', source: { type: 'blank', gib: 20 }, memory_mib: 2048, vcpus: 2, os: 'linux', display: 'auto' });
    expect(await screen.findByRole('heading', { name: 'new-1' }, LONG)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^New VM inside / })).toBeNull(), WAIT);
    expect(createLog).toHaveLength(1);
    expect(heldChanges(CREATE_LOCK)).toEqual([]);
  });

  it('a lost answer is held, never sent again, and the VM list proves it was created', async () => {
    const d = await fill('create-lost', 'lost-1');
    await userEvent.click(createButton(d));
    expect(await screen.findByText(heldText('lost-1'), undefined, WAIT)).toBeInTheDocument();
    const held = heldChanges(CREATE_LOCK);
    expect(held).toHaveLength(1);
    expect(held[0]!.identity).toMatchObject({ name: 'lost-1', before: [] });
    // While it is held the footer's Create is there and off: pressing it again sends nothing.
    const again = screen.getByRole('button', { name: strings['create.go'] });
    expect(again.getAttribute('aria-disabled') === 'true' || (again as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(again);
    await new Promise((r) => setTimeout(r, 300));
    expect(createLog).toHaveLength(1);
    // A read shows the VM under the name with a new id: created. Its screen opens.
    await userEvent.click(await screen.findByRole('button', { name: kitStrings['outcome.pending.check'] }, WAIT));
    expect(await screen.findByRole('heading', { level: 1, name: 'lost-1' }, LONG)).toBeInTheDocument();
    await waitFor(() => expect(heldChanges(CREATE_LOCK)).toEqual([]), WAIT);
    expect(createLog).toHaveLength(1);
  });

  it('a lost answer with no VM in the list stays held: Check again reads, and never sends', async () => {
    const d = await fill('create-lost-nothing', 'lost-2');
    await userEvent.click(createButton(d));
    expect(await screen.findByText(heldText('lost-2'), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: kitStrings['outcome.pending.check'] }, WAIT));
    expect(await screen.findByText(strings['create.held.notYet'], { exact: false }, WAIT)).toBeInTheDocument();
    expect(heldChanges(CREATE_LOCK)).toHaveLength(1);
    expect(createLog).toHaveLength(1);
    expect(screen.queryByText(say('create.notMade', { vm: 'lost-2' }), { exact: false })).toBeNull();
    // Stop tracking frees exactly this send, says nothing about the outcome, and brings the form back as typed.
    await userEvent.click(screen.getByRole('button', { name: kitStrings['held.dismiss'] }));
    await userEvent.click(await screen.findByRole('button', { name: kitStrings['held.dismissGo'] }, WAIT));
    await waitFor(() => expect(heldChanges(CREATE_LOCK)).toEqual([]), WAIT);
    expect(await screen.findByRole('textbox', { name: strings['create.name'] }, WAIT)).toHaveValue('lost-2');
    expect(screen.queryByText(say('create.notMade', { vm: 'lost-2' }), { exact: false })).toBeNull();
    expect(createLog).toHaveLength(1);
  });

  it('a lost answer whose create then failed: the list proves it was not created, and the form comes back as typed', async () => {
    const d = await fill('create-lost-failed', 'lost-3');
    await userEvent.click(createButton(d));
    expect(await screen.findByText(heldText('lost-3'), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: kitStrings['outcome.pending.check'] }, WAIT));
    expect(await screen.findByText(say('create.notMade', { vm: 'lost-3' }), { exact: false }, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(heldChanges(CREATE_LOCK)).toEqual([]), WAIT);
    expect(await screen.findByRole('textbox', { name: strings['create.name'] }, WAIT)).toHaveValue('lost-3');
    expect(createLog).toHaveLength(1);
  });

  it('the ids under the name come from a list read at the press: an earlier failed create the screen did not show proves nothing', async () => {
    const d = await fill('create-stale-failed', 'again-1');
    // The program lists an earlier failed create of again-1 from now on; the page still shows its earlier list.
    revealHiddenVms();
    await userEvent.click(createButton(d));
    expect(await screen.findByText(heldText('again-1'), undefined, WAIT)).toBeInTheDocument();
    // A read lists only that earlier failed row, under its old id: the create stays held, and nothing is said.
    await userEvent.click(await screen.findByRole('button', { name: kitStrings['outcome.pending.check'] }, WAIT));
    expect(await screen.findByText(strings['create.held.notYet'], { exact: false }, WAIT)).toBeInTheDocument();
    expect(heldChanges(CREATE_LOCK)).toHaveLength(1);
    expect(screen.queryByText(say('create.notMade', { vm: 'again-1' }), { exact: false })).toBeNull();
    expect(createLog).toHaveLength(1);
    // The earlier row's id is the create's baseline.
    expect(heldChanges(CREATE_LOCK)[0]!.identity).toMatchObject({ name: 'again-1', before: ['0195c0de00000777'] });
  });

  it('a VM of the name the screen did not show yet: the press reads the list, sends nothing and says the name is taken', async () => {
    const d = await fill('create-stale-taken', 'taken-1');
    revealHiddenVms();
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(strings['create.error.nameTaken'], undefined, WAIT)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(createLog).toEqual([]);
    expect(heldChanges(CREATE_LOCK)).toEqual([]);
  });

  it('a failed create of the name listed without an id at the press: nothing is sent, and the form says why', async () => {
    const d = await fill('create-stale-noid', 'taken-2');
    revealHiddenVms();
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(say('create.preflight.noId', { vm: 'taken-2' }), undefined, WAIT)).toBeInTheDocument();
    expect(createLog).toEqual([]);
    expect(heldChanges(CREATE_LOCK)).toEqual([]);
  });

  it('a list that cannot be read at the press: nothing is sent, and the form says why', async () => {
    const d = await fill('create-stale-unread', 'new-5');
    revealHiddenVms();
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(strings['create.preflight.listUnread'], undefined, WAIT)).toBeInTheDocument();
    expect(createLog).toEqual([]);
    expect(heldChanges(CREATE_LOCK)).toEqual([]);
  });

  it('"was not created" about one computer is gone once another computer is shown', async () => {
    await renderPage(page, { state: 'create-two', path: NEW, realm: 'all' });
    const show = (name: string) => {
      const c = fixtureWorld.computer(name);
      act(() => { setTarget({ project: { id: c.project_id }, container: { id: c.id, server_name: c.server_name } }); });
    };
    // Both computers are read once, so switching back shows the other one at once from what was read.
    show('granite');
    await screen.findByRole('dialog', { name: 'New VM inside granite' }, LONG);
    await screen.findByRole('textbox', { name: strings['create.name'] }, WAIT);
    show('atlas');
    const d = await screen.findByRole('dialog', { name: 'New VM inside atlas' }, LONG);
    await userEvent.type(await within(d).findByRole('textbox', { name: strings['create.name'] }, WAIT), 'lost-9');
    await userEvent.click(within(d).getByRole('radio', { name: strings['create.source.blank'] }));
    await userEvent.click(createButton(d));
    await userEvent.click(await screen.findByRole('button', { name: kitStrings['outcome.pending.check'] }, WAIT));
    const notMade = say('create.notMade', { vm: 'lost-9' });
    expect(await screen.findByText(notMade, { exact: false }, WAIT)).toBeInTheDocument();
    show('granite');
    expect(await screen.findByRole('dialog', { name: 'New VM inside granite' }, LONG)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(notMade, { exact: false })).toBeNull(), WAIT);
    expect(createLog).toHaveLength(1);
  }, 90000);

  it('not enough disk is no answer to the create: it is accepted, and the VM\'s own screen opens', async () => {
    const d = await fill('create-no-space', 'full-1');
    await userEvent.click(createButton(d));
    expect(await screen.findByRole('heading', { level: 1, name: 'full-1' }, LONG)).toBeInTheDocument();
    expect(heldChanges(CREATE_LOCK)).toEqual([]);
    expect(createLog).toHaveLength(1);
  });

  it('while the VM list cannot be read nothing is sent: an earlier VM of the name could not be told apart', async () => {
    const d = await fill('create-list-error');
    expect(within(d).getByText(strings['create.next.listUnread'])).toBeInTheDocument();
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(strings['create.error.listUnread'], undefined, WAIT)).toBeInTheDocument();
    expect(createLog).toEqual([]);
  });

  it('an image made for another kind of machine cannot be picked', async () => {
    await renderPage(page, { state: 'create-ok', path: NEW });
    const d = await drawer();
    await userEvent.click(await within(d).findByRole('button', { name: new RegExp(strings['create.image']) }, WAIT));
    const arm = await screen.findByRole('option', { name: /Debian 13 \(ARM\)/ }, WAIT);
    expect(arm).toHaveAttribute('aria-disabled', 'true');
    expect(arm.textContent).toContain(strings['create.image.otherMachine']);
  });

  it('a refusal says why in the form\'s own words, holds nothing and keeps what was typed', async () => {
    const d = await fill('create-refused', 'dup-1');
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(strings['create.refused.AlreadyExists'], { exact: false }, WAIT)).toBeInTheDocument();
    expect(heldChanges(CREATE_LOCK)).toEqual([]);
    expect(within(d).getByRole('textbox', { name: strings['create.name'] })).toHaveValue('dup-1');
    expect(createLog).toHaveLength(1);
  });

  it('inside another page nothing is sent, and the form says so', async () => {
    mocked.framed = true;
    const d = await fill('create-ok');
    expect(within(d).getByText(strings['create.framed'])).toBeInTheDocument();
    const b = createButton(d);
    expect(b.getAttribute('aria-disabled') === 'true' || (b as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(b);
    await new Promise((r) => setTimeout(r, 300));
    expect(createLog).toEqual([]);
  });
});
