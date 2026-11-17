// The agent's file has two editors in the view: the settings rows (FileSettings) and the file editor (Source). One writes
// at a time: the rows offer no Edit while the editor holds a draft, and the editor is locked (Save sends nothing) while a
// row's save is out or of unknown outcome. After a row saved, the editor reads the file again and the list is read again.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type * as KitMod from '@kit';
import { agentsOf } from './logic';
import type { AgentsRead } from './data';
import type * as SourceApiMod from './sourceApi';
import type { Settled, SourceApi } from './sourceApi';
import { AgentsView } from './AgentsView';
import { mount } from './routed';
import { resetFileSettingAttempts } from './FileSettings';
import src from './Source.strings.en.json';
import fs from './FileSettings.strings.en.json';

type Pending = (s: Settled) => void;
interface Fake { gets: Pending[]; puts: Array<{ content: string; answer: Pending }> }
const W = vi.hoisted(() => ({ read: null as unknown as AgentsRead, fakes: [] as Fake[], answered: [] as Pending[] }));
vi.mock('./data', () => ({ useAgents: () => W.read, agentsSource: { useQueryHash: () => 'list:c-atlas' } }));
vi.mock('./Tools', () => ({ AgentTools: () => null }));
vi.mock('./sourceApi', async (orig) => {
  const real = await orig<typeof SourceApiMod>();
  return {
    ...real,
    agentSourceApi: (): SourceApi => {
      const q: Fake = { gets: [], puts: [] };
      W.fakes.push(q);
      return {
        get: () => new Promise((r) => q.gets.push(r)),
        put: (content) => new Promise((r) => q.puts.push({ content, answer: r })),
        remove: () => new Promise(() => {}),
        reset: () => new Promise(() => {}),
      };
    },
  };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof KitMod>();
  return { ...real, useShellData: () => ({ ...real.useShellData(), computers: [{ id: 'c-atlas', name: 'atlas' }] }) };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, useCurrentComputer: () => ({ project: { id: 'p-atlas' }, container: { id: 'c-atlas' } }) };
});

const BODY = { items: [{ name: 'reviewer', labels: ['coding'], provenance: 'user', path: '/a/reviewer.md', tools: ['read_file'] }] };
const FILE = '---\nname: reviewer\ntemperature: 0.4\n---\nYou review.\n';
const retry = vi.fn();
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const doc = (content: string, revision: string): Settled => ({ ok: true, body: { path: '/a/reviewer.md', content, revision } });
// The file editor sits folded under the settings rows (AgentSource `folded`): it is mounted, so the view's tests reach it as is.
const editor = () => screen.getByRole('textbox', { name: src.label.replace('{{name}}', 'reviewer'), hidden: true }) as HTMLTextAreaElement;
const editorSave = () => screen.getAllByRole('button', { name: src.save, hidden: true }).find((b) => !b.closest('[data-sg-row]'))!;
const rowOf = (label: string) => screen.getByText(label).closest('[data-sg-row]') as HTMLElement;
const isOff = (b: HTMLElement) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
const TEMP = fs['temperature.label'];

