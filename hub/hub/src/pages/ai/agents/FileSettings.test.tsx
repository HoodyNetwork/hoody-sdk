// The agent's file-only settings, each edited on its own row, over a fake api: the Hub checks the typed value before
// anything is sent; a save changes that one line of the file as read and is checked against its revision; a conflict
// writes nothing and shows the file as it is now; a lost answer is never sent again and Check again only reads.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentFileSettings, type AgentFileSettingsProps } from './FileSettings';
import type { Refusal, Settled, SourceApi } from './sourceApi';
import strings from './FileSettings.strings.en.json';

const ok = (b: unknown): Settled => ({ ok: true, body: b });
const err = (kind: Refusal['kind'], o: Partial<Refusal> = {}): Settled => ({ ok: false, err: { kind, code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null, ...o } });
const doc = (content: string, revision: string, path = '/home/agents/helper.md') => ok({ path, content, revision });
const FILE = '---\nname: helper\ntools: none\ntemperature: 0.4\n---\nYou help.\n';

type Pending = (s: Settled) => void;
function fake() {
  const q = { gets: [] as Pending[], puts: [] as Array<{ content: string; expected: string; answer: Pending }> };
  const api: Pick<SourceApi, 'get' | 'put'> = {
    get: () => new Promise<Settled>((r) => q.gets.push(r)),
    put: (content, expected) => new Promise<Settled>((r) => q.puts.push({ content, expected, answer: r })),
  };
  return { q, api };
}
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

let f: ReturnType<typeof fake>;
let saved: number;
let held: boolean[];
async function show(o: Partial<AgentFileSettingsProps> & { content?: string; path?: string } = {}) {
  const { content = FILE, path, ...props } = o;
  const view = render(<AgentFileSettings name="helper" productOwned={false} api={f.api} onSaved={() => { saved++; }} onHeldChange={(h) => held.push(h)} {...props} />);
  await settle();
  await act(async () => { f.q.gets[0]!(doc(content, 'r1', path)); });
  await settle();
  return view;
}
/** The row of a setting: the group row that holds its label. */
const row = (label: string) => screen.getByText(label).closest('[data-sg-row]') as HTMLElement;
const edit = async (label: string) => { await userEvent.click(within(row(label)).getByRole('button', { name: words('edit') })); };
const type = async (field: string, text: string) => { await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: field }), { target: { value: text } }); }); };
const saveButton = (label: string) => within(row(label)).getByRole('button', { name: 'Save' });
const isOff = (b: HTMLElement) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
const TEMP = strings['temperature.label'], STEPS = strings['max_steps_per_turn.label'], WAIT = strings['ask_timeout.label'];

beforeEach(() => { f = fake(); saved = 0; held = []; });
afterEach(cleanup);

