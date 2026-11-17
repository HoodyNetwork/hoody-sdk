// New workflow drawer over a fake create api: one PUT per Create, a lost answer held (no Create, never resent,
// Check again only reads), a held create's Band shown before any name is typed, a held name's Create a ReasonButton
// that sends nothing, Stop tracking behind its confirm, and A copy of… reading its source before it can be sent. The
// races: a PUT held open (no second PUT, no Stop tracking), the drawer bound to the scope it opened on,
// and copy reads that failed, came back out of order or came back after Start from changed.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture } from '@core';
import { setRealm, setTarget } from '@core/ctx';
import { boot, deferred, R1, R2, TARGET } from '@core/test/env';
import type * as DataModule from './data';
import { createCreateAttempts, sendCreate, type CreateAttempts } from './createAttempts';
import { parseWorkflows } from './logic';
import { blankDefinition, HeldCreates, NewWorkflow } from './New';
import type { Settled, WorkflowCreateApi } from './sourceApi';
import strings from './New.strings.en.json';

const io = vi.hoisted(() => ({ refreshed: 0 }));
vi.mock('./data', async (orig) => ({ ...(await orig<typeof DataModule>()), refreshWorkflows: () => void io.refreshed++ }));
// The drawer's asking side has its own tests (New.ask.test.tsx); here it only hands over to the form these tests are the oracle of.
vi.mock('./NewAsk', () => ({
  useNewAsk: () => ({ text: '', busy: false, phase: { k: 'none' } }),
  AskPrimary: () => null,
  AskBody: () => null,
}));

const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const OK: Settled = { ok: true, body: { output: 'created', is_error: false } };
const LOST: Settled = { ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false } };
const doc = (d: object, rev = 'r1'): Settled => ({ ok: true, body: { status: 'ok', output: `revision: ${rev}\n${JSON.stringify(d, null, 2)}`, is_error: false } });
const COPIED = { summary: 'copied', entry_point: { id: 'go' }, steps: { go: { type: 'bash', command: 'make' } } };
const listed = parseWorkflows({ items: [{ name: 'src', entry_point: 'go' }, { name: 'Other', entry_point: 'a' }] }, { hiddenCap: false });

