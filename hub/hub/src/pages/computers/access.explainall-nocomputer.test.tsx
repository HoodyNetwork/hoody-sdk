// "Ask the Agent" on the Computers list never answers "The question didn't reach the Agent" only because the top
// bar showed "All computers": no computer was current, so the kit had no computer to ask on and refused at once. The
// list-wide start now names the first running computer listed (any agent answers from the snapshot alone); none
// running: no start, the kit's honest refusal; a current computer: that one, unchanged.
import { afterEach, describe, expect, it } from 'vitest';
import { capture, chooseComputer, chooseNoComputer, computerState } from '@core';
import { dropAskDraft, useAskDock } from '@kit/ask';
import { act, renderHook, renderPage, screen, userEvent, within } from '@app/testing';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import { computers, resetAccess } from './fixtures';
import page from './page';
import { explainAllComputer, resetAccessAsks } from './parts/AccessDrawer';

/** The list's Ask the Agent, then the drawer's Explain. */
async function explain(button: HTMLElement) {
  await userEvent.click(button);
  const d = await screen.findByRole('dialog');
  await userEvent.click(within(d).getByRole('button', { name: ask['aa.explain'] }));
  return d;
}
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const row = (id: string, status: string) => ({ ...computers[0]!, id: id.repeat(24).slice(0, 24), name: id, status });

describe('explainAllComputer: which computer the list-wide Explain names', () => {
  it('no current computer: the first running one listed, never a starting, failed, stopped or paused one', () => {
    const list = [row('a', 'stopped'), row('b', 'starting'), row('c', 'failed'), row('d', 'running'), row('e', 'running')];
    expect(explainAllComputer(list, false)?.name).toBe('d');
  });
  it('no current computer and none running: none (the kit refuses honestly)', () => {
    for (const st of ['starting', 'failed', 'stopped', 'paused']) expect(explainAllComputer([row('a', st), row('b', st)], false), st).toBeNull();
    expect(explainAllComputer([], false)).toBeNull();
  });
  it('a current computer: none named (the kit asks on the current one)', () => {
    expect(explainAllComputer([row('d', 'running')], true)).toBeNull();
  });
});

describe('computers list: Ask the Agent with no current computer', () => {
  afterEach(() => {
    act(() => dropAskDraft());
    resetAccess();
    resetAccessAsks();
  });

  it('asks on the first running computer listed, and the question reaches the Agent panel', async () => {
    await renderPage(page);
    const button = await screen.findByRole('button', { name: ask['aa.label'] }, { timeout: 8000 });
    act(() => { chooseNoComputer(); });
    expect(capture().target).toBeNull();
    const dock = renderHook(() => useAskDock()).result;
    const d = await explain(button);
    for (let n = 0; n < 80 && !dock.current.draft; n++) await settle(50);
    const draft = dock.current.draft;
    expect(draft?.start).toBe(true);
    expect(draft?.computer).toBe(computers.find((c) => computerState(c.status) === 'running')?.id);
    // The kit shows that computer everywhere, as a computer's own Explain does.
    expect(capture().target?.container.id).toBe(draft?.computer);
    expect(d).not.toHaveTextContent(ask['aa.notSent']);
  }, 30000);

  it('with a current computer, asks on it as before and leaves it current (not the first running one)', async () => {
    await renderPage(page);
    const button = await screen.findByRole('button', { name: ask['aa.label'] }, { timeout: 8000 });
    const running = computers.filter((c) => computerState(c.status) === 'running');
    expect(running.length).toBeGreaterThan(1);
    const other = running[1]!;
    act(() => { chooseComputer(other); });
    const current = capture().target?.container.id;
    expect(current).toBe(other.id);
    const dock = renderHook(() => useAskDock()).result;
    await explain(button);
    for (let n = 0; n < 80 && !dock.current.draft; n++) await settle(50);
    expect(dock.current.draft?.computer).toBe(current);
    expect(capture().target?.container.id).toBe(other.id);
  }, 30000);
});
