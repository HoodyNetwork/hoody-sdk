// "Ask the Agent" about access on the Computers list: the kit drawer's Explain reads the rules fresh on
// the press and starts a NEW Agent conversation with them. The realm-wide question is bounded and says how many
// computers were not read; no credential or whole id reaches it; one question per realm at a time (the kit's hold).
// (Overview's own Explain is gone: the access drawer's Ask the Agent covers it, access.explain.test.tsx.)
import { cleanup } from '@testing-library/react';
import { type ReactElement, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCore } from '@core';
import { setRealm } from '@core/ctx';
import { dropAskDraft, parseAskMessage, useAskDock } from '@kit/ask';
import { act, renderHook, renderPage, screen, userEvent, within } from '@app/testing';
import { type AskAgent, AskAgentButton } from '@kit';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import type * as Data from './data';
import { EXPLAIN_ALL_MAX } from './data';
import { accessAddElsewhere, computers, resetAccess } from './fixtures';
import page from './page';
import { resetAccessAsks, useExplainAll } from './parts/AccessDrawer';
import type { Computer } from './types';

// The list's reads, held by the test when `held.on`: they end exactly when the test says (held.end()), so a read's end
// can land in the same commit as a close or a key change. Off: the real reads.
const held = vi.hoisted(() => {
  const subs = new Set<() => void>();
  return {
    on: false,
    done: false,
    subs,
    end() {
      this.done = true;
      for (const f of subs) f();
    },
  };
});
vi.mock('./data', async (orig) => {
  const m = await orig<typeof Data>();
  return {
    ...m,
    useAccessMany: (ids: readonly string[], enabled: boolean) => {
      const real = m.useAccessMany(ids, enabled);
      const done = useSyncExternalStore(
        (f) => {
          held.subs.add(f);
          return () => held.subs.delete(f);
        },
        () => held.done,
      );
      if (!held.on) return real;
      const one = (id: string) => ({ isError: false, fetchStatus: 'idle', dataUpdatedAt: done ? Number.MAX_SAFE_INTEGER : 0, data: { [id]: null } });
      return { rules: ids.map(one), scope: ids.map(one) } as unknown as typeof real;
    },
  };
});

const SLOW = { timeout: 8000 };

// The component alone, as the computers page (its fixture rules and data source), in place of the page's view.
async function mount(el: ReactElement, state?: string, realm?: string, latency?: 'slow') {
  await renderPage({ ...page, load: () => Promise.resolve({ default: () => el }) }, { ...(state ? { state } : {}), ...(realm ? { realm } : {}), ...(latency ? { latency } : {}) });
}
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
let dock: { current: ReturnType<typeof useAskDock> } | null = null;
const draft = () => {
  dock ??= renderHook(() => useAskDock()).result;
  return dock.current.draft;
};
const waitDraft = async () => {
  for (let n = 0; n < 80 && !draft(); n++) await settle(50);
  return draft();
};
// The panel takes the start and its answer is lost: it may have reached the Agent.
function takeUnknown() {
  let taken: ReturnType<ReturnType<typeof useAskDock>['takeDraft']>;
  act(() => { taken = dock!.current.takeDraft(); });
  act(() => taken?.onStart?.('unknown'));
}
// The list's action and the drawer it opens, as ComputersList mounts them.
function ExplainAllAccess({ computers: list }: { computers: readonly Computer[] }) {
  const a = useExplainAll(list);
  return (
    <>
      <AskAgentButton ask={a} />
      {a.drawer}
    </>
  );
}
async function openAsk() {
  await userEvent.click(await screen.findByRole('button', { name: /^Ask the Agent/ }, SLOW));
  const d = await screen.findByRole('dialog');
  return { d, explain: within(d).getByRole('button', { name: ask['aa.explain'] }) };
}
// The page goes away (another page, or a switch), the start store stays.
function leave() {
  cleanup();
  dock = null;
}

