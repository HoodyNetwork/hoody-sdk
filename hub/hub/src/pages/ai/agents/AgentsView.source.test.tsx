// The view with the real source editor over fake requests: changing the agent the view keeps itself asks
// before a draft or a save of unknown outcome is dropped (Stay keeps them); a delete clears a choice the host owns, and an
// agent that keeps its name after a delete, or another computer, gets a fresh editor.
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
import strings from './strings.en.json';
import src from './Source.strings.en.json';

type Pending = (s: Settled) => void;
interface Fake { gets: Pending[]; puts: Pending[]; removes: Pending[] }
const W = vi.hoisted(() => ({ read: null as unknown as AgentsRead, cid: 'c-atlas', fakes: {} as Record<string, Fake[]> }));
vi.mock('./data', () => ({ useAgents: () => W.read, agentsSource: { useQueryHash: () => `list:${W.cid}` } }));
// The tools editor has its own mount test (AgentsView.tools.test.tsx); here only the file editor.
vi.mock('./Tools', () => ({ AgentTools: () => null }));
// The settings rows read the same file through their own calls; how they and the editor wait for each other is
// AgentsView.filesettings.test.tsx. Here each agentSourceApi call is the editor's.
vi.mock('./FileSettings', () => ({ AgentFileSettings: () => null }));
vi.mock('./sourceApi', async (orig) => {
  const real = await orig<typeof SourceApiMod>();
  return {
    ...real,
    agentSourceApi: (name: string): SourceApi => {
      const q: Fake = { gets: [], puts: [], removes: [] };
      (W.fakes[name] ??= []).push(q);
      return {
        get: () => new Promise((r) => q.gets.push(r)),
        put: () => new Promise((r) => q.puts.push(r)),
        remove: () => new Promise((r) => q.removes.push(r)),
        reset: () => new Promise(() => {}),
      };
    },
  };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof KitMod>();
  return { ...real, useShellData: () => ({ ...real.useShellData(), computers: [{ id: 'c-atlas', name: 'atlas' }, { id: 'c-blue', name: 'blue' }] }) };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, useCurrentComputer: () => ({ project: { id: 'p-atlas' }, container: { id: W.cid } }) };
});

const BODY = { items: [
  { name: 'general', labels: ['core'], provenance: 'shipped default (embedded)', tools: ['read_file'] },
  { name: 'reviewer', labels: ['coding'], provenance: 'user', path: '/home/ada/.hoody/agents/reviewer.md', tools: ['read_file'] },
] };
const retry = vi.fn();
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const words = (k: keyof typeof src, v: Record<string, string> = {}) => src[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const last = (name: string) => W.fakes[name]![W.fakes[name]!.length - 1]!;
const answer = async (name: string, content = `${name} file`) => {
  await settle();
  await act(async () => { last(name).gets[0]!({ ok: true, body: { path: `/a/${name}.md`, content, revision: 'r1' } }); });
  await settle();
};
// The file editor sits folded under the settings rows (AgentSource `folded`): it is mounted, so the view's tests reach it as is.
const editorOf = (name: string) => screen.queryByRole('textbox', { name: words('label', { name }), hidden: true }) as HTMLTextAreaElement | null;
const pick = async (name: RegExp) => { await userEvent.click(within(screen.getByRole('table', { name: strings['list.label'] })).getByRole('row', { name })); await settle(); };
const press = async (name: string) => { await userEvent.click(screen.getByRole('button', { name })); await settle(); };
const leaveDialog = () => screen.queryByRole('alertdialog') ?? screen.queryByRole('dialog');

beforeEach(() => {
  W.read = { rows: agentsOf(BODY) ?? [], pending: false, failed: false, retrying: false, error: null, retry };
  W.cid = 'c-atlas';
  W.fakes = {};
  retry.mockClear();
});
afterEach(() => cleanup());

describe('changing the agent the view keeps itself', () => {
  it('a clean editor changes at once', async () => {
    await mount(<AgentsView />);
    await pick(/reviewer/);
    await answer('reviewer');
    await pick(/general/);
    expect(leaveDialog()).toBeNull();
    await answer('general');
    expect(editorOf('general')).toBeTruthy();
  });

  it('a draft asks first: Stay keeps the draft and the agent, Leave changes', async () => {
    await mount(<AgentsView />);
    await pick(/reviewer/);
    await answer('reviewer');
    await act(async () => { fireEvent.change(editorOf('reviewer')!, { target: { value: 'mine' } }); });
    await pick(/general/);
    expect(within(leaveDialog()!).getByText(words('leave.body', { name: 'reviewer' }))).toBeTruthy();
    await press(words('leave.stay'));
    expect(leaveDialog()).toBeNull();
    expect(editorOf('reviewer')!.value).toBe('mine');
    expect(W.fakes.general).toBeUndefined();
    await pick(/general/);
    await press(words('leave.leave'));
    expect(editorOf('reviewer')).toBeNull();
    expect(W.fakes.general).toHaveLength(1);
  });

  it('a save of unknown outcome asks in its own words; Stay keeps the unknown outcome', async () => {
    await mount(<AgentsView />);
    await pick(/reviewer/);
    await answer('reviewer');
    await act(async () => { fireEvent.change(editorOf('reviewer')!, { target: { value: 'mine' } }); });
    await press(words('save'));
    await act(async () => { last('reviewer').puts[0]!({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null } }); });
    await settle();
    await pick(/general/);
    expect(within(leaveDialog()!).getByText(words('leave.body.unsure', { name: 'reviewer' }))).toBeTruthy();
    await press(words('leave.stay'));
    expect(screen.getByText(words('unsure'))).toBeTruthy();
    expect(W.fakes.reviewer).toHaveLength(1);
  });
});

