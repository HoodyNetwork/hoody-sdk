// Vitest: SessionView reads a ConversationSource. It draws the snapshot's transcript and gates; a read-only
// source's gate card cannot be decided and says why; an active source decides through source.decide with the gate the
// card was drawn for.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ActiveSource, ConvSnapshot, ConversationSource } from './source';
import { SessionView } from './SessionView';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const snap = (o: Partial<ConvSnapshot> = {}, f: Partial<CapFacts> = {}): ConvSnapshot => ({
  facts: { ...facts, ...f }, title: 'Fix tests', gates: [], blocks: [
    { k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1 },
    { k: 'steps', key: 't1', label: '2 steps · 4 s', state: 'ok', rows: [
      { id: 's1', state: 'ok', verb: 'Run', summary: 'npm run build', time: '3 s' },
      { id: 's2', state: 'unknown', verb: 'Edit file', summary: '/a/b.ts', note: 'This step may have run.' },
    ] },
    { k: 'reply', key: 'r1', text: 'Done: **all green**', streaming: false, final: true, cost: null, at: null },
    { k: 'decided', key: 'd1', d: { kind: 'once', tool: 'bash', text: 'npm test' } },
    { k: 'line', key: 'l1', text: 'Stopped by you', tone: 'muted' },
  ], ...o,
});
const gate = { key: 'g1', ref: { id: 'g1', generation: 3 }, gate: { kind: 'confirm' as const, risk: 'exec', tool: 'bash', params: { command: 'git push' } }, helper: false, addressing: false, held: null, decision: null };

function readSource(s: ConvSnapshot): ConversationSource {
  return { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) };
}
function activeSource(s: ConvSnapshot): ActiveSource & { decide: ReturnType<typeof vi.fn> } {
  const decide = vi.fn(async () => ({ k: 'done' as const }));
  return {
    ...readSource({ ...s, facts: { ...s.facts, mode: 'active' } }),
    can: (a: Action) => can(a, { ...s.facts, mode: 'active' }),
    send: vi.fn(), stop: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: vi.fn(() => true), decide,
  } as unknown as ActiveSource & { decide: ReturnType<typeof vi.fn> };
}

