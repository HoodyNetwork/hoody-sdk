// Vitest: a conversation tile (a web tile of a conversation's canonical link) is drawn natively
// while its computer runs: the transcript on the seam's ACTIVE source, never an iframe of the Hub. Its computer is found by
// the reference's handle; Open in AI is the canonical link. The body owns its keys (keygate), is the tile's FrameHandle, and
// a gate arriving in a tile that is not the entered one never takes focus. Part 2: the tile acts: its gate cards decide (Y/N
// only inside the card), its dense composer sends and stops through the kit's per-chat record (the AI tab's), and Escape in
// the composer is the composer's until it is empty.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { resetAttemptsForTests, setAttempts } from '@kit/agent/convComposer';
import kitConv from '@kit/agent/Conversation.strings.en.json';
import { attemptTarget, attemptsOf, can, provideActiveConversations, type Action, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvRef, type ConvSnapshot, type GateEntry, type SendOutcome } from '@kit';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import { convTileUrl } from '../links';
import type { Tile as BoardTile } from '../model/boards';
import strings from '../strings.en.json';
import convStrings from './ConvTile.strings.en.json';
import svStrings from '@kit/agent/SessionView.strings.en.json';
import type { FrameHandle } from './Frame';
import { Tile, type TileProps } from './Tile';
import { infoFor, type InfoCtx, type TileInfo } from './tileInfo';

// The shell's keygate (shell/keygate.ts frameOwnsKeys, tested in keygate.frame.test.tsx) gives the keys to anything under
// data-hub-keys="frame"; a page test may not import the shell, so it checks that marker.
const ownsKeys = (el: Element) => el.closest('[data-hub-keys="frame"]') !== null;

const S = strings as Record<string, string>;
const C = convStrings as Record<string, string>;
const KS = kitConv as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
// links.ts reads conversation links on the Hub site (core hubSiteOrigin), never on the page's own origin (ctx.origin).
const site = vi.hoisted(() => ({ origin: 'https://hub.example' }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), hubSiteOrigin: () => site.origin }));
const ORIGIN = site.origin;
const ID = 'c0a7150000000000000000a1', ID2 = 'c0a7150000000000000000b2';
const REF: ConvRef = { computer: 'atlas.00a1', realm: 'global', sid: 's1' };
const REF2: ConvRef = { computer: 'atlas.00a1', realm: 'global', sid: 's2' };
const comp = (status: string, id = ID, name = 'atlas') => computerOf({ id, name, status, project_id: 'p1', server_name: 'n12' })!;
const ctx = (status: string, over: Partial<InfoCtx> = {}): InfoCtx => ({ computers: [comp(status)], failed: false, complete: true, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: ORIGIN, scheme: 'light', t, ...over });
const convTile = (r: ConvRef = REF): BoardTile => ({ url: convTileUrl(ORIGIN, r) });
const info = (status = 'running', over: Partial<InfoCtx> = {}, r: ConvRef = REF, slot = 's1'): TileInfo => infoFor(slot, convTile(r), ctx(status, over), { selected: 'global', rows: [] });

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const idle: CapFacts = { ...facts, state: 'idle', turn: false, gate: 'none' };
const gate = (id: string): GateEntry => ({ key: id, ref: { id, generation: 1 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: `run ${id}` } }, helper: false, addressing: false, held: null, decision: null });
const snapOf = (gates: GateEntry[], status: 'running' | 'needs' = gates.length ? 'needs' : 'running', f: CapFacts = facts, turnId?: string): ConvSnapshot => ({
  facts: f, ...(turnId ? { turnId, turnConfirmed: true } : {}), title: 'Fix it', gates, meta: { computer: 'atlas', realm: 'Global', status },
  blocks: [{ k: 'reply', key: 'r1', text: 'Working on the build', streaming: false, final: true, cost: null, at: null }],
});

/** A fake active provider: one source per reference, the opens and releases counted, every send, Stop and decision recorded
 *  with the reference it went to (each answered by the test). */
