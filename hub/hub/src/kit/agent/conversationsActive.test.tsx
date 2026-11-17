// The page's way to an ACTIVE conversation (kit/agent/conversationsActive.ts), the twin of useConversation. Null without a
// provider or an account; one hold per mount, released on unmount and on any change of reference, shown computer or provider; a hold
// for an earlier reference is never shown for a new one; a provider that throws opens nothing; what it gives is an active source.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump } from '../../core/ctx';
import { boot, UID } from '../../core/test/env';
import type { ShownComputer } from './conversations';
import { provideActiveConversations, useActiveConversation, useStarter, type ActiveConversationProvider, type StartAt, type StartOpts, type StartPhase, type StartState, type Starter } from './conversationsActive';
import { isActive, type ActiveSource, type ConvRef } from './source';

const AT: ShownComputer = { project: 'p1', id: 'c0a7150000000000000000a1', name: 'atlas' };
const REF: ConvRef = { computer: 'atlas.00a1', realm: 'global', sid: 's1' };

function fakeProvider(throwOnOpen = false) {
  const opened: { account: string; ref: ConvRef; at: ShownComputer | null; release: ReturnType<typeof vi.fn>; source: ActiveSource }[] = [];
  const p: ActiveConversationProvider = {
    open(account, ref, at) {
      if (throwOnOpen) throw new Error('boom');
      const source = { kind: 'session', ref, send: () => Promise.resolve({ k: 'unknown' }) } as unknown as ActiveSource;
      const release = vi.fn();
      opened.push({ account, ref, at, release, source });
      return { source, release };
    },
  };
  return { p, opened };
}

let seen: (ActiveSource | null)[] = [];
function Probe({ r, at }: { r: ConvRef | null; at: ShownComputer | null }) {
  seen.push(useActiveConversation(r, at));
  return null;
}

beforeEach(() => { boot(); seen = []; });
afterEach(() => { cleanup(); provideActiveConversations(null); });

