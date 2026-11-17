// The page's way to a conversation (kit/agent/conversations.ts). Null without a provider or an account; one
// hold per mount, released on unmount and on any change of reference, shown computer or provider; a hold for an earlier
// reference is never shown for a new one; a provider that throws opens nothing.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump } from '../../core/ctx';
import { boot, UID } from '../../core/test/env';
import { provideConversations, useConversation, useConversationHold, useConversationList, type ConversationProvider, type ConvListRow, type ShownComputer } from './conversations';
import type { ConversationSource, ConvRef } from './source';

const AT: ShownComputer = { project: 'p1', id: 'c0a7150000000000000000a1', name: 'atlas' };
const REF: ConvRef = { computer: 'atlas.00a1', realm: 'global', sid: 's1' };

function fakeProvider() {
  const opened: { account: string; ref: ConvRef; at: ShownComputer | null; release: ReturnType<typeof vi.fn>; source: ConversationSource }[] = [];
  const p: ConversationProvider = {
    open(account, ref, at) {
      const source = { kind: 'session', ref } as unknown as ConversationSource;
      const release = vi.fn();
      opened.push({ account, ref, at, release, source });
      return { source, release };
    },
  };
  return { p, opened };
}

let seen: (ConversationSource | null)[] = [];
function Probe({ r, at }: { r: ConvRef | null; at: ShownComputer | null }) {
  seen.push(useConversation(r, at));
  return null;
}

beforeEach(() => { boot(); seen = []; });
afterEach(() => { cleanup(); provideConversations(null); });

describe('useConversation', () => {
  it('no provider: null, and nothing is opened', () => {
    render(<Probe r={REF} at={AT} />);
    expect(seen.at(-1)).toBeNull();
  });

  it('opens once for the shown account with the reference and the shown computer; unmount releases it', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<Probe r={REF} at={AT} />);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ account: UID, ref: REF, at: AT });
    expect(seen.at(-1)).toBe(opened[0]!.source);
    r.rerender(<Probe r={{ ...REF }} at={{ ...AT }} />);
    expect(opened).toHaveLength(1);
    r.unmount();
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('a new reference releases the old hold first and never shows the old source for it', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<Probe r={REF} at={AT} />);
    seen = [];
    r.rerender(<Probe r={{ ...REF, sid: 's2' }} at={AT} />);
    expect(opened).toHaveLength(2);
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(opened[1]!.ref.sid).toBe('s2');
    expect(seen).not.toContain(opened[0]!.source);
    expect(seen.at(-1)).toBe(opened[1]!.source);
  });

  it('another shown computer opens again; so does a new provider; removing it reads null', () => {
    const a = fakeProvider();
    provideConversations(a.p);
    const r = render(<Probe r={REF} at={AT} />);
    r.rerender(<Probe r={REF} at={{ ...AT, id: 'other' }} />);
    expect(a.opened).toHaveLength(2);
    expect(a.opened[0]!.release).toHaveBeenCalledTimes(1);
    const b = fakeProvider();
    act(() => provideConversations(b.p));
    expect(a.opened[1]!.release).toHaveBeenCalledTimes(1);
    expect(b.opened).toHaveLength(1);
    act(() => provideConversations(null));
    expect(b.opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBeNull();
  });

  it('a provider swap or removal never shows the previous provider\'s source, not even for one render', () => {
    const a = fakeProvider();
    provideConversations(a.p);
    render(<Probe r={REF} at={AT} />);
    expect(seen.at(-1)).toBe(a.opened[0]!.source);
    const b = fakeProvider();
    seen = [];
    act(() => provideConversations(b.p));
    expect(seen).not.toContain(a.opened[0]!.source);
    expect(seen.at(-1)).toBe(b.opened[0]!.source);
    seen = [];
    act(() => provideConversations(null));
    expect(seen).not.toContain(b.opened[0]!.source);
    expect(seen.at(-1)).toBeNull();
  });

  it('a new core generation (realm switch, same URL) releases the hold, never shows it again, and opens the same reference anew', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    render(<Probe r={REF} at={AT} />);
    seen = [];
    act(() => { bump('switch'); });
    expect(opened).toHaveLength(2);
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(opened[1]!.ref).toEqual(REF);
    expect(seen).not.toContain(opened[0]!.source);
    expect(seen.at(-1)).toBe(opened[1]!.source);
  });

  it('no reference, a provider that names nothing, or one that throws: null', () => {
    provideConversations({ open: () => null });
    const r = render(<Probe r={REF} at={AT} />);
    expect(seen.at(-1)).toBeNull();
    act(() => provideConversations({ open: () => { throw new Error('boom'); } }));
    expect(seen.at(-1)).toBeNull();
    const { p, opened } = fakeProvider();
    act(() => provideConversations(p));
    r.rerender(<Probe r={null} at={AT} />);
    expect(seen.at(-1)).toBeNull();
    expect(opened.filter((o) => !o.release.mock.calls.length)).toHaveLength(0);
  });
});

