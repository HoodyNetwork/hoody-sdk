// Vitest: Add a program › Notes › New page creates a page in the computer's
// Notes with the Notes page's own create (notes/links: createNote/checkNote, the C9 rules) and adds it as its page tile.
// The create is held in the Notes page's store before it is sent; an unknown answer offers Check again (a read only,
// never a second send) and a warned Dismiss, and the hold outlives the picker. Only the Notes Api is faked here.
// The hold is a claim (two pickers, one send); nothing to check or stop while the send is out; the
// store alone says what is held (another tab's release and re-hold shows); an answer after the step is gone adds no
// tile and settles only through the store.
// A 409's new id is sent only once the store holds it; the in-flight state is in the shared
// record, so a second picker offers no Check again or Stop tracking while the send is out (until its time runs out);
// each Check again acts only while it is the newest and the store still holds its note.
// An open Stop tracking warning closes when a send starts; a move that is not confirmed lets go
// of the new id too.
// 1e: Stop tracking lets go of the note it warned about only; a hold put in its place since is kept.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from './computers';
import { Picker, type PickerProps } from './parts/Picker';
import strings from './strings.en.json';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

type Settled = { ok: true; body: unknown } | { ok: false; err: Record<string, unknown> };
interface Body { id: string; type: string; parentId: string; attributes: { name: string } }

const fake = vi.hoisted(() => ({
  api: null as unknown,
  /** The held creates as the shared store has them (a probe rendered beside the picker). */
  held: null as null | (() => Record<string, { id: string; name: string }>),
  /** The shared store's own hook, as another tab or the Notes page uses it. */
  /** Make the claim's move report not won after its write (as a confirmation that timed out does). */
  moveFails: false,
  kept: null as null | { release: (computer: string, note: string) => void; hold: (computer: string, sent: { id: string; parentId: string; name: string }) => void },
}));
vi.mock('../notes/links', async (orig) => {
  const real = await orig<Record<string, unknown> & { useNotesKept: () => { move: (...a: unknown[]) => Promise<boolean> } }>();
  return {
    ...real,
    useNotesApi: () => fake.api,
    useNotesKept: () => {
      const k = real.useNotesKept();
      return fake.moveFails ? { ...k, move: async (...a: unknown[]) => { void k.move(...a); return false; } } : k;
    },
  };
});
const links = await import('../notes/links');

const S = strings as Record<string, string>;
const U = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const NB = 'b2c3d4e5f6a7b8c9d0e1f2a3';
const PLACE = 'c3d4e5f6a7b8c9d0e1f2a3b4';
const okLoad = (create: { parentId: string; section: string } | null = { parentId: PLACE, section: 'Work' }) => ({ state: 'ok', me: { userId: U, notebookId: NB, role: 'owner' }, recent: { items: [], partial: false, create } });

let calls: { load: number; send: Body[]; node: number; heldAtSend: boolean[]; heldNow: boolean[] };
let answers: { load: () => unknown; send: (b: Body) => Settled | Promise<Settled>; node: (sent: { id: string; parentId: string; name: string }) => Settled | Promise<Settled> };
const created = (b: Body): Settled => ({ ok: true, body: { id: b.id, type: 'page' } });
const lost = (): Settled => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
const matching = (sent: { id: string; parentId: string; name: string }): Settled => ({ ok: true, body: { id: sent.id, type: 'page', parentId: sent.parentId, name: sent.name } });
const taken = (): Settled => ({ ok: false, err: { kind: 'bad_request', status: 409, code: 'unknown', data: { code: 'unknown', message: 'x' } } });
const missing = (): Settled => ({ ok: false, err: { kind: 'not_found', status: 404, code: 'not_found', data: { code: 'not_found', message: 'x' } } });

