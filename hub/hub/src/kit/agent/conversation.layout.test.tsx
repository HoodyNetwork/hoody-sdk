// Vitest: the conversation's layout contracts. Each turn is a section and only the newest is marked (its reply's actions stay
// in sight); a closed step trail previews one step outside the button's name, a failed or unknown step before the newest; Jump
// to newest stands aside for the Needs-you bar only when both lead to the same place (one card waits, drawn last); the
// Needs-you bar keeps its buttons beside what waits; the header's status pill shows only when it says something the frame
// does not, and on a phone the header's second row runs under its buttons. The reply foot and the space between turns:
// conversation.quiet.test.tsx.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { ConvHeader } from './ConvHeader';
import hs from './ConvHeader.module.css';
import { SessionView } from './SessionView';
import type { ConvBlock, ConvMeta, ConvSnapshot, ConversationSource, GateEntry } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
type Steps = Extract<ConvBlock, { k: 'steps' }>;
const steps = (rows: Steps['rows'], o: Partial<Steps> = {}): Steps => ({ k: 'steps', key: 't1', label: `${rows.length} steps`, state: 'ok', rows, ...o });
const reply = (key: string, text: string): ConvBlock => ({ k: 'reply', key, text, streaming: false, final: true, cost: null, at: null });
const user = (key: string, text: string): ConvBlock => ({ k: 'user', key, text, at: 1 });
const snap = (blocks: ConvBlock[], gates: GateEntry[] = []): ConvSnapshot => ({ facts, title: 'Fix it', blocks, gates, meta: { computer: 'atlas', realm: 'Work', status: 'idle' } });
const source = (s: ConvSnapshot): ConversationSource => ({
  kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts),
});
const gate = (id: string, command: string): GateEntry => ({
  key: id, ref: { id, generation: 1 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command } }, helper: false, addressing: false, held: null, decision: null,
});
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = (f: string) => noComments(readFileSync(join(__dirname, f), 'utf8'));
/** The body of the first rule whose selector list is exactly `sel` (outside or inside an at-rule). */
const body = (sheet: string, sel: string) => [...sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => (m[1] ?? '').trim() === sel)?.[2] ?? '';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('turns', () => {
  it('each turn is a section; only the newest carries data-latest', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<SessionView source={source(snap([user('u1', 'One'), reply('r1', 'First'), user('u2', 'Two'), reply('r2', 'Second')]))} size="l" />);
    const turns = [...screen.getByRole('log').querySelectorAll('[data-turn]')];
    expect(turns).toHaveLength(2);
    expect(turns.map((t) => t.hasAttribute('data-latest'))).toEqual([false, true]);
    expect(within(turns[1] as HTMLElement).getByText('Second')).toBeTruthy();
  });
});

describe('the closed step trail previews one step', () => {
  const view = (b: Steps) => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    return render(<SessionView source={source(snap([user('u1', 'Go'), b, reply('r1', 'Done')]))} size="l" />);
  };
  it('all fine: the newest step, beside the button and outside its name; open, the preview goes and the rows show', () => {
    view(steps([
      { id: 'a', state: 'ok', verb: 'Read file', summary: '/a/one.ts' },
      { id: 'b', state: 'ok', verb: 'Write file', summary: '/a/two.ts' },
    ]));
    const button = screen.getByRole('button', { name: '2 steps Done' });
    const peek = document.querySelector('[data-trail-peek]') as HTMLElement;
    expect(peek.textContent).toBe('Write file/a/two.ts');
    expect(button.contains(peek)).toBe(false);
    fireEvent.click(button);
    expect(document.querySelector('[data-trail-peek]')).toBeNull();
    expect(screen.getByText('/a/one.ts')).toBeTruthy();
    expect(screen.getByText('/a/two.ts')).toBeTruthy();
  });
  it('a failed step is previewed before the newest', () => {
    view(steps([
      { id: 'a', state: 'ok', verb: 'Read file', summary: '/a/one.ts' },
      { id: 'b', state: 'failed', verb: 'Run', summary: 'npm test', note: 'exit 1' },
      { id: 'c', state: 'ok', verb: 'Write file', summary: '/a/two.ts' },
    ], { state: 'failed' }));
    expect((document.querySelector('[data-trail-peek]') as HTMLElement).textContent).toBe('Runnpm test');
  });
  it('a step whose result never came back is previewed before the newest', () => {
    view(steps([
      { id: 'a', state: 'unknown', verb: 'Edit file', summary: '/a/b.ts', note: 'This step may have run.' },
      { id: 'b', state: 'ok', verb: 'Write file', summary: '/a/two.ts' },
    ]));
    expect((document.querySelector('[data-trail-peek]') as HTMLElement).textContent).toBe('Edit file/a/b.ts');
  });
  it('an open trail wraps each step\'s summary (two lines at most; the open row shows it whole: StepTrail.test.tsx), the closed preview stays one line', () => {
    const trail = css('StepTrail.module.css');
    expect(body(trail, '.stepSum')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body(trail, '.stepSum')).not.toMatch(/white-space:\s*nowrap/);
    expect(body(trail, '.trailPeek')).toMatch(/white-space:\s*nowrap/);
  });
});

