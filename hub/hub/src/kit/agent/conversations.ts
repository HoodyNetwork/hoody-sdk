// conversations.ts: how a page reaches a conversation's source without importing ask/ (pages may name only
// @ask/io). Ask registers one provider (ask/index.ts); a page holds a source with `useConversation`. The seam the
// AI tab's chat, the dock on SessionView, Board tiles and Bots Activity share. Contract:
//   - `open(account, ref, at)` returns a source for exactly that conversation, or null when it cannot be named: no
//     account, or `ref.computer` is neither known to the provider nor the handle of `at`, the computer the page shows.
//     A source is never one of another computer's conversations.
//   - Every open is one hold; `release()` lets it go, once (a second call does nothing). Holders of one reference share the
//     provider's engine (one stream); the last release ends it.
//   - The source a provider gives today is READ ONLY: sending is activated through activate.ts, never here.
//   - `useConversation` holds one source per (provider, core generation, account, reference, shown computer); a change of
//     any of them releases the old hold and opens again, and a hold made under an older identity is never returned.
//   - A source that can't be read says so: facts.reach is not 'ok', meta.status is 'unreachable' (or 'loading' while it
//     checks), and its first block is a line with key 'reach' giving the reason. It never reads as an empty idle chat.
//   - `useConversationHold` also says when the source is still opening (the render before the hold is made, on mount and
//     after any change of identity), so a page never shows "can't be read" for a source that is about to open.
//   - `list(account, at, realm)` (optional): the chats of the computer a page shows, in one realm, newest first,
//     each a reference `open` takes. It opens no conversation. `useConversationList` reads it once per (provider, core
//     generation, account, computer, realm) while given one; an answer belongs to the read that asked (a change of any
//     of them drops it, so another computer's or realm's rows are never shown), and a failed read says so (never "no chats").
// Engine-free: nothing here imports ask/.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useCore } from '@core';
import { convKey, type ConversationSource, type ConvRef } from './source';

/** The computer a page shows: the one a reference may open on when the provider does not know its handle. */
/** `server`: the server the computer runs on (the host its agent is reached at); absent while unknown. `name` is only a label. */
export interface ShownComputer { project: string; id: string; name: string; server?: string }
export interface Held { source: ConversationSource; release(): void }
/** One chat of a computer's list: its reference, its title (null when the chat has none yet) and when it was last active. */
export interface ConvListRow { ref: ConvRef; title: string | null; at: number | null }
export interface ConversationProvider {
  open(account: string, ref: ConvRef, at: ShownComputer | null): Held | null;
  /** The chats of `at` in `realm`, newest first; rejects when they cannot be read (or `at` cannot be named). */
  list?(account: string, at: ShownComputer, realm: string): Promise<readonly ConvListRow[]>;
}

let provider: ConversationProvider | null = null;
const subs = new Set<() => void>();
/** Registers (or, with null, removes) the provider; holders open again on the new one. */
export function provideConversations(p: ConversationProvider | null): void {
  provider = p;
  for (const f of [...subs]) f();
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const current = () => provider;

/** The source of `ref` while the component is mounted, or null (no provider, no account, or the computer is not named).
 *  It opens again when the reference, the shown computer, the account, the core generation or the provider changes,
 *  releasing the old hold. */
export function useConversation(ref: ConvRef | null, at: ShownComputer | null): ConversationSource | null {
  return useConversationHold(ref, at).source;
}

/** `useConversation`, plus `opening`: a hold is about to be made for the current identity (a provider, an account and a
 *  reference exist, and the provider has not answered for this identity yet). `opening` is never true with a source; a
 *  provider that answered no source ends it (source null, opening false: the source can't be named). */
export function useConversationHold(ref: ConvRef | null, at: ShownComputer | null): { source: ConversationSource | null; opening: boolean } {
  const core = useCore();
  const account = core.account ?? '';
  const p = useSyncExternalStore(subscribe, current, current);
  const key = ref ? convKey(ref) : '';
  const atKey = at ? `${at.project}|${at.id}|${at.name}|${at.server ?? ''}` : '';
  // `source` null: the provider answered for this identity with no source (it can't be named).
  const [held, setHeld] = useState<{ p: ConversationProvider; k: string; source: ConversationSource | null } | null>(null);
  // The core generation is part of the identity: a realm switch or account change ends the engines made for the old
  // context, so the same reference opens again under the new one.
  const want = `${core.gen}|${account}|${key}|${atKey}`;
  useEffect(() => {
    if (!p || !ref || !account) { setHeld(null); return; }
    let h: Held | null = null;
    try { h = p.open(account, ref, at); } catch { h = null; }
    setHeld({ p, k: want, source: h ? h.source : null });
    return () => { h?.release(); };
    // `want` names every input (generation, account, reference, shown computer); the objects may be rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, want]);
  // A hold made by another provider or for an earlier identity is never shown, even for the render before the effect runs.
  const answered = held !== null && held.p === p && held.k === want;
  return { source: answered ? held.source : null, opening: !answered && !!p && !!ref && !!account };
}

export interface ConvList {
  /** The provider can list chats (a page offers the list only then). */
  available: boolean;
  /** The rows of the current read; null while it reads, after a failure, or with no computer or realm. */
  rows: readonly ConvListRow[] | null;
  failed: boolean;
  /** Reads again (after a failure, or for fresh rows). */
  retry(): void;
}

/** The chats of `at` in `realm` (null: none read). Read once per identity (provider, core generation, account, computer,
 *  realm) and per retry; an answer is shown only for the read that asked it, and only while that read is the current one (a
 *  read made again for the same identity, after leaving or after another identity, starts with no rows). */
export function useConversationList(at: ShownComputer | null, realm: string | null): ConvList {
  const core = useCore();
  const account = core.account ?? '';
  const p = useSyncExternalStore(subscribe, current, current);
  const [tries, setTries] = useState(0);
  const atKey = at ? `${at.project}|${at.id}|${at.name}|${at.server ?? ''}` : '';
  const want = `${core.gen}|${account}|${atKey}|${realm ?? ''}|${tries}`;
  const [got, setGot] = useState<{ p: ConversationProvider; k: string; rows: readonly ConvListRow[] | null; failed: boolean } | null>(null);
  const on = !!p?.list && !!at && !!realm && !!account;
  useEffect(() => {
    if (!on || !p?.list || !at || !realm) return;
    let live = true;
    let read: Promise<readonly ConvListRow[]>;
    try { read = p.list(account, at, realm); } catch (e) { read = Promise.reject(e); }
    read.then(
      (rows) => { if (live) setGot({ p, k: want, rows: Array.isArray(rows) ? rows : [], failed: false }); },
      () => { if (live) setGot({ p, k: want, rows: null, failed: true }); },
    );
    // Leaving or changing the read drops what it answered: coming back to the same computer and realm is a new read, and
    // its rows (or its empty list, or its failure) show only once that read answers, never the earlier read's.
    return () => { live = false; setGot(null); };
    // `want` names every input (generation, account, computer, realm, retry); the objects may be rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, want, on]);
  const mine = on && got !== null && got.p === p && got.k === want ? got : null;
  const retry = useCallback(() => setTries((n) => n + 1), []);
  return { available: !!p?.list, rows: mine?.rows ?? null, failed: mine?.failed ?? false, retry };
}