beforeEach(() => {
  bootFixtureCore({ rules: [] });
  calls = { load: 0, send: [], node: 0, heldAtSend: [], heldNow: [] };
  answers = { load: () => okLoad(), send: created, node: missing };
  fake.api = {
    async load() { calls.load++; return answers.load(); },
    async send(_c: unknown, _nb: string, b: Body) {
      calls.send.push(b);
      // Held already as the send starts (the store, as last rendered), with no waiting.
      calls.heldNow.push(fake.held?.()['c1']?.id === b.id);
      // The hold reaches the store before the send's answer can be lost: wait for this id there (never past 2 s).
      calls.heldAtSend.push(await waitFor(() => expect(fake.held?.()['c1']?.id).toBe(b.id), { timeout: 2000 }).then(() => true, () => false));
      return answers.send(b);
    },
    async node(_c: unknown, _nb: string, sent: { id: string; parentId: string; name: string }) { calls.node++; return answers.node(sent); },
    async download() { return 'failed'; },
  };
});
afterEach(() => { cleanup(); fake.held = null; fake.kept = null; fake.moveFails = false; });

/** Reads the shared hold store (notes/holds.ts, the real one) on every render, for the send to look at. */
function Probe() {
  const { storeRef, release, hold } = links.useNotesKept();
  useEffect(() => { fake.held = () => storeRef.current.holds; fake.kept = { release, hold }; });
  return null;
}
/** A send whose answer comes only when the test says so. */
const deferred = () => {
  let answer!: (v: Settled) => void;
  const p = new Promise<Settled>((r) => { answer = r; });
  return { p, answer };
};
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Probe />
    <Picker computers={[pc('c1', 'atlas')]} failed={false} complete onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
const atNew = (onPick: PickerProps['onPick'] = () => {}) => render(picker({ start: { step: 'notesNew', computer: 'c1' }, onPick }));
const createBtn = () => screen.queryByRole('button', { name: S['picker.notesNew.create']! });
/** The title field once Notes has given the place (it is off while Notes is read). */
const enabledField = async () => { const f = await screen.findByLabelText(S['picker.notesNew.field']!); await waitFor(() => expect(f).toBeEnabled()); return f; };
const pendingWords = () => screen.queryByText(S['picker.notesNew.pending']!);

/** The page tile Choose a page adds for the same page: view node, the viewer's user id, the page id, its name. */
function expectPageTile(onPick: ReturnType<typeof vi.fn>, nodeId: string, name: string) {
  expect(onPick).toHaveBeenCalledTimes(1);
  const tile = onPick.mock.calls[0]![0] as Record<string, unknown>;
  expect(tile).toMatchObject({ project: 'p1', computer: 'c1', program: 'notes', session: 1, view: 'node', name });
  expect(JSON.stringify(tile.params)).toContain(nodeId);
  expect(JSON.stringify(tile.params)).toContain(U);
}

describe('the New page row', () => {
  it('is the fourth Notes row on a running computer, and is not offered on a stopped one', async () => {
    const { unmount } = render(picker({ start: { step: 'notes', computer: 'c1' } }));
    const opts = await screen.findAllByRole('row');
    expect(opts.map((o) => within(o).getAllByText(/./)[0]!.textContent)).toEqual([S['picker.notes.whole'], S['picker.notes.page'], S['picker.notes.link'], S['picker.notes.new']]);
    unmount();
    render(picker({ computers: [pc('c2', 'cedar', 'stopped')], start: { step: 'notes', computer: 'c2' } }));
    await screen.findAllByRole('row');
    expect(screen.queryByRole('row', { name: new RegExp(S['picker.notes.new']!) })).toBeNull();
  });

  it('mouse: the row, a title, Create and add: one send, then the page tile of the new page', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(picker({ start: { step: 'notes', computer: 'c1' }, onPick }));
    await user.click(await screen.findByRole('row', { name: new RegExp(S['picker.notes.new']!) }));
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(calls.send).toHaveLength(1);
    expect(calls.send[0]).toMatchObject({ type: 'page', parentId: PLACE, attributes: { name: 'Q4 plan' } });
    expectPageTile(onPick, calls.send[0]!.id, 'Q4 plan');
  });

  it('keyboard: arrows to the tile, Enter, type, Enter does the same as the mouse', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(picker({ start: { step: 'notes', computer: 'c1' }, onPick }));
    // The first tile of "Add Notes as" takes the focus; the arrows move from tile to tile.
    await waitFor(() => expect(screen.getAllByRole('row')[0]).toHaveFocus());
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('row', { name: new RegExp('^' + S['picker.notes.new']!) })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveFocus());
    await user.keyboard('Q4 plan{Enter}');
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(calls.send).toHaveLength(1);
    expectPageTile(onPick, calls.send[0]!.id, 'Q4 plan');
  });

  it('a title Notes would refuse is said at the field, and nothing is sent', async () => {
    const user = userEvent.setup();
    atNew();
    await enabledField();
    await user.click(createBtn()!);
    expect(await screen.findByText(S['picker.notesNew.err.empty']!)).toBeInTheDocument();
    expect(calls.send).toHaveLength(0);
  });
});

