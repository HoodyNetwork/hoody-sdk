// The agent source editor on a live component, over a fake api: load states, a checked save, the three ways out of a
// conflict (Compare shows the diff), a lost save asking to be checked (never resent), Reset and Delete waiting for Resume,
// their confirms, and the unknown outcomes read back.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- a router harness for the editor's leave guard, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { AgentSource, type AgentSourceProps } from './Source';
import type { Refusal, Settled, SourceApi } from './sourceApi';
import strings from './Source.strings.en.json';

const ok = (b: unknown): Settled => ({ ok: true, body: b });
const err = (kind: Refusal['kind'], o: Partial<Refusal> = {}): Settled => ({ ok: false, err: { kind, code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null, ...o } });
const doc = (content: string, revision: string, path = '/home/agents/helper.md') => ok({ path, content, revision });
const conflict = err('failed', { code: 'revision_conflict', status: 409, notApplied: true, currentRevision: 'r2' });

type Pending = (s: Settled) => void;
function fake() {
  const q = { gets: [] as Pending[], puts: [] as Array<{ content: string; expected: string; answer: Pending }>, removes: [] as Pending[], resets: [] as Pending[] };
  const api: SourceApi = {
    get: () => new Promise<Settled>((r) => q.gets.push(r)),
    put: (content, expected) => new Promise<Settled>((r) => q.puts.push({ content, expected, answer: r })),
    remove: () => new Promise<Settled>((r) => q.removes.push(r)),
    reset: () => new Promise<Settled>((r) => q.resets.push(r)),
  };
  return { q, api };
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

let f: ReturnType<typeof fake>;
async function show(o: Partial<AgentSourceProps> & { content?: string; revision?: string } = {}) {
  const { content = '---\nname: helper\ntools: none\n---\nhi', revision = 'r1', ...props } = o;
  const view = render(<AgentSource name="helper" productOwned={false} computer="atlas" paused={false} api={f.api} {...props} />);
  await settle();
  await act(async () => { f.q.gets[0]!(doc(content, revision)); });
  await settle();
  return view;
}
const editor = () => screen.getByRole('textbox', { name: words('label', { name: 'helper' }) }) as HTMLTextAreaElement;
const type = async (text: string) => { await act(async () => { fireEvent.change(editor(), { target: { value: text } }); }); };
const press = async (name: string | RegExp) => { await userEvent.click(screen.getByRole('button', { name })); await settle(); };
// The kit's read-back button on a pending outcome line.
const CHECK = 'Check again';
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A button that is not there, or is there disabled. */
const offOrGone = (name: string) => { const b = screen.queryByRole('button', { name }); return !b || b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true'; };
const pressText = async (name: string | RegExp) => { await userEvent.click(screen.getByText(name)); await settle(); };

beforeEach(() => { f = fake(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('loading', () => {
  it('shows the file as read, with its path', async () => {
    await show();
    expect(editor().value).toBe('---\nname: helper\ntools: none\n---\nhi');
    expect(screen.getByText(words('file', { path: '/home/agents/helper.md' }))).toBeTruthy();
    expect(screen.getByRole('button', { name: words('save') }).hasAttribute('disabled')).toBe(true);
  });
  it('an embedded default (no file yet) says saving creates yours', async () => {
    render(<AgentSource name="helper" productOwned={false} computer="atlas" paused={false} api={f.api} />);
    await settle();
    await act(async () => { f.q.gets[0]!(doc('x', 'r1', '')); });
    await settle();
    expect(screen.getByText(words('new'))).toBeTruthy();
  });
  it('a failed read offers Try again, which reads again; a missing agent says so', async () => {
    render(<AgentSource name="helper" productOwned={false} computer="atlas" paused={false} api={f.api} />);
    await settle();
    await act(async () => { f.q.gets[0]!(err('failed', { status: 500, code: 'internal' })); });
    await settle();
    expect(screen.getByText(words('load.failed.title', { name: 'helper' }))).toBeTruthy();
    await press(/try again/i);
    expect(f.q.gets.length).toBe(2);
    await act(async () => { f.q.gets[1]!(err('failed', { status: 404, code: 'not_found' })); });
    await settle();
    expect(screen.getByText(words('load.gone.title', { name: 'helper' }))).toBeTruthy();
  });
  it('a Hoody-owned agent (its row says so) is read-only and has no Reset or Delete', async () => {
    render(<AgentSource name="bot" productOwned computer="atlas" paused={false} api={f.api} />);
    await settle();
    await act(async () => { f.q.gets[0]!(doc('x', 'r1')); });
    await settle();
    expect(screen.getByText(words('readonly', { name: 'bot' }))).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByText(words('danger.delete'))).toBeNull();
  });
  it('read-only comes from the row, never the name: a Hoody-owned name the row calls ordinary is editable, any row marked owned is not', async () => {
    render(<AgentSource name="github-installer" productOwned={false} computer="atlas" paused={false} api={f.api} />);
    await settle();
    await act(async () => { f.q.gets[0]!(doc('x', 'r1')); });
    await settle();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(false);
    expect(screen.getByText(words('danger.delete'))).toBeTruthy();
    cleanup();
    render(<AgentSource name="helper" productOwned computer="atlas" paused={false} api={f.api} />);
    await settle();
    await act(async () => { f.q.gets[1]!(doc('x', 'r1')); });
    await settle();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByText(words('danger.delete'))).toBeNull();
  });
});

describe('save', () => {
  it('sends the text as typed with the revision; tools: none is kept; then Saved', async () => {
    await show();
    await type('---\nname: helper\ntools: none\n---\nhello');
    expect(screen.getByText(words('dirty'))).toBeTruthy();
    await press(words('save'));
    expect(f.q.puts.length).toBe(1);
    expect(f.q.puts[0]).toMatchObject({ content: '---\nname: helper\ntools: none\n---\nhello', expected: 'r1' });
    expect(screen.getByRole('button', { name: words('saving') })).toBeTruthy();
    await act(async () => { f.q.puts[0]!.answer(ok({ path: '/home/agents/helper.md', revision: 'r2' })); });
    await settle();
    expect(screen.getByText(words('saved'))).toBeTruthy();
    expect(screen.queryByText(words('dirty'))).toBeNull();
  });
  it('Ctrl+S in the editor saves too', async () => {
    await show();
    await type('x');
    await act(async () => { fireEvent.keyDown(editor(), { key: 's', ctrlKey: true }); });
    await settle();
    expect(f.q.puts.length).toBe(1);
  });
  it('a refusal says nothing was written, in fixed words (the agent\'s text is not shown)', async () => {
    await show();
    await type('x');
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(err('failed', { status: 400, code: 'bad_request' })); });
    await settle();
    expect(screen.getByText(words('refused.bad_request'))).toBeTruthy();
  });
  it('a file over 1 MiB cannot be saved', async () => {
    await show();
    await type('é'.repeat(600000));
    expect(screen.getByText(words('tooBig'))).toBeTruthy();
    expect(screen.getByRole('button', { name: words('save') }).hasAttribute('disabled')).toBe(true);
  });
});

describe('a save whose answer is lost', () => {
  async function lost() {
    await show();
    await type('mine');
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    await settle();
  }
  it('says it may have been saved, locks the editor, and sends nothing again', async () => {
    await lost();
    expect(screen.getByText(words('unsure'))).toBeTruthy();
    expect(editor().readOnly).toBe(true);
    expect(screen.getByRole('button', { name: words('save') }).hasAttribute('disabled')).toBe(true);
    expect(f.q.puts.length).toBe(1);
  });
  it('Check what is saved reads the file: it holds the text, so Saved', async () => {
    await lost();
    await press(words('unsure.check'));
    await act(async () => { f.q.gets[1]!(doc('mine', 'r2')); });
    await settle();
    expect(screen.getByText(words('saved'))).toBeTruthy();
    expect(screen.queryByText(words('unsure'))).toBeNull();
    expect(editor().readOnly).toBe(false);
  });
  it('Check: the file looks as before. That proves nothing, so it stays unknown and Reset / Delete stay held', async () => {
    await lost();
    await press(words('unsure.check'));
    await act(async () => { f.q.gets[1]!(doc('---\nname: helper\ntools: none\n---\nhi', 'r1')); });
    await settle();
    expect(screen.getByText(words('unsure.same'))).toBeTruthy();
    expect(screen.getByText(words('unsure'))).toBeTruthy();
    expect(editor().value).toBe('mine');
    for (const k of ['save', 'danger.reset', 'danger.delete'] as const) expect(screen.getByRole('button', { name: words(k) }).hasAttribute('disabled')).toBe(true);
  });
  it('Check: a different file proves nothing either: it is not called a conflict, and nothing is forgotten', async () => {
    await lost();
    await press(words('unsure.check'));
    await act(async () => { f.q.gets[1]!(doc('someone else', 'r9')); });
    await settle();
    expect(screen.getByText(words('unsure.changed'))).toBeTruthy();
    expect(screen.queryByText(words('conflict'))).toBeNull();
    expect(screen.getByRole('button', { name: words('danger.reset') }).hasAttribute('disabled')).toBe(true);
  });
  it('Stop tracking… asks first (it may still land), then frees the editor on the file as last seen; nothing is sent', async () => {
    await lost();
    await press(words('unsure.check'));
    await act(async () => { f.q.gets[1]!(doc('someone else', 'r9')); });
    await settle();
    await pressText(words('unsure.abandon'));
    expect(screen.getByText(words('abandon.body'))).toBeTruthy();
    expect(screen.getByText(words('unsure'))).toBeTruthy();
    await press(words('abandon.confirm'));
    expect(screen.queryByText(words('unsure'))).toBeNull();
    expect(editor().readOnly).toBe(false);
    expect(editor().value).toBe('mine');
    expect(f.q.puts.length).toBe(1);
    await press(words('save'));
    expect(f.q.puts[1]).toMatchObject({ content: 'mine', expected: 'r9' });
  });
  it('after a permanent 404 the way out is the same: Stop tracking…', async () => {
    await lost();
    await press(words('unsure.check'));
    await act(async () => { f.q.gets[1]!(err('failed', { status: 404, code: 'not_found' })); });
    await settle();
    await pressText(words('unsure.abandon'));
    await press(words('abandon.confirm'));
    expect(editor().readOnly).toBe(false);
    expect(editor().value).toBe('mine');
  });
  it('Check: the file is gone. The editor and the draft stay, with the unknown outcome and a note', async () => {
    await lost();
    await press(words('unsure.check'));
    await act(async () => { f.q.gets[1]!(err('failed', { status: 404, code: 'not_found' })); });
    await settle();
    expect(screen.getByText(words('unsure.gone'))).toBeTruthy();
    expect(screen.getByText(words('unsure'))).toBeTruthy();
    expect(editor().value).toBe('mine');
  });
});

describe('a conflict', () => {
  async function conflicted() {
    await show({ content: 'a\nb\nc', revision: 'r1' });
    await type('a\nMINE\nc');
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(conflict); });
    await settle();
  }
  it('wrote nothing: the draft stays, the editor is locked, Compare / Load their file are offered', async () => {
    await conflicted();
    expect(screen.getByText(words('conflict'))).toBeTruthy();
    expect(editor().value).toBe('a\nMINE\nc');
    expect(editor().readOnly).toBe(true);
    expect(screen.queryByText(words('conflict.keep'))).toBeNull();
  });
  it('Compare reads their file and shows how saving yours over it would change it', async () => {
    await conflicted();
    await pressText(words('conflict.compare'));
    await act(async () => { f.q.gets[1]!(doc('a\nTHEIRS\nc', 'r2')); });
    await settle();
    const list = screen.getByRole('list', { name: words('diff.title') });
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['a', '-THEIRS', '+MINE', 'c']);
    expect(screen.getByText(/1 line added/)).toBeTruthy();
  });
  it('Keep mine bases the draft on their revision; the next Save is checked against it', async () => {
    await conflicted();
    await pressText(words('conflict.compare'));
    await act(async () => { f.q.gets[1]!(doc('a\nTHEIRS\nc', 'r2')); });
    await settle();
    await pressText(words('conflict.keep'));
    expect(editor().readOnly).toBe(false);
    expect(editor().value).toBe('a\nMINE\nc');
    await press(words('save'));
    expect(f.q.puts[1]).toMatchObject({ content: 'a\nMINE\nc', expected: 'r2' });
  });
  it('Load their file asks before dropping the draft, then loads it', async () => {
    await conflicted();
    await pressText(words('conflict.reload'));
    expect(f.q.gets.length).toBe(1);
    await press(words('reload.confirm'));
    await act(async () => { f.q.gets[1]!(doc('a\nTHEIRS\nc', 'r2')); });
    await settle();
    expect(editor().value).toBe('a\nTHEIRS\nc');
    expect(screen.queryByText(words('conflict'))).toBeNull();
  });
});