let holds: { source: ConversationSource | null; opening: boolean }[] = [];
function HoldProbe({ r, at }: { r: ConvRef | null; at: ShownComputer | null }) {
  holds.push(useConversationHold(r, at));
  return null;
}

describe('useConversationHold', () => {
  beforeEach(() => { holds = []; });

  it('opening for the render before the hold is made, then the source; never both', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    render(<HoldProbe r={REF} at={AT} />);
    expect(holds[0]).toEqual({ source: null, opening: true });
    expect(holds.at(-1)).toEqual({ source: opened[0]!.source, opening: false });
    expect(holds.some((h) => h.opening && h.source)).toBe(false);
  });

  it('a new identity (reference, generation) is opening again until its own hold is made, never the old source', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    const r = render(<HoldProbe r={REF} at={AT} />);
    holds = [];
    r.rerender(<HoldProbe r={{ ...REF, sid: 's2' }} at={AT} />);
    expect(holds[0]).toEqual({ source: null, opening: true });
    expect(holds.at(-1)).toEqual({ source: opened[1]!.source, opening: false });
    holds = [];
    act(() => { bump('switch'); });
    expect(holds.every((h) => h.source !== opened[1]!.source)).toBe(true);
    expect(holds.at(-1)).toEqual({ source: opened[2]!.source, opening: false });
  });

  it('a provider and a reference but no account: never opening, and nothing is opened', () => {
    boot({ signedIn: false });
    const { p, opened } = fakeProvider();
    provideConversations(p);
    render(<HoldProbe r={REF} at={AT} />);
    expect(holds.every((h) => !h.opening && h.source === null)).toBe(true);
    expect(opened).toHaveLength(0);
  });

  it('a provider and an account but no reference: never opening, and nothing is opened', () => {
    const { p, opened } = fakeProvider();
    provideConversations(p);
    render(<HoldProbe r={null} at={AT} />);
    expect(holds.every((h) => !h.opening && h.source === null)).toBe(true);
    expect(opened).toHaveLength(0);
  });

  it('a provider that names nothing or throws ends opening with no source; no provider or no reference is never opening', () => {
    provideConversations({ open: () => null });
    const r = render(<HoldProbe r={REF} at={AT} />);
    expect(holds.at(-1)).toEqual({ source: null, opening: false });
    act(() => provideConversations({ open: () => { throw new Error('boom'); } }));
    expect(holds.at(-1)).toEqual({ source: null, opening: false });
    act(() => provideConversations(null));
    expect(holds.at(-1)).toEqual({ source: null, opening: false });
    r.rerender(<HoldProbe r={null} at={AT} />);
    expect(holds.at(-1)).toEqual({ source: null, opening: false });
  });
});

