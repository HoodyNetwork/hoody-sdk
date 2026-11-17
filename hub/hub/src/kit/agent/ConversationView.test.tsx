// Vitest: ConversationView fills the frame's slots from one source and owns two compositions: the phone Details sheet
// (a gate that ARRIVES closes it, by identity; one already waiting never does) and focus (a gate never takes focus from a
// field, Details included; opening and closing Details hand focus over).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { ConversationView } from './ConversationView';
import type { ActiveSource, ConvSnapshot, GateEntry } from './source';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const gate = (id: string, generation = 1, decision: GateEntry['decision'] = null): GateEntry => ({
  key: id, ref: { id, generation }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: `run ${id}` } }, helper: false, addressing: false, held: null, decision,
});
const base = (gates: GateEntry[]): ConvSnapshot => ({ facts, title: 'Fix it', blocks: [], gates, meta: { computer: 'atlas', realm: 'Work', status: 'running' } });
function live(first: ConvSnapshot) {
  let s = first;
  const subs = new Set<() => void>();
  const decide = vi.fn(async () => ({ k: 'done' as const }));
  const src: ActiveSource = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: (f) => { subs.add(f); return () => subs.delete(f); }, watch: () => {}, can: (a: Action) => can(a, facts),
    send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide, answer: async () => ({ k: 'done' }), check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
  };
  return { src, decide, set: (n: ConvSnapshot) => { act(() => { s = n; subs.forEach((f) => f()); }); } };
}
const width = (w: number) => vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(w);

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ConversationView', () => {
  it('fills the slots: pane, header with where it runs, transcript, composer', () => {
    width(1000);
    const { src } = live(base([]));
    render(<ConversationView source={src} pane={<p>the list</p>} detailsOpen={false} onDetails={() => {}} composer={<p>the composer</p>} />);
    expect(screen.getByText('the list')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fix it' })).toBeTruthy();
    expect(screen.getByText('atlas · Work')).toBeTruthy();
    expect(screen.getByText('the composer')).toBeTruthy();
  });
  it('the header Details button toggles', () => {
    width(1000);
    const f = vi.fn();
    const { src } = live(base([]));
    render(<ConversationView source={src} pane={null} detailsOpen={false} onDetails={f} />);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(f).toHaveBeenCalledWith(true);
  });
});

