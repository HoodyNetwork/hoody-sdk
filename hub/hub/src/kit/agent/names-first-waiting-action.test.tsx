// Vitest: the Needs-you bar, Jump to newest, the header and Details. The bar sits in the
// column's flow (never an overlay), shows while a gate's card is not fully on screen or more than one waits, names what
// waits, never decides; Show brings the card into view. Details has its tabs and its words; the header always says where
// the chat runs.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registryEntry } from '@core/registry';
import { can, type Action, type CapFacts } from './capability';
import { ConvHeader } from './ConvHeader';
import { DetailsPanel } from './DetailsPanel';
import { JumpToNewest } from './JumpToNewest';
import { NeedsBar } from './NeedsBar';
import { SessionView } from './SessionView';
import type { ConvMeta, ConvSnapshot, ConversationSource, GateEntry } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const gate = (id: string, command: string): GateEntry => ({
  key: id, ref: { id, generation: 1 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command } }, helper: false, addressing: false, held: null, decision: null,
});
const META: ConvMeta = { computer: 'atlas', realm: 'Work', folder: '~/projects/shop', agent: 'General', model: 'Hoody Free', status: 'needs' };
const snap = (o: Partial<ConvSnapshot> = {}): ConvSnapshot => ({ facts, title: 'Fix the failing checkout tests', blocks: [{ k: 'user', key: 'u1', text: 'Fix it', at: 1 }], gates: [], meta: META, ...o });
const source = (s: ConvSnapshot): ConversationSource => ({
  kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts),
});

afterEach(() => { cleanup(); });