describe('the outcomes', () => {
  it('the create is held in the shared store while it is sent, before its answer', async () => {
    const user = userEvent.setup();
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(calls.send).toHaveLength(1));
    expect(calls.heldAtSend).toEqual([true]);
  });

  it('not sent: says so, nothing is held, and Create and add is there again', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    answers.send = () => ({ ok: false, err: { notSent: true } });
    atNew(onPick);
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    expect(await screen.findByText(S['picker.notesNew.notSent']!)).toBeInTheDocument();
    expect(createBtn()).toBeEnabled();
    expect(onPick).not.toHaveBeenCalled();
    answers.send = created;
    await user.click(createBtn()!);
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(calls.send).toHaveLength(2);
  });

  it('unknown: held, Check again only reads (no second send); unsure stays held, matching adds the tile', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    answers.send = lost;
    atNew(onPick);
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    expect(await screen.findByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    expect(createBtn()).toBeNull();
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText(S['picker.notesNew.unsure']!)).toBeInTheDocument();
    expect(calls.node).toBe(1);
    expect(calls.send).toHaveLength(1);
    expect(createBtn()).toBeNull();
    answers.node = matching;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(calls.node).toBe(2);
    expect(calls.send).toHaveLength(1);
    expectPageTile(onPick, calls.send[0]!.id, 'Q4 plan');
  });

  it('unknown: the hold outlives the picker; opened again it offers Check again, never Create', async () => {
    const user = userEvent.setup();
    answers.send = lost;
    const { unmount } = atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await screen.findByText(S['picker.notesNew.pending']!);
    unmount();
    atNew();
    expect(await screen.findByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveValue('Q4 plan');
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeDisabled();
    expect(createBtn()).toBeNull();
    expect(calls.send).toHaveLength(1);
  });

  it('Dismiss is warned: Cancel keeps the hold; Stop tracking frees it, the title back in the field, nothing sent', async () => {
    const user = userEvent.setup();
    answers.send = lost;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await screen.findByText(S['picker.notesNew.pending']!);
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.dismiss']! }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(S['picker.notesNew.dismissBody']!)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(pendingWords()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.dismiss']! }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: S['picker.notesNew.dismissConfirm']! }));
    expect(await screen.findByLabelText(S['picker.notesNew.field']!)).toHaveValue('Q4 plan');
    expect(createBtn()).toBeEnabled();
    await waitFor(() => expect(fake.held?.()['c1']).toBeUndefined());
    expect(calls.send).toHaveLength(1);
  });

  it('a refusal is said in plain words and nothing is held', async () => {
    const user = userEvent.setup();
    answers.send = () => ({ ok: false, err: { kind: 'bad_request', status: 400, code: 'parent_required', data: { code: 'parent_required', message: 'refused' } } });
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    expect(await screen.findByText(S['picker.notesNew.final.noPlace']!)).toBeInTheDocument();
    expect(createBtn()).toBeEnabled();
    await waitFor(() => expect(fake.held?.()['c1']).toBeUndefined());
  });
});

