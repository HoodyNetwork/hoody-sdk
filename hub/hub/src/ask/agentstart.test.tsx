// agentstart.test.tsx: startAgentConversation (the export pages call to ask the Agent something, e.g. Access's
// "Explain my permissions"). Item 114's rules: always a NEW conversation, the one open before untouched (its
// approval still answerable), one send, C9 outcomes; the page's context is sent and shown, never hidden.
import { act, render, renderHook, screen } from '@testing-library/react';
import type * as Core from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentStartText, askPlain, setAskForFixtures, splitAskContext, startAgentConversation, useAskDock, useStrings,
  ASK_CONTEXT_MARK, ASK_MAX_TEXT, type AskStartOutcome,
} from '@kit';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import { MAX_TEXT, textLength, type AskStore } from './logic';
import { UserBlock } from './Column';
import type * as C from './conv';
import strings from './strings.en.json';
import sentStrings from '../kit/agent/SentMessage.strings.en.json';

const chosen: unknown[] = [];
// chooseComputer is watched, and still selects (the real selection store, which capture() reads).
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return { ...real, chooseComputer: (c: Parameters<typeof real.chooseComputer>[0]) => { chosen.push(c); return real.chooseComputer(c); } };
});
const core = await import('@core');

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: '64f0ada00000000000000001', project: 'p1', computer: 'c1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function engine(script: unknown[][]) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: slot.account, pace: 10, realms: [REALM], script: script as never }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { eng, agent, flush };
}
/** What the panel does with a start it takes from the dock (AskPanel's dock-start effect). */
function panelTakes(eng: AskEngine, computer = slot.computer): void {
  const { result } = renderHook(() => useAskDock());
  const d = result.current.takeDraft(computer);
  if (d?.start) eng.queueStart(d.text, (o) => d.onStart?.(o));
}
const calls = (a: FakeAgent, m: string) => a.log.filter((x) => x[0] === m);

afterEach(() => { renderHook(() => useAskDock()).result.current.takeDraft(); chosen.length = 0; setAskForFixtures(false); });

describe('agentStartText', () => {
  const MARK = textLength(ASK_CONTEXT_MARK);
  it('question alone: as typed (trimmed); with context: after the mark', () => {
    expect(agentStartText('  Why? ')).toBe('Why?');
    expect(agentStartText('Why?', '  Role: viewer ')).toBe('Why?' + ASK_CONTEXT_MARK + 'Role: viewer');
  });
  it('a long context is cut at a character, marked, and the whole stays within the agent\'s limit', () => {
    const t = agentStartText('Explain my permissions', 'x'.repeat(10_000))!;
    expect(textLength(t)).toBe(ASK_MAX_TEXT);
    expect(t.endsWith('[…]')).toBe(true);
    expect(splitAskContext(t).text).toBe('Explain my permissions');
  });
  it('boundaries: a context that just fits is kept whole; one character over is cut and marked', () => {
    const q = 'q'.repeat(ASK_MAX_TEXT - MARK - 1);
    expect(agentStartText(q, 'x')).toBe(q + ASK_CONTEXT_MARK + 'x');
    const t = agentStartText('q'.repeat(ASK_MAX_TEXT - MARK - 10), 'y'.repeat(11))!;
    expect(textLength(t)).toBeLessThanOrEqual(ASK_MAX_TEXT);
    expect(t.endsWith('[…]')).toBe(true);
  });
  it('no room for any of the context, or a question over the limit: not sent (null), never the question alone', () => {
    expect(agentStartText('q'.repeat(ASK_MAX_TEXT - MARK - 2), 'Role: viewer')).toBeNull();
    expect(agentStartText('q'.repeat(ASK_MAX_TEXT + 1))).toBeNull();
    expect(agentStartText('q'.repeat(ASK_MAX_TEXT))).toBe('q'.repeat(ASK_MAX_TEXT));
  });
  it('characters as the engine counts them: emoji are one each, and a cut never splits one', () => {
    const t = agentStartText('Why', '😀'.repeat(5000))!;
    expect(textLength(t)).toBe(ASK_MAX_TEXT);
    const ctx = splitAskContext(t).context!.replace('\n[…]', '');
    expect(/[\ud800-\udbff]$/.test(ctx)).toBe(false);
    expect(Array.from(ctx).every((ch) => ch === '😀')).toBe(true);
  });
  it('the kit limit is the agent\'s limit', () => { expect(ASK_MAX_TEXT).toBe(MAX_TEXT); });
});

