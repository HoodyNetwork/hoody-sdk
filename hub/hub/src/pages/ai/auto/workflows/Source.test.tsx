// Workflow source on a live component over a fake api: what each origin offers (Delete only for yours, Hide for
// shipped ones, Reset for changed shipped ones, nothing for a project's own), the source read only when opened, the draft
// checked before Save, the project and shipped copy notes, a conflict's Compare, a lost save never resent, and Delete
// behind its typed confirm; a Global reset never claimed back before the list shows it; an editor holding a draft or an
// unknown save kept while the detail goes away (another workflow picked, agents paused) and back with it.
// The actions are the detail's ActionBar spec (useSourceActions): Edit source is the primary and opens the
// Source disclosure; Delete, Reset to shipped and Hide/Show are in its "..." menu. With the workflow_hidden capability one
// of Hide or Show is offered, and a hide's own answer wins until a list read brings a new row.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump, setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { ActionBar } from '@kit';
import type * as DataModule from './data';
import { parseWorkflows, type Workflow } from './logic';
import { dropKeptSources, keptSourceCount, useSourceActions, useWorkflowSource, WorkflowSource } from './Source';
import type { Refusal, Settled, WorkflowSourceApi } from './sourceApi';
import strings from './Source.strings.en.json';

const io = vi.hoisted(() => ({ refreshed: 0 }));
vi.mock('./data', async (orig) => ({ ...(await orig<typeof DataModule>()), refreshWorkflows: () => void io.refreshed++ }));

const ok = (b: unknown): Settled => ({ ok: true, body: b });
const err = (kind: Refusal['kind'], o: Partial<Refusal> = {}): Settled => ({ ok: false, err: { kind, code: '', status: 0, notApplied: false, ...o } });
const env = (output: string, is_error = false) => ok({ status: 'ok', output, is_error });
// As getWorkflow reads it: entry_point is a StepRef object.
const DEF = { name: 'ship-fix', entry_point: { id: 'a' }, steps: { a: { type: 'bash', command: 'true', next_steps: [{ id: 'stop' }] } } };
const text = (d: object) => JSON.stringify(d, null, 2);
const doc = (d: object, rev: string, project = false) => env(`revision: ${rev}\n${project ? 'project: true (UNTRUSTED)\n' : ''}${text(d)}`);
const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