describe('claim, in flight, the store, after the step', () => {
  it('two pickers press Create and add on the same rendered state: exactly one send', async () => {
    const user = userEvent.setup();
    render(
      <CoreQueryProvider>
        <Probe />
        <Picker computers={[pc('c1', 'atlas')]} failed={false} complete onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} start={{ step: 'notesNew', computer: 'c1' }} />
        <Picker computers={[pc('c1', 'atlas')]} failed={false} complete onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} start={{ step: 'notesNew', computer: 'c1' }} />
      </CoreQueryProvider>,
    );
    await waitFor(() => expect(screen.getAllByLabelText(S['picker.notesNew.field']!).every((f) => !(f as HTMLInputElement).disabled)).toBe(true));
    const [a, b] = screen.getAllByLabelText(S['picker.notesNew.field']!);
    await user.type(a!, 'From A');
    await user.type(b!, 'From B');
    const [ca, cb] = screen.getAllByRole('button', { name: S['picker.notesNew.create']! });
    // Both presses before either picker renders again: the second reads the prefs as stored, not as it last rendered.
    act(() => { fireEvent.click(ca!); fireEvent.click(cb!); });
    await waitFor(() => expect(calls.send).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 300));
    expect(calls.send).toHaveLength(1);
    expect(calls.send[0]!.attributes.name).toBe('From A');
    // The picker that lost sent nothing and says so once the winner's create settles (its hold is let go).
    expect(await screen.findByText(S['picker.notesNew.notClaimed']!)).toBeInTheDocument();
    expect(calls.send).toHaveLength(1);
  });

  it('while the send is out, Stop tracking and Check again are not offered', async () => {
    const user = userEvent.setup();
    const d = deferred();
    answers.send = () => d.p;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(calls.heldAtSend).toEqual([true]));
    expect(screen.getByRole('button', { name: S['picker.notesNew.dismiss']! })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
    expect(pendingWords()).toBeNull();
    expect(calls.node).toBe(0);
    await act(async () => { d.answer(lost()); await d.p; });
    expect(await screen.findByRole('button', { name: 'Check again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: S['picker.notesNew.dismiss']! })).toBeEnabled();
  });

  it("the store wins: another tab stops tracking and holds another page, and that page is what is shown and checked", async () => {
    const user = userEvent.setup();
    answers.send = lost;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await user.click(await screen.findByRole('button', { name: 'Check again' }));
    expect(await screen.findByText(S['picker.notesNew.unsure']!)).toBeInTheDocument();
    const other = { id: 'e5f6a7b8c9d0e1f2a3b4c5d6', parentId: PLACE, name: 'From another tab' };
    act(() => { fake.kept!.release('c1', fake.held!()['c1']!.id); });
    act(() => { fake.kept!.hold('c1', other); });
    await waitFor(() => expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveValue('From another tab'));
    expect(screen.queryByText(S['picker.notesNew.unsure']!)).toBeNull();
    expect(pendingWords()).toBeInTheDocument();
    const seen: string[] = [];
    answers.node = (sent) => { seen.push(sent.id); return missing(); };
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByText(S['picker.notesNew.unsure']!);
    expect(seen).toEqual([other.id]);
    expect(calls.send).toHaveLength(1);
  });

  it('an answer after the step is gone adds no tile; created lets go of its hold through the store', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const d = deferred();
    answers.send = () => d.p;
    const first = atNew(onPick);
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(calls.heldAtSend).toEqual([true]));
    first.unmount();
    // The store, read after the step is gone.
    render(<CoreQueryProvider><Probe /></CoreQueryProvider>);
    expect(fake.held?.()['c1']?.id).toBe(calls.send[0]!.id);
    await act(async () => { d.answer(created(calls.send[0]!)); await d.p; });
    await waitFor(() => expect(fake.held?.()['c1']).toBeUndefined());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('an unknown answer after the step is gone stays held: opened again, Check again finds it and adds the tile', async () => {
    const user = userEvent.setup();
    const d = deferred();
    answers.send = () => d.p;
    const first = atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(calls.heldAtSend).toEqual([true]));
    first.unmount();
    await act(async () => { d.answer(lost()); await d.p; });
    const onPick = vi.fn();
    answers.node = matching;
    atNew(onPick);
    await user.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expectPageTile(onPick, calls.send[0]!.id, 'Q4 plan');
    expect(calls.send).toHaveLength(1);
  });
});