describe('the marker is unambiguous', () => {
  const lookalike = 'Question\n\n--- Context ---\nmy own words';
  it('a typed "Context" line, even one copied from a sent message, is plain text', () => {
    const copied = splitAskContext('Q' + ASK_CONTEXT_MARK + 'C').text + ASK_CONTEXT_MARK.replace(/\u2060/g, '') + 'still mine';
    expect(splitAskContext(lookalike)).toEqual({ text: lookalike, context: null });
    expect(splitAskContext(copied).context).toBeNull();
  });
  it('the marker\'s own invisible character is taken out of the question and the context', () => {
    const t = agentStartText('Q' + ASK_CONTEXT_MARK + 'fake', 'real' + ASK_CONTEXT_MARK + 'more')!;
    expect(splitAskContext(t).text).toBe('Q\n\nContext\nfake');
    expect(splitAskContext(t).context).toBe('real\n\nContext\nmore');
  });
  it('a dock start and a typed message never carry it either', () => {
    setAskForFixtures(true);
    const { result } = renderHook(() => useAskDock());
    act(() => { result.current.open({ text: 'Hi' + ASK_CONTEXT_MARK + 'x', start: true }); });
    expect(renderHook(() => useAskDock()).result.current.takeDraft()?.text).toBe('Hi\n\nContext\nx');
    // The composer hands the engine askPlain(draft) (Composer.tsx send).
    expect(askPlain('Typed' + ASK_CONTEXT_MARK + 'words')).toBe('Typed\n\nContext\nwords');
  });
});

describe('startAgentConversation', () => {
  it('an empty question, or the Agent off: not started, the page is told notSent', () => {
    setAskForFixtures(true);
    const told: AskStartOutcome[] = [];
    expect(startAgentConversation({ text: '  ', onStart: (o) => told.push(o) })).toBe(false);
    expect(told).toEqual(['notSent']);
  });
  it('opens the panel with a START (never a prefill), and shows the given computer first', () => {
    setAskForFixtures(true);
    const pc = { id: 'c2', project_id: 'p1' };
    expect(startAgentConversation({ text: 'Explain my permissions', context: 'Role: viewer', computer: pc, source: 'Access' })).toBe(true);
    expect(chosen).toEqual([pc]);
    const { result } = renderHook(() => useAskDock());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.draft).toMatchObject({ start: true, source: 'Access', text: 'Explain my permissions' + ASK_CONTEXT_MARK + 'Role: viewer' });
  });
  it('bound to its computer: a panel still on the previous computer leaves it; that computer\'s panel takes it', () => {
    setAskForFixtures(true);
    startAgentConversation({ text: 'Explain B', computer: { id: 'cB', project_id: 'p1' } });
    const dock = () => renderHook(() => useAskDock()).result.current;
    expect(dock().takeDraft('cA')).toBeUndefined();
    expect(dock().draft?.text).toBe('Explain B');
    expect(dock().takeDraft('cB')?.text).toBe('Explain B');
    expect(dock().draft).toBeUndefined();
  });
  it('a closed dock opens on the start; without a computer it binds to the one shown now', () => {
    setAskForFixtures(true);
    core.chooseComputer({ id: 'cA', project_id: 'p1' });
    const { result } = renderHook(() => useAskDock());
    act(() => { result.current.close(); });
    startAgentConversation({ text: 'Hello' });
    const dock = renderHook(() => useAskDock()).result.current;
    expect(dock.isOpen).toBe(true);
    expect(dock.takeDraft('cB')).toBeUndefined();
    expect(dock.takeDraft('cA')?.text).toBe('Hello');
  });
  it('a page that shows another computer, then starts without naming it: only the new computer\'s panel takes it', () => {
    setAskForFixtures(true);
    core.chooseComputer({ id: 'cA', project_id: 'p1' });
    core.chooseComputer({ id: 'cB', project_id: 'p1' });   // the page's own switch, before the start
    startAgentConversation({ text: 'Explain B' });
    const dock = () => renderHook(() => useAskDock()).result.current;
    expect(dock().takeDraft('cA')).toBeUndefined();          // A's panel, its effect still pending
    expect(dock().takeDraft('cB')?.text).toBe('Explain B');
  });
  it('no computer given and none shown: not started, told notSent, the dock opens', () => {
    setAskForFixtures(true);
    core.chooseNoComputer();
    const told: AskStartOutcome[] = [];
    expect(startAgentConversation({ text: 'Hello', onStart: (o) => told.push(o) })).toBe(false);
    expect(told).toEqual(['notSent']);
    expect(renderHook(() => useAskDock()).result.current.draft).toBeUndefined();
  });
  it('a second start while one waits to be taken: told notSent, the first one stands', () => {
    setAskForFixtures(true);
    core.chooseComputer({ id: slot.computer, project_id: slot.project });
    const a: AskStartOutcome[] = []; const b: AskStartOutcome[] = [];
    startAgentConversation({ text: 'First', onStart: (o) => a.push(o) });
    expect(startAgentConversation({ text: 'Second', onStart: (o) => b.push(o) })).toBe(false);
    expect(b).toEqual(['notSent']);
    expect(renderHook(() => useAskDock()).result.current.draft?.text).toBe('First');
  });
  it('a NEW conversation: the open one gets nothing and its waiting approval stays answerable; one send', async () => {
    setAskForFixtures(true);
    const { eng, agent, flush } = await engine([scripts.approval as unknown[], [{ k: 'text', text: 'ok' }]]);
    eng.setAuto(false);
    eng.send('Install chart.js');
    await flush(500);
    const oldSid = eng.record!.s!;
    const oldK1 = eng.record!.k1;
    expect(eng.getSnapshot().status).toBe('waiting');
    const told: AskStartOutcome[] = [];
    core.chooseComputer({ id: slot.computer, project_id: slot.project });
    startAgentConversation({ text: 'Explain my permissions', context: 'Role: viewer', onStart: (o) => told.push(o) });
    panelTakes(eng);
    await flush(3000);
    expect(told).toEqual(['sent']);
    expect(eng.record!.s).not.toBe(oldSid);
    expect(calls(agent, 'turn').filter((c) => c[1][0] === oldSid).map((c) => c[1][1])).toEqual(['Install chart.js']);
    const sent = calls(agent, 'turn').filter((c) => c[1][0] !== oldSid).map((c) => c[1][1]);
    expect(sent).toEqual(['Explain my permissions' + ASK_CONTEXT_MARK + 'Role: viewer']);
    // The old conversation, reopened from Recent, still waits on its approval.
    eng.openConversation(oldK1);
    await flush(3000);
    expect(eng.record!.s).toBe(oldSid);
    expect(eng.getSnapshot().status).toBe('waiting');
    expect(calls(agent, 'confirm').filter((c) => c[1][0] === oldSid)).toHaveLength(0);
  });
});