describe('SessionView draws the snapshot', () => {
  it('the user message, the reply as markdown, the decided line and the note', () => {
    const { container } = render(<SessionView source={readSource(snap())} size="l" />);
    expect(screen.getByRole('log', { name: 'Conversation' })).toBeTruthy();
    expect(screen.getByText('Fix the checkout tests')).toBeTruthy();
    expect(container.querySelector('strong')?.textContent).toBe('all green');
    expect(screen.getByText('Allowed once')).toBeTruthy();
    expect(screen.getByText('Stopped by you')).toBeTruthy();
  });
  it('the step trail opens to its rows; a step of unknown outcome says it may have run, never failed', () => {
    render(<SessionView source={readSource(snap())} size="l" />);
    expect(screen.queryByText('npm run build')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '2 steps · 4 s Done' }));
    expect(screen.getByText('npm run build')).toBeTruthy();
    expect(screen.getByText('This step may have run.')).toBeTruthy();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });
  // (a) WCAG 2.5.3: the trail's name holds its visible label (no aria-label replaces it); open or closed is
  // aria-expanded. (b) every step mark says its outcome as text (the icon and the dots are hidden).
  it('the trail is named by its visible label and outcome, and each step mark says its outcome', () => {
    const marks = snap({ blocks: [{ k: 'steps', key: 't9', label: '4 steps', state: 'running', rows: [
      { id: 'a', state: 'ok', verb: 'Run' }, { id: 'b', state: 'failed', verb: 'Read' },
      { id: 'c', state: 'running', verb: 'Edit' }, { id: 'd', state: 'unknown', verb: 'Write' },
    ] }] });
    render(<SessionView source={readSource(marks)} size="l" />);
    const btn = screen.getByRole('button', { name: '4 steps Running' });
    expect(btn.hasAttribute('aria-label')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: '4 steps Running' })).toBe(btn);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['DoneRun', 'FailedRead', 'RunningEdit', 'Outcome unknownWrite']);
  });
  // The dock draws its trail toggle with the kit TextButton (ask/Column.tsx): the AI tab's is the same control, never a private button.
  it('the trail toggle is the kit TextButton, as in the dock', () => {
    render(<SessionView source={readSource(snap())} size="l" />);
    const btn = screen.getByRole('button', { name: /^2 steps · 4 s/ });
    expect(btn.hasAttribute('data-text-button')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
  // A reply still streaming is marked busy, so a screen reader waits for it to settle instead of reading every fragment.
  it('a streaming reply is aria-busy; once it settles the mark is gone', () => {
    const live = snap({ blocks: [{ k: 'reply', key: 'r1', text: 'Thinking aloud', streaming: true, final: false, cost: null, at: null }] });
    const { container, rerender } = render(<SessionView source={readSource(live)} size="l" />);
    const busy = () => container.querySelectorAll('[aria-busy="true"]');
    expect(busy()).toHaveLength(1);
    expect(busy()[0]?.textContent).toContain('Thinking aloud');
    rerender(<SessionView source={readSource(snap({ blocks: [{ k: 'reply', key: 'r1', text: 'Thinking aloud', streaming: false, final: true, cost: null, at: null }] }))} size="l" />);
    expect(busy()).toHaveLength(0);
    expect(container.textContent).toContain('Thinking aloud');
  });
  it('empty: the host\'s empty state', () => {
    render(<SessionView source={readSource(snap({ blocks: [] }))} size="s" empty={<p>Nothing yet</p>} />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    expect(screen.queryByText('Reading this chat…')).toBeNull();
  });
  // Triage 9a: a chat still being read is never drawn as an empty chat (the host's first-use state).
  it('nothing yet while the source still reads the chat: reading words and a skeleton, never the empty state', () => {
    const { container } = render(<SessionView source={readSource(snap({ blocks: [] }, { state: 'loading', turn: false, gate: 'none' }))} size="s" empty={<p>Nothing yet</p>} />);
    expect(screen.getByText('Reading this chat…')).toBeTruthy();
    expect(container.querySelector('[data-skeleton]')).not.toBeNull();
    expect(screen.queryByText('Nothing yet')).toBeNull();
  });
  // Triage 9b: a saved copy says so once, in the kit's band, above its blocks.
  it('a saved copy draws its blocks under one "saved copy" band; a live transcript has no band', () => {
    const { container, rerender } = render(<SessionView source={readSource(snap({ saved: { at: Date.now() - 5 * 60_000 } }, { state: 'loading' }))} size="s" />);
    expect(screen.getByText(/^Showing a saved copy from .*\. Reading the latest from the computer…$/)).toBeTruthy();
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
    expect(screen.getByText('Fix the checkout tests')).toBeTruthy();
    rerender(<SessionView source={readSource(snap())} size="s" />);
    expect(screen.queryByText(/saved copy/)).toBeNull();
  });
  it('a loading source that already shows blocks draws them, not the reading state', () => {
    render(<SessionView source={readSource(snap({}, { state: 'loading' }))} size="s" empty={<p>Nothing yet</p>} />);
    expect(screen.getByText('Fix the checkout tests')).toBeTruthy();
    expect(screen.queryByText('Reading this chat…')).toBeNull();
  });
  it('the size class reaches the column', () => {
    const { container } = render(<SessionView source={readSource(snap())} size="xxl" />);
    expect((container.firstElementChild as HTMLElement).dataset.size).toBe('xxl');
  });
});

// A failure no Retry helps names the page where the next step is taken: its line carries a link drawn as a button beside it.
describe('a failure line with the page of its next step', () => {
  it('draws the line and a link to that page; a line without one draws no link', () => {
    const failed = snap({ blocks: [{ k: 'line', key: 'o1', text: 'No usable model is set on this computer.', tone: 'bad', link: { label: 'Open AI models', href: '/ai/models' } }] });
    render(<SessionView source={activeSource(failed)} size="l" />);
    expect(screen.getByText('No usable model is set on this computer.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open AI models' }).getAttribute('href')).toContain('/ai/models');
    cleanup();
    render(<SessionView source={activeSource(snap({ blocks: [{ k: 'line', key: 'o2', text: 'Stopped.', tone: 'muted' }] }))} size="l" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('a next step in the Agent app links to the address the host gives; with none, the line alone', () => {
    const held = snap({ blocks: [{ k: 'line', key: 'h1', text: 'A hook is holding the agent.', tone: 'info', agentApp: 'Open the Agent app' }] });
    render(<SessionView source={activeSource(held)} size="l" agentUrl="https://agent.example" />);
    expect(screen.getByRole('link', { name: 'Open the Agent app' }).getAttribute('href')).toBe('https://agent.example');
    cleanup();
    render(<SessionView source={activeSource(held)} size="l" />);
    expect(screen.getByText('A hook is holding the agent.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

// The agent's summary of the earlier conversation: one folded row, no "You" and no row actions; opened, the summary is drawn as a
// reply's markdown (headings, lists, code), never as raw text.
describe('the compaction summary', () => {
  it('is a folded row that opens to the summary in markdown, with no author of its own', () => {
    const sum = snap({ blocks: [
      { k: 'summary', key: 'c0', text: '**User goals**\n\n## Done so far\n- Fixed `round()`\n\n```ts\nconst total = 1;\n```' },
      { k: 'user', key: 'u1', text: 'Now round it half up.', at: 1000 },
    ] });
    const { container } = render(<SessionView source={activeSource(sum)} size="l" />);
    const open = screen.getByRole('button', { name: 'Earlier conversation summarized to save space' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByText('You')).toHaveLength(1);
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Done so far' })).toBeInTheDocument();
    expect(screen.getByText('Fixed', { exact: false }).closest('li')).not.toBeNull();
    expect(container.textContent).not.toContain('**User goals**');
    expect(container.textContent).not.toContain('```');
  });
});

// A turn whose outcome is not known ("Couldn't tell"): on an active source that can read it again, its line offers Check again
// (the dock's words); a press reads, never sends. A read-only source, or a line not marked for it, draws the line alone.
describe('Check again on an unsure line', () => {
  const unsure = snap({ blocks: [{ k: 'line', key: 'u1', text: "Couldn't tell if this turn finished.", tone: 'info', recheck: true }] });
  it('an active source with recheckOutcome offers it; a press calls it once', () => {
    const recheckOutcome = vi.fn();
    const src: ActiveSource = { ...activeSource(unsure), recheckOutcome };
    render(<SessionView source={src} size="l" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(recheckOutcome).toHaveBeenCalledTimes(1);
  });
  it('a read-only source draws the line alone', () => {
    render(<SessionView source={readSource(unsure)} size="l" />);
    expect(screen.getByText("Couldn't tell if this turn finished.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });
  it('a line not marked for it draws no button', () => {
    const plain = snap({ blocks: [{ k: 'line', key: 'u2', text: 'Stopped.', tone: 'muted' }] });
    const src: ActiveSource = { ...activeSource(plain), recheckOutcome: vi.fn() };
    render(<SessionView source={src} size="l" />);
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });
});

describe('gates on a read-only source', () => {
  it('the card shows, its buttons cannot decide, and a line says the view only reads', () => {
    const s = snap({ gates: [gate] });
    render(<SessionView source={readSource(s)} size="l" typing />);
    const allow = screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement;
    expect(allow.disabled).toBe(true);
    expect(screen.getByText('This view only reads the conversation.')).toBeTruthy();
    fireEvent.click(allow);
    fireEvent.keyDown(allow, { key: 'y' });
  });
  it('a source missing a prerequisite says what is missing', () => {
    const s = snap({ gates: [gate] }, { mode: 'active', prereq: { journal: false, recovery: true, attachment: true, approver: 'notNeeded' } });
    render(<SessionView source={{ ...readSource(s), can: (a: Action) => can(a, s.facts) }} size="l" typing />);
    expect(screen.getByText(/Sending is not ready yet: the record that keeps sends safe\./)).toBeTruthy();
  });
});

describe('gates on an active source', () => {
  it('Allow once decides the gate the card was drawn for', () => {
    const src = activeSource(snap({ gates: [gate] }));
    render(<SessionView source={src} size="l" typing />);
    fireEvent.click(screen.getByRole('button', { name: /Allow once/ }));
    expect(src.decide).toHaveBeenCalledWith({ id: 'g1', generation: 3 }, { choice: 'once', reason: undefined });
  });
});

describe('following new output', () => {
  function live() {
    let s = snap();
    const subs = new Set<() => void>();
    const src: ConversationSource = { ...readSource(s), snapshot: () => s, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
    return { src, push: () => { s = { ...s, blocks: [...s.blocks, { k: 'line', key: 'n' + s.blocks.length, text: 'more', tone: 'muted' }] }; subs.forEach((f) => f()); } };
  }
  const dims = (el: HTMLElement, scrollHeight: number, clientHeight: number) => {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  };
  it('follows rows added inside an existing step block (no new block, no new text)', async () => {
    let s = snap();
    const subs = new Set<() => void>();
    const src: ConversationSource = { ...readSource(s), snapshot: () => s, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
    render(<SessionView source={src} size="l" />);
    const log = screen.getByRole('log');
    dims(log, 500, 100);
    log.scrollTop = 400; fireEvent.scroll(log);
    s = { ...s, blocks: s.blocks.map((b) => (b.k === 'steps' ? { ...b, rows: [...b.rows, { id: 'sx', state: 'running' as const, verb: 'Run' }] } : b)) };
    act(() => { subs.forEach((f) => f()); });
    expect(log.scrollTop).toBe(500);
  });
  // One rule: any change at the end of the transcript is followed while the reader is at the end.
  const changed = (mk: (b: ConvSnapshot['blocks']) => ConvSnapshot['blocks']) => async () => {
    let s = snap();
    const subs = new Set<() => void>();
    const src: ConversationSource = { ...readSource(s), snapshot: () => s, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
    render(<SessionView source={src} size="l" />);
    const log = screen.getByRole('log');
    dims(log, 500, 100);
    log.scrollTop = 400; fireEvent.scroll(log);
    s = { ...s, blocks: mk(s.blocks) };
    act(() => { subs.forEach((f) => f()); });
    expect(log.scrollTop).toBe(500);
    // and once the reader has scrolled up, the same kind of change leaves them where they are
    log.scrollTop = 100; fireEvent.scroll(log);
    s = { ...s, blocks: mk(mk(s.blocks)) };
    act(() => { subs.forEach((f) => f()); });
    expect(log.scrollTop).toBe(100);
  };
  it('follows a note appearing on the user message', changed((b) => b.map((x) => (x.k === 'user' ? { ...x, note: { text: x.note ? x.note.text + '!' : 'Not sent', bad: true } } : x))));
  it('follows a step note appearing', changed((b) => b.map((x) => (x.k === 'steps' ? { ...x, rows: x.rows.map((r) => ({ ...r, note: (r.note ?? '') + 'This step may have run.' })) } : x))));
  it('follows the reply finishing (the footer appears)', changed((b) => b.map((x) => (x.k === 'reply' ? { ...x, final: !x.final, streaming: !x.streaming, cost: (x.cost ?? 0) + 1 } : x))));
  it('follows a change that is only in the DOM below the snapshot', async () => {
    const src = readSource(snap());
    render(<SessionView source={src} size="l" />);
    const log = screen.getByRole('log');
    dims(log, 500, 100);
    log.scrollTop = 400; fireEvent.scroll(log);
    await act(async () => { log.appendChild(document.createElement('p')); await Promise.resolve(); });
    expect(log.scrollTop).toBe(500);
    log.scrollTop = 100; fireEvent.scroll(log);
    await act(async () => { log.appendChild(document.createElement('p')); await Promise.resolve(); });
    expect(log.scrollTop).toBe(100);
  });
  it('follows new output while the reader is at the end, and stops once they scroll up', async () => {
    const { src, push } = live();
    render(<SessionView source={src} size="l" />);
    const log = screen.getByRole('log');
    dims(log, 500, 100);
    log.scrollTop = 400; fireEvent.scroll(log);
    push();
    await Promise.resolve();
    expect(log.scrollTop).toBe(500);
    log.scrollTop = 0; fireEvent.scroll(log);
    push();
    await Promise.resolve();
    expect(log.scrollTop).toBe(0);
  });
});

describe('every refused capability disables the card', () => {
  const withCan = (s: ConvSnapshot, cap: (a: Action) => ReturnType<typeof can>) => {
    const base = activeSource(s);
    return Object.assign(base, { can: cap }) as ActiveSource & { decide: ReturnType<typeof vi.fn> };
  };
  it('can(decide) = gate_held with the card\'s own held unset: Allow once is disabled and nothing is sent', () => {
    const src = withCan(snap({ gates: [gate] }), () => ({ ok: false, reason: 'gate_held' }));
    render(<SessionView source={src} size="l" typing />);
    const allow = screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement;
    expect(allow.disabled).toBe(true);
    fireEvent.click(allow);
    expect(src.decide).not.toHaveBeenCalled();
    expect(screen.getByText('Earlier decisions are still going through.')).toBeTruthy();
  });
  it('a decision on its way (decision_pending) disables the other card too', () => {
    const g2 = { ...gate, key: 'g2', ref: { id: 'g2', generation: 1 } };
    const src = withCan(snap({ gates: [{ ...gate, decision: 'sending' as const }, g2] }), () => ({ ok: false, reason: 'decision_pending' }));
    render(<SessionView source={src} size="l" typing />);
    const allows = screen.getAllByRole('button', { name: /Allow once/ }) as HTMLButtonElement[];
    expect(allows).toHaveLength(2);
    for (const b of allows) { expect(b.disabled || b.getAttribute('aria-disabled') === 'true').toBe(true); fireEvent.click(b); }
    expect(src.decide).not.toHaveBeenCalled();
  });
  it('the capability is read again where the action is taken', () => {
    let ok = true;
    const src = withCan(snap({ gates: [gate] }), () => (ok ? { ok: true } : { ok: false, reason: 'prerequisites', missing: ['journal'] }));
    render(<SessionView source={src} size="l" typing />);
    const allow = screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement;
    expect(allow.disabled).toBe(false);
    ok = false; // the facts changed after the card was drawn, before any repaint
    fireEvent.click(allow);
    expect(src.decide).not.toHaveBeenCalled();
  });
  it('a refused card shows no spinner: nothing is on its way', () => {
    const src = withCan(snap({ gates: [gate] }), () => ({ ok: false, reason: 'read_only' }));
    render(<SessionView source={src} size="l" typing />);
    expect((screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement).getAttribute('aria-busy')).not.toBe('true');
  });
});

describe('a replacement gate starts with fresh answer state', () => {
  const q = (id: string, generation: number, question: string) => ({ key: 'g1', ref: { id, generation }, gate: { kind: 'question' as const, risk: '', question, options: ['Yes', 'No'] }, helper: false, addressing: false, held: null, decision: null });
  it('a different question under the same key and a new generation does not keep the earlier choice', () => {
    let s = snap({ gates: [q('g1', 3, 'Deploy now?')] }, { gate: 'question' });
    const subs = new Set<() => void>();
    const src = { ...activeSource(s), snapshot: () => s, subscribe: (fn: () => void) => { subs.add(fn); return () => subs.delete(fn); } } as unknown as ActiveSource;
    render(<SessionView source={src} size="l" typing />);
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    expect((screen.getByRole('button', { name: /Send answer/ }) as HTMLButtonElement).disabled).toBe(false);
    s = snap({ gates: [q('g1', 4, 'Delete everything?')] }, { gate: 'question' });
    act(() => { subs.forEach((f) => f()); });
    expect(screen.getByText('Delete everything?')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Send answer/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Stop tracking on a "not sure" decision (engine.dismissDecision)', () => {
  const unsure = { ...gate, decision: 'unknown' as const };
  it('an active source: Stop tracking hands the gate the card was drawn for to dismissDecision, and sends nothing', () => {
    const src = activeSource(snap({ gates: [unsure] }));
    render(<SessionView source={src} size="l" typing />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(src.dismissDecision).toHaveBeenCalledTimes(1);
    expect(src.dismissDecision).toHaveBeenCalledWith(unsure.ref);
    expect(src.decide).not.toHaveBeenCalled();
    expect(src.send).not.toHaveBeenCalled();
  });
  it('Check again stays beside it', () => {
    render(<SessionView source={activeSource(snap({ gates: [unsure] }))} size="l" typing />);
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });
  it('a read-only source has no Stop tracking, and a card that is not unsure has none either', () => {
    const { unmount } = render(<SessionView source={readSource(snap({ gates: [unsure] }))} size="l" typing />);
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    unmount();
    render(<SessionView source={activeSource(snap({ gates: [gate] }))} size="l" typing />);
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
  });
});

describe('Dismiss only where the engine can dismiss', () => {
  const unsure = { ...gate, decision: 'unknown' as const };
  it('canDismiss false: no Stop tracking button, Check again stays', () => {
    const src = activeSource(snap({ gates: [unsure] }));
    (src.canDismiss as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<SessionView source={src} size="l" typing />);
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(src.canDismiss).toHaveBeenCalledWith(unsure.ref);
  });
});

describe('a refused Check again is disabled and says why', () => {
  const unsure = { ...gate, decision: 'unknown' as const };
  it('a read-only source: disabled, with its reason', () => {
    render(<SessionView source={readSource(snap({ gates: [unsure] }))} size="l" typing />);
    expect((screen.getByRole('button', { name: 'Check again' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('This view only reads the conversation.')).toBeTruthy();
  });
  it('an active source whose journal is missing: disabled, names what is missing', () => {
    const src = activeSource(snap({ gates: [unsure] }, { unsettledSends: 1, prereq: { journal: false, recovery: true, attachment: true, approver: 'notNeeded' } }));
    render(<SessionView source={src} size="l" typing />);
    const b = screen.getByRole('button', { name: 'Check again' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(src.check).not.toHaveBeenCalled();
  });
  it('an allowed check stays enabled and runs (a decision whose outcome is unknown counts as an unsettled send)', () => {
    const src = activeSource(snap({ gates: [unsure] }, { unsettledSends: 1 }));
    render(<SessionView source={src} size="l" typing />);
    const b = screen.getByRole('button', { name: 'Check again' }) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    expect(src.check).toHaveBeenCalledTimes(1);
  });
});

describe('reflow follows too, and a scrolled-up reader gets "Jump to newest"', () => {
  type RO = { cb: () => void; targets: Set<Element> };
  const ros: RO[] = [];
  class FakeRO { rec: RO; constructor(cb: () => void) { this.rec = { cb, targets: new Set() }; ros.push(this.rec); } observe(e: Element) { this.rec.targets.add(e); } unobserve(e: Element) { this.rec.targets.delete(e); } disconnect() { this.rec.targets.clear(); } }
  const dims = (el: HTMLElement, h: () => number, c: number) => {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: h });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => c });
    // A browser keeps scrollTop inside [0, scrollHeight - clientHeight], and keeps it there when the layout shrinks.
    let top = 0;
    const max = () => Math.max(0, el.scrollHeight - el.clientHeight);
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => { top = Math.min(top, max()); return top; }, set: (v: number) => { top = Math.min(Math.max(0, v), max()); } });
  };
  const setup = (o: Partial<ConvSnapshot> = {}) => {
    ros.length = 0;
    vi.stubGlobal('ResizeObserver', FakeRO);
    let height = 500;
    let s = snap(o);
    const subs = new Set<() => void>();
    const base = o.gates?.length ? activeSource(s) : readSource(s); // a gate's buttons and fields work only on an active source
    const src: ConversationSource = { ...base, snapshot: () => s, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
    const view = render(<SessionView source={src} size="l" typing />);
    const log = screen.getByRole('log');
    dims(log, () => height, 100);
    act(() => { ros.forEach((r) => r.cb()); }); // a follow with the real dimensions, as the observers do once the view is laid out
    return { log, view, grow: (to: number) => { height = to; }, push: () => { s = { ...s, blocks: [...s.blocks, { k: 'line', key: 'n' + subs.size + Math.random(), text: 'x', tone: 'muted' as const }] }; act(() => { subs.forEach((f) => f()); }); } };
  };
  afterEach(() => { vi.unstubAllGlobals(); });
  it('a size change of the column or of a block in it (reflow) is followed while at the bottom', () => {
    const { log, grow } = setup();
    log.scrollTop = 400; fireEvent.scroll(log);
    grow(600);
    expect(ros.some((r) => r.targets.has(log))).toBe(true);
    expect(ros.some((r) => [...r.targets].some((t) => t !== log && log.contains(t)))).toBe(true);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(500);
  });
  it('a reflow while scrolled up leaves the reader where they are', () => {
    const { log, grow } = setup();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(600);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(100);
  });
  it('no jump button at the end; new output while scrolled up shows it; it scrolls to the end and following resumes', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 400; fireEvent.scroll(log);
    push();
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(700); push();
    expect(log.scrollTop).toBe(100);
    const jump = screen.getByRole('button', { name: 'Jump to newest' });
    expect(log.contains(jump)).toBe(false); // its own row below the transcript: it can never cover a gate's controls
    jump.focus();
    fireEvent.click(jump);
    expect(log.getAttribute('tabindex')).toBe('-1'); // focusable by script only, never a tab stop
    expect(document.activeElement).toBe(log); // the pressed button is gone: focus goes to the newest content, not <body>
    expect(log.scrollTop).toBe(600);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
    grow(800); push();
    expect(log.scrollTop).toBe(700);
  });
  it('the late scroll event of the view\'s own follow is not the reader leaving the end (content grew after it)', () => {
    const { log, grow, push } = setup();
    push(); // follow: to the end (content 500, view 100: scrollTop 400)
    grow(700); // a code block or image drew after the follow, before its scroll event
    fireEvent.scroll(log); // the event of our own follow arrives late
    act(() => { ros.forEach((r) => r.cb()); }); // the observers follow the growth
    expect(log.scrollTop).toBe(600);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('a layout change that clamps the position (the end came closer, the view got shorter) is not the reader leaving the end', () => {
    const { log, grow, push } = setup();
    push(); // follow: to the end (content 500, view 100: scrollTop 400)
    grow(470); // narrower text: the content shrank; the browser clamps the position to the new end
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 80 }); // and a band above shortened the view
    log.scrollTop = 450; fireEvent.scroll(log);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(390);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('a clamp, then the view shortening by more than a line before the scroll event (a wider column reflowed shorter, a band drew above): still the end', () => {
    // The order a browser takes (seen at 1700/2500 px, kit/agent/geometry.spec): the content shrinks and the position is
    // clamped to the end of the view as it then was; the view shrinks after that, leaving the clamped position 50 px short of
    // the new end; then the scroll event of the clamp arrives, then the observers.
    const { log, grow, push } = setup();
    push(); // to the end (content 500, view 100: scrollTop 400)
    grow(470); log.scrollTop = 370; // the clamp: the end of the shorter content in the 100 px view
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 50 }); // then the view lost 50 px
    fireEvent.scroll(log);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(420);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('the same clamp with the observers before the scroll event: still the end', () => {
    const { log, grow, push } = setup();
    push();
    grow(470); log.scrollTop = 370;
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 50 });
    act(() => { ros.forEach((r) => r.cb()); });
    fireEvent.scroll(log);
    expect(log.scrollTop).toBe(420);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('a reader already away who moves up a little while the content shrinks is not taken to the end (only a log at the end is clamped)', () => {
    const { log, grow } = setup();
    log.scrollTop = 100; fireEvent.scroll(log); // away
    grow(470); log.scrollTop = 90; fireEvent.scroll(log); // content lost 30 px, the reader went up 10
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(90);
  });
  it('a reader who scrolls up further than the content shrank is not pulled back', () => {
    const { log, grow, push } = setup();
    push(); // scrollTop 400
    grow(400); log.scrollTop = 270; fireEvent.scroll(log); // content lost 100 px, the reader went up 130: 30 px above the new end
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(270);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('a reader who moves down while the view shortens, still short of the new end, is not taken to it (a clamp only moves up)', () => {
    const { log, push } = setup();
    push(); // scrollTop 400
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 50 }); // the view lost 50 px: the end is 450
    log.scrollTop = 410; fireEvent.scroll(log); // the reader went down 10: 40 px above the new end
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(410);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('a clamp because the view got taller, then the content grew before the event: still the end, followed', () => {
    const { log, grow, push } = setup();
    push(); // to the end (content 500, view 100: scrollTop 400)
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 140 }); // a band closed: the view is taller
    expect(log.scrollTop).toBe(360); // clamped to the end of that layout
    grow(530); // and text arrived before the event ran: the end is now 390
    fireEvent.scroll(log);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(390);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  // One position rule: a change is followed iff the log sat at the end when it arrived. No guess about hands, keys,
  // pointers or the timing of scroll events: where the log is decides. A scroll event decides the button, and follows only a
  // move consistent with a clamp (a reader's move up by no more than the clamp could take counts as the end).
  it('a reader who scrolls away between the view\'s follow and the observers is not pulled back (no wheel, key or touch seen)', () => {
    const { log, grow, push } = setup();
    push(); // follow: to the end (content 500, view 100: scrollTop 400)
    grow(700); // the content grew before the observers ran
    log.scrollTop = 100; fireEvent.scroll(log); // and the log is now somewhere else, however it got there
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(100);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('at the bottom, the reader scrolls up 200 px, a change arrives: the log stays put (a stale position never beats their scroll)', () => {
    const { log, grow, push } = setup();
    push(); // at the end (scrollTop 400)
    log.scrollTop = 200; fireEvent.scroll(log); // 200 px up
    push(); // a change at the same layout
    expect(log.scrollTop).toBe(200);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
    grow(700); push(); // and one that also grew the layout
    expect(log.scrollTop).toBe(200);
  });
  it('the same when the scroll event has not arrived yet: the position now decides, not the last event', () => {
    const { log, grow, push } = setup();
    push();
    grow(700);
    log.scrollTop = 300; // moved, event still to come
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(300);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('a small move of the reader whose scroll event has not arrived yet still wins over the old layout (the layout then grew)', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400): the old layout's end
    log.scrollTop = 390; // the reader moved 10 px (inside the old layout's last line); no event yet
    grow(700);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(390);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('the layout shrinking so the browser clamps the position to the new end (no event yet) is still the end', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400)
    grow(470); log.scrollTop = 370; // the end of the shorter content is 370
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(370);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('a position the view last saw does not come back as the end: away, then the position set back to the old spot, then growth', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400)
    log.scrollTop = 100; // away, no event
    grow(700); act(() => { ros.forEach((r) => r.cb()); });
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
    log.scrollTop = 400; // the position happens to equal the one the view left at the first end
    grow(800); push();
    expect(log.scrollTop).toBe(400);
  });
  it('a scroll event while away leaves the Jump button up', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(700); push();
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
    log.scrollTop = 150; fireEvent.scroll(log);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('the view grows until all the content fits while away: following resumes and the button goes, though no scroll event comes', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 0; fireEvent.scroll(log);
    grow(700); push();
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 800 }); // all of it fits; scrollTop stays 0
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(0);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('the unmoved-position tolerance is below a pixel: a move of 5 px with no event yet is the reader\'s', () => {
    const { log, grow, push } = setup();
    push(); // scrollTop 400, the old layout's end
    log.scrollTop = 395; // 5 px up, no event yet
    grow(700);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(395);
  });
  it('a fraction of a pixel (the browser rounding a fractional scrollTop) is not a move: following goes on', () => {
    const { log, grow, push } = setup();
    push(); // scrollTop 400
    log.scrollTop = 399.6; // device-pixel rounding, no scroll by the reader
    grow(700);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(600);
  });
  it('a selection drag that began outside the log and went past its top edge (the browser scrolls up on its own; no press in the log) after growth, before the observers: the log stays where the drag left it', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400)
    grow(900); // a streaming reply grew
    log.scrollTop = 380; fireEvent.scroll(log); // autoscroll above the edge moved the log up a little
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(380);
    log.scrollTop = 200; fireEvent.scroll(log); // and on up
    grow(1000); push();
    expect(log.scrollTop).toBe(200);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('a selection drag past the bottom edge (scrolls down to the end) keeps following', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(700); push();
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
    log.scrollTop = 600; fireEvent.scroll(log); // autoscroll reached the end
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
    grow(800); push();
    expect(log.scrollTop).toBe(700);
  });
  describe('keys a field consumes are not a reader leaving the end', () => {
    const open = () => {
      const x = setup({ gates: [gate] });
      fireEvent.click(screen.getByRole('button', { name: /Add a reason/ }));
      return x;
    };
    it('ArrowUp / PageUp in the multiline "Add a reason" field (moves the caret, never the log)', () => {
      const { log, grow, push } = open();
      push(); // to the end (scrollTop 400)
      const field = screen.getByRole('textbox');
      fireEvent.keyDown(field, { key: 'ArrowUp' });
      fireEvent.keyDown(field, { key: 'PageUp' });
      grow(700); fireEvent.scroll(log); // the late event of our own follow, after the growth
      act(() => { ros.forEach((r) => r.cb()); });
      expect(log.scrollTop).toBe(600);
      expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
    });
    it('Shift+Space on a button (the page would scroll up; the app cancels it)', () => {
      const { log, grow, push } = open();
      push();
      const b = screen.getByRole('button', { name: /Allow once/ });
      fireEvent.keyDown(b, { key: ' ', shiftKey: true });
      grow(700); fireEvent.scroll(log);
      act(() => { ros.forEach((r) => r.cb()); });
      expect(log.scrollTop).toBe(600);
      expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
    });
  });
  it('a press held on the scrollbar without moving, then the late scroll event of the view\'s own follow: still following', () => {
    const { log, grow, push } = setup();
    push(); // follow: to the end (content 500, view 100: scrollTop 400)
    fireEvent.pointerDown(log); // pointer held on the bar after it; no pointerup yet
    grow(700);
    fireEvent.scroll(log); // delayed event of the follow, the position unchanged by the reader
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(600);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
    grow(900); push();
    expect(log.scrollTop).toBe(800);
  });
  it('a press held, the reader drags the thumb up, and output arrives: they stay', () => {
    const { log, grow, push } = setup();
    push();
    fireEvent.pointerDown(log);
    log.scrollTop = 150; fireEvent.scroll(log);
    grow(700); push();
    expect(log.scrollTop).toBe(150);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('the browser anchoring the position to content that grew above (the distance to the end unchanged) is still the end', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400)
    grow(660); // a block above grew by 160
    log.scrollTop = 560; fireEvent.scroll(log); // the browser kept the visible content in place
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(560);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('a position a few pixels short of the end (within one line) follows; further than that does not', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400)
    log.scrollTop = 390; fireEvent.scroll(log); // 10 px short
    grow(600); push();
    expect(log.scrollTop).toBe(500);
    log.scrollTop = 450; fireEvent.scroll(log); // 50 px short of the end 500 of the layout now
    grow(700); push();
    expect(log.scrollTop).toBe(450);
  });
  it('a scroll that finds the layout as the follow left it, with the log somewhere else, is the reader\'s even with no other sign', () => {
    const { log, push } = setup();
    push();
    log.scrollTop = 100; fireEvent.scroll(log);
    push();
    expect(log.scrollTop).toBe(100);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('the late event of Jump to newest is its own: the layout moving under it does not stop following', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 100; fireEvent.scroll(log); // the reader scrolled up
    grow(700); push();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to newest' }));
    grow(1000); // grew before the event of the jump arrived
    fireEvent.scroll(log);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(900);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('Jump to newest while a press is held: it goes to the end, following resumes, the held press changes nothing', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(700); push();
    fireEvent.pointerDown(log);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to newest' }));
    expect(log.scrollTop).toBe(600);
    grow(800); push();
    expect(log.scrollTop).toBe(700);
  });
  it('after Jump to newest the reader can leave again and is left alone', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(700); push();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to newest' }));
    log.scrollTop = 200; fireEvent.scroll(log);
    grow(800); push();
    expect(log.scrollTop).toBe(200);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('several late events of one follow (the layout settling in steps) are all its own', () => {
    const { log, grow, push } = setup();
    push(); // to the end (scrollTop 400)
    grow(650); fireEvent.scroll(log);
    grow(900); fireEvent.scroll(log);
    act(() => { ros.forEach((r) => r.cb()); });
    expect(log.scrollTop).toBe(800);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('scrolling back to the end by hand hides the jump button', () => {
    const { log, grow, push } = setup();
    log.scrollTop = 100; fireEvent.scroll(log);
    grow(700); push();
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
    log.scrollTop = 600; fireEvent.scroll(log);
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
});
