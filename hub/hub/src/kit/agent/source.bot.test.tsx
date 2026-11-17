// The Bot's conversation source (kit/agent/source.bot.ts). Read-only (no send, isActive false, every write
// refused), never a gate (the Bots page's pinned card is the one card), the live reply only from the session the Bot view names
// NOW (a reset that names another session shows nothing of the old one, not even for one render), and the session stream held
// at rank 'bot', the lowest: under pressure it is the first one closed.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RANKS, type Rank } from '../../core/stream-budget';
import { boot } from '../../core/test/env';
import { provideConversations, type ConversationProvider, type ShownComputer } from './conversations';
import { streamingText, tailOf, useBotSource, type BotFeed, type BotHome, type BotSource } from './source.bot';
import { isActive, type ConversationSource, type ConvBlock, type ConvRef, type ConvSnapshot, type GateEntry, type WatchRank } from './source';

// WatchRank passes straight to the budget's Rank (ask/registry.ts): a rank the budget does not know must not compile.
type Fits<A, B> = [A] extends [B] ? true : false;
const watchRankFits: Fits<WatchRank, Rank> = true;

const AT: ShownComputer = { project: 'p1', id: 'c0a7150000000000000000a1', name: 'atlas' };
const HOME: BotHome = { computer: 'atlas.00a1', realm: 'global', at: AT };

const reply = (text: string, streaming = true): ConvBlock => ({ k: 'reply', key: `r-${text}`, text, streaming, final: !streaming, cost: null, at: null });
const gate = { key: 'g', ref: { id: 'g1', generation: 1 }, gate: { kind: 'question' }, helper: false, addressing: false, held: null, decision: null } as unknown as GateEntry;

interface Fake { ref: ConvRef; source: ConversationSource; release: ReturnType<typeof vi.fn>; watch: ReturnType<typeof vi.fn>; set(blocks: ConvBlock[], gates?: GateEntry[]): void }
function fakeProvider() {
  const opened: Fake[] = [];
  const p: ConversationProvider = {
    open(_account, ref) {
      let snap = { facts: {}, title: null, blocks: [], gates: [] } as unknown as ConvSnapshot;
      const subs = new Set<() => void>();
      const watch = vi.fn();
      const source = {
        kind: 'session',
        ref,
        snapshot: () => snap,
        subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
        watch,
        can: () => ({ ok: false, reason: 'read_only' }),
      } as unknown as ConversationSource;
      const release = vi.fn();
      const f: Fake = {
        ref, source, release, watch,
        set(blocks, gates = []) { snap = { ...snap, blocks, gates }; for (const s of [...subs]) s(); },
      };
      opened.push(f);
      return { source, release };
    },
  };
  return { p, opened };
}

let seen: BotSource<string>[] = [];
function Probe({ feed, home = HOME }: { feed: BotFeed<string>; home?: BotHome | null }) {
  seen.push(useBotSource('chief', feed, home));
  return null;
}
const feed = (sid: string | null, page = 'page-1', turnId: string | null = null, mark = -1, onReplyEnd?: () => void): BotFeed<string> => ({ page, sid, turnId, mark, ...(onReplyEnd ? { onReplyEnd } : {}) });

beforeEach(() => { boot(); seen = []; });
afterEach(() => { cleanup(); provideConversations(null); });

describe('the live reply', () => {
  it('is the last block only while it is a reply still streaming', () => {
    const snap = (blocks: ConvBlock[]) => ({ blocks }) as unknown as ConvSnapshot;
    expect(streamingText(snap([reply('so far')]))).toBe('so far');
    expect(streamingText(snap([reply('done', false)]))).toBeNull();
    expect(streamingText(snap([reply('so far'), { k: 'line', key: 'l', text: 'x', tone: 'muted' }]))).toBeNull();
    expect(streamingText(snap([reply('')]))).toBeNull();
    expect(streamingText(null)).toBeNull();
  });
  it('comes only from a source on the session the Bot names now', () => {
    const src = { ref: { computer: 'atlas.00a1', realm: 'global', sid: 'old' } } as unknown as ConversationSource;
    const snap = { blocks: [reply('old text')] } as unknown as ConvSnapshot;
    expect(tailOf('new', src, snap)).toBeNull();
    expect(tailOf('old', src, snap)).toEqual({ sid: 'old', key: 'r-old text', text: 'old text', done: false });
    expect(tailOf(null, src, snap)).toBeNull();
    expect(tailOf('old', null, snap)).toBeNull();
  });
});

