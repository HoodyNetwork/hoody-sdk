// run-open-hook.ts: useRunOpen(), the Apps Open step machine (core/run-open) bound to one computer.
//
// Contract, in plain words:
//   - The computer is the current one, or `target` when the caller passes it (a Board tile's computer, which may
//     not be the one the top bar shows). `target: null` means none.
//   - null while there is no computer; otherwise one machine for (computer, context generation). The computer is
//     compared by its ids and server name, so a caller that builds a new Target object on every render keeps its
//     machine. Its send is
//     runOpenSend over api(): declared kit rows only, never retried, never a fresh key (the machine owns C9).
//   - Every send carries the context captured when the machine was made. An account, realm or computer switch
//     makes a new machine; the old one's answers are dropped as stale and its new sends are refused unsent.
//   - Every launch-producing send (resolve, band create, band execute, replays included) checks, as it leaves,
//     that this session may still run things on the computer (can('computers.actions.exec')); without it the send
//     is refused unsent (send.ts mayLaunch). Status reads and Stop always go.
//   - Unmount (or the switch) aborts the old machine's signal: a dropped resolve answer has its secret values
//     blanked (scrubResolveAnswer) before it is discarded.
//   - Made in an effect, so the first render is null (and StrictMode's remount gets a live machine).
import { useEffect, useRef, useState } from 'react';
import { alive, capture, type Target } from './ctx';
import { useCurrentComputer } from './computer';
import { useCore } from './query';
import { can } from './token';
import { createRunOpen, scrubResolveAnswer, type RunOpen } from './run-open/index';
import { runOpenSend } from './run-open/send';

export interface UseRunOpenOptions {
  /** A server's "come back later", in ms, for the view to show. */
  onRetryAfter?: (ms: number) => void;
  /** The computer to open on, instead of the current one (undefined). null: none. */
  target?: Target | null;
}

const targetKey = (t: Target | null): string => (t ? `${t.project.id}\n${t.container.id}\n${t.container.server_name ?? ''}` : '');

export function useRunOpen(o: UseRunOpenOptions = {}): RunOpen | null {
  const current = useCurrentComputer();
  const target = o.target === undefined ? current : o.target;
  const key = targetKey(target);
  const latest = useRef(target);
  latest.current = target;
  const { gen } = useCore();
  const hold = useRef(o.onRetryAfter);
  hold.current = o.onRetryAfter;
  // The machine with the computer and generation it was made for: a render after a switch never hands out the old one.
  const [made, setMade] = useState<{ for: string; m: RunOpen } | null>(null);
  const want = `${key}|${gen}`;
  useEffect(() => {
    const target = latest.current;
    if (!target) { setMade(null); return; }
    const ctx = capture(target);
    const abort = new AbortController();
    const send = runOpenSend({
      ctx,
      target,
      signal: abort.signal,
      // A machine whose view ended (unmount, switch) is not alive: core refuses its sends unsent.
      alive: () => !abort.signal.aborted && alive(ctx),
      onRetryAfter: (ms) => { hold.current?.(ms); },
      scrubDropped: (a) => { scrubResolveAnswer(a); },
      mayLaunch: () => can('computers.actions.exec'),
    });
    const guarded: typeof send = (t, m, p, q, b) => (abort.signal.aborted || !alive(ctx) ? Promise.reject({ notSent: true, code: 'stale' }) : send(t, m, p, q, b));
    setMade({ for: want, m: createRunOpen({ send: guarded, computer: { project: target.project.id, computer_id: target.container.id } }) });
    return () => { abort.abort(); };
  }, [want]);
  return key && made?.for === want ? made.m : null;
}