describe('Reset to shipped and Delete', () => {
  it('say "Resume to ..." and are disabled while agents are paused; nothing is sent', async () => {
    await show({ paused: true });
    for (const k of ['danger.reset.paused', 'danger.delete.paused'] as const) {
      expect(screen.getByRole('button', { name: words(k) }).hasAttribute('disabled')).toBe(true);
    }
    expect(screen.getByText(words('danger.paused.hint', { computer: 'atlas' }))).toBeTruthy();
    expect(f.q.removes.length + f.q.resets.length).toBe(0);
  });
  it('Reset asks first, sends once, and reloads the file on done', async () => {
    const onReset = vi.fn();
    await show({ onReset });
    await press(words('danger.reset'));
    expect(f.q.resets.length).toBe(0);
    await press(words('danger.reset.confirm'));
    expect(f.q.resets.length).toBe(1);
    await act(async () => { f.q.resets[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    expect(onReset).toHaveBeenCalledTimes(1);
    await act(async () => { f.q.gets[1]!(doc('shipped', 'r7')); });
    await settle();
    expect(editor().value).toBe('shipped');
    expect(screen.getByText(words('danger.done.reset', { name: 'helper' }))).toBeTruthy();
  });
  it('Delete needs the name typed; done tells the host', async () => {
    const onDeleted = vi.fn();
    await show({ onDeleted });
    await press(words('danger.delete'));
    const confirm = screen.getByRole('button', { name: words('danger.delete.confirm') });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await userEvent.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), 'helper');
    await press(words('danger.delete.confirm'));
    expect(f.q.removes.length).toBe(1);
    await act(async () => { f.q.removes[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
  it('the host is told once, even when its callback is a new function on every render', async () => {
    const calls: number[] = [];
    const view = await show({ onDeleted: () => calls.push(1) });
    await press(words('danger.delete'));
    await userEvent.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), 'helper');
    await press(words('danger.delete.confirm'));
    await act(async () => { f.q.removes[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    for (let i = 0; i < 3; i++) view.rerender(<AgentSource name="helper" productOwned={false} computer="atlas" paused={false} api={f.api} onDeleted={() => calls.push(1)} />);
    await settle();
    expect(calls.length).toBe(1);
  });
  it('a daemon_paused refusal says nothing was done', async () => {
    await show();
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(err('failed', { code: 'daemon_paused', status: 503, notApplied: true })); });
    await settle();
    expect(screen.getByText(words('danger.paused', { computer: 'atlas' }))).toBeTruthy();
  });
  it('an unknown outcome is read back, never resent: gone means deleted', async () => {
    const onDeleted = vi.fn();
    await show({ onDeleted });
    await press(words('danger.delete'));
    await userEvent.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), 'helper');
    await press(words('danger.delete.confirm'));
    await act(async () => { f.q.removes[0]!(err('pending')); });
    await settle();
    expect(screen.getByText(words('danger.unsure'))).toBeTruthy();
    // The row offers only Check again: no Delete to press.
    expect(offOrGone(words('danger.delete'))).toBe(true);
    await press(CHECK);
    await act(async () => { f.q.gets[1]!(err('failed', { status: 404, code: 'not_found' })); });
    await settle();
    expect(f.q.removes.length).toBe(1);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
  it('an unknown outcome read back as the same file proves nothing: it stays held until the person stops watching, knowingly', async () => {
    await show();
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(err('pending')); });
    await settle();
    await press(CHECK);
    await act(async () => { f.q.gets[1]!(doc('---\nname: helper\ntools: none\n---\nhi', 'r1')); });
    await settle();
    expect(screen.getByText(new RegExp(esc(words('danger.seenSame'))))).toBeTruthy();
    expect(offOrGone(words('danger.reset'))).toBe(true);
    await pressText(words('danger.forget'));
    expect(f.q.resets.length).toBe(1);
    await press(words('forget.confirm'));
    expect(screen.getByRole('button', { name: words('danger.reset') }).hasAttribute('disabled')).toBe(false);
    expect(f.q.resets.length).toBe(1);
  });
  it('after a reset whose check found the agent gone, nothing is claimed', async () => {
    await show();
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(err('pending')); });
    await settle();
    await press(CHECK);
    await act(async () => { f.q.gets[1]!(err('failed', { status: 404, code: 'not_found' })); });
    await settle();
    expect(screen.getByText(new RegExp(esc(words('danger.seenGone'))))).toBeTruthy();
    expect(screen.queryByText(words('danger.done.reset', { name: 'helper' }))).toBeNull();
  });
  it('a success the Hub cannot read is an unknown outcome, not Deleted', async () => {
    const onDeleted = vi.fn();
    await show({ onDeleted });
    await press(words('danger.delete'));
    await userEvent.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), 'helper');
    await press(words('danger.delete.confirm'));
    await act(async () => { f.q.removes[0]!(ok({})); });
    await settle();
    expect(screen.getByText(words('danger.unsure'))).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
  });
  it('Reset reads the file fresh afterwards, never the comparison read before', async () => {
    await show({ content: 'a', revision: 'r1' });
    await type('mine');
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(conflict); });
    await settle();
    await pressText(words('conflict.compare'));
    await act(async () => { f.q.gets[1]!(doc('old custom', 'r2')); });
    await settle();
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    expect(f.q.gets.length).toBe(3);
    await act(async () => { f.q.gets[2]!(doc('shipped', 'r9')); });
    await settle();
    expect(editor().value).toBe('shipped');
  });
});