type Pending = (s: Settled) => void;
function fake() {
  const q = { gets: [] as Pending[], puts: [] as Array<{ def: Record<string, unknown>; rev: string; answer: Pending }>, removes: [] as Pending[], hides: [] as Array<{ hidden: boolean; answer: Pending }>, lists: [] as Pending[] };
  const api: WorkflowSourceApi = {
    get: () => new Promise((r) => q.gets.push(r)),
    put: (def, rev) => new Promise((r) => q.puts.push({ def, rev, answer: r })),
    remove: () => new Promise((r) => q.removes.push(r)),
    hide: (hidden) => new Promise((r) => q.hides.push({ hidden, answer: r })),
    list: () => new Promise((r) => q.lists.push(r)),
  };
  return { q, api };
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const wf = (row: Record<string, unknown>, hiddenCap = false) => parseWorkflows({ items: [{ name: 'ship-fix', entry_point: 'a', ...row }] }, { hiddenCap })[0]!;

let f: ReturnType<typeof fake>;
beforeEach(() => { boot(); f = fake(); io.refreshed = 0; });
// The Date.now spies stay on to each test's end (the answer's time is taken in its completion notice, which under load
// may run after settle()); a failed expect before the restore must not leak the clock into the next test.
afterEach(() => { cleanup(); dropKeptSources(); vi.restoreAllMocks(); });

// The detail's wiring (Graph.tsx): the bar from the spec, the Source section from the same controller.
function Shown({ workflow, computer, api, hiddenCap = false, readAt, onCopy }: { workflow: Workflow; computer: string; api: WorkflowSourceApi; hiddenCap?: boolean; readAt?: number; onCopy?: (name: string) => void }) {
  const src = useWorkflowSource(workflow, { api, hiddenCap, readAt });
  const actions = useSourceActions(src, onCopy);
  return (
    <>
      {actions && <ActionBar label="Workflow actions" {...actions} />}
      {src.hidden && <span data-testid="hidden-tag" />}
      <WorkflowSource source={src} computer={computer} />
    </>
  );
}
const showW = (w: Workflow, computer = 'atlas', hiddenCap = false) => render(<Shown workflow={w} computer={computer} api={f.api} hiddenCap={hiddenCap} />);
const show = (row: Record<string, unknown> = {}, hiddenCap = false) => showW(wf(row, hiddenCap), 'atlas', hiddenCap);
const btn = (k: keyof typeof strings) => screen.queryByRole('button', { name: strings[k] });
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const itemName = (k: keyof typeof strings) => new RegExp(`^${esc(strings[k])}`);
/** Whether the "..." menu offers the item (false when the bar has no menu); the menu is closed again. */
async function offered(k: keyof typeof strings): Promise<boolean> {
  const more = screen.queryByRole('button', { name: 'More actions' });
  if (!more) return false;
  await userEvent.click(more);
  const has = screen.queryByRole('menuitem', { name: itemName(k) }) !== null;
  await userEvent.keyboard('{Escape}');
  return has;
}
/** The "..." menu's item names, in order. */
async function menuNames(): Promise<string[]> {
  const more = screen.queryByRole('button', { name: 'More actions' });
  if (!more) return [];
  await userEvent.click(more);
  const names = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  return names;
}
/** Chooses a "..." item; it must be there and enabled. */
async function choose(k: keyof typeof strings) {
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
  await userEvent.click(screen.getByRole('menuitem', { name: itemName(k) }));
}
/** Whether a "..." item is offered but disabled (its reason shown under it). */
async function heldItem(k: keyof typeof strings): Promise<boolean> {
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
  const it = screen.getByRole('menuitem', { name: itemName(k) });
  const held = it.getAttribute('aria-disabled') === 'true';
  await userEvent.keyboard('{Escape}');
  return held;
}
async function openWith(d: object = DEF, rev = 'r1', project = false) {
  await userEvent.click(btn('edit')!);
  await settle();
  await act(async () => { f.q.gets[0]!(doc(d, rev, project)); });
  await settle();
}
const editor = () => screen.getByRole('textbox', { name: words('label', { name: 'ship-fix' }) }) as HTMLTextAreaElement;
const type = async (v: string) => { await act(async () => { fireEvent.change(editor(), { target: { value: v } }); }); };
const save = () => screen.getByRole('button', { name: strings.save });

describe('what each workflow offers', () => {
  it('yours: Edit source as the bar\'s button; Delete in "...", no Hide', async () => {
    show();
    expect(btn('edit')).toBeInTheDocument();
    expect(btn('danger.delete')).toBeNull();
    expect(await offered('danger.delete')).toBe(true);
    expect(await offered('danger.hide')).toBe(false);
    expect(await offered('danger.reset')).toBe(false);
  });
  it('Make a copy…: offered first in "..." only with onCopy; it hands over the name and sends nothing', async () => {
    const copied: string[] = [];
    render(<Shown workflow={wf({ system: true })} computer="atlas" api={f.api} onCopy={(n) => copied.push(n)} />);
    expect((await menuNames())[0]).toBe(strings.copy);
    await choose('copy');
    await settle();
    expect(copied).toEqual(['ship-fix']);
    expect([f.q.gets, f.q.puts, f.q.removes, f.q.hides, f.q.lists].map((x) => x.length)).toEqual([0, 0, 0, 0, 0]);
    cleanup();
    show();
    expect(await offered('copy')).toBe(false);
  });
  it('Edit source is never repeated in "..."', async () => {
    show({ system: true, customized: true });
    expect(btn('edit')).toBeInTheDocument();
    expect(await offered('edit')).toBe(false);
    expect((await menuNames()).some((n) => n.startsWith(strings.edit))).toBe(false);
  });
  it('shipped: never Delete; Hide and Show again while the agent does not say which it is, saying what hiding does', async () => {
    show({ system: true });
    expect(await offered('danger.delete')).toBe(false);
    expect(await offered('danger.reset')).toBe(false);
    expect(await offered('danger.hide')).toBe(true);
    expect(await offered('danger.show')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: itemName('danger.hide') })).toHaveAccessibleDescription(strings['danger.hideHint']);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(strings['danger.hideHint'])).toBeNull();
  });
  it('shipped and changed: Reset to shipped and Hide, never Delete', async () => {
    show({ system: true, customized: true });
    expect(await offered('danger.reset')).toBe(true);
    expect(await offered('danger.hide')).toBe(true);
    expect(await offered('danger.delete')).toBe(false);
  });
  it("a project's own: Edit only", async () => {
    show({ project: true });
    expect(btn('edit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
  it('with the workflow_hidden capability: only the one that changes something, from the list row', async () => {
    show({ system: true, hidden: true }, true);
    expect(await offered('danger.show')).toBe(true);
    expect(await offered('danger.hide')).toBe(false);
    expect(screen.getByTestId('hidden-tag')).toBeInTheDocument();
    cleanup();
    show({ system: true }, true);
    expect(await offered('danger.hide')).toBe(true);
    expect(await offered('danger.show')).toBe(false);
    expect(screen.queryByTestId('hidden-tag')).toBeNull();
  });
});

describe('the editor', () => {
  it('nothing is read until Edit source; then the source shows as read', async () => {
    show();
    await settle();
    expect(f.q.gets).toHaveLength(0);
    await openWith();
    expect(editor().value).toBe(text(DEF));
    expect(save()).toBeDisabled();
  });

  it('Edit source opens the Definition fold and puts the cursor in the editor once the source is read', async () => {
    show();
    const fold = screen.getByRole('button', { name: strings.disclosure });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(btn('edit')!);
    await settle();
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    await act(async () => { f.q.gets[0]!(doc(DEF, 'r1')); });
    await settle();
    expect(document.activeElement).toBe(editor());
  });

  it("the fold's own button closes it; typed text is asked about first, and the source is read again when reopened", async () => {
    show();
    await openWith();
    await type(text({ ...DEF, summary: 'typed' }));
    await userEvent.click(screen.getByRole('button', { name: strings.disclosure }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(strings['closeAsk.body'])).toBeInTheDocument();
    expect(editor()).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['reload.confirm'] }));
    await settle();
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'ship-fix' }) })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings.disclosure }));
    await settle();
    expect(f.q.gets).toHaveLength(2);
  });

  it('a failed read says why, never an empty editor; Try again reads again', async () => {
    show();
    await userEvent.click(btn('edit')!);
    await act(async () => { f.q.gets[0]!(err('failed', { code: 'daemon_paused', status: 200, notApplied: true })); });
    await settle();
    expect(screen.getByText(words('load.failed.paused', { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'ship-fix' }) })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await settle();
    expect(f.q.gets).toHaveLength(2);
  });

  it('a project workflow says a save makes your own copy; a shipped one says how to get it back', async () => {
    show({ project: true });
    await openWith(DEF, 'r1', true);
    expect(screen.getByText(strings.project)).toBeInTheDocument();
    cleanup();
    f = fake();
    show({ system: true });
    await openWith();
    expect(screen.getByText(strings.system)).toBeInTheDocument();
  });

  it('a draft that is not a definition says why and Save stays off', async () => {
    show();
    await openWith();
    await type('{"entry_point":"a","steps":{}}');
    expect(screen.getByText(strings['problem.steps'])).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await type('{ nope');
    expect(screen.getByRole('alert').textContent).toMatch(/not valid JSON/);
    expect(f.q.puts).toHaveLength(0);
  });

  it('save: sent once with the revision read, Saved once the workflow reads again, the list refreshed', async () => {
    show();
    await openWith();
    await type(text({ ...DEF, summary: 'x' }));
    await userEvent.click(save());
    await settle();
    expect(f.q.puts).toHaveLength(1);
    expect(f.q.puts[0]!.rev).toBe('r1');
    await act(async () => { f.q.puts[0]!.answer(env('updated workflow "ship-fix"')); });
    await settle();
    expect(screen.getByText(strings.rebasing)).toBeInTheDocument();
    await act(async () => { f.q.gets[1]!(doc({ ...DEF, summary: 'x', updated_at: 'now' }, 'r2')); });
    await settle();
    expect(screen.getByText(strings.saved)).toBeInTheDocument();
    expect(io.refreshed).toBeGreaterThan(0);
  });

  it('a refused definition (invalid_definition) says why, wrote nothing, and leaves the editor open to fix it', async () => {
    show();
    await openWith();
    await type(text({ ...DEF, summary: 'mine' }));
    await userEvent.click(save());
    await act(async () => { f.q.puts[0]!.answer(err('failed', { code: 'invalid_definition', status: 200, notApplied: true, reason: 'step "check": unknown next target "nope"' })); });
    await settle();
    expect(screen.getByText(strings['refused.invalid'].replace('{{reason}}', 'step "check": unknown next target "nope"'))).toBeInTheDocument();
    expect(screen.queryByText(strings.unsure)).toBeNull();
    expect(screen.queryByText(strings.saved)).toBeNull();
    expect(editor().readOnly).toBe(false);
    await type(text({ ...DEF, summary: 'fixed' }));
    expect(save()).toBeEnabled();
  });

  it('a conflict (the 200 revision_conflict envelope) is never shown as saved; Compare shows how saving would change it', async () => {
    show();
    await openWith();
    await type(text({ ...DEF, summary: 'mine' }));
    await userEvent.click(save());
    await act(async () => { f.q.puts[0]!.answer(err('failed', { code: 'revision_conflict', status: 200, notApplied: true })); });
    await settle();
    expect(screen.getByText(strings.conflict)).toBeInTheDocument();
    expect(screen.queryByText(strings.saved)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    await act(async () => { f.q.gets[1]!(doc({ ...DEF, summary: 'theirs' }, 'r9')); });
    await settle();
    expect(screen.getByRole('list', { name: strings['diff.title'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['conflict.keep'] })).toBeInTheDocument();
  });

  it('a real workflow (its entry point an object) edited and saved: Save is on, the definition sent as typed', async () => {
    show();
    await openWith();
    const mine = { ...DEF, summary: 'Ship the fix' };
    await type(text(mine));
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    await settle();
    const { name: _n, ...unstamped } = mine;
    expect(f.q.puts[0]!.def).toEqual(unstamped);
  });

  it('a lost save is held, never resent; Check what is saved reads it back', async () => {
    show();
    await openWith();
    await type(text({ ...DEF, summary: 'mine' }));
    await userEvent.click(save());
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    await settle();
    expect(screen.getByText(strings.unsure)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['unsure.check'] }));
    await act(async () => { f.q.gets[1]!(doc(DEF, 'r1')); });
    await settle();
    expect(screen.getByText(strings['unsure.same'])).toBeInTheDocument();
    expect(f.q.puts).toHaveLength(1);
  });
});