describe('NeedsBar', () => {
  it('names the first waiting action, counts the others and offers Show', () => {
    const onShow = vi.fn();
    render(<NeedsBar gates={[gate('a', 'git push origin feature/cart'), gate('b', 'rm -rf build')]} onShow={onShow} />);
    const bar = screen.getByRole('region', { name: 'Waiting for you' });
    expect(within(bar).getByText('Allow git push origin feature/cart?')).toBeTruthy();
    expect(within(bar).getByText('1 more')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Show' }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });
  it('a question names the question; an unnamed approval says "this action"', () => {
    const q: GateEntry = { ...gate('q', ''), gate: { kind: 'question', risk: '', question: 'Which branch?', options: ['main'] } };
    const { rerender } = render(<NeedsBar gates={[q]} onShow={() => {}} />);
    expect(screen.getByText('Which branch?')).toBeTruthy();
    rerender(<NeedsBar gates={[{ ...gate('x', ''), gate: { kind: 'confirm', risk: '', tool: 'mcp_x', params: {} } }]} onShow={() => {}} />);
    expect(screen.getByText('Allow this action?')).toBeTruthy();
  });
  it('draws nothing for no gate; has no decision button', () => {
    const { container } = render(<NeedsBar gates={[]} onShow={() => {}} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    render(<NeedsBar gates={[gate('a', 'ls')]} onShow={() => {}} />);
    expect(screen.queryByRole('button', { name: /Allow|Deny/ })).toBeNull();
  });
});

describe('SessionView and the Needs-you bar', () => {
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const stub = (cardTop: number, cardBottom: number) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-gate-wrap')) return rect(cardTop, cardBottom);
      if (this.getAttribute('role') === 'log') return rect(0, 400);
      return rect(0, 0);
    });
  };
  it('one waiting gate whose card is fully in view: no bar', () => {
    stub(100, 300);
    render(<SessionView source={source(snap({ gates: [gate('a', 'ls')] }))} size="l" typing />);
    expect(document.querySelector('[data-needs-bar]')).toBeNull();
  });
  it('one waiting gate whose card is cut off: the bar shows, outside the log, and Show brings the card into view and focuses it', () => {
    stub(380, 520);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<SessionView source={source(snap({ gates: [gate('a', 'git push')] }))} size="l" typing />);
    const bar = document.querySelector('[data-needs-bar]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(screen.getByRole('log').contains(bar)).toBe(false);
    fireEvent.click(within(bar).getByRole('button', { name: 'Show' }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement?.closest('[data-gate-wrap]')).toBeTruthy();
  });
  it('more than one waiting gate: the bar shows even when the first card is in view', () => {
    stub(10, 100);
    render(<SessionView source={source(snap({ gates: [gate('a', 'ls'), gate('b', 'pwd')] }))} size="l" typing />);
    const bar = document.querySelector('[data-needs-bar]') as HTMLElement;
    expect(within(bar).getByText('1 more')).toBeTruthy();
  });
  it('no waiting gate: no bar', () => {
    stub(0, 0);
    render(<SessionView source={source(snap())} size="l" />);
    expect(document.querySelector('[data-needs-bar]')).toBeNull();
  });
});

describe('JumpToNewest', () => {
  it('is a button that jumps', () => {
    const f = vi.fn();
    render(<JumpToNewest onPress={f} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to newest' }));
    expect(f).toHaveBeenCalled();
  });
});

describe('ConvHeader', () => {
  it('the meta line says where it runs (computer · realm, then the folder), with the agent and model', () => {
    render(<ConvHeader size="l" title="Fix the failing checkout tests" meta={META} detailsOpen={false} onDetails={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Fix the failing checkout tests' })).toBeTruthy();
    const meta = screen.getByRole('list', { name: 'Where this chat runs' });
    expect(within(meta).getAllByRole('listitem').map((x) => x.textContent)).toEqual(['atlas · Work', '~/projects/shop', 'General', 'Hoody Free']);
    expect(screen.getByText('Needs you')).toBeTruthy();
  });
  it('on a phone computer · realm still leads the meta line and there is a way back (the stylesheet leaves the folder to Details: conversation.layout.test.tsx)', () => {
    const back = vi.fn();
    render(<ConvHeader size="xs" title={null} meta={META} detailsOpen={false} onDetails={() => {}} onBack={back} />);
    expect(screen.getByRole('heading', { name: 'New chat' })).toBeTruthy();
    const items = within(screen.getByRole('list', { name: 'Where this chat runs' })).getAllByRole('listitem');
    expect(items[0]?.textContent).toBe('atlas · Work');
    expect(items[1]?.textContent).toBe('~/projects/shop');
    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }));
    expect(back).toHaveBeenCalled();
  });
  it('no way back at m and wider', () => {
    render(<ConvHeader size="m" title="x" meta={META} detailsOpen={false} onDetails={() => {}} onBack={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Back to chats' })).toBeNull();
  });
  it('Details is a toggle that says which way it goes', () => {
    const f = vi.fn();
    const { rerender } = render(<ConvHeader size="l" title="x" meta={META} detailsOpen={false} onDetails={f} />);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(f).toHaveBeenCalled();
    rerender(<ConvHeader size="l" title="x" meta={META} detailsOpen onDetails={f} />);
    expect(screen.getByRole('button', { name: 'Close details' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('DetailsPanel', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* none */ } });
  it('Activity: what waits, where it runs and the safety note', () => {
    render(<DetailsPanel snapshot={snap({ gates: [gate('a', 'git push')] })} onClose={() => {}} />);
    expect(screen.getByText('Kept waiting while the Hub is open.')).toBeTruthy();
    expect(screen.getByText('atlas')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
  });
  it('Edits: the design wording, and the files the edit tools changed', () => {
    render(<DetailsPanel snapshot={snap({ edits: [{ id: 'e1', path: 'src/cart.ts', verb: 'edited', meta: '+12 -3' }, { id: 'e2', path: 'src/new.ts', verb: 'created' }] })} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Edits' }));
    expect(screen.getByText("Edits made with the edit tools in this chat, read from the tools' own inputs. Commands and helpers may have changed other files: see the folder's Repository.")).toBeTruthy();
    expect(screen.getByText('src/cart.ts')).toBeTruthy();
    expect(screen.getByText('+12 -3')).toBeTruthy();
  });
  it('Session and Usage tabs exist only when their content is given', () => {
    const { rerender } = render(<DetailsPanel snapshot={snap()} onClose={() => {}} />);
    expect(screen.queryByRole('tab', { name: 'Session' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Usage' })).toBeNull();
    rerender(<DetailsPanel snapshot={snap()} onClose={() => {}} session={<p>Session body</p>} usage={<p>Usage body</p>} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(screen.getByText('Usage body')).toBeTruthy();
  });
  it('remembers the last tab on this device', () => {
    const { unmount } = render(<DetailsPanel snapshot={snap()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Edits' }));
    unmount();
    render(<DetailsPanel snapshot={snap()} onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Edits' }).getAttribute('aria-selected')).toBe('true');
  });
  it('keeps the tab under a registered Hub v3 key (purged and forgotten as the registry says)', () => {
    render(<DetailsPanel snapshot={snap()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Edits' }));
    expect(window.localStorage.getItem('hub.v3.ai.details.tab')).toBe('edits');
    expect(registryEntry('local', 'hub.v3.ai.details.tab')).not.toBeNull();
  });
  it('a remembered tab that is not drawn falls back to Activity', () => {
    window.localStorage.setItem('hub.v3.ai.details.tab', 'usage');
    render(<DetailsPanel snapshot={snap()} onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected')).toBe('true');
  });
  it('Close', () => {
    const f = vi.fn();
    render(<DetailsPanel snapshot={snap()} onClose={f} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close details' })); });
    expect(f).toHaveBeenCalled();
  });
});

describe('waiting is not pending or unknown', () => {
  const pending = (id: string, decision: 'sending' | 'unknown'): GateEntry => ({ ...gate(id, 'git push'), decision });
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('a retained unknown card is not named "Waiting for you" and gets no bar; the real gate behind it is the one counted and shown', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-gate-wrap')) return rect(380, 520);
      if (this.getAttribute('role') === 'log') return rect(0, 400);
      return rect(0, 0);
    });
    render(<SessionView source={source(snap({ gates: [pending('u', 'unknown'), gate('w', 'rm -rf build')] }))} size="l" typing />);
    const bar = document.querySelector('[data-needs-bar]') as HTMLElement;
    expect(within(bar).getByText('Allow rm -rf build?')).toBeTruthy();
    expect(within(bar).queryByText(/more/)).toBeNull();
    // The marked wrapper (what Show brings into view) is the waiting gate's, not the unknown one's.
    expect((document.querySelector('[data-gate-wrap]') as HTMLElement).textContent).toContain('rm -rf build');
  });
  it('only an unknown or sending card: no bar at all', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect(0, 0));
    render(<SessionView source={source(snap({ gates: [pending('u', 'unknown'), pending('s', 'sending')] }))} size="l" typing />);
    expect(document.querySelector('[data-needs-bar]')).toBeNull();
  });
  it('Details says an unknown decision may have gone through, and a sending one is on its way; neither is "waiting"', () => {
    render(<DetailsPanel snapshot={snap({ gates: [pending('u', 'unknown'), pending('s', 'sending')] })} onClose={() => {}} />);
    expect(screen.getByText(/A decision may have gone through: Allow git push\?/)).toBeTruthy();
    expect(screen.getByText('Sending your decision: Allow git push?')).toBeTruthy();
    expect(screen.queryByText(/Waiting for you/)).toBeNull();
    expect(screen.queryByText('Kept waiting while the Hub is open.')).toBeNull();
  });
});

describe('Activity states come from the facts', () => {
  const f = (o: Partial<CapFacts>): ConvSnapshot => snap({ facts: { ...facts, ...o } });
  it.each([
    ['running', { state: 'running', turn: true } as Partial<CapFacts>, 'The agent is working on this chat.'],
    ['queued work on an idle chat', { state: 'idle', turn: false, queued: true } as Partial<CapFacts>, 'The agent is working on this chat.'],
    ['loading', { state: 'loading', turn: false } as Partial<CapFacts>, 'Reading this chat…'],
    ['closed', { state: 'closed', turn: false } as Partial<CapFacts>, 'This chat is closed.'],
    ['unreachable', { reach: 'unreachable', turn: false } as Partial<CapFacts>, 'This chat cannot be reached now, so what is running is not known.'],
    ['idle', { state: 'idle', turn: false } as Partial<CapFacts>, 'Nothing is running or waiting.'],
  ])('%s', (_n, o, text) => {
    render(<DetailsPanel snapshot={f(o)} onClose={() => {}} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe('Session and Usage content', () => {
  it('null and false are no content: no empty tab', () => {
    render(<DetailsPanel snapshot={snap()} onClose={() => {}} session={null} usage={false} />);
    expect(screen.queryByRole('tab', { name: 'Session' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Usage' })).toBeNull();
  });
});