describe('Save and Reset / Delete exclude each other', () => {
  it('Reset and Delete are disabled while a save runs or its outcome is unknown', async () => {
    await show();
    await type('x');
    await press(words('save'));
    for (const k of ['danger.reset', 'danger.delete'] as const) expect(screen.getByRole('button', { name: words(k) }).hasAttribute('disabled')).toBe(true);
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    await settle();
    for (const k of ['danger.reset', 'danger.delete'] as const) expect(screen.getByRole('button', { name: words(k) }).hasAttribute('disabled')).toBe(true);
  });
  it('while a reset runs the editor is read-only and neither the button nor Ctrl+S saves', async () => {
    await show();
    await type('x');
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    expect(editor().readOnly).toBe(true);
    expect(screen.getByRole('button', { name: words('save') }).hasAttribute('disabled')).toBe(true);
    await act(async () => { fireEvent.keyDown(editor(), { key: 's', ctrlKey: true }); });
    await settle();
    expect(f.q.puts.length).toBe(0);
  });
});

describe('after a reset', () => {
  it('the editor is read-only and takes nothing while the fresh read is out; the text read replaces it afterwards', async () => {
    await show();
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    expect(f.q.gets.length).toBe(2);
    expect(editor().readOnly).toBe(true);
    // The row offers only Check again: no Delete to press.
    expect(offOrGone(words('danger.delete'))).toBe(true);
    await act(async () => { f.q.gets[1]!(doc('shipped', 'r9')); });
    await settle();
    expect(editor().readOnly).toBe(false);
    expect(editor().value).toBe('shipped');
  });
  it('a failed read leaves the old text under a band that says it may be out of date; Read it again reads again', async () => {
    await show();
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    await act(async () => { f.q.gets[1]!(err('failed', { status: 500, code: 'internal' })); });
    await settle();
    expect(screen.getByText(words('stale'))).toBeTruthy();
    expect(editor().readOnly).toBe(false);
    await pressText(words('stale.reload'));
    await act(async () => { f.q.gets[2]!(doc('shipped', 'r9')); });
    await settle();
    expect(screen.queryByText(words('stale'))).toBeNull();
    expect(editor().value).toBe('shipped');
  });
});

