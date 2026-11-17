// Vitest: NotesNew is on the Board, which keeps itself loaded (useKeepPage), and it uses
// the kit FormFooter. NotesNew never builds a done outcome: a created page leaves the step through onAdd. These tests
// hold that: an outcome the step shows (not sent, or held with Check again) is the same after a hide and show, no
// "Saved" ever shows, and hiding opens no toast (the footer's toastOnLeave is off: the Notes store holds the create).
// The step's own effects stop while hidden too: a create or Check again that answers then lands when it shows again
// (the page tile is added), and showing again does not read Notes once more.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { PageNavHoldContext, type PageNavHold } from '@kit/nav';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity, StrictMode, useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import formStrings from '@kit/forms/forms.strings.en.json';
import type { BoardComputer } from '../computers';
import strings from '../strings.en.json';
import { Picker, type PickerProps } from './Picker';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

type Settled = { ok: true; body: unknown } | { ok: false; err: Record<string, unknown> };
interface Body { id: string; type: string; parentId: string; attributes: { name: string } }

// claimGate: the store's claim, once kept, answers the step only when it opens; claimKept is told it was kept.
// claimLost: the claim answers not won after the store's own claim wrote the hold (the store did not confirm it in
// time); the step must take that hold back itself.
const fake = vi.hoisted(() => ({ api: null as unknown, claimGate: null as null | Promise<void>, claimKept: null as null | (() => void), claimLost: null as null | (() => void) }));
vi.mock('../../notes/links', async (orig) => {
  const real = await orig<Record<string, unknown> & { useNotesKept: () => { claim: (...a: unknown[]) => Promise<boolean> } }>();
  return {
    ...real,
    useNotesApi: () => fake.api,
    useNotesKept: () => {
      const k = real.useNotesKept();
      return { ...k, claim: async (...a: unknown[]) => { const won = await k.claim(...a); fake.claimKept?.(); if (fake.claimGate) await fake.claimGate; if (fake.claimLost) { fake.claimLost(); return false; } return won; } };
    },
  };
});

// The toasts the footer would open on a hide.
const T = vi.hoisted(() => ({ shown: 0 }));
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: () => `t${++T.shown}`, closeToast: () => {} }));

const links = await import('../../notes/links');
const S = strings as Record<string, string>;
const F = formStrings as Record<string, string>;
const U = 'a1b2c3d4e5f6a7b8c9d0e1f2';
/** Another tab's held page for the same computer. */
const OTHER = 'd4e5f6a7b8c9d0e1f2a3b4c5';
const okLoad = () => ({ state: 'ok', me: { userId: U, notebookId: 'b2c3d4e5f6a7b8c9d0e1f2a3', role: 'owner' }, recent: { items: [], partial: false, create: { parentId: 'c3d4e5f6a7b8c9d0e1f2a3b4', section: 'Work' } } });
let send: (b: Body) => Settled;
let sent: Body[];
let loads: number;

beforeEach(() => {
  bootFixtureCore({ rules: [] });
  sent = [];
  loads = 0;
  fake.api = {
    async load() { loads++; return okLoad(); },
    async send(_c: unknown, _nb: string, b: Body) { sent.push(b); return send(b); },
    async node() { return { ok: false, err: { kind: 'not_found', status: 404, code: 'not_found', data: { code: 'not_found', message: 'x' } } }; },
    async download() { return 'failed'; },
  };
});
afterEach(() => { cleanup(); page.shown = true; T.shown = 0; fake.claimGate = null; fake.claimKept = null; fake.claimLost = null; });

// The shell's hold and Activity, as a kept page sits in them (keep.hidden.test.tsx).
const page = { shown: true };
const hold: PageNavHold = { location: null, owns: () => page.shown, hidden: () => !page.shown };
const Shown = ({ on, children }: { on: boolean; children: ReactNode }) => {
  page.shown = on;
  return <PageNavHoldContext value={hold}><Activity mode={on ? 'visible' : 'hidden'}>{children}</Activity></PageNavHoldContext>;
};
const pc = { id: 'c1', name: 'atlas', project_id: 'p1', server_name: 'n12', status: 'running' } as BoardComputer;
const step = (p: Partial<PickerProps> = {}) => (
  <CoreQueryProvider>
    <Picker computers={[pc]} failed={false} complete onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} start={{ step: 'notesNew', computer: 'c1' }} {...p} />
  </CoreQueryProvider>
);
const field = async () => { const f = await screen.findByLabelText(S['picker.notesNew.field']!); await waitFor(() => expect(f).toBeEnabled()); return f; };
const saved = () => screen.queryByText(F['form.saved']!);
/** A send (or a read back) whose answer comes only when the test says so. */
function deferred<T>() {
  let answer!: (v: T) => void;
  const p = new Promise<T>((r) => { answer = r; });
  return { p, answer };
}