describe('the moved claim, the shared in-flight record, fenced checks', () => {
  it('a 409: the new id is sent only once the store holds it in place of the first', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    let n = 0;
    answers.send = (b) => (n++ === 0 ? taken() : created(b));
    atNew(onPick);
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(calls.send).toHaveLength(2);
    expect(calls.send[1]!.id).not.toBe(calls.send[0]!.id);
    expect(calls.heldNow).toEqual([true, true]);
    expectPageTile(onPick, calls.send[1]!.id, 'Q4 plan');
  });

  it('a 409 after another tab replaced the hold: the new id is never sent, and the other hold stays', async () => {
    const user = userEvent.setup();
    const other = { id: 'f6a7b8c9d0e1f2a3b4c5d6e7', parentId: PLACE, name: 'From another tab' };
    answers.send = () => {
      fake.kept!.hold('c1', other);
      return taken();
    };
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveValue('From another tab'));
    await new Promise((r) => setTimeout(r, 300));
    expect(calls.send).toHaveLength(1);
    expect(fake.held?.()['c1']?.id).toBe(other.id);
  });

  it('a second picker while the send is out: no Check again, no Stop tracking; both open once it answers', async () => {
    const user = userEvent.setup();
    const d = deferred();
    answers.send = () => d.p;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    await waitFor(() => expect(calls.heldAtSend).toEqual([true]));
    const second = render(picker({ start: { step: 'notesNew', computer: 'c1' } }));
    const there = within(second.container);
    expect(await there.findByText(S['picker.notesNew.sendingElsewhere']!)).toBeInTheDocument();
    expect(there.getByRole('button', { name: 'Check again' })).toBeDisabled();
    expect(there.getByRole('button', { name: S['picker.notesNew.dismiss']! })).toBeDisabled();
    await act(async () => { d.answer(lost()); await d.p; });
    await waitFor(() => expect(there.getByRole('button', { name: 'Check again' })).toBeEnabled());
    expect(there.getByRole('button', { name: S['picker.notesNew.dismiss']! })).toBeEnabled();
    expect(there.getByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    expect(calls.node).toBe(0);
  });

  it('a sending record older than the create timeout reads unknown once no beat comes for BEAT_GRACE: Check again and Stop tracking are offered', async () => {
    render(<CoreQueryProvider><Probe /></CoreQueryProvider>);
    await waitFor(() => expect(fake.kept).not.toBeNull());
    const old = { id: 'a7b8c9d0e1f2a3b4c5d6e7f8', parentId: PLACE, name: 'From a closed tab', phase: 'sending' as const, sentAt: Date.now() - links.SENDING_FOR - 50 };
    act(() => { fake.kept!.hold('c1', old); });
    atNew();
    // First read here: it may be a live send whose clock jumped, so it is out until its sender's beat is overdue.
    const check = await screen.findByRole('button', { name: 'Check again' });
    await waitFor(() => expect(check).toBeEnabled(), { timeout: links.BEAT_GRACE + 4_000 });
    expect(screen.getByRole('button', { name: S['picker.notesNew.dismiss']! })).toBeEnabled();
    expect(screen.queryByText(S['picker.notesNew.sendingElsewhere']!)).toBeNull();
  }, 20_000);

  it('a check whose note is replaced while it reads: its answer is dropped (no tile), the new hold stays', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    answers.send = lost;
    atNew(onPick);
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    const check = await screen.findByRole('button', { name: 'Check again' });
    await waitFor(() => expect(check).toBeEnabled());
    let read!: (v: Settled) => void;
    answers.node = () => new Promise<Settled>((r) => { read = r; });
    await user.click(check);
    await waitFor(() => expect(calls.node).toBe(1));
    const other = { id: 'b8c9d0e1f2a3b4c5d6e7f8a9', parentId: PLACE, name: 'From another tab' };
    act(() => { fake.kept!.release('c1', fake.held!()['c1']!.id); });
    act(() => { fake.kept!.hold('c1', other); });
    await act(async () => { read(matching({ id: calls.send[0]!.id, parentId: PLACE, name: 'Q4 plan' })); await new Promise((r) => setTimeout(r, 50)); });
    expect(onPick).not.toHaveBeenCalled();
    expect(fake.held?.()['c1']?.id).toBe(other.id);
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveValue('From another tab');
    expect(calls.send).toHaveLength(1);
  });
});