describe('Compare of a long change', () => {
  it('says how many lines are not shown', async () => {
    const mineText = Array.from({ length: 450 }, (_, i) => `mine ${i}`).join('\n');
    await show({ content: 'a', revision: 'r1' });
    await type(mineText);
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(conflict); });
    await settle();
    await pressText(words('conflict.compare'));
    await act(async () => { f.q.gets[1]!(doc('theirs', 'r2')); });
    await settle();
    expect(screen.getByText(words('diff.cut', { n: '51' }))).toBeTruthy();
  });
});

describe('onHeldChange (the host keeps a held editor open)', () => {
  const FILE = '---\nname: helper\ntools: none\n---\nhi';

  it('says true when a draft starts, false when it is undone, and false when the editor closes', async () => {
    const seen: boolean[] = [];
    const view = await show({ onHeldChange: (h) => seen.push(h) });
    expect(seen.at(-1)).toBe(false);
    await type('mine');
    expect(seen.at(-1)).toBe(true);
    await type(FILE);
    expect(seen.at(-1)).toBe(false);
    await type('mine');
    expect(seen.at(-1)).toBe(true);
    seen.length = 0;
    view.unmount();
    expect(seen).toEqual([false]);
  });

  it('a save of unknown outcome holds too (the leave guard\'s own predicate)', async () => {
    const seen: boolean[] = [];
    await show({ onHeldChange: (h) => seen.push(h) });
    await type('hello');
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    await settle();
    expect(screen.getByText(words('unsure'))).toBeTruthy();
    expect(seen.at(-1)).toBe(true);
  });

  it('a Reset running with no draft holds too (not only a draft: the leave guard\'s predicate)', async () => {
    const seen: boolean[] = [];
    await show({ onHeldChange: (h) => seen.push(h) });
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    expect(f.q.resets.length).toBe(1);
    expect(seen.at(-1)).toBe(true);
  });

  it('without the prop the editor works as before', async () => {
    await show();
    await type('mine');
    expect(screen.getByRole('button', { name: words('save') }).hasAttribute('disabled')).toBe(false);
  });
});