type Mounted = Awaited<ReturnType<typeof mount>>;
let shown: Mounted;
const LOST: Settled = { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null } };
/** Every write sent, by either editor, on any mount. */
const puts = () => W.fakes.reduce((n, f) => n + f.puts.length, 0);
/** Back on `reviewer`: every read still open is answered with the file (`content`). */
async function back(view: Mounted, content = FILE) {
  await view.rerender(<AgentsView selected="reviewer" onSelect={vi.fn()} />);
  await settle();
  const answered = new Set(W.answered);
  for (const f of W.fakes) for (const g of f.gets) if (!answered.has(g)) { W.answered.push(g); await act(async () => { g(doc(content, 'r2')); }); }
  await settle();
}
/** The row save's unknown outcome is shown on its row with Check again, no row offers Edit and the file editor is locked. */
function expectHeld() {
  expect(within(rowOf(TEMP)).getByText(new RegExp(`^${fs.unsure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeTruthy();
  expect(within(rowOf(TEMP)).getByRole('button', { name: /check again/i })).toBeTruthy();
  expect(screen.queryByRole('button', { name: fs.edit })).toBeNull();
  expect(editor().readOnly).toBe(true);
  expect(isOff(editorSave())).toBe(true);
}

/** The view on `reviewer` with both reads answered: the rows' calls are the first made, the editor's the second. */
async function open() {
  shown = await mount(<AgentsView selected="reviewer" onSelect={vi.fn()} />);
  await settle();
  const [rows, file] = W.fakes;
  W.answered.push(rows!.gets[0]!, file!.gets[0]!);
  await act(async () => { rows!.gets[0]!(doc(FILE, 'r1')); file!.gets[0]!(doc(FILE, 'r1')); });
  await settle();
  return { rows: rows!, file: file! };
}
async function saveRow(text: string) {
  await userEvent.click(within(rowOf(TEMP)).getByRole('button', { name: fs.edit }));
  await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: fs['temperature.field'] }), { target: { value: text } }); });
  await userEvent.click(within(rowOf(TEMP)).getByRole('button', { name: 'Save' }));
  await settle();
}

beforeEach(() => {
  W.read = { rows: agentsOf(BODY) ?? [], pending: false, failed: false, retrying: false, error: null, retry };
  W.fakes = [];
  W.answered = [];
  resetFileSettingAttempts();
  retry.mockClear();
});
afterEach(() => cleanup());

describe('the settings rows and the file editor', () => {
  it('while the editor holds a draft, the rows say so and offer no Edit', async () => {
    await open();
    expect(screen.getAllByRole('button', { name: fs.edit }).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.change(editor(), { target: { value: 'mine' } }); });
    await settle();
    expect(screen.getByText(fs.blocked)).toBeTruthy();
    expect(screen.queryByRole('button', { name: fs.edit })).toBeNull();
  });

  it('while a row save is out the editor is locked and sends nothing; once saved, the editor and the list read again', async () => {
    const { rows, file } = await open();
    await saveRow('0.9');
    expect(rows.puts).toHaveLength(1);
    expect(editor().readOnly).toBe(true);
    expect(isOff(editorSave())).toBe(true);
    await act(async () => { fireEvent.keyDown(editor(), { key: 's', ctrlKey: true }); });
    expect(file.puts).toHaveLength(0);
    await act(async () => { rows.puts[0]!.answer({ ok: true, body: { path: '/a/reviewer.md', revision: 'r2' } }); });
    await settle();
    expect(retry).toHaveBeenCalledTimes(1);
    // A fresh editor: its own read of the file the row wrote.
    expect(W.fakes).toHaveLength(3);
    await act(async () => { W.fakes[2]!.gets[0]!(doc(rows.puts[0]!.content, 'r2')); });
    await settle();
    expect(editor().value).toContain('temperature: 0.9');
    expect(editor().readOnly).toBe(false);
  });

  it('while a row holds a typed value the file editor is locked, so the row is never dropped under it', async () => {
    const { file } = await open();
    await userEvent.click(within(rowOf(TEMP)).getByRole('button', { name: fs.edit }));
    await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: fs['temperature.field'] }), { target: { value: '0.9' } }); });
    await settle();
    expect(editor().readOnly).toBe(true);
    expect(isOff(editorSave())).toBe(true);
    // Typing into the locked editor changes nothing.
    await userEvent.setup({ pointerEventsCheck: 0 }).type(editor(), 'mine');
    await settle();
    expect(editor().value).toBe(FILE);
    // The row keeps its editor and what was typed; nothing was written.
    expect((screen.getByRole('textbox', { name: fs['temperature.field'] }) as HTMLInputElement).value).toBe('0.9');
    expect(screen.queryByText(fs.blocked)).toBeNull();
    expect(file.puts).toHaveLength(0);
    // Cancel lets the editor go again.
    await userEvent.click(within(rowOf(TEMP)).getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(editor().readOnly).toBe(false);
  });

  it('leaving while a row save is out keeps the attempt: an answer lost while away shows on return, both editors wait, nothing is sent again', async () => {
    const { rows } = await open();
    const view = shown;
    await saveRow('0.9');
    expect(rows.puts).toHaveLength(1);
    await view.rerender(<AgentsView selected={null} onSelect={vi.fn()} />);
    await settle();
    expect(screen.queryByText(TEMP)).toBeNull();
    await act(async () => { rows.puts[0]!.answer(LOST); });
    await settle();
    await back(view);
    expectHeld();
    expect(puts()).toBe(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('leaving after a row save became unknown keeps it: on return the row still waits with Check again, and both editors stay locked', async () => {
    const { rows } = await open();
    const view = shown;
    await saveRow('0.9');
    await act(async () => { rows.puts[0]!.answer(LOST); });
    await settle();
    await view.rerender(<AgentsView selected={null} onSelect={vi.fn()} />);
    await settle();
    await back(view);
    expectHeld();
    expect(puts()).toBe(1);
  });

  it('a row save that lands while away settles nothing on the page it left; back on the agent the rows read the file again', async () => {
    const { rows } = await open();
    const view = shown;
    await saveRow('0.9');
    await view.rerender(<AgentsView selected={null} onSelect={vi.fn()} />);
    await settle();
    await act(async () => { rows.puts[0]!.answer({ ok: true, body: { path: '/a/reviewer.md', revision: 'r2' } }); });
    await settle();
    expect(retry).not.toHaveBeenCalled();
    await back(view, rows.puts[0]!.content);
    expect(within(rowOf(TEMP)).getByText('0.9')).toBeTruthy();
    expect(within(rowOf(TEMP)).getByRole('button', { name: fs.edit })).toBeTruthy();
    expect(editor().readOnly).toBe(false);
  });

  it('a row save of unknown outcome keeps the editor locked', async () => {
    const { rows, file } = await open();
    await saveRow('0.9');
    await act(async () => { rows.puts[0]!.answer({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null } }); });
    await settle();
    expect(editor().readOnly).toBe(true);
    expect(isOff(editorSave())).toBe(true);
    expect(file.puts).toHaveLength(0);
    expect(retry).not.toHaveBeenCalled();
  });
});
