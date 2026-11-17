// The part of the Agent dock that draws a source with the kit's SessionView (DockSessionView). The hooks card keeps its
// working link to the Agent app, a Not sent message with files can be taken back here (the dock's composer owns files), and the shell
// jobs the chat runs show above the composer. The source is a fake; the dock over its real engine is dock.sameEngine.test.tsx's.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bootFixtureCore, queryClient } from '@core';
import type { ActiveSource, ConvSnapshot } from '@kit';
import { can, type CapFacts } from '@kit/agent/capability';
import { createShellJobStops } from '@kit/agent/shellJobStop';
import { emptyConv } from './conv';
import { DockSessionView } from './DockSession';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const REF = { computer: 'atlas.1234', realm: 'global', sid: 's1' };
const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const snap = (blocks: ConvSnapshot['blocks']): ConvSnapshot => ({ facts, title: 'Chat', gates: [], blocks });

interface Fake { source: ActiveSource; released: number; takeBack: ReturnType<typeof vi.fn> }
const stops = (items: unknown[]) => {
  const st = createShellJobStops({ chat: REF, list: async () => ({ ok: true, body: { items } }) as any, stop: async () => ({ ok: true, status: 200, body: {} }) as any, newKey: () => 'k1', can: () => ({ ok: true }) });
  void st.refresh();
  return st;
};
function fake(blocks: ConvSnapshot['blocks'], o: { jobs?: unknown[] } = {}): Fake {
  const s = snap(blocks);
  const takeBack = vi.fn(() => ({ k: 'text', text: 'my message' }));
  const x: Fake = { released: 0, takeBack, source: null as unknown as ActiveSource };
  x.source = {
    kind: 'active', ref: REF, snapshot: () => s, subscribe: () => () => undefined, watch: () => undefined, can: (a: any) => can(a, facts),
    send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false,
    resend: vi.fn(), retry: vi.fn(), takeBack,
    ...(o.jobs ? { shellJobs: () => stops(o.jobs!) } : {}),
  } as unknown as ActiveSource;
  return x;
}
let current: Fake | null = null;
const provide = (x: Fake) => { current = x; };
const View = (p: { onTakeBack?: (t: string) => void }) => (
  <DockSessionView source={current!.source} eng={null as any} conv={REF} host={{ computer: 'atlas', realm: 'global' }} agentUrl="https://agent.example/" typing={false} empty={<p>Nothing yet</p>} onTakeBack={p.onTakeBack ?? (() => undefined)} fallback={null} />
);

afterEach(() => { cleanup(); current = null; queryClient.clear(); vi.restoreAllMocks(); });
const boot = () => { bootFixtureCore({}); };

describe('DockSessionView', () => {
  it('draws the source with SessionView (the conversation log)', async () => {
    boot();
    provide(fake([{ k: 'user', key: 'u1', text: 'Fix the tests', at: 1 }, { k: 'reply', key: 'r1', text: 'Done.', streaming: false, final: true, cost: null, at: null }]));
    render(<View />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('log', { name: 'Conversation' })).toBeTruthy();
    expect(screen.getByText('Fix the tests')).toBeTruthy();
  });

  it('a hook that holds the agent keeps its card with a working link to the Agent app, and the plain line is not drawn twice', async () => {
    boot();
    provide(fake([{ k: 'line', key: 'h0', text: S['ask.hooksBody']!, tone: 'info' }]));
    render(<View />);
    await act(async () => { await Promise.resolve(); });
    const link = screen.getByRole('link', { name: S['ask.hooksOpenAgent']! });
    expect(link.getAttribute('href')).toBe('https://agent.example/');
    expect(link.getAttribute('target')).toBe('_blank');
    const seen = vi.fn();
    link.addEventListener('click', (e) => { seen(e.defaultPrevented); e.preventDefault(); });
    fireEvent.click(link);
    expect(seen).toHaveBeenCalledWith(false);
    expect(screen.getAllByText(S['ask.hooksBody']!)).toHaveLength(1);
  });

  it('a Not sent message with files can be taken back here: Edit puts its text in the composer', async () => {
    boot();
    const onTakeBack = vi.fn();
    const x = fake([{ k: 'user', key: 'u1', text: 'see file', at: 1, files: [{ id: 'f1', kind: 'text', name: 'a.txt' }], note: { text: 'Not sent', bad: true }, req: { key: 'k1', kind: 'turn' }, actions: ['takeBack'] } as any]);
    provide(x);
    render(<View onTakeBack={onTakeBack} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(x.takeBack).toHaveBeenCalledTimes(1);
    expect(onTakeBack).toHaveBeenCalledWith('my message');
  });

  it('a sent message keeps its attachments: the image and the text file are listed under it', async () => {
    boot();
    provide(fake([{ k: 'user', key: 'u1', text: 'Look at these', at: 1, files: [{ id: 'i1', kind: 'image', name: 'shot.png', url: 'blob:x' }, { id: 'f1', kind: 'text', name: 'log.txt', meta: '12 lines' }] }]));
    render(<View />);
    await act(async () => { await Promise.resolve(); });
    const list = screen.getByRole('list', { name: 'Sent with this message' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('shot.png')).toBeTruthy();
    expect(screen.getByText('log.txt')).toBeTruthy();
  });

  it('what the dock puts above the transcript (the fork band, the page\'s lines) is drawn above the log, whether or not a hook holds the agent', async () => {
    boot();
    provide(fake([{ k: 'user', key: 'u1', text: 'Hello', at: 1 }]));
    render(<DockSessionView source={current!.source} eng={null as any} conv={REF} host={{ computer: 'atlas', realm: 'global' }} agentUrl="https://agent.example/" typing={false} empty={null} top={<p>BAND</p>} onTakeBack={() => undefined} fallback={null} />);
    await act(async () => { await Promise.resolve(); });
    const band = screen.getByText('BAND');
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(band.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the shell jobs the chat runs show above the composer, and nothing is drawn when it has none', async () => {
    boot();
    provide(fake([{ k: 'user', key: 'u1', text: 'go', at: 1 }], { jobs: [{ job_id: 'a', command: 'npm run dev', started_ms: Date.now(), state: 'running', last_line: 'ready', remote: false }] }));
    render(<View />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByText('npm run dev')).toBeTruthy();
    cleanup();
    provide(fake([{ k: 'user', key: 'u1', text: 'go', at: 1 }], { jobs: [] }));
    render(<View />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByText('npm run dev')).toBeNull();
  });

  it('the transcript\'s reach line is not drawn: the dock\'s bands say it', async () => {
    boot();
    provide(fake([{ k: 'line', key: 'reach', text: 'Can\'t reach atlas', tone: 'bad' }, { k: 'user', key: 'u1', text: 'go', at: 1 }]));
    render(<View />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Can\'t reach atlas')).toBeNull();
    expect(screen.getByText('go')).toBeTruthy();
  });

  it('after a turn whose end could not be read: Check again acts on the engine', async () => {
    boot();
    provide(fake([{ k: 'line', key: 'q', text: 'Not sure it finished', tone: 'info' }]));
    const snapshot = { conv: { ...emptyConv('s1'), unsure: true }, gates: [], users: {} } as any;
    const eng = { getSnapshot: () => snapshot, subscribe: () => () => undefined, checkOutcome: vi.fn(), journaled: false, newConversation: vi.fn() } as any;
    render(<DockSessionView source={current!.source} eng={eng} conv={REF} host={{ computer: 'atlas', realm: 'global' }} agentUrl="" typing={false} empty={null} onTakeBack={() => undefined} fallback={null} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(eng.checkOutcome).toHaveBeenCalledTimes(1);
  });
});