function fakeProvider() {
  const sources = new Map<string, { snap: ConvSnapshot; subs: Set<() => void>; src: ActiveSource }>();
  const opened: { account: string; ref: ConvRef; release: ReturnType<typeof vi.fn> }[] = [];
  const decide = vi.fn((..._a: unknown[]) => Promise.resolve<SendOutcome>({ k: 'done' }));
  const sends: { sid: string; d: unknown; answer: (o: SendOutcome) => void }[] = [];
  const stops: { sid: string; answer: (o: SendOutcome) => void }[] = [];
  const watches: { sid: string; w: unknown; rank: unknown }[] = [];
  const resend = vi.fn((..._a: unknown[]) => Promise.resolve<SendOutcome>({ k: 'done' }));
  const retry = vi.fn((..._a: unknown[]) => Promise.resolve<SendOutcome>({ k: 'done' }));
  const of = (r: ConvRef) => {
    const k = r.sid;
    let e = sources.get(k);
    if (!e) {
      const subs = new Set<() => void>();
      const box = { snap: snapOf([]), subs, src: null as unknown as ActiveSource };
      box.src = {
        kind: 'session', ref: r, snapshot: () => box.snap, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; }, watch: (w: unknown, rank: unknown) => { watches.push({ sid: k, w, rank }); },
        can: (a: Action) => can(a, box.snap.facts),
        decide: (g: unknown, d: unknown) => decide(k, g, d),
        send: (d: unknown) => new Promise<SendOutcome>((res) => sends.push({ sid: k, d, answer: res })),
        stop: () => new Promise<SendOutcome>((res) => stops.push({ sid: k, answer: res })),
        resend: (p: unknown) => resend(k, p),
        retry: (p: unknown) => retry(k, p),
        answer: () => Promise.resolve({ k: 'done' }), check: () => Promise.resolve({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
      } as unknown as ActiveSource;
      sources.set(k, box);
      e = box;
    }
    return e;
  };
  const p: ActiveConversationProvider = {
    open(account, ref) {
      const release = vi.fn();
      opened.push({ account, ref, release });
      return { source: of(ref).src, release };
    },
  };
  const set = (r: ConvRef, s: ConvSnapshot) => { act(() => { const e = of(r); e.snap = s; e.subs.forEach((f) => f()); }); };
  return { p, opened, set, decide, sends, stops, resend, retry, watches };
}

function props(i: TileInfo, over: Partial<TileProps> = {}): TileProps {
  return {
    info: i, domId: 'tile-' + i.slot, active: true, maximised: false, hidden: false, narrow: false, inside: false, reloadKey: 0, frameState: 'loading',
    frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined, onActivate: () => undefined,
    onReload: () => undefined, onFrameState: () => undefined, onRegister: () => undefined, onBack: () => undefined, onRetry: () => undefined,
    cardActions: <button type="button">Remove</button>, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null, ...over,
  };
}

let fp: ReturnType<typeof fakeProvider>;
beforeEach(() => {
  boot();
  fp = fakeProvider();
  resetAttemptsForTests();
  provideActiveConversations(fp.p);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); provideActiveConversations(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('a conversation tile: what it is', () => {
  it('names its reference and its computer by handle, has no frame address, and shares the canonical link', () => {
    const i = info();
    expect(i.conv).toEqual(REF);
    expect(i).toMatchObject({ state: 'live', url: null, shareUrl: convTileUrl(ORIGIN, REF), computerName: 'atlas', parentKeys: true });
    expect(i.computer?.id).toBe(ID);
  });

  it('a plain web tile is not a conversation; a link on another origin neither', () => {
    expect(infoFor('s1', { url: 'https://example.com/' }, ctx('running'), { selected: 'global', rows: [] }).conv).toBeUndefined();
    const other = infoFor('s1', { url: convTileUrl('https://other.example', REF) }, ctx('running'), { selected: 'global', rows: [] });
    expect(other.url).toBe(convTileUrl('https://other.example', REF));
    expect(other.conv).toBeUndefined();
  });

  it("reads conversations on the Hub site, never on the page's own origin (the one-file Hub's page is another one)", () => {
    for (const page of ['null', 'https://file.example']) {
      // A link on the Hub site is a conversation whatever the page's own origin (the frame parent) is.
      expect(infoFor('s1', convTile(), ctx('running', { origin: page }), { selected: 'global', rows: [] }).conv).toEqual(REF);
    }
    // A conversation's link on the page's own origin, when that is not the Hub site, is a web tile.
    const own = infoFor('s1', { url: convTileUrl('https://file.example', REF) }, ctx('running', { origin: 'https://file.example' }), { selected: 'global', rows: [] });
    expect(own.conv).toBeUndefined();
    expect(own.url).toBe(convTileUrl('https://file.example', REF));
  });

  it("takes its computer's state; a handle no row names is gone from a whole list, unknown from a partial or failed one", () => {
    expect(info('stopped').state).toBe('stopped');
    expect(info('running', { computers: [comp('running', ID2)] })).toMatchObject({ state: 'gone', computer: null });
    expect(info('running', { computers: [comp('running', ID2)], complete: false }).state).toBe('unknown');
    expect(info('running', { computers: [comp('running', ID2)], failed: true }).state).toBe('unknown');
    expect(info('running', { computers: null }).state).toBe('loading');
  });

  it('two rows with the same handle name none (never a guess)', () => {
    const twin = computerOf({ id: 'ffffffffffffffffffff00a1', name: 'atlas', status: 'running', project_id: 'p2', server_name: 'n1' })!;
    expect(info('running', { computers: [comp('running'), twin] }).computer).toBeNull();
  });
});

describe('a conversation tile: the native body', () => {
  it('draws the transcript and a composer on the active source for its own reference, never an iframe, never "reading only"', () => {
    const { container } = render(<Tile {...props(info())} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.getByText('Working on the build')).toBeInTheDocument();
    expect(screen.getByText(C['conv.running']!)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByText(/Reading only/)).toBeNull();
    // Text only in the tile: no add-files button (files are added in AI).
    expect(screen.queryByRole('button', { name: /attach|add file/i })).toBeNull();
    expect(fp.opened.map((o) => o.ref)).toEqual([REF]);
  });

  it('a stopped computer shows its card and reads nothing', () => {
    render(<Tile {...props(info('stopped'))} />);
    expect(screen.getByRole('heading', { name: t('tile.stoppedTitle', { computer: 'atlas' }) })).toBeInTheDocument();
    expect(screen.queryByRole('log')).toBeNull();
    expect(fp.opened).toHaveLength(0);
  });

  it("no source: a card that says it can't be read here, with Open in AI on the canonical link", () => {
    provideActiveConversations(null);
    render(<Tile {...props(info())} />);
    expect(screen.getByRole('heading', { name: t('tile.convUnavailableTitle') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('tile.openInAi') })).toHaveAttribute('href', convTileUrl(ORIGIN, REF));
  });

  // What the body showed when the hold was being made: open() runs in the effect, after the first render was committed.
  function atOpen() {
    const shown: { cantRead: boolean; loader: boolean }[] = [];
    const open = fp.p.open.bind(fp.p);
    provideActiveConversations({
      open: (a, r, at) => {
        shown.push({
          cantRead: screen.queryByRole('heading', { name: t('tile.convUnavailableTitle') }) !== null,
          loader: screen.queryByRole('status', { name: C['conv.opening'] }) !== null,
        });
        return open(a, r, at);
      },
    });
    return shown;
  }

  it("while its source opens (first mount), a loader and never the can't-be-read card", () => {
    const shown = atOpen();
    render(<Tile {...props(info())} />);
    expect(shown).toEqual([{ cantRead: false, loader: true }]);
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: C['conv.opening'] })).toBeNull();
  });

  it("shown again after hidden, it is opening again: a loader, never the can't-be-read card", () => {
    const shown = atOpen();
    const { rerender } = render(<Tile {...props(info())} />);
    rerender(<Tile {...props(info(), { hidden: true })} />);
    rerender(<Tile {...props(info(), { hidden: false })} />);
    expect(shown).toEqual([{ cantRead: false, loader: true }, { cantRead: false, loader: true }]);
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it("a provider that names no source: the can't-be-read card, and no loader left", () => {
    provideActiveConversations({ open: () => null });
    render(<Tile {...props(info())} />);
    expect(screen.getByRole('heading', { name: t('tile.convUnavailableTitle') })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: C['conv.opening'] })).toBeNull();
  });

  it('releases its hold when the tile goes', () => {
    const { unmount } = render(<Tile {...props(info())} />);
    expect(fp.opened[0]!.release).not.toHaveBeenCalled();
    unmount();
    expect(fp.opened[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('a hidden tile (another maximised) releases its hold, reads nothing, and holds again when shown', () => {
    const { rerender } = render(<Tile {...props(info())} />);
    expect(fp.opened).toHaveLength(1);
    rerender(<Tile {...props(info(), { hidden: true })} />);
    expect(fp.opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(fp.opened).toHaveLength(1);
    expect(screen.queryByRole('log')).toBeNull();
    rerender(<Tile {...props(info(), { hidden: false })} />);
    expect(fp.opened).toHaveLength(2);
    expect(fp.opened[1]!.release).not.toHaveBeenCalled();
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('is the tile FrameHandle: element() is the body, focus() puts focus on the transcript and leaves focus already inside', () => {
    const ref = createRef<FrameHandle>();
    render(<Tile {...props(info(), { frameRef: ref })} />);
    const el = ref.current!.element()!;
    expect(el.contains(screen.getByRole('log'))).toBe(true);
    act(() => { ref.current!.focus(); });
    expect(document.activeElement).toBe(screen.getByRole('log'));
    act(() => { el.focus(); });
    act(() => { ref.current!.focus(); });
    expect(document.activeElement).toBe(el);
  });
});

describe('a conversation tile: keyboard ownership', () => {
  it("anything typed in the body is the tile's: the Board's and the shell's keys stand aside, even before the tile is entered", () => {
    render(<Tile {...props(info(), { inside: false })} />);
    const log = screen.getByRole('log');
    expect(ownsKeys(log)).toBe(true);
    // The header stays the Board's (its keys move and enter tiles) while the tile is not entered.
    expect(ownsKeys(screen.getByRole('button', { name: S['tile.reload'] }))).toBe(false);
  });

  it('liveness (2c): the entered tile asks for its stream at rank focused, a tile in view at visible, each for its own chat', () => {
    const { rerender } = render(
      <>
        <Tile {...props(info('running', {}, REF, 's1'), { inside: true })} />
        <Tile {...props(info('running', {}, REF2, 's2'), { inside: false })} />
      </>,
    );
    const lastOf = (sid: string) => fp.watches.filter((x) => x.sid === sid).at(-1);
    expect(lastOf('s1')).toMatchObject({ w: 'stream', rank: 'focused' });
    expect(lastOf('s2')).toMatchObject({ w: 'stream', rank: 'visible' });
    // The person enters the other tile: the ranks follow.
    rerender(
      <>
        <Tile {...props(info('running', {}, REF, 's1'), { inside: false })} />
        <Tile {...props(info('running', {}, REF2, 's2'), { inside: true })} />
      </>,
    );
    expect(lastOf('s1')).toMatchObject({ w: 'stream', rank: 'visible' });
    expect(lastOf('s2')).toMatchObject({ w: 'stream', rank: 'focused' });
  });

  it('two passive tiles each get a gate at once: neither takes focus from where the person is', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    render(
      <>
        <Tile {...props(info('running', {}, REF, 's1'), { inside: false })} />
        <Tile {...props(info('running', {}, REF2, 's2'), { inside: false })} />
      </>,
    );
    fp.set(REF, snapOf([gate('g1')]));
    fp.set(REF2, snapOf([gate('g2')]));
    expect(document.activeElement).toBe(outside);
    // Each passive tile shows its own Needs you (the status pill; the gate card says it too).
    for (const id of ['tile-s1', 'tile-s2']) expect(within(document.getElementById(id)!).getAllByText(C['conv.needs']!).length).toBeGreaterThan(0);
    outside.remove();
  });

  it("Y typed in one tile's composer never decides, here or in another tile; Y in a gate's own card decides that gate only", () => {
    render(
      <>
        <Tile {...props(info('running', {}, REF, 's1'), { inside: true })} />
        <Tile {...props(info('running', {}, REF2, 's2'), { inside: false })} />
      </>,
    );
    fp.set(REF, snapOf([gate('g1')]));
    fp.set(REF2, snapOf([gate('g2')]));
    const first = document.getElementById('tile-s1')!;
    const box = within(first).getByRole('textbox');
    act(() => { box.focus(); });
    for (const key of ['y', 'Y', 'n']) fireEvent.keyDown(box, { key });
    fireEvent.keyDown(within(first).getByRole('log'), { key: 'y' });
    expect(fp.decide).not.toHaveBeenCalled();
    const second = document.getElementById('tile-s2')!;
    expect(within(second).getAllByText(C['conv.needs']!).length).toBeGreaterThan(0);
    // The second tile's own card: Y there decides g2, on s2, and nothing else.
    const card = second.querySelector<HTMLElement>('[data-gate-wrap]')!;
    fireEvent.keyDown(within(card).getAllByRole('button')[0]!, { key: 'y' });
    expect(fp.decide).toHaveBeenCalledTimes(1);
    expect(fp.decide.mock.calls[0]![0]).toBe('s2');
    expect(fp.decide.mock.calls[0]![1]).toMatchObject({ id: 'g2' });
  });

  it('arrows in the composer are the textarea\'s: under the tile\'s key owner, and not taken from the caret', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    const box = screen.getByRole('textbox');
    expect(ownsKeys(box)).toBe(true);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(fireEvent.keyDown(box, { key })).toBe(true);
  });

  it('Escape while typing stays in the tile: a selection collapses, then text keeps it; an empty composer hands focus to the transcript', () => {
    const onLeave = vi.fn();
    render(<Tile {...props(info(), { inside: true, onLeave })} />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox');
    act(() => { box.focus(); });
    fireEvent.change(box, { target: { value: 'half a thought' } });
    box.setSelectionRange(0, 4);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onLeave).not.toHaveBeenCalled();
    expect([box.selectionStart, box.selectionEnd]).toEqual([4, 4]);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onLeave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onLeave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('log'));
    // Not editing now: Escape leaves the tile.
    fireEvent.keyDown(screen.getByRole('log'), { key: 'Escape' });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("an IME composition's Escape is the IME's: the tile is not left and nothing else hears it (isComposing, or keyCode 229)", () => {
    const onLeave = vi.fn();
    render(<Tile {...props(info(), { inside: true, onLeave })} />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox');
    act(() => { box.focus(); });
    fireEvent.change(box, { target: { value: 'にほ' } });
    fireEvent.keyDown(box, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(box, { key: 'Escape', keyCode: 229 });
    expect(onLeave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box);
    expect(box).toHaveValue('にほ');
  });

  it('a gate arriving while the person writes in the entered tile does not take focus from the composer', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    const box = screen.getByRole('textbox');
    act(() => { box.focus(); });
    fireEvent.input(box, { target: { value: 'typing' } });
    fp.set(REF, snapOf([gate('g1')]));
    expect(document.activeElement).toBe(box);
  });

  it('a gate arriving while focus is in the EMPTY composer of the entered tile keeps focus there, so a typed y decides nothing', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    const box = screen.getByRole('textbox');
    act(() => { box.focus(); });
    expect(box).toHaveValue('');
    fp.set(REF, snapOf([gate('g1')]));
    expect(document.activeElement).toBe(box);
    // The person goes on typing "yes, and ...": the keys land in the composer, the gate is not answered.
    for (const key of ['y', 'Y', 'n']) fireEvent.keyDown(document.activeElement!, { key });
    expect(fp.decide).not.toHaveBeenCalled();
    expect(within(document.querySelector('[data-conv-tile]')!).getAllByText(C['conv.needs']!).length).toBeGreaterThan(0);
  });

  // The window loses focus: the composer gets a blur but stays the active element and is focused again on return (:2537).
  // jsdom always reports focus, so away is document.hasFocus() false and the blur moves nothing, as in a browser.
  const away = () => vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const back = async (h: { mockReturnValue: (v: boolean) => unknown }) => {
    h.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('focus')); await new Promise((r) => setTimeout(r, 0)); });
  };
  it('a gate arriving while the window is in the background leaves focus in the composer, and y on return decides nothing [:2537]', async () => {
    render(<Tile {...props(info(), { inside: true })} />);
    const box = screen.getByRole('textbox');
    act(() => { box.focus(); });
    fireEvent.input(box, { target: { value: 'typing' } });
    const h = away();
    fireEvent.blur(box);
    fp.set(REF, snapOf([gate('g1')]));
    expect(document.activeElement).toBe(box);
    await back(h);
    expect(document.activeElement).toBe(box);
    for (const key of ['y', 'Y']) fireEvent.keyDown(document.activeElement!, { key });
    expect(fp.decide).not.toHaveBeenCalled();
  });

  it('the kept flag never sticks: back in the window with focus off the composer, the next gate takes focus in the tile [:2537]', async () => {
    render(<Tile {...props(info(), { inside: true })} />);
    const box = screen.getByRole('textbox');
    act(() => { box.focus(); });
    fireEvent.input(box, { target: { value: 'typing' } });
    const h = away();
    act(() => { box.blur(); }); // focus left the composer while away: it is on the page now
    await back(h);
    fp.set(REF, snapOf([gate('g1')]));
    const on = document.activeElement as HTMLElement;
    expect(on.closest('[data-gate-wrap]')).not.toBeNull();
  });

  it('focus in a gate card field (a reason) is typing too: a second gate arriving leaves focus in that field', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, snapOf([gate('g1')]));
    const body = document.querySelector<HTMLElement>('[data-conv-tile]')!;
    // A text field inside the tile that is not the composer (as a gate's reason field would be).
    const field = document.createElement('input');
    body.querySelector('[data-gate-wrap]')!.appendChild(field);
    act(() => { field.focus(); });
    fp.set(REF, snapOf([gate('g1'), gate('g2')]));
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('a gate arriving in the entered tile may take focus, and it stays inside that tile', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, snapOf([gate('g1')]));
    const body = document.querySelector('[data-conv-tile]')!;
    expect(body.contains(document.activeElement)).toBe(true);
  });
});

describe('a conversation tile: row actions', () => {
  const sv = (k: string) => (svStrings as Record<string, string>)[k]!;
  const userRow = (actions: ('resend' | 'retry' | 'takeBack')[]): ConvSnapshot => ({
    ...snapOf([], 'running', idle),
    blocks: [{ k: 'user', key: 'u1', text: 'build it', at: 1, req: { key: 'kt-1', kind: 'turn' }, actions }],
  });

  it('Send again and Retry are deliberate presses on this chat only, each the source\'s own, once; Edit is never offered', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, userRow(['resend', 'retry', 'takeBack']));
    const body = within(document.querySelector<HTMLElement>('[data-conv-tile]')!);
    expect(body.queryByRole('button', { name: sv('sv.edit') })).toBeNull();
    // Shown, nothing pressed: nothing goes.
    expect(fp.resend).not.toHaveBeenCalled();
    expect(fp.retry).not.toHaveBeenCalled();
    fireEvent.click(body.getByRole('button', { name: sv('sv.resend') }));
    expect(fp.resend).toHaveBeenCalledTimes(1);
    expect(fp.resend.mock.calls[0]).toEqual(['s1', { key: 'kt-1', kind: 'turn' }]);
    fireEvent.click(body.getByRole('button', { name: sv('sv.retry') }));
    expect(fp.retry).toHaveBeenCalledTimes(1);
    expect(fp.retry.mock.calls[0]).toEqual(['s1', { key: 'kt-1', kind: 'turn' }]);
    expect(fp.sends).toHaveLength(0);
    expect(fp.decide).not.toHaveBeenCalled();
  });

  it('a turn in the way (the source\'s own capability): the buttons are disabled and a press sends nothing', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, { ...userRow(['resend', 'retry']), facts });
    const body = within(document.querySelector<HTMLElement>('[data-conv-tile]')!);
    for (const k of ['sv.resend', 'sv.retry']) {
      const b = body.getByRole('button', { name: sv(k) });
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    expect(fp.resend).not.toHaveBeenCalled();
    expect(fp.retry).not.toHaveBeenCalled();
  });
});