// UseConversationList reads the provider's `list` once per identity; an answer belongs to the read that asked.
describe('useConversationList', () => {
  function ListProbe({ at, realm, out }: { at: ShownComputer | null; realm: string | null; out: Array<ReturnType<typeof useConversationList>> }) {
    out.push(useConversationList(at, realm));
    return null;
  }
  function lister() {
    const asks: Array<{ at: ShownComputer; realm: string; ok: (r: readonly ConvListRow[]) => void; no: (e: unknown) => void }> = [];
    const p: ConversationProvider = { open: () => null, list: (_a, at, realm) => new Promise((ok, no) => { asks.push({ at, realm, ok, no }); }) };
    return { p, asks };
  }
  const ROW = (sid: string): ConvListRow => ({ ref: { ...REF, sid }, title: sid, at: 1 });

  it('without a list: not available and nothing read; with one: one read per (computer, realm), its rows shown', async () => {
    const out: Array<ReturnType<typeof useConversationList>> = [];
    provideConversations({ open: () => null });
    const r = render(<ListProbe at={AT} realm="global" out={out} />);
    expect(out.at(-1)).toMatchObject({ available: false, rows: null, failed: false });
    const { p, asks } = lister();
    act(() => provideConversations(p));
    expect(asks).toHaveLength(1);
    r.rerender(<ListProbe at={{ ...AT }} realm="global" out={out} />);
    expect(asks).toHaveLength(1);
    await act(async () => { asks[0]!.ok([ROW('a')]); });
    expect(out.at(-1)).toMatchObject({ available: true, rows: [ROW('a')], failed: false });
    r.rerender(<ListProbe at={null} realm="global" out={out} />);
    expect(out.at(-1)!.rows).toBeNull();
  });

  it("a read for an earlier computer, realm or core generation is never shown; a failure says so and retry reads again", async () => {
    const out: Array<ReturnType<typeof useConversationList>> = [];
    const { p, asks } = lister();
    provideConversations(p);
    const r = render(<ListProbe at={AT} realm="global" out={out} />);
    r.rerender(<ListProbe at={AT} realm="f1f1f1f1f1f1f1f1f1f1f1f1" out={out} />);
    expect(asks.map((x) => x.realm)).toEqual(['global', 'f1f1f1f1f1f1f1f1f1f1f1f1']);
    await act(async () => { asks[0]!.ok([ROW('old')]); });
    expect(out.at(-1)!.rows).toBeNull();
    act(() => bump('test'));
    expect(asks).toHaveLength(3);
    await act(async () => { asks[1]!.ok([ROW('stale')]); });
    expect(out.at(-1)!.rows).toBeNull();
    await act(async () => { asks[2]!.no(new Error('down')); });
    expect(out.at(-1)).toMatchObject({ rows: null, failed: true });
    act(() => out.at(-1)!.retry());
    expect(asks).toHaveLength(4);
    expect(out.at(-1)).toMatchObject({ rows: null, failed: false });
    await act(async () => { asks[3]!.ok([ROW('fresh')]); });
    expect(out.at(-1)!.rows).toEqual([ROW('fresh')]);
  });

  // An answered identity read again (Back, then the same Conversation step) shows nothing of the earlier read.
  it('success, leave, return to the same computer and realm: no earlier rows until the new read answers', async () => {
    const out: Array<ReturnType<typeof useConversationList>> = [];
    const { p, asks } = lister();
    provideConversations(p);
    const r = render(<ListProbe at={AT} realm="global" out={out} />);
    await act(async () => { asks[0]!.ok([ROW('a')]); });
    expect(out.at(-1)!.rows).toEqual([ROW('a')]);
    r.rerender(<ListProbe at={null} realm="global" out={out} />);
    out.length = 0;
    r.rerender(<ListProbe at={AT} realm="global" out={out} />);
    expect(asks).toHaveLength(2);
    expect(out.every((x) => x.rows === null && !x.failed), 'no render shows the earlier rows').toBe(true);
    await act(async () => { asks[1]!.ok([ROW('b')]); });
    expect(out.at(-1)!.rows).toEqual([ROW('b')]);
  });

  it('empty, or failed, then leave and return: neither "none" nor the failure shows before the new read answers', async () => {
    for (const end of ['empty', 'failed'] as const) {
      const out: Array<ReturnType<typeof useConversationList>> = [];
      const { p, asks } = lister();
      provideConversations(p);
      const r = render(<ListProbe at={AT} realm="global" out={out} />);
      await act(async () => { if (end === 'empty') asks[0]!.ok([]); else asks[0]!.no(new Error('down')); });
      expect(out.at(-1), end).toMatchObject(end === 'empty' ? { rows: [], failed: false } : { rows: null, failed: true });
      r.rerender(<ListProbe at={null} realm="global" out={out} />);
      out.length = 0;
      r.rerender(<ListProbe at={AT} realm="global" out={out} />);
      expect(out.every((x) => x.rows === null && !x.failed), end).toBe(true);
      r.unmount();
    }
  });

  it('A answered, B pending, back to A: neither A\'s earlier rows nor B\'s late answer show; only the new read of A', async () => {
    const B: ShownComputer = { project: 'p1', id: 'c0a7150000000000000000b2', name: 'borealis' };
    const out: Array<ReturnType<typeof useConversationList>> = [];
    const { p, asks } = lister();
    provideConversations(p);
    const r = render(<ListProbe at={AT} realm="global" out={out} />);
    await act(async () => { asks[0]!.ok([ROW('a1')]); });
    r.rerender(<ListProbe at={B} realm="global" out={out} />);
    out.length = 0;
    r.rerender(<ListProbe at={AT} realm="global" out={out} />);
    expect(asks.map((x) => x.at.name)).toEqual(['atlas', 'borealis', 'atlas']);
    await act(async () => { asks[1]!.ok([ROW('b1')]); });
    expect(out.every((x) => x.rows === null), 'neither a1 nor b1').toBe(true);
    await act(async () => { asks[2]!.ok([ROW('a2')]); });
    expect(out.at(-1)!.rows).toEqual([ROW('a2')]);
  });

  it('another computer after an answer: not one render shows the earlier computer\'s rows (the answer names its read)', async () => {
    const B: ShownComputer = { project: 'p1', id: 'c0a7150000000000000000b2', name: 'borealis' };
    const out: Array<ReturnType<typeof useConversationList>> = [];
    const { p, asks } = lister();
    provideConversations(p);
    const r = render(<ListProbe at={AT} realm="global" out={out} />);
    await act(async () => { asks[0]!.ok([ROW('a1')]); });
    out.length = 0;
    r.rerender(<ListProbe at={B} realm="global" out={out} />);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((x) => x.rows === null)).toBe(true);
  });

  it('a read still out when the step is left answers after the step is back: only the new read\'s answer shows', async () => {
    const out: Array<ReturnType<typeof useConversationList>> = [];
    const { p, asks } = lister();
    provideConversations(p);
    const r = render(<ListProbe at={AT} realm="global" out={out} />);
    r.rerender(<ListProbe at={null} realm="global" out={out} />);
    r.rerender(<ListProbe at={AT} realm="global" out={out} />);
    expect(asks).toHaveLength(2);
    await act(async () => { asks[0]!.ok([ROW('first')]); });
    expect(out.at(-1)!.rows, 'the first read, same computer and realm, is not the current read').toBeNull();
    await act(async () => { asks[1]!.ok([ROW('second')]); });
    expect(out.at(-1)!.rows).toEqual([ROW('second')]);
  });

  it('a provider replaced while its read is out: that read\'s answer never shows; the new provider reads and its rows show', async () => {
    const out: Array<ReturnType<typeof useConversationList>> = [];
    const one = lister(), two = lister();
    provideConversations(one.p);
    render(<ListProbe at={AT} realm="global" out={out} />);
    expect(one.asks).toHaveLength(1);
    act(() => provideConversations(two.p));
    expect(two.asks).toHaveLength(1);
    await act(async () => { one.asks[0]!.ok([ROW('old')]); });
    expect(out.at(-1)!.rows).toBeNull();
    await act(async () => { two.asks[0]!.ok([ROW('new')]); });
    expect(out.at(-1)!.rows).toEqual([ROW('new')]);
  });
});