/** A fake api: creates answer `create`, reads answer `get`; every call is counted by name. */
function fake(create: () => Promise<Settled> = async () => OK, get: (name: string) => Promise<Settled> = async () => LOST) {
  const sent = { creates: [] as Array<{ name: string; def: Record<string, unknown> }>, gets: [] as string[] };
  const make = (name: string): WorkflowCreateApi => ({
    create: (def) => { sent.creates.push({ name, def }); return create(); },
    get: () => { sent.gets.push(name); return get(name); },
  });
  return { sent, make };
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

let store: CreateAttempts;
let opened: string[];
beforeEach(() => { boot({ realm: R1 }); store = createCreateAttempts(); opened = []; io.refreshed = 0; });
afterEach(cleanup);

function open(f: ReturnType<typeof fake>, o: { copyOf?: string } = {}) {
  render(<NewWorkflow computer="box" realm={null} listed={listed} {...o} onClose={() => {}} onCreated={(n) => opened.push(n)} store={store} makeApi={f.make} />);
  if (!o.copyOf) fireEvent.click(screen.getByRole('radio', { name: words('new.mode.write') }));
}
const createButton = () => screen.getByRole('button', { name: words('new.create') });
const isOff = (b: HTMLElement) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
const nameBox = () => screen.getByRole('textbox', { name: words('new.name') });
const OTHER_DEF = { summary: 'other', entry_point: { id: 'x' }, steps: { x: { type: 'bash', command: 'ls' } } };
const fail: Settled = { ok: false, err: { kind: 'failed', code: 'not_found', status: 404, notApplied: true } };
async function pickCopy(name: string) {
  const box = screen.getByRole('combobox', { name: new RegExp(`^${words('new.copyOf')}`) });
  await userEvent.clear(box);
  await userEvent.type(box, name.slice(0, 3));
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('New workflow', () => {
  it('a name the computer already has: the outcome is the kit line alone and Open it sits with the drawer\'s actions', async () => {
    const f = fake(async () => ({ ok: false, err: { kind: 'failed', code: 'already_exists', status: 200, notApplied: true } }));
    open(f);
    await userEvent.type(nameBox(), 'mine');
    await userEvent.click(createButton());
    await settle();
    const said = screen.getByText(words('new.out.exists', { name: 'mine' }));
    const openIt = screen.getByRole('button', { name: words('new.open') });
    // Not inside the outcome line: an outcome slot holds the outcome only.
    expect(said.closest('[role="status"],[role="alert"]')?.contains(openIt) ?? false).toBe(false);
    expect(openIt.parentElement).toBe(createButton().parentElement);
    await userEvent.click(openIt);
    expect(opened).toEqual(['mine']);
  });
  it('Create sends one PUT of the blank definition, then the list opens it', async () => {
    const f = fake();
    open(f);
    await userEvent.type(screen.getByRole('textbox', { name: words('new.name') }), 'mine');
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([{ name: 'mine', def: JSON.parse(blankDefinition(words('new.blankSummary'))) }]);
    expect(opened).toEqual(['mine']);
    expect(io.refreshed).toBe(1);
  });

  it('a lost answer is held: Create held with its reason, never "created", Check again only reads', async () => {
    const f = fake(async () => LOST, async () => ({ ok: false, err: { kind: 'failed', code: 'not_found', status: 404, notApplied: false } }));
    open(f);
    await userEvent.type(screen.getByRole('textbox', { name: words('new.name') }), 'mine');
    await userEvent.click(createButton());
    await settle();
    expect(screen.getByText(words('new.out.unknown', { name: 'mine', computer: 'box' }))).toBeTruthy();
    expect(screen.queryByText(words('new.out.created', { name: 'mine', computer: 'box' }))).toBeNull();
    // Create stays on screen but held, saying why (a ReasonButton), so the lost create is never resent.
    expect(createButton().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText(words('new.heldReason', { name: 'mine', computer: 'box' })).length).toBeGreaterThan(0);
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await settle();
    expect(f.sent.creates).toHaveLength(1);
    expect(f.sent.gets).toEqual(['mine']);
    expect(screen.getAllByText(words('new.seen.none', { name: 'mine', computer: 'box' })).length).toBeGreaterThan(0);
    expect(opened).toEqual([]);
  });

  it('a held create shows its Band before any name is typed, and its name gets a ReasonButton that sends nothing', async () => {
    await sendCreate(store, 'held', R1, { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } }, { makeApi: fake(async () => LOST).make });
    const f = fake();
    open(f);
    expect(screen.getByText(words('new.heldBand', { name: 'held' }))).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: words('new.name') }), 'held');
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([]);
    expect(screen.getAllByText(words('new.heldReason', { name: 'held', computer: 'box' })).length).toBeGreaterThan(0);
  });

  it('a name already listed keeps Create off and says so', async () => {
    const f = fake();
    open(f);
    await userEvent.type(screen.getByRole('textbox', { name: words('new.name') }), 'other');
    expect(screen.getByText(words('new.taken.case', { computer: 'box' }))).toBeTruthy();
    await userEvent.click(createButton());
    expect(f.sent.creates).toEqual([]);
  });

  it('A copy of… reads its source, and Create sends that definition', async () => {
    const f = fake(async () => OK, async (n) => (n === 'src' ? doc(COPIED) : LOST));
    open(f, { copyOf: 'src' });
    await settle();
    expect(f.sent.gets).toEqual(['src']);
    await userEvent.type(screen.getByRole('textbox', { name: words('new.name') }), 'copy');
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([{ name: 'copy', def: COPIED }]);
  });
});

describe('HeldCreates', () => {
  it('Stop tracking ends the record behind its confirm, sending and reading nothing', async () => {
    const lost = fake(async () => LOST);
    await sendCreate(store, 'held', R1, { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } }, { makeApi: lost.make });
    const f = fake();
    render(<HeldCreates computer="box" realm={null} onCreated={() => {}} store={store} makeApi={f.make} />);
    await userEvent.click(screen.getByRole('button', { name: words('new.stop') }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: words('new.stop.confirm') }));
    await settle();
    expect(screen.queryByText(words('new.heldBand', { name: 'held' }))).toBeNull();
    expect(store.list(`${capture().account ?? ''}|p1|c1|${R1}`)).toEqual([]);
    expect([f.sent.creates.length, f.sent.gets.length, lost.sent.creates.length]).toEqual([0, 0, 1]);
  });

  it('Check again proving the create opens it', async () => {
    const def = { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } };
    await sendCreate(store, 'held', R1, def, { makeApi: fake(async () => LOST).make });
    const f = fake(async () => OK, async () => doc({ name: 'held', entry_point: { id: 'a' }, steps: def.steps, created_at: 't', updated_at: 't' }));
    const seen: string[] = [];
    render(<HeldCreates computer="box" realm={null} onCreated={(n) => seen.push(n)} store={store} makeApi={f.make} />);
    await userEvent.click(screen.getByRole('button', { name: words('new.check') }));
    await settle();
    expect(seen).toEqual(['held']);
    expect(f.sent.creates).toEqual([]);
  });
});