// The shared hold store as another tab or the Notes page uses it, rendered beside the kept Board (never hidden).
const kept = {
  holds: (() => ({})) as () => Record<string, { id: string }>,
  hold: null as null | ((computer: string, sent: { id: string; parentId: string; name: string }) => void),
  release: null as null | ((computer: string, note: string) => void),
};
function Probe() {
  const k = links.useNotesKept() as unknown as { storeRef: { current: { holds: Record<string, { id: string }> } }; hold: typeof kept.hold; release: typeof kept.release };
  useEffect(() => { kept.holds = () => k.storeRef.current.holds; kept.hold = k.hold; kept.release = k.release; });
  return null;
}
const probe = () => <CoreQueryProvider><Probe /></CoreQueryProvider>;

/** Hides the step as a kept Board does on another page, then shows it again. */
function hideAndShow(v: ReturnType<typeof render>, p: Partial<PickerProps> = {}) {
  v.rerender(<Shown on={false}>{step(p)}</Shown>);
  v.rerender(<Shown on>{step(p)}</Shown>);
}

describe('a kept Board hides and shows the New page step', () => {
  it('not sent: the outcome and Create and add are the same after a hide and show, no Saved, no toast', async () => {
    const user = userEvent.setup();
    send = () => ({ ok: false, err: { notSent: true } });
    const v = render(<Shown on>{step()}</Shown>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    expect(await screen.findByText(S['picker.notesNew.notSent']!)).toBeInTheDocument();
    hideAndShow(v);
    expect(screen.getByText(S['picker.notesNew.notSent']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: S['picker.notesNew.create']! })).toBeEnabled();
    expect(saved()).toBeNull();
    expect(T.shown).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('held with an unknown answer: Check again and the locked field are the same after a hide and show, no toast', async () => {
    const user = userEvent.setup();
    send = () => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
    const v = render(<Shown on>{step()}</Shown>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    expect(await screen.findByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    hideAndShow(v);
    expect(screen.getByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: F['outcome.check']! })).toBeInTheDocument();
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeDisabled();
    expect(saved()).toBeNull();
    expect(T.shown).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('created: the step hands the page to the Board and never shows Saved, before or after a hide and show', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    send = (b) => ({ ok: true, body: { id: b.id, type: 'page' } });
    const v = render(<Shown on>{step({ onPick })}</Shown>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(saved()).toBeNull();
    hideAndShow(v, { onPick });
    expect(saved()).toBeNull();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(T.shown).toBe(0);
  });
});

describe('answers that settle while the kept Board is hidden', () => {
  it('a create that answers while hidden adds its page tile when the Board shows again', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const d = deferred<Settled>();
    (fake.api as { send: unknown }).send = async (_c: unknown, _nb: string, b: Body) => { sent.push(b); return d.p; };
    const v = render(<Shown on>{step({ onPick })}</Shown>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    await waitFor(() => expect(sent).toHaveLength(1));
    v.rerender(<Shown on={false}>{step({ onPick })}</Shown>);
    d.answer({ ok: true, body: { id: sent[0]!.id, type: 'page' } });
    // Hidden: the answer is in, and nothing lands yet (the step's effects are stopped).
    await act(async () => { await d.p; });
    expect(onPick).not.toHaveBeenCalled();
    v.rerender(<Shown on>{step({ onPick })}</Shown>);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(sent).toHaveLength(1);
  });

  it('a Check again that finds the page while hidden adds its tile on return, with one send in all', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    send = () => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
    const found = deferred<Settled>();
    (fake.api as { node: unknown }).node = async () => found.p;
    const v = render(<Shown on>{step({ onPick })}</Shown>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    await user.click(await screen.findByRole('button', { name: F['outcome.check']! }));
    v.rerender(<Shown on={false}>{step({ onPick })}</Shown>);
    const s0 = sent[0]!;
    found.answer({ ok: true, body: { id: s0.id, type: 'page', parentId: s0.parentId, name: s0.attributes.name } });
    // Hidden: the read back is in, and nothing lands yet.
    await act(async () => { await found.p; });
    expect(onPick).not.toHaveBeenCalled();
    v.rerender(<Shown on>{step({ onPick })}</Shown>);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(sent).toHaveLength(1);
  });

  // The claim here is already kept by the store when the Board hides (its confirmation runs from an effect, which a
  // hidden Board does not run: a claim still unconfirmed past its 15 s while hidden reads not won, and nothing is sent;
  // the claim waits for the Board to show again).
  it('a Board hidden after the claim is kept, before the step reads it, still sends, and the tile lands on return', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    send = (b) => ({ ok: true, body: { id: b.id, type: 'page' } });
    const v = render(<Shown on>{step({ onPick })}</Shown>);
    await user.type(await field(), 'Q4 plan');
    // Pressed, then hidden before the step reads the claim's answer: the step is still there, so the send goes out.
    const gate = deferred<void>();
    const keptNow = deferred<void>();
    fake.claimGate = gate.p;
    fake.claimKept = () => keptNow.answer();
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    // The store has confirmed the claim (its waiter ran while shown); only then does the Board hide.
    await act(async () => { await keptNow.p; });
    v.rerender(<Shown on={false}>{step({ onPick })}</Shown>);
    gate.answer();
    await act(async () => { await gate.p; });
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(onPick).not.toHaveBeenCalled();
    v.rerender(<Shown on>{step({ onPick })}</Shown>);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
  });

  it('showing again does not read Notes once more: the field stays open with its title', async () => {
    const user = userEvent.setup();
    const v = render(<Shown on>{step()}</Shown>);
    await user.type(await field(), 'Q4 plan');
    expect(loads).toBe(1);
    hideAndShow(v);
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeEnabled();
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toHaveValue('Q4 plan');
    expect(screen.getByRole('button', { name: S['picker.notesNew.create']! })).toBeInTheDocument();
    expect(loads).toBe(1);
  });

  it('a read the hide cut off runs again on return', async () => {
    const first = deferred<unknown>();
    (fake.api as { load: unknown }).load = async () => { loads++; return loads === 1 ? first.p : okLoad(); };
    const v = render(<Shown on>{step()}</Shown>);
    await waitFor(() => expect(loads).toBe(1));
    v.rerender(<Shown on={false}>{step()}</Shown>);
    first.answer(okLoad());
    // Its answer comes while hidden, after the hide cut it off: it is dropped, and the return reads again.
    await act(async () => { await first.p; });
    v.rerender(<Shown on>{step()}</Shown>);
    await field();
    expect(loads).toBe(2);
  });
  it('a Check again that matches while hidden adds no tile when another hold was put there before the return', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    send = () => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
    const found = deferred<Settled>();
    (fake.api as { node: unknown }).node = async () => found.p;
    const v = render(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    await user.click(await screen.findByRole('button', { name: F['outcome.check']! }));
    v.rerender(<>{probe()}<Shown on={false}>{step({ onPick })}</Shown></>);
    const s0 = sent[0]!;
    found.answer({ ok: true, body: { id: s0.id, type: 'page', parentId: s0.parentId, name: s0.attributes.name } });
    await act(async () => { await found.p; });
    // The match let go of its hold; another tab holds another page for the computer before the Board shows again.
    await waitFor(() => expect(kept.holds()['c1']).toBeUndefined());
    act(() => { kept.hold!('c1', { id: OTHER, parentId: s0.parentId, name: 'Other' }); });
    await waitFor(() => expect(kept.holds()['c1']?.id).toBe(OTHER));
    v.rerender(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    // The step shows the hold the store has now, with its own Check again, and the old answer adds no tile.
    expect(await screen.findByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: F['outcome.check']! })).toBeEnabled();
    expect(onPick).not.toHaveBeenCalled();
    // That hold let go elsewhere: the step is not left checking the old note, so a new create goes out.
    act(() => { kept.release!('c1', OTHER); });
    send = (b) => ({ ok: true, body: { id: b.id, type: 'page' } });
    await user.clear(await field());
    await user.type(screen.getByLabelText(S['picker.notesNew.field']!), 'Q5 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(sent).toHaveLength(2);
  });

  it('a create that answers while hidden adds no tile when another hold was put there before the return, and the step shows that hold', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const d = deferred<Settled>();
    (fake.api as { send: unknown }).send = async (_c: unknown, _nb: string, b: Body) => { sent.push(b); return d.p; };
    const v = render(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
    await waitFor(() => expect(sent).toHaveLength(1));
    v.rerender(<>{probe()}<Shown on={false}>{step({ onPick })}</Shown></>);
    d.answer({ ok: true, body: { id: sent[0]!.id, type: 'page' } });
    await act(async () => { await d.p; });
    await waitFor(() => expect(kept.holds()['c1']).toBeUndefined());
    act(() => { kept.hold!('c1', { id: OTHER, parentId: sent[0]!.parentId, name: 'Other' }); });
    await waitFor(() => expect(kept.holds()['c1']?.id).toBe(OTHER));
    v.rerender(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    // Not left sending: the other hold shows with a Check again that can be pressed.
    expect(await screen.findByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: F['outcome.check']! })).toBeEnabled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a Try again read that a show overtakes: only the newest answer is kept', async () => {
    const user = userEvent.setup();
    const retry = deferred<unknown>();
    const answersOf = [() => Promise.resolve({ state: 'protected' }), () => retry.p, () => Promise.resolve(okLoad())];
    (fake.api as { load: unknown }).load = async () => answersOf[loads++]!();
    const v = render(<Shown on>{step()}</Shown>);
    expect(await screen.findByText(S['picker.notesNew.state.protected']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.tryAgain']! }));
    await waitFor(() => expect(loads).toBe(2));
    // Hidden and shown while the retry is out: the show reads again, and that newer read answers first.
    hideAndShow(v);
    await field();
    expect(loads).toBe(3);
    // The retry's late answer (Notes cannot be read) is dropped: the field stays open.
    await act(async () => { retry.answer({ state: 'protected' }); await retry.p; });
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeEnabled();
    expect(screen.queryByText(S['picker.notesNew.state.protected']!)).toBeNull();
  });
  it('a Try again read still out when the Notes api changes is cut by the new read: only the newest answer is kept', async () => {
    const user = userEvent.setup();
    const retry = deferred<unknown>();
    const answersOf = [() => Promise.resolve({ state: 'protected' }), () => retry.p, () => Promise.resolve(okLoad())];
    (fake.api as { load: unknown }).load = async () => answersOf[loads++]!();
    const v = render(<Shown on>{step()}</Shown>);
    expect(await screen.findByText(S['picker.notesNew.state.protected']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.tryAgain']! }));
    await waitFor(() => expect(loads).toBe(2));
    // A new api (the realm's access was renewed) while the retry is out and the step stays shown: the step reads again.
    fake.api = { ...(fake.api as object) };
    v.rerender(<Shown on>{step()}</Shown>);
    await field();
    expect(loads).toBe(3);
    // The retry's late answer belongs to the old api and is dropped: the field stays open.
    await act(async () => { retry.answer({ state: 'protected' }); await retry.p; });
    expect(screen.getByLabelText(S['picker.notesNew.field']!)).toBeEnabled();
    expect(screen.queryByText(S['picker.notesNew.state.protected']!)).toBeNull();
  });
  it('a Try again read that answers while hidden is cut by the hide: the return reads again and keeps that answer', async () => {
    const user = userEvent.setup();
    const retry = deferred<unknown>();
    const answersOf = [() => Promise.resolve({ state: 'protected' }), () => retry.p, () => Promise.resolve(okLoad())];
    (fake.api as { load: unknown }).load = async () => answersOf[loads++]!();
    const v = render(<Shown on>{step()}</Shown>);
    expect(await screen.findByText(S['picker.notesNew.state.protected']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.tryAgain']! }));
    await waitFor(() => expect(loads).toBe(2));
    v.rerender(<Shown on={false}>{step()}</Shown>);
    // The retry answers while hidden (Notes still cannot be read): the hide cut it, so its answer is dropped.
    await act(async () => { retry.answer({ state: 'protected' }); await retry.p; });
    v.rerender(<Shown on>{step()}</Shown>);
    await field();
    expect(loads).toBe(3);
    expect(screen.queryByText(S['picker.notesNew.state.protected']!)).toBeNull();
  });
});

// The other ways out of a hidden step. An
// answer that comes while the kept Board is hidden lands, as it would have shown, when the Board shows again; the last
// two cases pin a failed read across a hide and show, and a StrictMode step sending once.
describe('other answers that settle while the kept Board is hidden', () => {
  /** Types a title and presses Create and add, with the send answering only when the test says so. */
  async function pressCreate(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await field(), 'Q4 plan');
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.create']! }));
  }

  it('a claim not won while hidden: nothing is sent, and the return says so with Create and add again', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const gate = deferred<void>();
    const keptNow = deferred<void>();
    fake.claimGate = gate.p;
    fake.claimKept = () => keptNow.answer();
    fake.claimLost = () => {};
    const v = render(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    await pressCreate(user);
    await act(async () => { await keptNow.p; });
    v.rerender(<>{probe()}<Shown on={false}>{step({ onPick })}</Shown></>);
    gate.answer();
    await act(async () => { await gate.p; });
    v.rerender(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    expect(await screen.findByText(S['picker.notesNew.notClaimed']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: S['picker.notesNew.create']! })).toBeEnabled();
    expect(sent).toHaveLength(0);
    // The step took back the hold its claim wrote: the store holds nothing for the computer.
    expect(kept.holds()['c1']).toBeUndefined();
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each([
    ['not sent', { ok: false, err: { notSent: true } } as Settled, 'picker.notesNew.notSent'],
    ['refused', { ok: false, err: { kind: 'bad_request', status: 400, code: 'parent_required', data: { code: 'parent_required', message: 'refused' } } } as Settled, 'picker.notesNew.final.noPlace'],
  ])('a create answered %s while hidden shows that on return, Create and add again, one send', async (_n, answer, key) => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const d = deferred<Settled>();
    (fake.api as { send: unknown }).send = async (_c: unknown, _nb: string, b: Body) => { sent.push(b); return d.p; };
    const v = render(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    await pressCreate(user);
    await waitFor(() => expect(sent).toHaveLength(1));
    v.rerender(<>{probe()}<Shown on={false}>{step({ onPick })}</Shown></>);
    d.answer(answer);
    await act(async () => { await d.p; });
    v.rerender(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    expect(await screen.findByText(S[key]!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: S['picker.notesNew.create']! })).toBeEnabled();
    expect(kept.holds()['c1']).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a Check again that cannot tell while hidden shows the unsure words on return, still held, Check again enabled', async () => {
    const user = userEvent.setup();
    send = () => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
    const back = deferred<Settled>();
    (fake.api as { node: unknown }).node = async () => back.p;
    const v = render(<Shown on>{step()}</Shown>);
    await pressCreate(user);
    await user.click(await screen.findByRole('button', { name: F['outcome.check']! }));
    v.rerender(<Shown on={false}>{step()}</Shown>);
    back.answer({ ok: false, err: { kind: 'unreachable', code: 'NETWORK' } });
    await act(async () => { await back.p; });
    v.rerender(<Shown on>{step()}</Shown>);
    expect(await screen.findByText(S['picker.notesNew.unsure']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: F['outcome.check']! })).toBeEnabled();
    expect(sent).toHaveLength(1);
  });

  it('a hold replaced elsewhere before a hidden Check again answers: no tile, and the return shows that hold', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    send = () => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
    const back = deferred<Settled>();
    (fake.api as { node: unknown }).node = async () => back.p;
    const v = render(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    await pressCreate(user);
    await user.click(await screen.findByRole('button', { name: F['outcome.check']! }));
    v.rerender(<>{probe()}<Shown on={false}>{step({ onPick })}</Shown></>);
    // Another tab stops tracking this note and holds its own before the read back answers.
    const mineId = sent[0]!.id;
    act(() => { kept.release!('c1', mineId); kept.hold!('c1', { id: OTHER, parentId: sent[0]!.parentId, name: 'Other tab' }); });
    const s0 = sent[0]!;
    back.answer({ ok: true, body: { id: s0.id, type: 'page', parentId: s0.parentId, name: s0.attributes.name } });
    await act(async () => { await back.p; });
    v.rerender(<>{probe()}<Shown on>{step({ onPick })}</Shown></>);
    expect(await screen.findByText(S['picker.notesNew.pending']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: F['outcome.check']! })).toBeEnabled();
    expect(kept.holds()['c1']?.id).toBe(OTHER);
    expect(onPick).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it('a Notes read that failed stays failed across a hide and show (no read on show); Try again reads', async () => {
    const user = userEvent.setup();
    const answersOf = [() => Promise.resolve({ state: 'protected' }), () => Promise.resolve(okLoad())];
    (fake.api as { load: unknown }).load = async () => answersOf[loads++]!();
    const v = render(<Shown on>{step()}</Shown>);
    expect(await screen.findByText(S['picker.notesNew.state.protected']!)).toBeInTheDocument();
    hideAndShow(v);
    expect(screen.getByText(S['picker.notesNew.state.protected']!)).toBeInTheDocument();
    expect(loads).toBe(1);
    await user.click(screen.getByRole('button', { name: S['picker.notesNew.tryAgain']! }));
    await field();
    expect(loads).toBe(2);
  });

  it('in StrictMode (effects run twice) the step opens, sends once and adds one tile', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    send = (b) => ({ ok: true, body: { id: b.id, type: 'page' } });
    render(<StrictMode><Shown on>{step({ onPick })}</Shown></StrictMode>);
    await pressCreate(user);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(sent).toHaveLength(1);
  });
});