describe('the warning, the unconfirmed move', () => {
  it('an open Stop tracking warning closes when a send starts elsewhere, and the hold stays', async () => {
    const user = userEvent.setup();
    answers.send = lost;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    const stop = await screen.findByRole('button', { name: S['picker.notesNew.dismiss']! });
    await waitFor(() => expect(stop).toBeEnabled());
    await user.click(stop);
    await screen.findByRole('alertdialog');
    const mine = fake.held?.()['c1'];
    act(() => { fake.kept!.hold('c1', { ...mine!, parentId: PLACE, phase: 'sending', sentAt: Date.now() } as never); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fake.held?.()['c1']?.id).toBe(calls.send[0]!.id);
    expect(screen.getByRole('button', { name: S['picker.notesNew.dismiss']! })).toBeDisabled();
  });

  it('a 409 whose move is written but not confirmed: the new id is not sent and is let go too', async () => {
    const user = userEvent.setup();
    fake.moveFails = true;
    answers.send = taken;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    expect(await screen.findByText(S['picker.notesNew.notClaimed']!)).toBeInTheDocument();
    await waitFor(() => expect(fake.held?.()['c1']).toBeUndefined());
    expect(calls.send).toHaveLength(1);
    expect(createBtn()).toBeEnabled();
  });
});

describe('conditional release', () => {
  it('the warning opens for A, A is replaced by B (not sending), confirm: B is kept', async () => {
    const user = userEvent.setup();
    answers.send = lost;
    atNew();
    await user.type(await enabledField(), 'Q4 plan');
    await user.click(createBtn()!);
    const stop = await screen.findByRole('button', { name: S['picker.notesNew.dismiss']! });
    await waitFor(() => expect(stop).toBeEnabled());
    await user.click(stop);
    const dialog = await screen.findByRole('alertdialog');
    const b = { id: 'c9d0e1f2a3b4c5d6e7f8a9b0', parentId: PLACE, name: 'From another tab' };
    act(() => { fake.kept!.release('c1', calls.send[0]!.id); });
    act(() => { fake.kept!.hold('c1', b); });
    await user.click(within(dialog).getByRole('button', { name: S['picker.notesNew.dismissConfirm']! }));
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.held?.()['c1']?.id).toBe(b.id);
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveValue('From another tab');
  });
});

describe('no place to create', () => {
  it('Notes gives no place: says why, and nothing to create', async () => {
    answers.load = () => okLoad(null);
    atNew();
    expect(await screen.findByText(S['picker.notesNew.state.noPlace']!)).toBeInTheDocument();
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeDisabled();
    expect(createBtn()).toBeNull();
  });

  it('a Notes that cannot be read: its words, and Try again reads once more', async () => {
    const user = userEvent.setup();
    answers.load = () => ({ state: 'protected' });
    atNew();
    expect(await screen.findByText(S['picker.notesNew.state.protected']!)).toBeInTheDocument();
    answers.load = () => okLoad();
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.tryAgain']! }));
    await waitFor(() => expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeEnabled());
    expect(createBtn()).toBeInTheDocument();
    expect(calls.load).toBe(2);
  });

  it('every built key exists', () => {
    const keys = [
      ...['noPlace', 'older', 'protected', 'cantTell', 'unreachable', 'unexpected', 'busy', 'noAccess', 'notOwner'].map((k) => 'picker.notesNew.state.' + k),
      ...['cantAdd', 'protected', 'noPlace', 'gone', 'taken'].map((k) => 'picker.notesNew.final.' + k),
      ...['empty', 'control', 'long'].map((k) => 'picker.notesNew.err.' + k),
    ];
    for (const k of [...keys, 'picker.notesNew.notClaimed', 'picker.notesNew.sendingElsewhere']) expect(S[k], k).toMatch(/\S/);
  });
});