describe('route once: hostGuard, leaveRef stay and alsoLost', () => {
  type LeaveRef = { current: ((go: () => void, stay?: () => void) => void) | null };
  const dialogs = () => [...screen.queryAllByRole('alertdialog'), ...screen.queryAllByRole('dialog')];
  const body = () => within(dialogs()[0]!);

  async function routed(props: Partial<AgentSourceProps> = {}) {
    const Page = () => <AgentSource name="helper" productOwned={false} computer="atlas" paused={false} api={f.api} {...props} />;
    const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/ai/agents'] }) });
    await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
    await settle();
    await act(async () => { f.q.gets[0]!(doc('---\nname: helper\ntools: none\n---\nhi', 'r1')); });
    await settle();
    const go = async (to: string) => { await act(async () => { void router.navigate({ to: to as never }); await new Promise((r) => setTimeout(r, 10)); }); };
    return { go, where: () => router.state.location.pathname };
  }

  it('hostGuard: a draft holds no path change of its own (the host asks)', async () => {
    const r = await routed({ hostGuard: true });
    await type('mine');
    await r.go('/elsewhere');
    expect(dialogs()).toHaveLength(0);
    expect(r.where()).toBe('/elsewhere');
  });

  it('without hostGuard the editor keeps its own guard: a path change with a draft asks, Stay stays', async () => {
    const r = await routed();
    await type('mine');
    await r.go('/elsewhere');
    expect(dialogs()).toHaveLength(1);
    expect(body().getByText(words('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(body().getByRole('button', { name: words('leave.stay') }));
    await settle();
    expect(r.where()).toBe('/ai/agents');
    expect(editor().value).toBe('mine');
  });

  it('leaveRef: Stay calls the host\'s stay and keeps the draft; Leave runs go', async () => {
    const ref: LeaveRef = { current: null };
    await show({ leaveRef: ref, hostGuard: true });
    await type('mine');
    const go = vi.fn();
    const stay = vi.fn();
    act(() => { ref.current!(go, stay); });
    await userEvent.click(body().getByRole('button', { name: words('leave.stay') }));
    expect(stay).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    expect(editor().value).toBe('mine');
    act(() => { ref.current!(go, stay); });
    await userEvent.click(body().getByRole('button', { name: words('leave.leave') }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(stay).toHaveBeenCalledTimes(1);
  });

  it('alsoLost is added to the leave body, also to the unknown-save body; without it the body is unchanged', async () => {
    const ref: LeaveRef = { current: null };
    const also = 'Your tool ticks for helper are not saved either.';
    const view = await show({ leaveRef: ref, alsoLost: also });
    await type('mine');
    act(() => { ref.current!(() => {}); });
    expect(body().getByText(`${words('leave.body', { name: 'helper' })} ${also}`)).toBeTruthy();
    await userEvent.click(body().getByRole('button', { name: words('leave.stay') }));
    await press(words('save'));
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    await settle();
    act(() => { ref.current!(() => {}); });
    expect(body().getByText(`${words('leave.body.unsure', { name: 'helper' })} ${also}`)).toBeTruthy();
    await userEvent.click(body().getByRole('button', { name: words('leave.stay') }));
    view.unmount();
    f = fake();
    const ref2: LeaveRef = { current: null };
    await show({ leaveRef: ref2 });
    await type('mine');
    act(() => { ref2.current!(() => {}); });
    expect(body().getByText(words('leave.body', { name: 'helper' }))).toBeTruthy();
  });
  // A draft can outlive a read that ends gone (a Reset whose follow-up read finds no file).
  // The gone branch still renders the guard and its dialog, so a held navigation gets Stay and Leave.
  const resetToGone = async () => {
    await type('mine');
    await press(words('danger.reset'));
    await press(words('danger.reset.confirm'));
    await act(async () => { f.q.resets[0]!(ok({ output: 'x', is_error: false })); });
    await settle();
    await act(async () => { f.q.gets[1]!(err('failed', { status: 404, code: 'not_found' })); });
    await settle();
    expect(screen.getByText(words('load.gone.title', { name: 'helper' }))).toBeTruthy();
  };

  it('gone after a Reset with a draft left: the host\'s leaveRef still asks; Stay calls stay, Leave runs go', async () => {
    const ref: LeaveRef = { current: null };
    const held: boolean[] = [];
    await show({ leaveRef: ref, hostGuard: true, onHeldChange: (h) => held.push(h) });
    await resetToGone();
    expect(held.at(-1)).toBe(true);
    const go = vi.fn();
    const stay = vi.fn();
    act(() => { ref.current!(go, stay); });
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(body().getByRole('button', { name: words('leave.stay') }));
    expect(stay).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    act(() => { ref.current!(go, stay); });
    await userEvent.click(body().getByRole('button', { name: words('leave.leave') }));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('gone after a Reset with a draft left, own guard: a path change asks, Stay stays, Leave goes', async () => {
    const r = await routed();
    await resetToGone();
    await r.go('/elsewhere');
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(body().getByRole('button', { name: words('leave.stay') }));
    await settle();
    expect(r.where()).toBe('/ai/agents');
    await r.go('/elsewhere');
    await userEvent.click(body().getByRole('button', { name: words('leave.leave') }));
    await settle();
    expect(r.where()).toBe('/elsewhere');
  });
});

describe('the editor folded under a host\'s settings rows (folded)', () => {
  it('starts folded, opens on its title, and a draft keeps it open', async () => {
    await show({ folded: true });
    const fold = screen.getByRole('button', { name: new RegExp(words('editor.title')) });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: words('label', { name: 'helper' }) })).toBeNull();
    await userEvent.click(fold);
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    await type('changed');
    await userEvent.click(fold);
    // A draft is never folded away.
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(editor()).toBeTruthy();
  });
});
