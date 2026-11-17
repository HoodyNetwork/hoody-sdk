// Vitest: the Computers zero state. "Your first computer is being prepared" shows only with positive evidence:
// a computer create of this browser still out or held. A realm with no computer and no setup record offers Create;
// an unknown setup state says so with Check again. Never "being prepared" from a guess.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadChangesForTests, resetChanges } from '@core/changes';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const PREPARING = 'Your first computer is being prepared';
const CREATE_FIRST = 'Get your first computer';
const COULD_NOT_CHECK = "We couldn't check whether a computer is being set up";
const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';

// realm: where the mocked create was sent; the mocks keep core's view filter (o.realm 'all' shows every realm).
const mock = vi.hoisted(() => ({ creating: false, unattributed: false, held: false, converted: false, realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', setupFails: false }));
const inView = (o?: unknown): boolean => { const r = (o as { realm?: string } | undefined)?.realm; return r === undefined || r === 'all' || r === mock.realm; };
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const sending = core.sendingChanges as (lock: string, o?: unknown) => unknown[];
  const heldOf = core.heldChanges as (lock: string, o?: unknown) => unknown[];
  return {
    ...core,
    // creating: this browser's computer create is out (the positive evidence).
    // unattributed: a sending row this browser cannot attribute (another tab, a made-up record): no evidence.
    sendingChanges: (lock: string, o?: unknown) => ((mock.creating || mock.unattributed) && lock === 'computer.create' && inView(o) ? [{ identity: null, target: null, realm: mock.realm, by: undefined, from: null, here: true, attributed: mock.creating }] : sending(lock, o)),
    // held: this browser's create came back unknown and is held.
    // held: this browser's create came back unknown and is held (a sender and an identity). converted: an older
    // record converted with metadata made from its scope, as core lists it (changes.converted-create.test.ts): no
    // sender, no identity, realm null (so every realm view lists it).
    heldChanges: (lock: string, o?: unknown) => (lock === 'computer.create' && mock.converted ? [{ key: null, identity: undefined, target: null, realm: null, at: 1, by: undefined, from: null, persisted: true, hold: 'h', seq: 1 }]
      : mock.held && lock === 'computer.create' && inView(o) ? [{ key: 'k', identity: { project: 'p1', name: 'atlas' }, target: null, realm: mock.realm, at: 1, by: 'q:create@computer.create', from: null, persisted: true, hold: 'h', seq: 1 }] : heldOf(lock, o)),
    // setupFails: an earlier answer is cached and the latest setup read failed (TanStack keeps data on a failed refetch).
    useSetupState: (o?: unknown) => { const r = (core.useSetupState as (o?: unknown) => Record<string, unknown>)(o); return mock.setupFails ? { ...r, isError: true, data: { kind: 'empty', freeSetup: false } } : r; },
  };
});

// Every case starts with no mocked evidence: a case that fails before its own reset must not leave a flag on for the next.
beforeEach(() => {
  Object.assign(mock, { creating: false, unattributed: false, held: false, converted: false, setupFails: false, realm: R1 });
});

describe('computers zero state', () => {
  it('the exact case: a realm with zero computers and no setup record shows Create, not "being prepared"', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
  });
  it('all realms, nothing claimed: Create, not "being prepared"', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptyNone', realm: 'all' });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
  });
  it('a realm whose account owns its free server (already_claimed): Create, not "being prepared" (the free computer never lands in a realm)', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptyClaimed', realm: R1 });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
  });
  it('all realms, free server owned (already_claimed) but nothing reports preparation: Create, never "being prepared"', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptyClaimed', realm: 'all' });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
  });
  it('the setup state cannot be read: "couldn\'t check" with Check again, never "being prepared"', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptySetupDown', realm: R1 });
    expect(await screen.findByText(COULD_NOT_CHECK, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['zero.retry'] })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
  });
  it('positive evidence: this browser\'s computer create is out, so "being prepared" shows', async () => {
    mock.creating = true;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByText(PREPARING, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CREATE_FIRST })).toBeNull();
    mock.creating = false;
  });
  it('an unattributed sending create row is no evidence: Create, not "being prepared"', async () => {
    mock.unattributed = true;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
    mock.unattributed = false;
  });
  it('the setup read still out: never "being prepared" while it waits', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptySetupSlow', realm: R1 });
    await screen.findByRole('heading', { level: 1 }, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByText(PREPARING)).toBeNull();
    expect(screen.queryByRole('button', { name: CREATE_FIRST })).toBeNull();
  });
  it('a create sent in another realm is no evidence here: Create, not "being prepared" (the shown realm filters)', async () => {
    mock.creating = true; mock.realm = 'bbbbbbbbbbbbbbbbbbbbbbb2';
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
    mock.creating = false; mock.realm = R1;
  });
  it('a create held in another realm is no evidence here: Create, not "being prepared"', async () => {
    mock.held = true; mock.realm = 'bbbbbbbbbbbbbbbbbbbbbbb2';
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
    mock.held = false; mock.realm = R1;
  });
  it('a token session with no computer sees the empty state (never blank, never "being prepared"), without Create', async () => {
    await renderPage(page, { state: 'emptyLimited', realm: R1 });
    expect(await screen.findByText(strings['zero.empty.title'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).toBeNull();
    expect(screen.queryByRole('button', { name: CREATE_FIRST })).toBeNull();
  });
  it('a held create (outcome unknown) shows "being prepared" with Check on it, which opens the Create drawer; never failed', async () => {
    mock.held = true;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByText(PREPARING, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['zero.provisioning.heldBody'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['zero.provisioning.check'] }));
    expect(await screen.findByText(strings['create.title'], {}, { timeout: 8000 })).toBeInTheDocument();
    mock.held = false;
  });
  it('a converted older create hold (no sender, no identity) proves nothing: "couldn\'t check" with Check again, in every realm, never "being prepared"', async () => {
    mock.converted = true;
    for (const realm of [R1, 'bbbbbbbbbbbbbbbbbbbbbbb2']) {
      const view = await renderPage(page, { state: 'emptyNone', realm });
      expect(await screen.findByText(COULD_NOT_CHECK, {}, { timeout: 8000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: strings['zero.retry'] })).toBeInTheDocument();
      expect(screen.queryByText(PREPARING)).toBeNull();
      view.unmount();
    }
    mock.converted = false;
  });
  it('a failed setup read over a cached answer is "couldn\'t check", never the cached Create offer', async () => {
    mock.setupFails = true;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByText(COULD_NOT_CHECK, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CREATE_FIRST })).toBeNull();
    mock.setupFails = false;
  });
  it('control: an invite wall stays the invite wall', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'empty', realm: 'all' });
    expect(await screen.findByText(strings['zero.invite.title'], {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

// The cases above stand in for core's lock store with mocks. This one goes through the real store: the create is sent
// from the zero state's own drawer, its answer is lost (fixture emptyCreateUnknown), and core holds it with this
// browser as the sender and the computer as the identity. No mock flag is set, so sendingChanges and heldChanges are core's.
describe('computers zero state, through the real lock store', () => {
  afterEach(() => {
    // eslint-disable-next-line no-restricted-globals -- the held create this case made must not reach the next test
    localStorage.removeItem('hub.v3.changes');
    resetChanges();
    reloadChangesForTests();
  });
  it('a create sent from here whose answer is lost shows "being prepared" with Check, never failed and never Create', async () => {
    await renderPage(page, { state: 'emptyCreateUnknown', realm: R1 });
    await userEvent.click(await screen.findByRole('button', { name: CREATE_FIRST }, { timeout: 8000 }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['create.go'] }));
    expect(await within(dlg).findByText(/may already have been made/i, {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText(PREPARING, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['zero.provisioning.heldBody'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['zero.provisioning.check'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CREATE_FIRST })).toBeNull();
  }, 30000);
});