describe('useBotSource', () => {
  it('holds the session the view names, at rank bot (the first stream closed under pressure), and shows its reply as it streams', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const ends = vi.fn();
    const r = render(<Probe feed={feed('s1', 'page-1', null, 4, ends)} />);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.ref).toEqual({ computer: 'atlas.00a1', realm: 'global', sid: 's1' });
    expect(opened[0]!.watch).toHaveBeenCalledWith('stream', 'bot');
    // 'bot' is the budget's last rank: every other stream outranks it, so it is the one cut first.
    expect(RANKS.at(-1)).toBe('bot');
    expect(RANKS.indexOf('bot')).toBeGreaterThan(RANKS.indexOf('visible'));
    expect(seen.at(-1)!.tail()).toBeNull();
    act(() => opened[0]!.set([{ ...reply('Checking the orders'), key: 'r1' }]));
    expect(seen.at(-1)!.tail()).toEqual({ sid: 's1', key: 'r1', text: 'Checking the orders', done: false });
    // It ends: the finished text stays (no blink) and the host is asked to read its log now, once.
    act(() => opened[0]!.set([{ ...reply('Checking the orders. Done.', false), key: 'r1' }]));
    expect(seen.at(-1)!.tail()).toEqual({ sid: 's1', key: 'r1', text: 'Checking the orders. Done.', done: true });
    expect(ends).toHaveBeenCalledTimes(1);
    r.rerender(<Probe feed={feed('s1', 'page-1', null, 4, ends)} />);
    expect(seen.at(-1)!.tail()?.done).toBe(true);
    // Its row arrives (the log's newest reply row moves past the one it started at): it leaves in that same render.
    seen = [];
    r.rerender(<Probe feed={feed('s1', 'page-2', null, 5, ends)} />);
    expect(seen.every((s) => s.tail() === null)).toBe(true);
    expect(ends).toHaveBeenCalledTimes(1);
  });

  it('a reply already finished when the source opened is never drawn (the log has it); only a reply seen streaming is kept', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const ends = vi.fn();
    render(<Probe feed={feed('s1', 'page-1', null, 4, ends)} />);
    act(() => opened[0]!.set([reply('Old answer', false)]));
    expect(seen.at(-1)!.tail()).toBeNull();
    expect(ends).not.toHaveBeenCalled();
  });

  it('a reset (the view names another session) lets the old one go and shows none of its text, not even for one render', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<Probe feed={feed('s1')} />);
    act(() => opened[0]!.set([reply('old session text')]));
    expect(seen.at(-1)!.tail()?.text).toBe('old session text');
    seen = [];
    r.rerender(<Probe feed={feed('s2')} />);
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(opened.at(-1)!.ref.sid).toBe('s2');
    expect(seen.map((s) => s.tail())).not.toContainEqual(expect.objectContaining({ sid: 's1' }));
    // The old source still writing changes nothing here.
    act(() => opened[0]!.set([reply('old session text, more')]));
    expect(seen.at(-1)!.tail()).toBeNull();
    act(() => opened.at(-1)!.set([reply('new session text')]));
    expect(seen.at(-1)!.tail()).toMatchObject({ sid: 's2', text: 'new session text', done: false });
  });

  it('no session named, the computer not known, or off the tab: nothing is held and no text shows', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<Probe feed={feed(null)} />);
    r.rerender(<Probe feed={feed('s1')} home={null} />);
    expect(opened).toHaveLength(0);
    expect(seen.at(-1)!.tail()).toBeNull();
  });

  it('its row arriving first hides the reply even while the session still reads streaming (a closed or reconnecting stream)', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<Probe feed={feed('s1', 'page-1', null, 4)} />);
    act(() => opened[0]!.set([{ ...reply('Checking the orders'), key: 'r1' }]));
    expect(seen.at(-1)!.tail()?.text).toBe('Checking the orders');
    seen = [];
    r.rerender(<Probe feed={feed('s1', 'page-2', null, 5)} />);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.tail() === null)).toBe(true);
    // A later reply of the same session still shows: it starts at the mark the log has then.
    act(() => opened[0]!.set([{ ...reply('Next answer'), key: 'r2' }]));
    expect(seen.at(-1)!.tail()).toMatchObject({ key: 'r2', text: 'Next answer' });
  });

  it('a kept reply belongs to its source: leaving the tab, the computer turning unknown, or another session discards it for good', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<Probe feed={feed('s1', 'page-1', null, 4)} />);
    act(() => opened[0]!.set([{ ...reply('Kept text'), key: 'r1' }]));
    act(() => opened[0]!.set([{ ...reply('Kept text, done', false), key: 'r1' }]));
    expect(seen.at(-1)!.tail()).toMatchObject({ text: 'Kept text, done', done: true });
    // Off the tab, then back, before the new hold says anything: nothing of the old reply.
    r.rerender(<Probe feed={feed(null, 'page-1', null, 4)} />);
    seen = [];
    r.rerender(<Probe feed={feed('s1', 'page-1', null, 4)} />);
    expect(seen.every((s) => s.tail() === null)).toBe(true);
    // The computer turning unknown: no hold, and no text either.
    act(() => opened.at(-1)!.set([{ ...reply('Second'), key: 'r2' }]));
    expect(seen.at(-1)!.tail()?.text).toBe('Second');
    seen = [];
    r.rerender(<Probe feed={feed('s1', 'page-1', null, 4)} home={null} />);
    r.rerender(<Probe feed={feed('s1', 'page-1', null, 4)} home={null} />);
    expect(seen.every((s) => s.tail() === null)).toBe(true);
    // s1 -> s2 -> s1: the first session's text does not come back.
    r.rerender(<Probe feed={feed('s1', 'page-1', null, 4)} />);
    act(() => opened.at(-1)!.set([{ ...reply('Third'), key: 'r3' }]));
    r.rerender(<Probe feed={feed('s2', 'page-1', null, 4)} />);
    seen = [];
    r.rerender(<Probe feed={feed('s1', 'page-1', null, 4)} />);
    expect(seen.every((s) => s.tail() === null)).toBe(true);
  });

  it('is read-only: no send, every write refused, never a gate (the page pins the one card); the page is handed back unchanged', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    render(<Probe feed={feed('s1', 'the-log-page', 't-9')} />);
    act(() => opened[0]!.set([reply('x')], [gate]));
    const s = seen.at(-1)!;
    expect(isActive(s)).toBe(false);
    expect(s.kind).toBe('bot');
    expect(s.ref).toEqual({ bot: 'chief' });
    expect(s.snapshot().gates).toEqual([]);
    expect(s.snapshot().turnId).toBe('t-9');
    for (const a of ['send', 'decide', 'answer', 'stopTurn', 'check'] as const) expect(s.can(a).ok).toBe(false);
    expect(s.page()).toBe('the-log-page');
    expect(watchRankFits).toBe(true);
  });
});