async function deleteIt(name: string) {
  await press(words('danger.delete'));
  await userEvent.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), name);
  await press(words('danger.delete.confirm'));
  await act(async () => { last(name).removes[0]!({ ok: true, body: { output: 'x', is_error: false } }); });
  await settle();
}

describe('a delete and a choice the host owns', () => {
  it('without onDeleted the deleted agent leaves the detail (nothing chosen) and the list is read again; a later choice of it works', async () => {
    const onSelect = vi.fn();
    const view = await mount(<AgentsView selected="reviewer" onSelect={onSelect} />);
    await answer('reviewer');
    await deleteIt('reviewer');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(editorOf('reviewer')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    await view.rerender(<AgentsView selected="general" onSelect={onSelect} />);
    await view.rerender(<AgentsView selected="reviewer" onSelect={onSelect} />);
    await answer('reviewer', 'shipped');
    expect(editorOf('reviewer')!.value).toBe('shipped');
  });

  it('clicking the deleted name again (the host route did not move) opens it', async () => {
    const onSelect = vi.fn();
    await mount(<AgentsView selected="reviewer" onSelect={onSelect} />);
    await answer('reviewer');
    await deleteIt('reviewer');
    await pick(/reviewer/);
    expect(onSelect).toHaveBeenCalledWith('reviewer');
    await answer('reviewer', 'shipped');
    expect(editorOf('reviewer')!.value).toBe('shipped');
  });

  it('a host given onDeleted is told; a shipped agent under the same name gets a fresh editor, never the deleted file', async () => {
    const host = vi.fn();
    await mount(<AgentsView selected="reviewer" onSelect={vi.fn()} onDeleted={host} />);
    await answer('reviewer', 'old');
    await deleteIt('reviewer');
    expect(host).toHaveBeenCalledTimes(1);
    expect(W.fakes.reviewer).toHaveLength(2);
    await answer('reviewer', 'shipped');
    expect(editorOf('reviewer')!.value).toBe('shipped');
  });

  it('another computer gets a fresh editor', async () => {
    const view = await mount(<AgentsView selected="reviewer" onSelect={vi.fn()} />);
    await answer('reviewer');
    W.cid = 'c-blue';
    await view.rerender(<AgentsView selected="reviewer" onSelect={vi.fn()} />);
    expect(W.fakes.reviewer).toHaveLength(2);
  });
});