describe('useActiveConversation', () => {
  it('no provider: null; a provider that throws opens nothing', () => {
    render(<Probe r={REF} at={AT} />);
    expect(seen.at(-1)).toBeNull();
    cleanup();
    provideActiveConversations(fakeProvider(true).p);
    render(<Probe r={REF} at={AT} />);
    expect(seen.at(-1)).toBeNull();
  });

  it('opens once for the shown account; what it holds can send; unmount releases it once', () => {
    const { p, opened } = fakeProvider();
    provideActiveConversations(p);
    const r = render(<Probe r={REF} at={AT} />);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ account: UID, ref: REF, at: AT });
    expect(seen.at(-1)).toBe(opened[0]!.source);
    expect(isActive(seen.at(-1)!)).toBe(true);
    r.rerender(<Probe r={{ ...REF }} at={{ ...AT }} />);
    expect(opened).toHaveLength(1);
    r.unmount();
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('a new reference releases the old hold first and never shows the old source for it', () => {
    const { p, opened } = fakeProvider();
    provideActiveConversations(p);
    const r = render(<Probe r={REF} at={AT} />);
    seen = [];
    r.rerender(<Probe r={{ ...REF, sid: 's2' }} at={AT} />);
    expect(opened).toHaveLength(2);
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(seen).not.toContain(opened[0]!.source);
    expect(seen.at(-1)).toBe(opened[1]!.source);
  });

  // The identity holds the core generation, as the twin useConversation does.
  it('a new core generation (realm switch, same account, same reference) releases the hold, never shows it again, and opens anew', () => {
    const { p, opened } = fakeProvider();
    provideActiveConversations(p);
    render(<Probe r={REF} at={AT} />);
    seen = [];
    act(() => { bump('switch'); });
    expect(opened).toHaveLength(2);
    expect(opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(opened[1]!.ref).toEqual(REF);
    expect(seen).not.toContain(opened[0]!.source);
    expect(seen.at(-1)).toBe(opened[1]!.source);
  });

  it('another shown computer opens again; a new provider opens again; removing it reads null', () => {
    const a = fakeProvider();
    provideActiveConversations(a.p);
    const r = render(<Probe r={REF} at={AT} />);
    r.rerender(<Probe r={REF} at={{ ...AT, id: 'other' }} />);
    expect(a.opened).toHaveLength(2);
    expect(a.opened[0]!.release).toHaveBeenCalledTimes(1);
    const b = fakeProvider();
    act(() => provideActiveConversations(b.p));
    expect(a.opened[1]!.release).toHaveBeenCalledTimes(1);
    expect(b.opened).toHaveLength(1);
    act(() => provideActiveConversations(null));
    expect(b.opened[0]!.release).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBeNull();
  });

  it('no reference reads null and opens nothing', () => {
    const { p, opened } = fakeProvider();
    provideActiveConversations(p);
    render(<Probe r={null} at={AT} />);
    expect(seen.at(-1)).toBeNull();
    expect(opened).toHaveLength(0);
  });
});

// UseStarter, the New chat seam. One hold per mount and place, let go on unmount, on a new place and on a provider
// change; a starter (or its snapshot) of a replaced or removed provider, or of an earlier place, is never shown, even for one render.
const START_AT: StartAt = { computer: AT, realm: 'global' };
function starterProvider() {
  const made: { account: string; at: StartAt; s: Starter; release: ReturnType<typeof vi.fn> }[] = [];
  const p: ActiveConversationProvider = {
    open: () => null,
    starter(account, at) {
      const st: StartState = { door: { ok: true }, phase: { k: 'none' } };
      const release = vi.fn();
      const s: Starter = { state: () => st, subscribe: () => () => {}, start: () => false, check: () => {}, settle: () => false, release };
      made.push({ account, at, s, release });
      return s;
    },
  };
  return { p, made };
}
let starters: (Starter | null)[] = [];
function StartProbe({ at }: { at: StartAt | null }) {
  starters.push(useStarter(at).starter);
  return null;
}

describe('useStarter', () => {
  beforeEach(() => { starters = []; });

  it('no provider, or a provider without starts: no starter; one hold per mount, released once on unmount', () => {
    render(<StartProbe at={START_AT} />);
    expect(starters.at(-1)).toBeNull();
    cleanup();
    provideActiveConversations({ open: () => null });
    render(<StartProbe at={START_AT} />);
    expect(starters.at(-1)).toBeNull();
    cleanup();
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={START_AT} />);
    expect(a.made).toHaveLength(1);
    expect(a.made[0]).toMatchObject({ account: UID, at: START_AT });
    expect(starters.at(-1)).toBe(a.made[0]!.s);
    r.rerender(<StartProbe at={{ computer: { ...AT }, realm: 'global' }} />);
    expect(a.made).toHaveLength(1);
    r.unmount();
    expect(a.made[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('another realm or computer: the old hold is let go and its starter is never shown for the new place', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={START_AT} />);
    starters = [];
    r.rerender(<StartProbe at={{ ...START_AT, realm: 'aaaaaaaaaaaaaaaaaaaaaaaa' }} />);
    expect(a.made).toHaveLength(2);
    expect(a.made[0]!.release).toHaveBeenCalledTimes(1);
    expect(starters).not.toContain(a.made[0]!.s);
    expect(starters.at(-1)).toBe(a.made[1]!.s);
  });

  it('a replaced or removed provider: the old starter is never shown, not even for the render before the effect', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    render(<StartProbe at={START_AT} />);
    expect(starters.at(-1)).toBe(a.made[0]!.s);
    starters = [];
    const b = starterProvider();
    act(() => provideActiveConversations(b.p));
    expect(starters).not.toContain(a.made[0]!.s);
    expect(a.made[0]!.release).toHaveBeenCalledTimes(1);
    expect(starters.at(-1)).toBe(b.made[0]!.s);
    starters = [];
    act(() => provideActiveConversations(null));
    expect(starters).not.toContain(b.made[0]!.s);
    expect(b.made[0]!.release).toHaveBeenCalledTimes(1);
    expect(starters.at(-1)).toBeNull();
  });
});

// The kind of page that made a start. An opened start shows only on a page of its kind (one taken up
// from the journal has none and shows everywhere); a page of a kind other than New chat's stamps its starts with it.
describe('useStarter: the kind of page', () => {
  let seen: { starter: Starter | null; state: StartState }[] = [];
  function KindProbe({ from }: { from?: string }) {
    seen.push(useStarter(START_AT, from));
    return null;
  }
  function kindProvider(st: StartState) {
    const starts: StartOpts[] = [];
    const s: Starter = { state: () => st, subscribe: () => () => {}, start: (_t, o) => { starts.push(o); return true; }, check: () => {}, settle: () => false, release: () => {} };
    provideActiveConversations({ open: () => null, starter: () => s });
    return { s, starts };
  }
  beforeEach(() => { seen = []; });

  it.each([
    ['workflow', 'workflow', true], ['workflow', '', false], ['workflow', undefined, false], ['', 'workflow', false], ['', '', true],
    [undefined, 'workflow', true], [undefined, '', true],
  ] as const)('opened from %j on a page of kind %j: shown %j', (made, page, shown) => {
    const st: StartState = { door: { ok: false, why: 'one at a time' }, phase: { k: 'opened', ref: REF, ...(made !== undefined ? { from: made } : {}) } };
    kindProvider(st);
    render(<KindProbe from={page} />);
    const got = seen.at(-1)!.state;
    expect(got.phase.k).toBe(shown ? 'opened' : 'none');
    if (shown) expect(got).toBe(st);
    expect(got.door).toBe(st.door);
  });

  it('every phase but opened shows to every page, as the place\'s', () => {
    for (const phase of [{ k: 'waiting' }, { k: 'starting' }, { k: 'notSent', why: 'no' }, { k: 'unknown', taken: true }] as const) {
      const st: StartState = { door: { ok: true }, phase };
      kindProvider(st);
      for (const page of ['', 'workflow']) {
        const r = render(<KindProbe from={page} />);
        expect(seen.at(-1)!.state, `${phase.k} on ${page}`).toBe(st);
        r.unmount();
      }
    }
  });

  it('a page of another kind stamps its starts, in place of a caller\'s own; New chat\'s go as given, on the provider\'s own starter', () => {
    const a = kindProvider({ door: { ok: true }, phase: { k: 'none' } });
    const r = render(<KindProbe from="workflow" />);
    const wf = seen.at(-1)!.starter!;
    expect(wf).not.toBe(a.s);
    expect(wf.start('x', { agent: 'a', strict: false })).toBe(true);
    expect(wf.start('x', { agent: 'a', strict: false, from: 'other' })).toBe(true);
    expect(wf.state).toBe(a.s.state);
    expect(wf.settle).toBe(a.s.settle);
    r.rerender(<KindProbe from="workflow" />);
    expect(seen.at(-1)!.starter, 'one copy per mount, not one per render').toBe(wf);
    r.unmount();
    render(<KindProbe />);
    expect(seen.at(-1)!.starter).toBe(a.s);
    expect(seen.at(-1)!.starter!.start('y', { agent: 'a', strict: true })).toBe(true);
    expect(a.starts).toEqual([{ agent: 'a', strict: false, from: 'workflow' }, { agent: 'a', strict: false, from: 'workflow' }, { agent: 'a', strict: true }]);
  });
});

// A start a mount showed unresolved (waiting, starting, unknown: the person watched it there, or
// pressed Check again there) shows its opened on that mount too, whichever kind of page made it. Only that mount's own sight counts.
describe('useStarter: a start watched here', () => {
  let seen: StartState[] = [];
  const OTHER_AT: StartAt = { computer: AT, realm: 'other' };
  function Probe({ at = START_AT, from }: { at?: StartAt; from?: string }) {
    seen.push(useStarter(at, from).state);
    return null;
  }
  // One start per place, as the provider: every holder of a place sees the same start.
  function liveProvider() {
    const places = new Map<string, { st: StartState; subs: Set<() => void> }>();
    const place = (at: StartAt) => {
      let pl = places.get(at.realm);
      if (!pl) { pl = { st: { door: { ok: true }, phase: { k: 'none' } }, subs: new Set() }; places.set(at.realm, pl); }
      return pl;
    };
    provideActiveConversations({
      open: () => null,
      starter: (_a, at) => {
        const pl = place(at);
        return { state: () => pl.st, subscribe: (f) => { pl.subs.add(f); return () => { pl.subs.delete(f); }; }, start: () => false, check: () => {}, settle: () => false, release: () => {} };
      },
    });
    return (phase: StartPhase, at: StartAt = START_AT) => act(() => { const pl = place(at); pl.st = { ...pl.st, phase }; for (const f of [...pl.subs]) f(); });
  }
  beforeEach(() => { seen = []; });

  it.each([
    ['workflow', '', 'unknown'], ['workflow', '', 'starting'], ['workflow', '', 'waiting'], ['', 'workflow', 'unknown'], ['', 'workflow', 'starting'],
  ] as const)('a page of kind %j showed a start of kind %j %s: its opened shows there', (page, made, was) => {
    const set = liveProvider();
    render(<Probe from={page} />);
    set({ k: was });
    expect(seen.at(-1)!.phase.k).toBe(was);
    set({ k: 'opened', ref: REF, from: made });
    expect(seen.at(-1)!.phase).toEqual({ k: 'opened', ref: REF, from: made });
  });

  it.each([[{ k: 'none' }], [{ k: 'notSent', why: 'no' }]] as const)('watched, then ended (%j): a later opened of the other kind is hidden again', (end) => {
    const set = liveProvider();
    render(<Probe from="workflow" />);
    set({ k: 'unknown' });
    set(end);
    set({ k: 'opened', ref: REF, from: '' });
    expect(seen.at(-1)!.phase.k).toBe('none');
  });

  it('watched by an earlier mount only: a mount that comes after it opened hides it', () => {
    const set = liveProvider();
    const r = render(<Probe from="workflow" />);
    set({ k: 'unknown' });
    r.unmount();
    set({ k: 'opened', ref: REF, from: '' });
    render(<Probe from="workflow" />);
    expect(seen.at(-1)!.phase.k).toBe('none');
  });

  it('watched on another place: an opened of the other kind on this one is hidden', () => {
    const set = liveProvider();
    set({ k: 'opened', ref: REF, from: '' }, OTHER_AT);
    const r = render(<Probe from="workflow" />);
    set({ k: 'unknown' });
    r.rerender(<Probe at={OTHER_AT} from="workflow" />);
    expect(seen.at(-1)!.phase.k).toBe('none');
  });

  it('opened of its own kind, or taken up, shows whatever was watched', () => {
    const set = liveProvider();
    render(<Probe from="workflow" />);
    set({ k: 'opened', ref: REF, from: 'workflow' });
    expect(seen.at(-1)!.phase.k).toBe('opened');
    set({ k: 'none' });
    set({ k: 'opened', ref: REF });
    expect(seen.at(-1)!.phase.k).toBe('opened');
  });
});

// The shown computer's server. New chat that stays mounted while the server becomes known opens its start again
// on it; a server no longer known is never filled from a cache (a mounted hold keeps the server it holds). An open conversation's hold is never let go for a server change (that
// would end its engine with a send on its way): a server that becomes known or changes reaches the held entry in place.
describe('the server of the shown computer', () => {
  const SERVER = 'node-amber';
  const OTHER = 'node-orca';
  beforeEach(() => { starters = []; });

  it('useStarter: a server that becomes known while New chat stays mounted opens the start again on it', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={START_AT} />);
    expect(a.made).toHaveLength(1);
    expect(a.made[0]!.at.computer.server).toBeUndefined();
    r.rerender(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'global' }} />);
    expect(a.made).toHaveLength(2);
    expect(a.made[0]!.release).toHaveBeenCalledTimes(1);
    expect(a.made[1]!.at.computer.server).toBe(SERVER);
    expect(starters.at(-1)).toBe(a.made[1]!.s);
  });

  // a row that withholds the server keeps the mounted hold (core refuses its
  // requests meanwhile, core/routing.ts), as the dock keeps its engine; named again, the same hold goes on: never let go and taken again.
  it('useStarter: a row that withholds the server, then names it again, keeps the one hold (never let go and taken again)', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'global' }} />);
    r.rerender(<StartProbe at={START_AT} />);
    expect(a.made, 'withheld: nothing let go, nothing opened').toHaveLength(1);
    expect(a.made[0]!.release).not.toHaveBeenCalled();
    expect(starters.at(-1)).toBe(a.made[0]!.s);
    r.rerender(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'global' }} />);
    expect(a.made, 'named again: the same hold').toHaveLength(1);
    expect(a.made[0]!.release).not.toHaveBeenCalled();
    expect(starters.at(-1)).toBe(a.made[0]!.s);
  });

  it('useStarter: withheld, then another server named: the start opens again on that one', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'global' }} />);
    r.rerender(<StartProbe at={START_AT} />);
    r.rerender(<StartProbe at={{ computer: { ...AT, server: OTHER }, realm: 'global' }} />);
    expect(a.made).toHaveLength(2);
    expect(a.made[0]!.release).toHaveBeenCalledTimes(1);
    expect(a.made[1]!.at.computer.server).toBe(OTHER);
    expect(starters.at(-1)).toBe(a.made[1]!.s);
  });

  it('useStarter: a New chat mounted while the row withholds the server names none (no cached host), even after an earlier mount named it', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'global' }} />);
    r.unmount();
    render(<StartProbe at={START_AT} />);
    expect(a.made).toHaveLength(2);
    expect(a.made[1]!.at.computer.server).toBeUndefined();
  });

  it('useStarter: another place while the server is withheld does not carry the old place\'s server', () => {
    const a = starterProvider();
    provideActiveConversations(a.p);
    const r = render(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'global' }} />);
    r.rerender(<StartProbe at={{ computer: { ...AT }, realm: 'aaaaaaaaaaaaaaaaaaaaaaaa' }} />);
    expect(a.made).toHaveLength(2);
    expect(a.made[1]!.at.computer.server).toBeUndefined();
    expect(a.made[1]!.at.realm).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    r.rerender(<StartProbe at={{ computer: { ...AT, server: SERVER }, realm: 'aaaaaaaaaaaaaaaaaaaaaaaa' }} />);
    expect(a.made, 'the new place\'s server becomes known: its start opens again on it').toHaveLength(3);
    expect(a.made[2]!.at.computer.server).toBe(SERVER);
  });

  it('useActiveConversation: a server no longer known lets nothing go and opens nothing', () => {
    const { p, opened } = fakeProvider();
    provideActiveConversations(p);
    const r = render(<Probe r={REF} at={{ ...AT, server: SERVER }} />);
    const n = opened.length;
    r.rerender(<Probe r={REF} at={AT} />);
    expect(opened).toHaveLength(n);
    expect(opened[0]!.release).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(opened[0]!.source);
  });

  it('useActiveConversation: a server that becomes known or changes reaches the held entry in place; the hold is kept', () => {
    const { p, opened } = fakeProvider();
    provideActiveConversations(p);
    const r = render(<Probe r={REF} at={AT} />);
    expect(opened).toHaveLength(1);
    r.rerender(<Probe r={REF} at={{ ...AT, server: SERVER }} />);
    expect(opened.at(-1)!.at?.server).toBe(SERVER);
    expect(opened.at(-1)!.release, 'the extra open is let go at once').toHaveBeenCalledTimes(1);
    r.rerender(<Probe r={REF} at={{ ...AT, server: OTHER }} />);
    expect(opened.at(-1)!.at?.server).toBe(OTHER);
    expect(opened[0]!.release, 'the hold itself is never let go for a server').not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(opened[0]!.source);
  });
});