describe('computers list: Ask the Agent about access', () => {
  afterEach(() => {
    act(() => dropAskDraft());
    dock = null;
    held.on = false;
    held.done = false;
    resetAccess();
    resetAccessAsks();
  });

  it('one question over at most EXPLAIN_ALL_MAX computers, saying how many were not read', async () => {
    const many = Array.from({ length: EXPLAIN_ALL_MAX + 3 }, (_, n) => ({ ...computers[n % computers.length]!, name: `box-${n}` }));
    await mount(<ExplainAllAccess computers={many} />);
    const { explain } = await openAsk();
    await userEvent.click(explain);
    const text = (await waitDraft())?.text ?? '';
    expect(text).toContain('3 more computers not read');
    expect(text).toContain('"box-0"');
    expect(text).not.toContain(`"box-${EXPLAIN_ALL_MAX}"`);
    expect(text).not.toContain('fixture-password-not-shown');
    for (const c of computers) expect(text).not.toContain(c.id);
  });

  it('the drawer lists what the Agent reads before the press; the press reads again and sends what the rules say THEN, never the preview', async () => {
    const list = computers.slice(0, 3);
    await mount(<ExplainAllAccess computers={list} />);
    const { d, explain } = await openAsk();
    // The first frame: the request in plain words, and the rules read at open, one row per computer, each opening to its exact text.
    const parts = await within(d).findByRole('list', { name: ask['aa.reads'] }, SLOW);
    const row = await within(parts).findByRole('button', { name: new RegExp(`^${list[0]!.name}:`) }, SLOW);
    await userEvent.click(row);
    const shown = within(parts).getAllByRole('figure')[0]!.querySelector('pre')?.textContent ?? '';
    expect(shown).toContain(`Computer "${list[0]!.name}"`);
    expect(shown).not.toContain('late-team');
    // The rules change elsewhere after the drawer read them.
    accessAddElsewhere(list[0]!.id, 'late-team');
    await userEvent.click(explain);
    const sent = (await waitDraft())?.text ?? '';
    const m = parseAskMessage(sent);
    expect(m.title).toBe('Check who can open these computers');
    expect(m.contextLabel).toBe('access rules of 3 computers');
    // What is sent is the fresh read: the thread's "Context sent" row opens to this text (SentText), not to the drawer's preview.
    expect(m.context).toContain('late-team');
    expect(m.context).not.toContain(shown);
  });

  it('a start that may have reached the Agent in one realm leaves another realm free to ask, and still guards its own', async () => {
    const two = computers.slice(0, 2);
    await mount(<ExplainAllAccess computers={two} />);
    await userEvent.click((await openAsk()).explain);
    expect((await waitDraft())?.start).toBe(true);
    takeUnknown();
    await screen.findByText(ask['aa.unknown']);
    leave();
    await mount(<ExplainAllAccess computers={two} />, undefined, 'all');
    const other = await openAsk();
    expect(other.d).not.toHaveTextContent(ask['aa.unknown']);
    await userEvent.click(other.explain);
    expect((await waitDraft())?.start).toBe(true);
    act(() => dropAskDraft());
    leave();
    // Slow reads: the panel opens on the press itself, never after a read.
    await mount(<ExplainAllAccess computers={two} />, undefined, undefined, 'slow');
    const own = await openAsk();
    await within(own.d).findByText(ask['aa.unknown'], undefined, SLOW);
    expect(own.explain).toBeDisabled();
    draft();
    act(() => dock!.current.close());
    await userEvent.click(within(own.d).getByRole('button', { name: ask['aa.look'] }));
    expect(dock!.current.isOpen).toBe(true);
    expect(draft()).toBeUndefined();
  });

  it('closing the drawer while Explain still reads the rules starts nothing', async () => {
    await mount(<ExplainAllAccess computers={computers.slice(0, 2)} />, undefined, undefined, 'slow');
    const { explain } = await openAsk();
    await userEvent.click(explain);
    expect(draft()).toBeUndefined();
    await userEvent.keyboard('{Escape}');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Every slow read has answered by now: nothing was started for the drawer that was left.
    await settle(3000);
    expect(draft()).toBeUndefined();
    // Opened again, Explain is free and starts one question of its own.
    await userEvent.click((await openAsk()).explain);
    expect((await waitDraft())?.start).toBe(true);
  });

  // The list's hook as ComputersList mounts it, with its result and the realm it saw kept for the test.
  const seen: { a: AskAgent | null; realm: string } = { a: null, realm: '' };
  function Probe({ computers: list }: { computers: readonly Computer[] }) {
    const a = useExplainAll(list);
    seen.a = a;
    seen.realm = useCore().realm;
    return (
      <>
        <AskAgentButton ask={a} />
        {a.drawer}
      </>
    );
  }
  async function pressHeld() {
    held.on = true;
    await mount(<Probe computers={computers.slice(0, 2)} />);
    await userEvent.click((await openAsk()).explain);
    await settle(100);
    expect(draft()).toBeUndefined();
  }

  it('a read that ends while the drawer is open starts the question (the held reads below are real ends)', async () => {
    await pressHeld();
    act(() => held.end());
    expect((await waitDraft())?.start).toBe(true);
  });

  it('a read that ends in the same commit as the close starts nothing', async () => {
    await pressHeld();
    act(() => {
      flushSync(() => {
        held.end();
        seen.a!.close();
      });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await settle(300);
    expect(draft()).toBeUndefined();
  });

  it('a read that ends in the same commit as a realm change starts nothing', async () => {
    await pressHeld();
    const was = seen.realm;
    try {
      act(() => {
        flushSync(() => {
          held.end();
          setRealm(`${was}-other`);
        });
      });
      await settle(300);
      expect(draft()).toBeUndefined();
    } finally {
      act(() => setRealm(was));
    }
  });

  it('no computers: nothing can be asked; the action says why', async () => {
    await mount(<ExplainAllAccess computers={[]} />);
    expect(screen.getByRole('button', { name: /^Ask the Agent/ })).toHaveAttribute('aria-disabled', 'true');
  });
});