describe('New workflow: races', () => {
  it('one switch, Write it | Ask the agent, above the form; while the PUT is out the asking side waits', async () => {
    const d = deferred<Settled>();
    const f = fake(() => d.p);
    open(f);
    expect(screen.getAllByRole('radiogroup', { name: words('new.mode') })).toHaveLength(1);
    const ask = () => screen.getByRole('radio', { name: words('new.mode.ask') });
    expect(screen.getByRole('radio', { name: words('new.mode.write') })).toBeChecked();
    expect(isOff(ask())).toBe(false);
    await userEvent.type(nameBox(), 'mine');
    await userEvent.click(createButton());
    await settle();
    expect(isOff(ask()), 'the Create is out').toBe(true);
    await userEvent.click(ask());
    await settle();
    expect(nameBox(), 'the form stays').toBeTruthy();
    d.res(OK);
    await settle();
    expect(isOff(ask())).toBe(false);
  });
  it('while the PUT is out: a second Create sends nothing, Stop tracking is off, and it comes back only once the answer is lost', async () => {
    const d = deferred<Settled>();
    const f = fake(() => d.p);
    open(f);
    await userEvent.type(nameBox(), 'mine');
    await userEvent.click(createButton());
    await settle();
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toHaveLength(1);
    const key = `${capture().account ?? ''}|p1|c1|${R1}|mine`;
    const stop = screen.getByRole('button', { name: words('new.stop') });
    expect(isOff(stop)).toBe(true);
    expect(isOff(screen.getByRole('button', { name: words('new.check') }))).toBe(true);
    await userEvent.click(stop);
    await settle();
    expect(screen.queryByText(words('new.stop.title', { name: 'mine' }))).toBeNull();
    expect(store.get(key)?.phase).toBe('sending');
    d.res(LOST);
    await settle();
    expect(store.get(key)?.phase).toBe('unknown');
    expect(f.sent.creates).toHaveLength(1);
    cleanup();
    render(<HeldCreates computer="box" realm={null} onCreated={() => {}} store={store} makeApi={f.make} />);
    expect(isOff(screen.getByRole('button', { name: words('new.stop') }))).toBe(false);
  });

  it('a create still out in another drawer is listed as sending, and its Stop tracking cannot end it', async () => {
    const d = deferred<Settled>();
    const out = fake(() => d.p);
    void sendCreate(store, 'held', R1, { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } }, { makeApi: out.make });
    await settle();
    const f = fake();
    render(<HeldCreates computer="box" realm={null} onCreated={() => {}} store={store} makeApi={f.make} />);
    expect(screen.getByText(words('new.out.sending', { name: 'held' }))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: words('new.stop') }));
    await settle();
    expect(store.list(`${capture().account ?? ''}|p1|c1|${R1}`).map((a) => a.phase)).toEqual(['sending']);
    d.res(OK);
    await settle();
    expect([out.sent.creates.length, f.sent.creates.length, f.sent.gets.length]).toEqual([1, 0, 0]);
  });

  it('bound to the computer it opened on: after a switch, Create and a copy read send and read nothing until it is back', async () => {
    const f = fake(async () => OK, async (n) => (n === 'Other' ? doc(OTHER_DEF) : LOST));
    open(f);
    await userEvent.type(nameBox(), 'mine');
    act(() => setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } }));
    await settle();
    expect(screen.getAllByText(words('new.moved', { computer: 'box' })).length).toBeGreaterThan(0);
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([]);
    await userEvent.click(screen.getByRole('radio', { name: words('new.from.copy') }));
    await pickCopy('Other');
    await settle();
    expect(f.sent.gets).toEqual([]);
    act(() => setTarget(TARGET));
    await settle();
    expect(screen.queryByText(words('new.moved', { computer: 'box' }))).toBeNull();
    expect(f.sent.gets).toEqual(['Other']);
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([{ name: 'mine', def: OTHER_DEF }]);
  });

  it('bound to the realm it opened in: after a realm switch, Create and Check again send and read nothing', async () => {
    const f = fake(async () => LOST);
    open(f);
    await userEvent.type(nameBox(), 'mine');
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toHaveLength(1);
    const unknown = words('new.out.unknown', { name: 'mine', computer: 'box' });
    expect(screen.getByText(unknown)).toBeInTheDocument();
    act(() => setRealm(R2));
    await settle();
    expect(screen.getAllByText(words('new.moved', { computer: 'box' })).length).toBeGreaterThan(0);
    // the opening scope's held create is not shown in the moved drawer: no unknown outcome, no Check again
    expect(screen.queryByText(unknown)).toBeNull();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    await settle();
    expect([f.sent.creates.length, f.sent.gets.length]).toEqual([1, 0]);
    // back in the opening realm, the held create and its Check again are there again
    act(() => setRealm(R1));
    await settle();
    expect(screen.getByText(unknown)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeTruthy();
    expect(f.sent.creates).toHaveLength(1);
  });

  it('a copy whose read failed has no definition, and Create sends nothing', async () => {
    const f = fake(async () => OK, async () => fail);
    open(f, { copyOf: 'src' });
    await settle();
    expect(f.sent.gets).toEqual(['src']);
    await userEvent.type(nameBox(), 'copy');
    expect(isOff(createButton())).toBe(true);
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([]);
  });

  it('reads that come back out of order: only the read of the pick shown fills the definition Create sends', async () => {
    const reads = { src: deferred<Settled>(), Other: deferred<Settled>() };
    const f = fake(async () => OK, (n) => reads[n as 'src' | 'Other'].p);
    open(f, { copyOf: 'src' });
    await settle();
    await pickCopy('Other');
    await settle();
    expect(f.sent.gets).toEqual(['src', 'Other']);
    reads.Other.res(doc(OTHER_DEF));
    await settle();
    reads.src.res(doc(COPIED));
    await settle();
    await userEvent.type(nameBox(), 'copy');
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([{ name: 'copy', def: OTHER_DEF }]);
  });

  it('a copy read that comes back after Start from turned to Blank never fills Create', async () => {
    const r = deferred<Settled>();
    const f = fake(async () => OK, () => r.p);
    open(f, { copyOf: 'src' });
    await settle();
    await userEvent.click(screen.getByRole('radio', { name: words('new.from.blank') }));
    r.res(doc(COPIED));
    await settle();
    await userEvent.type(nameBox(), 'fresh');
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([{ name: 'fresh', def: JSON.parse(blankDefinition(words('new.blankSummary'))) }]);
  });

  it('Start from back to A copy of… reads again: Create waits for that read', async () => {
    const first = deferred<Settled>();
    const again = deferred<Settled>();
    let n = 0;
    const f = fake(async () => OK, () => (n++ === 0 ? first.p : again.p));
    open(f, { copyOf: 'src' });
    await settle();
    first.res(doc(COPIED));
    await settle();
    await userEvent.click(screen.getByRole('radio', { name: words('new.from.blank') }));
    await userEvent.click(screen.getByRole('radio', { name: words('new.from.copy') }));
    await settle();
    expect(f.sent.gets).toEqual(['src', 'src']);
    await userEvent.type(nameBox(), 'copy');
    expect(isOff(createButton())).toBe(true);
    again.res(doc(OTHER_DEF));
    await settle();
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([{ name: 'copy', def: OTHER_DEF }]);
  });
});