describe('Jump to newest and the Needs-you bar', () => {
  // A browser's scroll box: scrollTop stays inside [0, scrollHeight - clientHeight].
  const dims = (el: HTMLElement, h: () => number, c: number) => {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: h });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => c });
    let top = 0;
    const max = () => Math.max(0, el.scrollHeight - el.clientHeight);
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => { top = Math.min(top, max()); return top; }, set: (v: number) => { top = Math.min(Math.max(0, v), max()); } });
  };
  /** Scrolled up, then new output arrives: the moment Jump to newest is offered. */
  const behind = (gates: GateEntry[]) => {
    const ros: (() => void)[] = [];
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { ros.push(cb); } observe() {} unobserve() {} disconnect() {} });
    let height = 500;
    let s = snap([user('u1', 'Go'), reply('r1', 'Done')], gates);
    const subs = new Set<() => void>();
    const src: ConversationSource = { ...source(s), snapshot: () => s, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
    render(<SessionView source={src} size="l" typing />);
    const log = screen.getByRole('log');
    dims(log, () => height, 100);
    act(() => { ros.forEach((cb) => cb()); });
    log.scrollTop = 100; fireEvent.scroll(log);
    height = 700;
    s = { ...s, blocks: [...s.blocks, { k: 'line', key: 'n1', text: 'x', tone: 'muted' }] };
    act(() => { subs.forEach((f) => f()); });
    return log;
  };
  it('no gate waiting: new output while scrolled up offers Jump to newest (the control case)', () => {
    behind([]);
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  // The one waiting card is cut off at the log's end (the reason the bar shows).
  const cardCutOff = () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-gate-wrap')) return rect(380, 520);
      if (this.getAttribute('role') === 'log') return rect(0, 400);
      return rect(0, 0);
    });
  };
  it('one card waits and it is drawn last: the Needs-you bar alone is drawn (its Show leads to the newest content)', () => {
    cardCutOff();
    behind([gate('a', 'ls')]);
    expect(document.querySelector('[data-needs-bar]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull();
  });
  it('the one card is taller than the log: Show cannot reach the end, so Jump to newest stays beside the bar', () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-gate-wrap')) return rect(380, 900);
      if (this.getAttribute('role') === 'log') return rect(0, 400);
      return rect(0, 0);
    });
    behind([gate('a', 'ls')]);
    expect(document.querySelector('[data-needs-bar]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
  it('more than one card waits: Show goes to the first, so Jump to newest stays beside the bar', () => {
    behind([gate('a', 'ls'), gate('b', 'pwd')]);
    expect(document.querySelector('[data-needs-bar]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();
  });
});

describe('the Needs-you bar keeps one row', () => {
  it('label, request and count are one group before the buttons', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<SessionView source={source(snap([user('u1', 'Go')], [gate('a', 'git push'), gate('b', 'ls')]))} size="xs" typing />);
    const bar = document.querySelector('[data-needs-bar]') as HTMLElement;
    const what = within(bar).getByText('Allow git push?');
    const group = what.parentElement as HTMLElement;
    expect(group.parentElement).toBe(bar);
    expect(within(group).getByText('Waiting for you')).toBeTruthy();
    expect(within(group).getByText('1 more')).toBeTruthy();
    expect(within(group).queryByRole('button')).toBeNull();
    expect(group.compareDocumentPosition(within(bar).getByRole('button', { name: 'Show' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('a narrow conversation stacks the label over the request (never the buttons on a row of their own); the request stays one line', () => {
    const session = css('SessionView.module.css');
    expect(body(session, ".root[data-size='xs']")).toMatch(/--conv-needs-dir:\s*column/);
    const bar = css('NeedsBar.module.css');
    expect(body(bar, '.text')).toMatch(/flex-direction:\s*var\(--conv-needs-dir, row\)/);
    expect(body(bar, '.bar')).not.toMatch(/flex-wrap/);
    expect(body(bar, '.what')).toMatch(/white-space:\s*nowrap/);
  });
});

describe('the header status pill', () => {
  const meta = (status: ConvMeta['status']): ConvMeta => ({ computer: 'atlas', realm: 'Work', folder: '/home/ada/shop', status });
  const pill = (status: ConvMeta['status'], size: 'xs' | 'l') => {
    const { unmount } = render(<ConvHeader size={size} title="Fix the failing checkout tests" meta={meta(status)} detailsOpen={false} onDetails={() => {}} />);
    const words: Record<string, string> = { idle: 'Idle', loading: 'Loading', running: 'Running', needs: 'Needs you', paused: 'Paused', closed: 'Closed', unreachable: "Can't reach" };
    const shown = screen.queryByText(words[status]!) !== null;
    unmount();
    return shown;
  };
  it('idle and loading draw no pill at any size', () => {
    for (const size of ['xs', 'l'] as const) {
      expect(pill('idle', size)).toBe(false);
      expect(pill('loading', size)).toBe(false);
    }
  });
  it('running and needs-you show on a wide frame; on a phone the pinned bars say them', () => {
    expect(pill('running', 'l')).toBe(true);
    expect(pill('needs', 'l')).toBe(true);
    expect(pill('running', 'xs')).toBe(false);
    expect(pill('needs', 'xs')).toBe(false);
  });
  it('the states no bar names show at every size', () => {
    for (const st of ['paused', 'closed', 'unreachable'] as const) {
      expect(pill(st, 'xs')).toBe(true);
      expect(pill(st, 'l')).toBe(true);
    }
  });
  it('the title is one line with its whole text as the tooltip; the folder is its own item, left to Details on a phone', () => {
    render(<ConvHeader size="xs" title="Fix the failing checkout tests" meta={meta('idle')} detailsOpen={false} onDetails={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Fix the failing checkout tests' }).getAttribute('title')).toBe('Fix the failing checkout tests');
    expect(screen.getByText('atlas · Work')).toBeTruthy();
    expect(screen.getByText('/home/ada/shop').classList.contains(hs.folder as string)).toBe(true);
    expect(body(css('ConvHeader.module.css'), ".head[data-size='xs'] .folder")).toMatch(/display:\s*none/);
  });
  it('on a phone the second row runs under the buttons too: Back, title and buttons are row one, where it runs spans to the end', () => {
    const head = css('ConvHeader.module.css');
    expect(body(head, ".head[data-size='xs']")).toMatch(/display:\s*grid/);
    expect(body(head, ".head[data-size='xs'] .text")).toMatch(/display:\s*contents/);
    expect(body(head, ".head[data-size='xs'] .actions")).toMatch(/grid-area:\s*1 \/ 3/);
    expect(body(head, ".head[data-size='xs'] .where,\n.head[data-size='xs'] .cap")).toMatch(/grid-column:\s*2 \/ -1/);
    render(<ConvHeader size="xs" title="Fix it" meta={meta('idle')} detailsOpen={false} onDetails={() => {}} onBack={() => {}} />);
    expect(screen.getByRole('button', { name: 'Back to chats' }).classList.contains(hs.back as string)).toBe(true);
  });
  it('the row holding the model chip is the whole press tall, so a touch press on the chip never reaches the row above or below', () => {
    // The place line is press-tall with or without the chip (the header keeps its height when the model becomes known).
    expect(body(css('ConvHeader.module.css'), '.where')).toMatch(/min-block-size:\s*var\(--xs-press-h\)/);
  });
});