describe('the phone Details sheet and arriving gates', () => {
  it('below 840 a gate arriving closes an open sheet', () => {
    width(500);
    const f = vi.fn();
    const { src, set } = live(base([]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    expect(f).not.toHaveBeenCalled();
    set(base([gate('a')]));
    expect(f).toHaveBeenCalledWith(false);
  });
  it('a replacement with the same count is an arrival: [A] -> [B]', () => {
    width(500);
    const f = vi.fn();
    const { src, set } = live(base([gate('a')]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    expect(f).not.toHaveBeenCalled();
    set(base([gate('b')]));
    expect(f).toHaveBeenCalledWith(false);
  });
  it('a removal and an arrival together close it: [A, B] -> [C]', () => {
    width(500);
    const f = vi.fn();
    const { src, set } = live(base([gate('a'), gate('b')]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    set(base([gate('c')]));
    expect(f).toHaveBeenCalledWith(false);
  });
  it('a new generation of the same gate is an arrival', () => {
    width(500);
    const f = vi.fn();
    const { src, set } = live(base([gate('a', 1)]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    set(base([gate('a', 2)]));
    expect(f).toHaveBeenCalledWith(false);
  });
  it('a gate that stays, or one that goes, never closes the sheet; one already waiting when it was opened does not', () => {
    width(500);
    const f = vi.fn();
    const { src, set } = live(base([gate('a'), gate('b')]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    expect(f).not.toHaveBeenCalled();
    set(base([gate('a')]));
    set(base([gate('a')]));
    set(base([]));
    expect(f).not.toHaveBeenCalled();
  });
  it('a decision on its way is not an arrival, and a gate that is back to waiting is', () => {
    width(500);
    const f = vi.fn();
    const { src, set } = live(base([gate('a')]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    set(base([gate('a', 1, 'sending')]));
    expect(f).not.toHaveBeenCalled();
    set(base([gate('a', 1, null)]));
    expect(f).toHaveBeenCalledWith(false);
  });
  it('at 840 and wider an arriving gate leaves Details open (it sits beside the conversation)', () => {
    width(1000);
    const f = vi.fn();
    const { src, set } = live(base([]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={f} />);
    set(base([gate('a')]));
    expect(f).not.toHaveBeenCalled();
  });
});

describe('focus', () => {
  const Host = ({ src, open, setOpen, width: w = 1000 }: { src: ActiveSource; open: boolean; setOpen: (v: boolean) => void; width?: number }) => {
    void w;
    return <ConversationView source={src} pane={null} detailsOpen={open} onDetails={setOpen} session={<input aria-label="Session note" />} />;
  };
  it('a gate arriving while a Details field has focus does not take it, and Y types into the field instead of deciding', () => {
    width(1000);
    const { src, set, decide } = live(base([]));
    render(<Host src={src} open setOpen={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Session' }));
    const field = screen.getByLabelText('Session note');
    act(() => { field.focus(); });
    expect(document.activeElement).toBe(field);
    set(base([gate('a')]));
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: 'y' });
    expect(decide).not.toHaveBeenCalled();
  });
  // The window loses focus (another app, tab or window): the browser fires blur on the field but keeps it the active element
  // and focuses it again on return, so a gate arriving meanwhile must not take it (:2537). jsdom always reports focus, so the
  // away state is document.hasFocus() false, and the blur is fired without moving focus, as a browser does.
  const away = () => vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const back = async (h: { mockReturnValue: (v: boolean) => unknown }) => {
    h.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('focus')); await new Promise((r) => setTimeout(r, 0)); });
  };
  it('a gate arriving while the window is in the background leaves focus in the field, and Y on return decides nothing [:2537]', async () => {
    width(1000);
    const { src, set, decide } = live(base([]));
    render(<Host src={src} open setOpen={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Session' }));
    const field = screen.getByLabelText('Session note');
    act(() => { field.focus(); });
    const h = away();
    fireEvent.blur(field);
    set(base([gate('a')]));
    expect(document.activeElement).toBe(field);
    await back(h);
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: 'y' });
    expect(decide).not.toHaveBeenCalled();
  });
  it('with no field focused, a gate arriving while the window is away is focused as a card, where no key decides [:2537]', () => {
    width(1000);
    const { src, set } = live(base([]));
    render(<Host src={src} open setOpen={() => {}} />);
    away();
    set(base([gate('a')]));
    const on = document.activeElement as HTMLElement;
    expect(on.matches('[data-ask-gate]')).toBe(true);
  });
  it('the kept flag never sticks: back in the window with focus off the field, the next gate takes focus as usual [:2537]', async () => {
    width(1000);
    const { src, set } = live(base([]));
    render(<Host src={src} open setOpen={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Session' }));
    const field = screen.getByLabelText('Session note');
    act(() => { field.focus(); });
    const h = away();
    act(() => { field.blur(); }); // focus left the field while away (the field's tab closed, say): it is on the page now
    expect(document.activeElement).toBe(document.body);
    await back(h);
    set(base([gate('a')]));
    const on = document.activeElement as HTMLElement;
    expect(on.closest('[data-ask-gate]')).not.toBeNull();
    expect(on.matches('button, input, textarea, select, a[href]')).toBe(true);
  });
  // Any element that takes typed text protects the typing, not only inputs: contenteditable in every spelling the browser
  // takes (true, empty, plaintext-only, any case) and anything focused inside such a host.
  const editor = (attr: string | null, nested: boolean) => (
    <div {...(attr === null ? {} : { contentEditable: attr as never })} suppressContentEditableWarning role="textbox" aria-multiline="true" tabIndex={0} aria-label="Editor" data-testid="host">
      {nested ? <span tabIndex={-1} data-testid="inner">text</span> : 'text'}
    </div>
  );
  const withEditor = (attr: string | null, nested: boolean) => {
    width(1000);
    const { src, set, decide } = live(base([]));
    render(<ConversationView source={src} pane={null} detailsOpen onDetails={() => {}} session={editor(attr, nested)} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Session' }));
    const target = screen.getByTestId(nested ? 'inner' : 'host');
    act(() => { target.focus(); });
    expect(document.activeElement).toBe(target);
    set(base([gate('a')]));
    return { target, decide };
  };
  it.each([['true'], [''], ['plaintext-only'], ['PLAINTEXT-ONLY'], ['True']])('a focused contenteditable="%s" keeps focus when a gate arrives, and Y decides nothing', (attr) => {
    const { target, decide } = withEditor(attr, false);
    expect(document.activeElement).toBe(target);
    fireEvent.keyDown(document.activeElement as Element, { key: 'y' });
    expect(decide).not.toHaveBeenCalled();
  });
  it('focus on an element inside a plaintext-only host keeps focus too', () => {
    const { target, decide } = withEditor('plaintext-only', true);
    expect(document.activeElement).toBe(target);
    fireEvent.keyDown(document.activeElement as Element, { key: 'y' });
    expect(decide).not.toHaveBeenCalled();
  });
  it.each([[false], [true]])('where the engine does not report isContentEditable, the attribute decides (nested %s)', (nested) => {
    vi.spyOn(HTMLElement.prototype, 'isContentEditable', 'get').mockReturnValue(false);
    const { target, decide } = withEditor('plaintext-only', nested);
    expect(document.activeElement).toBe(target);
    fireEvent.keyDown(document.activeElement as Element, { key: 'y' });
    expect(decide).not.toHaveBeenCalled();
  });
  it('an element that is not editable (contenteditable="false") does not hold focus against a gate', () => {
    const { target } = withEditor('false', false);
    expect(document.activeElement).not.toBe(target);
    expect(document.activeElement?.closest('[data-ask-gate]')).toBeTruthy();
  });
  it('with no field focused, an arriving gate takes focus as before', () => {
    width(1000);
    const { src, set } = live(base([]));
    render(<Host src={src} open={false} setOpen={() => {}} />);
    set(base([gate('a')]));
    expect(document.activeElement?.closest('[data-ask-gate]')).toBeTruthy();
  });
  it('opening Details moves focus into it, closing it returns focus to the Details button', () => {
    width(1000);
    const { src } = live(base([]));
    function Stateful() { const [o, setO] = useState(false); return <Host src={src} open={o} setOpen={setO} />; }
    render(<Stateful />);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(document.activeElement?.getAttribute('role')).toBe('tab');
    fireEvent.click(within(document.querySelector('[data-details-panel]') as HTMLElement).getByRole('button', { name: 'Close details' }));
    expect(document.activeElement?.hasAttribute('data-details-toggle')).toBe(true);
  });
  it('a sheet that closes for an arriving gate puts focus on the card itself, where no key decides', () => {
    width(500);
    const { src, set, decide } = live(base([]));
    function Stateful() { const [o, setO] = useState(true); return <Host src={src} open={o} setOpen={setO} />; }
    render(<Stateful />);
    set(base([gate('a')]));
    const el = document.activeElement as HTMLElement;
    expect(el.hasAttribute('data-ask-gate')).toBe(true);
    fireEvent.keyDown(el, { key: 'y' });
    expect(decide).not.toHaveBeenCalled();
  });
});