describe('what the rows show', () => {
  it('each setting with its value and whether it is in the file or the default', async () => {
    await show();
    expect(within(row(TEMP)).getByText('0.4')).toBeTruthy();
    expect(within(row(TEMP)).getByText(words('state.set'))).toBeTruthy();
    expect(within(row(STEPS)).getByText(words('max_steps_per_turn.default'))).toBeTruthy();
    expect(within(row(STEPS)).getByText(words('state.default'))).toBeTruthy();
  });
  it('a step limit of one is said in the singular', async () => {
    await show({ content: '---\nname: helper\nmax_steps_per_turn: 1\n---\n' });
    expect(within(row(STEPS)).getByText('1 step')).toBeTruthy();
    cleanup();
    f = fake();
    await show({ content: '---\nname: helper\nmax_steps_per_turn: 2000\n---\n' });
    expect(within(row(STEPS)).getByText('2,000 steps')).toBeTruthy();
  });
  it('a value the agent ignores is marked Check and says the default applies', async () => {
    await show({ content: '---\nname: helper\ntemperature: hot\n---\n' });
    expect(within(row(TEMP)).getByText(words('state.ignored'))).toBeTruthy();
    // The default is what the agent uses; the tag's tip says why.
    expect(within(row(TEMP)).getByText(words('temperature.default'))).toBeTruthy();
    await userEvent.click(within(row(TEMP)).getByText(words('state.ignored')));
    expect(await screen.findByText(words('ignored'))).toBeTruthy();
  });
  it('a key on two lines is not edited here', async () => {
    await show({ content: '---\nname: helper\ntemperature: 1\ntemperature: 2\n---\n' });
    expect(within(row(TEMP)).getByText(words('state.twice'))).toBeTruthy();
    expect(within(row(TEMP)).queryByRole('button', { name: words('edit') })).toBeNull();
    expect(within(row(STEPS)).getByRole('button', { name: words('edit') })).toBeTruthy();
  });
  it('a file with no settings block offers no rows and says where to edit', async () => {
    await show({ content: 'You help.\n' });
    expect(screen.getByText(words('noBlock'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: words('edit') })).toBeNull();
  });
  it('a failed read shows the kit error; Try again reads once more, and nothing is offered for editing', async () => {
    render(<AgentFileSettings name="helper" productOwned={false} api={f.api} />);
    await settle();
    await act(async () => { f.q.gets[0]!(err('failed', { code: 'server', status: 500 })); });
    await settle();
    expect(screen.queryByRole('button', { name: words('edit') })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await settle();
    expect(f.q.gets).toHaveLength(2);
    await act(async () => { f.q.gets[1]!(doc(FILE, 'r1')); });
    await settle();
    expect(within(row(TEMP)).getByText('0.4')).toBeTruthy();
  });
  it('a Hoody-owned agent, or a file editor that holds something, offers no Edit', async () => {
    await show({ productOwned: true });
    expect(screen.queryByRole('button', { name: words('edit') })).toBeNull();
    expect(screen.getByText(words('owned'))).toBeTruthy();
    cleanup();
    f = fake();
    await show({ blocked: true });
    expect(screen.queryByRole('button', { name: words('edit') })).toBeNull();
    expect(screen.getByText(words('blocked'))).toBeTruthy();
  });
});

describe('the Hub checks the value before anything is sent', () => {
  it('a value out of range names the bound, Save stays off and nothing is sent', async () => {
    await show();
    await edit(TEMP);
    await type(words('temperature.field'), '3');
    expect(screen.getByText(words('bad.tooHigh', { max: '2' }))).toBeTruthy();
    expect(isOff(saveButton(TEMP))).toBe(true);
    await type(words('temperature.field'), 'warm');
    expect(screen.getByText(words('bad.notNumber', { example: '0.7' }))).toBeTruthy();
    expect(isOff(saveButton(TEMP))).toBe(true);
    expect(f.q.puts).toHaveLength(0);
  });
  it('a whole-number setting refuses a fraction and a value under its floor', async () => {
    await show();
    await edit(STEPS);
    await type(words('max_steps_per_turn.field'), '1.5');
    expect(screen.getByText(words('bad.notWhole'))).toBeTruthy();
    await type(words('max_steps_per_turn.field'), '0');
    expect(screen.getByText(words('bad.tooLow', { min: '1' }))).toBeTruthy();
    expect(isOff(saveButton(STEPS))).toBe(true);
  });
  it('a wait that is not a time is refused in words', async () => {
    await show();
    await edit(WAIT);
    await type(words('ask_timeout.field'), 'ten minutes');
    expect(screen.getByText(words('bad.notDuration'))).toBeTruthy();
    await type(words('ask_timeout.field'), '25h');
    expect(screen.getByText(words('bad.tooHigh', { max: words('ask_timeout.max') }))).toBeTruthy();
    expect(isOff(saveButton(WAIT))).toBe(true);
  });
  it('an editor opened and left as it was has nothing to save', async () => {
    await show();
    await edit(TEMP);
    expect(isOff(saveButton(TEMP))).toBe(true);
  });
});

describe('a save', () => {
  it('sends the file as read with that one line changed, at the revision it was read at, once', async () => {
    await show();
    await edit(TEMP);
    await type(words('temperature.field'), '1.20');
    await userEvent.click(saveButton(TEMP));
    await settle();
    expect(f.q.puts).toHaveLength(1);
    expect(f.q.puts[0]).toMatchObject({ content: FILE.replace('temperature: 0.4', 'temperature: 1.2'), expected: 'r1' });
    expect(held.at(-1)).toBe(true);
    await act(async () => { f.q.puts[0]!.answer(ok({ path: '/home/agents/helper.md', revision: 'r2' })); });
    await settle();
    expect(within(row(TEMP)).getByText('1.2')).toBeTruthy();
    expect(screen.getByText(words('saved'))).toBeTruthy();
    expect(saved).toBe(1);
    expect(held.at(-1)).toBe(false);
  });
  it('a setting with no line is added before the closing ---; clearing one removes its line', async () => {
    await show();
    await edit(WAIT);
    await type(words('ask_timeout.field'), '10m');
    await userEvent.click(saveButton(WAIT));
    await settle();
    expect(f.q.puts[0]!.content).toBe(FILE.replace('temperature: 0.4\n---', 'temperature: 0.4\nask_timeout: 10m\n---'));
    await act(async () => { f.q.puts[0]!.answer(ok({ path: '/home/agents/helper.md', revision: 'r2' })); });
    await settle();
    await edit(TEMP);
    await type(words('temperature.field'), '');
    await userEvent.click(saveButton(TEMP));
    await settle();
    expect(f.q.puts[1]).toMatchObject({ content: FILE.replace('temperature: 0.4\n---', 'ask_timeout: 10m\n---'), expected: 'r2' });
  });
  it('a conflict writes nothing, reads the file again and shows its values', async () => {
    await show();
    await edit(TEMP);
    await type(words('temperature.field'), '1');
    await userEvent.click(saveButton(TEMP));
    await settle();
    await act(async () => { f.q.puts[0]!.answer(err('failed', { code: 'revision_conflict', status: 409, notApplied: true })); });
    await settle();
    expect(f.q.gets).toHaveLength(2);
    await act(async () => { f.q.gets[1]!(doc(FILE.replace('0.4', '0.9'), 'r5')); });
    await settle();
    expect(screen.getByText(words('conflict'))).toBeTruthy();
    expect(within(row(TEMP)).getByText('0.9')).toBeTruthy();
    expect(f.q.puts).toHaveLength(1);
    expect(saved).toBe(0);
  });
  it('a refusal says nothing was written and keeps the file\'s value', async () => {
    await show();
    await edit(TEMP);
    await type(words('temperature.field'), '1');
    await userEvent.click(saveButton(TEMP));
    await settle();
    await act(async () => { f.q.puts[0]!.answer(err('failed', { code: 'bad_request', status: 400 })); });
    await settle();
    expect(screen.getByText(words('refused', { code: 'bad_request' }))).toBeTruthy();
    expect(within(row(TEMP)).getByText('0.4')).toBeTruthy();
  });
});

describe('a lost answer', () => {
  async function lose() {
    await show();
    await edit(TEMP);
    await type(words('temperature.field'), '1');
    await userEvent.click(saveButton(TEMP));
    await settle();
    await act(async () => { f.q.puts[0]!.answer(err('pending')); });
    await settle();
  }
  it('is never sent again: every row waits, and Check again only reads', async () => {
    await lose();
    expect(screen.getByText(new RegExp(`^${words('unsure').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeTruthy();
    expect(screen.queryByRole('button', { name: words('edit') })).toBeNull();
    expect(held.at(-1)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await settle();
    expect(f.q.gets).toHaveLength(2);
    // The file as it was: that settles nothing.
    await act(async () => { f.q.gets[1]!(doc(FILE, 'r1')); });
    await settle();
    expect(screen.getByText(new RegExp(words('unsure.same').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    expect(f.q.puts).toHaveLength(1);
    expect(screen.queryByRole('button', { name: words('edit') })).toBeNull();
  });
  it('only a file that holds the sent text settles it as saved', async () => {
    await lose();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await settle();
    await act(async () => { f.q.gets[1]!(doc(FILE.replace('0.4', '1'), 'r2')); });
    await settle();
    expect(within(row(TEMP)).getByText('1')).toBeTruthy();
    expect(saved).toBe(1);
    expect(held.at(-1)).toBe(false);
    expect(within(row(STEPS)).getByRole('button', { name: words('edit') })).toBeTruthy();
  });
  it('Stop tracking asks first, sends nothing and shows the file as last read', async () => {
    await lose();
    await userEvent.click(screen.getByRole('button', { name: words('stop') }));
    expect(screen.getByText(words('stop.body'))).toBeTruthy();
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: words('stop.confirm') }));
    await settle();
    expect(f.q.puts).toHaveLength(1);
    expect(within(row(TEMP)).getByText('0.4')).toBeTruthy();
    expect(within(row(TEMP)).getByRole('button', { name: words('edit') })).toBeTruthy();
    expect(held.at(-1)).toBe(false);
  });
});
