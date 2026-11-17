// The Board's one Broadcaster, wired to core: the pipe's live upload and progress stream (pipeRoutes) and the
// link's C9 changes (data.ts).
//
// Contract, in plain words:
//   - useBroadcast(computer) returns {b, state, aliases}: one Broadcaster per Board mount, made in an effect and
//     disposed on unmount (the stream ends with the Board; StrictMode's second mount gets a new one), null before
//     the first effect; its state (re-rendered on every change, IDLE_STATE without one); and the broadcast aliases
//     of the broadcast's computer while it holds it (holdsComputer), else of `computer` (the panel's pick).
//   - The link changes go through the page's source mutations, so their outcomes and held locks are core's;
//     checkCreate/checkRemove/checkRenew are those mutations' readBack(); findLink reads the alias list again and picks a
//     usable link (link.ts usable) of this broadcast's name (rejects when the list could not be read, so unread is never "not there").
//   - capture/alive are core's: a link change is sent only while the context of Start (account, realm, generation)
//     is still the current one.
//   - The progress stream is core stream(): its 'open' state opens, 'closed' and 'error' close (with the reason).
import { alive, capture, pipeRoutes, stream, upload, type Ctx, type Target } from '@core';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Broadcaster, IDLE_STATE, holdsComputer, type BroadcastDeps, type BroadcastState, type Outcome, type ProgressCallbacks } from './broadcaster';
import { useBroadcastAliases, useCreateLink, useRemoveLink, useRenewLink } from './data';
import { usable, type BroadcastAlias } from './link';

export interface UseBroadcast {
  readonly b: Broadcaster | null;
  readonly state: BroadcastState;
  readonly aliases: ReturnType<typeof useBroadcastAliases>;
}

function openProgress(target: Target, name: string, cb: ProgressCallbacks) {
  const s = stream(pipeRoutes.progress, {
    target,
    params: { name },
    query: { progress: 1 },
    onEvent: (ev, data) => cb.onEvent(ev, data),
    onState: (st) => {
      if (st.state === 'open') cb.onOpen();
      else if (st.state === 'closed') cb.onClosed(st.reason);
      else if (st.state === 'error') cb.onClosed('error');
    },
  });
  if (s.refused) queueMicrotask(() => cb.onClosed('refused'));
  return { close: s.close };
}

/** The live upload of one Start: the pipe's keyed live route, always with that Start's sender key. */
export const sendLive = (up: typeof upload = upload): BroadcastDeps['upload'] => (target, name, transfer, key, body, mime, signal) =>
  up(pipeRoutes.live, { target, params: { name }, query: { live: 1, transfer }, senderKey: key, body, contentType: mime, signal });

export function useBroadcast(computer: string | undefined): UseBroadcast {
  const create = useCreateLink();
  const remove = useRemoveLink();
  const renew = useRenewLink();
  const ref = useRef({ create, remove, renew, aliases: null as ReturnType<typeof useBroadcastAliases> | null });
  ref.current.create = create;
  ref.current.remove = remove;
  ref.current.renew = renew;

  const [b, setB] = useState<Broadcaster | null>(null);
  useEffect(() => {
    const deps: BroadcastDeps = {
      // Read through globalThis: a browser without them gets the capability note, never a ReferenceError here.
      getDisplayMedia: (o) => navigator.mediaDevices.getDisplayMedia(o),
      MediaRecorder: (globalThis as { MediaRecorder?: unknown }).MediaRecorder as BroadcastDeps['MediaRecorder'],
      upload: sendLive(),
      openProgress,
      capture: () => capture(),
      alive: (ctx) => alive(ctx as Ctx),
      createLink: (v) => ref.current.create.mutateAsync(v) as Promise<Outcome<BroadcastAlias | null>>,
      removeLink: (v) => ref.current.remove.mutateAsync(v) as Promise<Outcome<unknown>>,
      renewLink: (v) => ref.current.renew.mutateAsync(v) as Promise<Outcome<unknown>>,
      checkCreate: () => ref.current.create.readBack(),
      checkRemove: () => ref.current.remove.readBack(),
      checkRenew: () => ref.current.renew.readBack(),
      findLink: async (_computer, name) => {
        const q = ref.current.aliases;
        const r = q ? await q.refetch() : null;
        if (!r || r.isError || !r.data) throw new Error('unread');
        const now = Date.now();
        return r.data.rows.find((a) => a.name === name && usable(a, now)) ?? null;
      },
    };
    const made = new Broadcaster(deps);
    setB(made);
    return () => made.dispose();
  }, []);

  const subscribe = useCallback((fn: () => void) => (b ? b.subscribe(fn) : () => {}), [b]);
  const state = useSyncExternalStore(subscribe, () => (b ? b.state : IDLE_STATE));
  const aliases = useBroadcastAliases(holdsComputer(state) && state.computer ? state.computer.id : computer);
  ref.current.aliases = aliases;
  return { b, state, aliases };
}