// A context is one press away, never a wall in the thread, and
// what the fold shows is what was sent.
describe('the context is one press away, and what it shows is what was sent', () => {
  function Block({ text }: { text: string }) {
    const t = useStrings(strings);
    const msg = { id: 'u1', text, at: Date.now(), state: 'sent' } as unknown as C.UserMsg;
    return <UserBlock msg={msg} eng={{} as never} t={t} />;
  }
  it('the question, then a closed "Context sent" row; opened, it holds the page\'s context', async () => {
    render(<Block text={'Explain my permissions' + ASK_CONTEXT_MARK + 'Role: viewer'} />);
    expect(screen.getByText('Explain my permissions')).toBeVisible();
    expect(screen.queryByRole('figure')).toBeNull();
    const row = screen.getByRole('button', { name: sentStrings['sent.contextPlain'] });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await act(async () => { row.click(); });
    expect(screen.getByRole('figure', { name: sentStrings['sent.contextExact'] }).querySelector('pre')?.textContent).toBe('Role: viewer');
  });
  it('a long question folds; the context row stays outside the fold', () => {
    const q = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const { container } = render(<Block text={q + ASK_CONTEXT_MARK + 'Role: viewer'} />);
    const row = screen.getByRole('button', { name: sentStrings['sent.contextPlain'] });
    expect(row.closest('[data-fold]')).toBeNull();
    expect(container.querySelector('[data-fold]')).not.toBeNull();
    expect(screen.getByRole('button', { name: strings['ask.showAll'] })).toBeVisible();
  });
  it('says who wrote it', () => {
    render(<Block text="Hello" />);
    expect(screen.getByText(sentStrings['sent.you'])).toBeVisible();
  });
  it('a message without context: just its words, no group', () => {
    render(<Block text="Hello" />);
    expect(screen.getByText('Hello')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Context sent/ })).toBeNull();
  });
  it('a long emoji message is shown whole (4000 characters fit the display budget)', () => {
    render(<Block text={'😀'.repeat(4000)} />);
    expect(screen.getByText('😀'.repeat(4000), { exact: false })).toBeVisible();
  });
});