describe('a conversation tile: the composer', () => {
  const text = (k: string) => C[k]!;
  const fileDrag = () => ({ files: [new File(['x'], 'a.png', { type: 'image/png' })], types: ['Files'], dropEffect: 'none' });

  it("a file dropped on the body is refused whatever it shows: the can't-be-read card, a live source, and after the source goes", () => {
    // No source: the provider answers none.
    provideActiveConversations({ open: () => null });
    const { container, rerender } = render(<Tile {...props(info())} />);
    // Answered no source: the can't-be-read card.
    expect(screen.getByRole('heading', { name: t('tile.convUnavailableTitle') })).toBeInTheDocument();
    const body = () => container.querySelector<HTMLElement>('[data-conv-tile]')!;
    const d1 = fileDrag();
    expect(fireEvent.dragOver(body(), { dataTransfer: d1 })).toBe(false);
    expect(d1.dropEffect).toBe('none');
    expect(fireEvent.drop(body(), { dataTransfer: fileDrag() })).toBe(false);
    // A live source, then the provider removed (the source goes): still refused.
    act(() => { provideActiveConversations(fp.p); });
    expect(screen.getByRole('log')).toBeInTheDocument();
    act(() => { provideActiveConversations(null); });
    rerender(<Tile {...props(info())} />);
    expect(fireEvent.drop(body(), { dataTransfer: fileDrag() })).toBe(false);
    // Hidden (another tile maximised): the body draws nothing, and holds no guard of its own.
    rerender(<Tile {...props(info(), { hidden: true })} />);
    expect(fireEvent.drop(document.body, { dataTransfer: fileDrag() })).toBe(true);
  });

  it('takes text only: no add button, no file input; a dropped file is refused (never opened by the browser), a pasted one not taken', () => {
    const { container } = render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, snapOf([], 'running', idle));
    const body = container.querySelector<HTMLElement>('[data-conv-tile]')!;
    expect(within(body).queryByRole('button', { name: KS['agent.attach']! })).toBeNull();
    expect(body.querySelector('input[type="file"]')).toBeNull();
    const box = within(body).getByRole('textbox');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const files = { files: [file], types: ['Files'], dropEffect: 'none' };
    // A file dragged or dropped is refused: prevented (so the browser never opens it in place of the Hub) with no drop effect,
    // and nothing takes it (no attachment, nothing sent with it).
    const over = { ...files };
    expect(fireEvent.dragOver(box, { dataTransfer: over })).toBe(false);
    expect(over.dropEffect).toBe('none');
    expect(fireEvent.drop(box, { dataTransfer: files })).toBe(false);
    expect(within(body).queryByRole('list', { name: KS['agent.attList']! })).toBeNull();
    // A paste of files is not claimed (the composer would cancel a paste it takes); nothing is attached.
    expect(fireEvent.paste(box, { clipboardData: { files: [file], types: ['Files'], getData: () => '' } })).toBe(true);
    expect(within(body).queryByRole('list', { name: KS['agent.attList']! })).toBeNull();
    fireEvent.change(box, { target: { value: 'just text' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(fp.sends).toHaveLength(1);
    expect(fp.sends[0]!.d).toEqual({ text: 'just text' });
  });

  it('sends the typed text to its own chat, once; done clears the box', async () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, snapOf([], 'running', idle));
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'ship it' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(fp.sends).toHaveLength(1);
    expect(fp.sends[0]).toMatchObject({ sid: 's1', d: { text: 'ship it' } });
    await act(async () => { fp.sends[0]!.answer({ k: 'done' }); await Promise.resolve(); });
    expect(box).toHaveValue('');
  });

  it("an unknown send holds Send in the tile and in the AI tab's record alike, until Stop tracking", async () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, snapOf([], 'running', idle));
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'maybe' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await act(async () => { fp.sends[0]!.answer({ k: 'unknown' }); await Promise.resolve(); });
    expect(screen.getByText(text('conv.send.unknown'))).toBeInTheDocument();
    // The record is the AI tab's (attemptTarget): the same chat there reads the same hold.
    expect(attemptsOf(attemptTarget(fp.opened[0]!.account, REF.computer, REF.realm, REF.sid)).send).toEqual({ k: 'unknown' });
    fireEvent.change(box, { target: { value: 'maybe' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(fp.sends).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: text('conv.send.dismiss') }));
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(fp.sends).toHaveLength(2);
  });

  it('shows Stop from the shared capability state while a turn runs; one Stop per turn, held across tiles of the chat', async () => {
    render(
      <>
        <Tile {...props(info('running', {}, REF, 's1'), { inside: true })} />
        <Tile {...props(info('running', {}, REF, 's9'), { inside: false })} />
      </>,
    );
    fp.set(REF, snapOf([], 'running', facts, 't1'));
    const stops = screen.getAllByRole('button', { name: 'Stop' });
    expect(stops).toHaveLength(2);
    fireEvent.click(stops[0]!);
    fireEvent.click(stops[1]!);
    expect(fp.stops).toHaveLength(1);
    fp.set(REF, snapOf([], 'running', idle));
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('a Stop without an answer is said once: while the transcript says it (a stop line) the composer adds no note', async () => {
    render(<Tile {...props(info(), { inside: true })} />);
    const running = snapOf([], 'running', facts, 't1');
    fp.set(REF, running);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await act(async () => { fp.stops[0]!.answer({ k: 'unknown' }); await Promise.resolve(); });
    expect(screen.getByText(text('conv.stop.unknown'))).toBeInTheDocument();
    const line = 'Stop may have gone through. The task still showed as running when it was last read.';
    fp.set(REF, { ...running, blocks: [...running.blocks, { k: 'line', key: 's0', text: line, tone: 'info', recheck: true, stop: true }] });
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByText(text('conv.stop.unknown'))).toBeNull();
    // The line gone while the Stop is still unresolved: the note is the one message again.
    fp.set(REF, running);
    expect(screen.getByText(text('conv.stop.unknown'))).toBeInTheDocument();
  });

  it('no Stop while nothing runs; a waiting gate makes Send a follow-up, quiet', () => {
    render(<Tile {...props(info(), { inside: true })} />);
    fp.set(REF, snapOf([], 'running', idle));
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    act(() => setAttempts(attemptTarget(fp.opened[0]!.account, REF.computer, REF.realm, REF.sid), (x) => ({ ...x, draft: 'and then' })));
    fp.set(REF, snapOf([gate('g1')], 'needs', { ...facts, turn: false }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(fp.sends).toHaveLength(1);
  });
});