// forms-required, "New workflow, Write mode": Create was off with nothing naming the empty Name, or the
// workflow a copy still needs. Off for one of those, it stays focusable and says which (kit ReasonButton); nothing is sent.
describe('New workflow: Create says what it waits for', () => {
  it('an empty name: Create names it and sends nothing; a typed name turns it on', async () => {
    const f = fake();
    open(f);
    expect(createButton().getAttribute('aria-disabled')).toBe('true');
    expect(createButton().hasAttribute('disabled')).toBe(false);
    expect(screen.getAllByText(words('new.name.empty')).length).toBeGreaterThan(0);
    expect(nameBox()).toBeRequired();
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([]);
    await userEvent.type(nameBox(), 'mine');
    expect(screen.queryByText(words('new.name.empty'))).toBeNull();
    expect(isOff(createButton())).toBe(false);
  });
  it('a copy with no workflow picked: Create names the pick it needs', async () => {
    const f = fake();
    open(f);
    await userEvent.type(nameBox(), 'copy');
    await userEvent.click(screen.getByRole('radio', { name: words('new.from.copy') }));
    await settle();
    expect(createButton().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText(words('new.copyOf.need')).length).toBeGreaterThan(0);
    await userEvent.click(createButton());
    await settle();
    expect(f.sent.creates).toEqual([]);
    expect(f.sent.gets).toEqual([]);
  });
});
