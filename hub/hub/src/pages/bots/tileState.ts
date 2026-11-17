// What the bots tile (tile.tsx) shows for one Bot key, from the computers list and the Bot's own read.
//
// The computers list decides first: its latest answer without that computer (deleted, another
// account's) or with it stopped means the Bot isn't here; starting is loading. The Bot's own read is consulted only
// while that answer says running, and it is keyed by the computer's recovery epoch (data.ts
// recoveryEpoch): each return to running after the list said otherwise starts a key with no data, so a Bot answer from
// before a stop is never shown again, whatever happens to reads still in flight, cancellations or remounts.
// A stop and restart that no computers answer saw is caught by the computer's runtime mark (
// data.ts useTileBotView): the agent's /health `started` + `pid`, read every 15 s while the tile is seen on screen and
// its computer listed running and reachable. A changed mark starts a key with no data as a new epoch does. The epoch's
// first mark is waited for (loading, no cached answer shown) for at most HEALTH_WAIT_MS; without a mark (health failed,
// slow, off screen) the Bot is read as before.
// While the computer is listed and not running the tile re-reads the computers list (nothing else does on its own), so
// a computer that starts brings the Bot back. That re-read is the shared computers read, sent by one poller for every
// tile, only while some such tile is on screen and the browser tab is not hidden, one read at a time; it stops when the
// computer runs or a read no longer lists it.
// With no computers answer yet: loading; a failed computers answer is a retry on it. The agent's not_found for the Bot
// is gone; any other failure is a retry. A refresh that fails while an earlier answer of the same epoch is kept still
// shows that answer, marked `refreshFailed` with its retry, so a failing read is never shown as current.
import { type RefObject, useEffect, useState } from 'react';
import { hostEnv } from '@core';
import { parseBotKey } from './logic';
import { useComputers, useTileBotView } from './data';

/** How often the tile re-reads the computers list while the Bot's computer is not running. */
export const COMPUTER_POLL_MS = 15000;

// One poller for every tile that waits on its computer: each such tile adds its refetch of the shared computers read.
const waiting = new Map<symbol, (o: { cancelRefetch: boolean }) => Promise<unknown>>();
let poller: ReturnType<typeof setInterval> | null = null;
function pollOnce() {
  // The host's page visibility (a web page's document; the terminal host's own), never `document` (it traps there).
  if (!hostEnv().visible()) return;
  // cancelRefetch false: a read already in flight is joined, never sent again.
  const refetch = waiting.values().next().value;
  if (refetch) void refetch({ cancelRefetch: false });
}
function wait(id: symbol, refetch: (o: { cancelRefetch: boolean }) => Promise<unknown>) {
  waiting.set(id, refetch);
  poller ??= setInterval(pollOnce, COMPUTER_POLL_MS);
}
function unwait(id: symbol) {
  waiting.delete(id);
  if (waiting.size === 0 && poller !== null) {
    clearInterval(poller);
    poller = null;
  }
}

/** Whether the element is on screen: 'unknown' until the observer's first entry, true where the browser cannot tell. */
export function useScreenState(ref: RefObject<Element | null>): boolean | 'unknown' {
  const [on, setOn] = useState<boolean | 'unknown'>(() => (typeof IntersectionObserver === 'undefined' ? true : 'unknown'));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setOn(last.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

/** Whether the element is on screen (true until the observer says otherwise, and where the browser cannot tell). */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  return useScreenState(ref) !== false;
}

export type TileShow = 'loading' | 'error' | 'gone' | 'ready';

/** `key` is a well-formed Bot key: the tile checks it before anything that reads is mounted. `onScreen`: the tile is
 *  in view (the computers re-read waits while it is not). */
export function useTileBot(key: string, onScreen = true, admitted = onScreen) {
  const computersQ = useComputers();
  const computerId = parseBotKey(key)?.computerId;
  const computer = computersQ.data?.find((c) => c.id === computerId);
  const down = computersQ.data !== undefined && computer?.state !== 'running';
  // Health (the runtime mark) only for a computer the list has running, while the tile is seen on screen; the view
  // read checks the computer is reachable.
  const viewQ = useTileBotView(key, admitted && computer?.state === 'running');
  const refetchComputers = computersQ.refetch;
  const waitsOnComputer = down && computer !== undefined && onScreen;
  useEffect(() => {
    if (!waitsOnComputer) return;
    const id = Symbol('tile');
    wait(id, refetchComputers);
    return () => unwait(id);
  }, [waitsOnComputer, refetchComputers]);
  const retryOf = (q: { refetch: () => unknown }) => () => void q.refetch();
  const fail = (q: { error: unknown; refetch: () => unknown }) => ({ show: 'error' as const, error: q.error, retry: retryOf(q) });
  const out = ((): { show: TileShow; error?: unknown; retry?: () => void; refreshFailed?: boolean } => {
    if (down) return { show: computer?.state === 'starting' ? 'loading' : 'gone' };
    // The epoch's first runtime mark is not in yet (bounded): no Bot read yet, and no cached Bot answer shows.
    if (viewQ.waiting) return { show: 'loading' };
    if (viewQ.isError && viewQ.error?.kind === 'not_found') return { show: 'gone' };
    if (viewQ.bot) {
      if (viewQ.isError) return { show: 'ready', refreshFailed: true, error: viewQ.error, retry: retryOf(viewQ) };
      if (computersQ.isError) return { show: 'ready', refreshFailed: true, error: computersQ.error, retry: retryOf(computersQ) };
      return { show: 'ready' };
    }
    if (viewQ.isError) return fail(viewQ);
    if (viewQ.isSuccess) return { show: 'gone' };
    if (computersQ.data === undefined) return computersQ.isError ? fail(computersQ) : { show: 'loading' };
    // Listed and running but not a computer the agent's reads can reach (the read stays off).
    if (!viewQ.isEnabled) return { show: 'gone' };
    // No answer of this epoch yet (in flight, or a read cancelled before it answered: the view's own refetch follows).
    return { show: 'loading' };
  })();
  return { ...out, bot: viewQ.bot, viewQ };
}