describe('Delete, Reset, Hide', () => {
  it('Delete asks for the name typed, then sends one delete; done hides the editor and actions', async () => {
    show();
    await choose('danger.delete');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(f.q.removes).toHaveLength(0);
    const box = within(dlg).getByRole('textbox');
    await userEvent.type(box, 'ship-fix');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.delete.confirm'] }));
    await settle();
    expect(f.q.removes).toHaveLength(1);
    await act(async () => { f.q.removes[0]!(env('deleted workflow "ship-fix"')); });
    await settle();
    expect(screen.getByText(words('danger.done.delete', { name: 'ship-fix' }))).toBeInTheDocument();
    expect(btn('edit')).toBeNull();
    expect(io.refreshed).toBeGreaterThan(0);
  });

  it('a lost reset holds Edit and Reset; Check again reads the list', async () => {
    show({ system: true, customized: true });
    await choose('danger.reset');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.reset.confirm'] }));
    await act(async () => { f.q.removes[0]!(err('pending')); });
    await settle();
    expect(screen.getByText(words('danger.unsure.reset', { name: 'ship-fix' }))).toBeInTheDocument();
    expect(await heldItem('danger.reset')).toBe(true);
    expect(btn('edit')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: strings['danger.check'] }));
    await act(async () => { f.q.lists[0]!(ok({ items: [{ name: 'ship-fix', system: true }] })); });
    await settle();
    expect(screen.getByText(words('danger.done.reset', { name: 'ship-fix' }))).toBeInTheDocument();
  });

  it('a Global reset (answered, no row after) says the shipped version comes back at restart, never that it is back', async () => {
    show({ system: true, customized: true });
    await choose('danger.reset');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(strings['danger.reset.body'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.reset.confirm'] }));
    await act(async () => { f.q.removes[0]!(env('removed your customized "ship-fix"; the shipped version returns at the next restart')); });
    await settle();
    expect(screen.queryByText(words('danger.done.reset', { name: 'ship-fix' }))).toBeNull();
    await act(async () => { f.q.lists[0]!(ok({ items: [] })); });
    await settle();
    expect(screen.getByText(words('danger.done.resetLater', { name: 'ship-fix', computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByText(words('danger.done.reset', { name: 'ship-fix' }))).toBeNull();
  });

  it('an answered reset whose list read fails says the changes are removed and offers to read it again', async () => {
    show({ system: true, customized: true });
    await choose('danger.reset');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.reset.confirm'] }));
    await act(async () => { f.q.removes[0]!(env('ok')); });
    await act(async () => { f.q.lists[0]!(err('failed', { code: 'internal', status: 500 })); });
    await settle();
    expect(screen.getByText(words('danger.done.resetUnread', { name: 'ship-fix' }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['danger.readAgain'] }));
    await act(async () => { f.q.lists[1]!(ok({ items: [{ name: 'ship-fix', system: true }] })); });
    await settle();
    expect(screen.getByText(words('danger.done.reset', { name: 'ship-fix' }))).toBeInTheDocument();
  });

  it('Hide: once answered only the other choice is offered, so it can be undone here', async () => {
    show({ system: true });
    await choose('danger.hide');
    expect(f.q.hides[0]!.hidden).toBe(true);
    await act(async () => { f.q.hides[0]!.answer(ok({ status: 'ok', name: 'ship-fix', hidden: true, hidden_workflows: ['ship-fix'] })); });
    await settle();
    expect(screen.getByText(strings['danger.hiddenNow'])).toBeInTheDocument();
    expect(await offered('danger.hide')).toBe(false);
    await choose('danger.show');
    expect(f.q.hides[1]!.hidden).toBe(false);
  });

  it('with the capability, a hide\'s answer wins over the row it was sent from, until a list read brings a new row', async () => {
    const parsed = wf({ system: true, hidden: false }, true);
    expect(parsed.hidden).toBe(false);
    const v = showW(parsed, 'atlas', true);
    await choose('danger.hide');
    await act(async () => { f.q.hides[0]!.answer(ok({ status: 'ok', name: 'ship-fix', hidden: true, hidden_workflows: ['ship-fix'] })); });
    await settle();
    // The same row object (the list not read again yet): the answer wins.
    v.rerender(<Shown workflow={parsed} computer="atlas" api={f.api} hiddenCap />);
    await settle();
    expect(screen.getByTestId('hidden-tag')).toBeInTheDocument();
    expect(await offered('danger.show')).toBe(true);
    expect(await offered('danger.hide')).toBe(false);
    // A list read brings a new row: it says what the agent has now.
    const fresh = wf({ system: true, hidden: false }, true);
    v.rerender(<Shown workflow={fresh} computer="atlas" api={f.api} hiddenCap />);
    await settle();
    expect(screen.queryByTestId('hidden-tag')).toBeNull();
    expect(await offered('danger.hide')).toBe(true);
    expect(await offered('danger.show')).toBe(false);
  });

  it('with the list read time: the answer holds over reads done by its answer, not over a later one, even the same row object', async () => {
    const parsed = wf({ system: true, hidden: false }, true);
    const v = render(<Shown workflow={parsed} computer="atlas" api={f.api} hiddenCap readAt={100} />);
    await choose('danger.hide');
    const now = vi.spyOn(Date, 'now').mockReturnValue(200);
    await act(async () => { f.q.hides[0]!.answer(ok({ status: 'ok', name: 'ship-fix', hidden: true, hidden_workflows: ['ship-fix'] })); });
    await settle();
    expect(screen.getByTestId('hidden-tag')).toBeInTheDocument();
    // A read that completed in the answer's own millisecond may have started before it: the answer still holds.
    v.rerender(<Shown workflow={parsed} computer="atlas" api={f.api} hiddenCap readAt={200} />);
    await settle();
    expect(screen.getByTestId('hidden-tag')).toBeInTheDocument();
    // Read again after the answer with the same answer: the query keeps the row object, only the read time moves.
    v.rerender(<Shown workflow={parsed} computer="atlas" api={f.api} hiddenCap readAt={201} />);
    await settle();
    expect(screen.queryByTestId('hidden-tag')).toBeNull();
    expect(await offered('danger.hide')).toBe(true);
    expect(await offered('danger.show')).toBe(false);
    now.mockRestore();
  });

  it('with the list read time: a refresh that completes before the answer is drawn still ends it', async () => {
    const parsed = wf({ system: true, hidden: false }, true);
    const v = render(<Shown workflow={parsed} computer="atlas" api={f.api} hiddenCap readAt={100} />);
    await choose('danger.hide');
    const now = vi.spyOn(Date, 'now').mockReturnValue(200);
    // The answer and the list read it starts land in one go: the first render with the answer already has the new read.
    await act(async () => {
      f.q.hides[0]!.answer(ok({ status: 'ok', name: 'ship-fix', hidden: true, hidden_workflows: ['ship-fix'] }));
      await Promise.resolve();
      v.rerender(<Shown workflow={parsed} computer="atlas" api={f.api} hiddenCap readAt={300} />);
    });
    await settle();
    expect(screen.queryByTestId('hidden-tag')).toBeNull();
    expect(await offered('danger.hide')).toBe(true);
    now.mockRestore();
  });

  it('a save still out holds Edit source, Hide and Show, with a reason', async () => {
    show({ system: true });
    await openWith();
    await type(text({ ...DEF, summary: 'x' }));
    await userEvent.click(save());
    await settle();
    expect(f.q.puts).toHaveLength(1);
    expect(btn('edit')).toHaveAttribute('aria-disabled', 'true');
    expect(await heldItem('danger.hide')).toBe(true);
    expect(await heldItem('danger.show')).toBe(true);
    await act(async () => { f.q.puts[0]!.answer(env('updated workflow "ship-fix"')); });
    await settle();
    await act(async () => { f.q.gets[1]!(doc({ ...DEF, summary: 'x', updated_at: 'now' }, 'r2')); });
    await settle();
    expect(btn('edit')).not.toHaveAttribute('aria-disabled', 'true');
    expect(await heldItem('danger.hide')).toBe(false);
  });

  it('a delete or reset still out holds Edit source and the other changes, with a reason', async () => {
    show({ system: true, customized: true });
    await choose('danger.reset');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.reset.confirm'] }));
    await settle();
    expect(screen.getByText(strings['danger.running'])).toBeInTheDocument();
    expect(btn('edit')).toHaveAttribute('aria-disabled', 'true');
    expect(await heldItem('danger.reset')).toBe(true);
  });
});

describe('the editor kept while its detail goes away', () => {
  it('typed text survives another workflow picked (or a pause) and comes back with a note; nothing was sent', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'half done' }));
    first.unmount();
    show({ name: 'other' });
    await settle();
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'ship-fix' }) })).toBeNull();
    cleanup();
    show();
    await settle();
    expect(editor().value).toBe(text({ ...DEF, summary: 'half done' }));
    expect(screen.getByText(strings.kept)).toBeInTheDocument();
    expect(f.q.gets).toHaveLength(1);
    expect(f.q.puts).toHaveLength(0);
  });

  it('a save out when the detail went away lands in the kept editor; a lost one stays unsure, never resent', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'mine' }));
    await userEvent.click(save());
    await settle();
    first.unmount();
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    show();
    await settle();
    expect(screen.getByText(strings.unsure)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(f.q.puts).toHaveLength(1);
  });

  it('an unsure delete is kept too: Edit and Delete stay held when the workflow is shown again', async () => {
    const first = show();
    await choose('danger.delete');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.type(within(dlg).getByRole('textbox'), 'ship-fix');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.delete.confirm'] }));
    await act(async () => { f.q.removes[0]!(err('pending')); });
    await settle();
    first.unmount();
    show();
    await settle();
    expect(screen.getByText(words('danger.unsure.delete', { name: 'ship-fix' }))).toBeInTheDocument();
    expect(await heldItem('danger.delete')).toBe(true);
    expect(btn('edit')).toHaveAttribute('aria-disabled', 'true');
    expect(f.q.removes).toHaveLength(1);
  });

  it('a clean editor is not kept: shown again it starts closed and reads afresh when opened', async () => {
    const first = show();
    await openWith();
    first.unmount();
    show();
    await settle();
    expect(btn('edit')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'ship-fix' }) })).toBeNull();
  });

  it('a kept draft follows the computer, not its shown name: renamed, the draft is still there', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'kept under the id' }));
    first.unmount();
    showW(wf({}), 'atlas-renamed');
    await settle();
    expect(editor().value).toBe(text({ ...DEF, summary: 'kept under the id' }));
  });

  it('after a reset, a new draft survives the detail going away and coming back (the reset is not done again)', async () => {
    const first = show({ system: true, customized: true });
    await openWith();
    await choose('danger.reset');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.reset.confirm'] }));
    await act(async () => { f.q.removes[0]!(env('ok')); });
    await act(async () => { f.q.lists[0]!(ok({ items: [{ name: 'ship-fix', system: true }] })); });
    await act(async () => { f.q.gets[1]!(doc(DEF, 'r2')); });
    await settle();
    await type(text({ ...DEF, summary: 'after the reset' }));
    first.unmount();
    show({ system: true, customized: true });
    await settle();
    expect(editor().value).toBe(text({ ...DEF, summary: 'after the reset' }));
    expect(f.q.gets).toHaveLength(2);
  });

  it('a confirmed delete drops the draft with the workflow: nothing kept, a reload is not held', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'unsaved' }));
    await choose('danger.delete');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.type(within(dlg).getByRole('textbox'), 'ship-fix');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.delete.confirm'] }));
    await act(async () => { f.q.removes[0]!(env('deleted')); });
    await settle();
    first.unmount();
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  // the delete answered after the editor went away (row switch, Back, pause).
  it('a delete answered after leaving still drops the draft: nothing kept, a reload is not held', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'unsaved' }));
    await choose('danger.delete');
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.type(within(dlg).getByRole('textbox'), 'ship-fix');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['danger.delete.confirm'] }));
    first.unmount();
    expect(keptSourceCount()).toBe(1);
    await act(async () => { f.q.removes[0]!(env('deleted')); });
    await settle();
    // Settled and dropped with no editor mounted.
    expect(keptSourceCount()).toBe(0);
    const io0 = io.refreshed;
    show({ name: 'other' });
    await settle();
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(io0).toBeGreaterThan(0);
    cleanup();
    // The deleted workflow shown again starts fresh: no open editor, no kept text.
    show();
    await settle();
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'ship-fix' }) })).toBeNull();
  });

  it('a kept draft holds a reload; once its context is gone (realm switch, sign-out) it holds nothing', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'unsaved' }));
    first.unmount();
    const e1 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    bump('switch');
    const e2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });

  it('another computer selected, even one with the same shown name: the editor kept for the first is not shown', async () => {
    const first = show();
    await openWith();
    await type(text({ ...DEF, summary: 'on c1' }));
    first.unmount();
    // Same project, another container.
    setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv2' } });
    show();
    await settle();
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'ship-fix' }) })).toBeNull();
  });
});
