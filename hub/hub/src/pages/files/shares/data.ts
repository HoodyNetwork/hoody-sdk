// The storage share lists and changes of the Files page, through core from the Hoody API (realm scoped): the
// shares a computer gives and receives, and those of every computer of the realm view (routes.ts). Each list is
// read again every 30 s while shown, every 5 s while a share on it is moving (state.ts poll), so a share the servers
// are still setting up never keeps old words. An answer that is not a list is an error, never an empty list (wire.ts
// shareListOf). The changes (changes.ts) are each sent once under a lock; a lost answer is held and read back through
// these lists, never sent again.
import { coreSource, type HeldChange, type SourceTable } from '@core';
import { CHANGE_LOCK, CREATE_LOCK, STOP_LOCK, changeHolds, createHolds, createProved, enabledProved, modeProved, retryProved, stopProved, type CreateVars, type EnabledVars, type ModeVars, type RetryVars, type StopVars } from './changes';
import { shareRoutes } from './routes';
import type { ShareScope } from './section';
import { shareListOf, type ShareList } from './wire';

export interface ShareListParams { readonly computer: string }

const listOf = (of: (p: ShareListParams) => string) => (raw: unknown, p: ShareListParams): ShareList => {
  const l = shareListOf(raw);
  if (!l) throw new Error('SHARES_UNREADABLE');
  return { ...l, of: of(p) };
};

// Every list a change can show in: a change is read back through whichever of them is on screen.
const LISTS = ['given', 'received', 'allGiven', 'allReceived'] as const;

export const sharesTable: SourceTable = {
  reads: {
    given: { route: shareRoutes.list, input: (p: ShareListParams) => ({ params: { id: p.computer } }), select: listOf((p) => `given:${p.computer}`) },
    received: { route: shareRoutes.incoming, input: (p: ShareListParams) => ({ params: { id: p.computer } }), select: listOf((p) => `received:${p.computer}`) },
    allGiven: { route: shareRoutes.allShares, input: () => ({}), select: listOf(() => 'allGiven') },
    allReceived: { route: shareRoutes.allIncoming, input: () => ({}), select: listOf(() => 'allReceived') },
  },
  changes: {
    create: {
      route: shareRoutes.create,
      input: (v: CreateVars) => ({
        params: { id: v.source },
        body: { source_path: v.path, mode: v.mode, target_computer_id: v.target, ...(v.expiresAt === undefined ? {} : { expires_at: v.expiresAt }) },
      }),
      reads: LISTS,
      // One share of a folder to a computer at a time, whatever access each press chose.
      lock: CREATE_LOCK, lockKey: (v: CreateVars) => ({ source: v.source, path: v.path, target: v.target }),
      // `before` goes with the hold so its read-back can tell this send's share from one that was already there.
      identity: (v: CreateVars) => ({ source: v.source, path: v.path, target: v.target, mode: v.mode, before: [...v.before] }),
      acrossRealms: true,
      holds: createHolds,
      proves: createProved,
    },
    // Off/on, access and Try again are one share's changes: one lock, so only one of them is out at a time.
    setEnabled: {
      route: shareRoutes.update,
      input: (v: EnabledVars) => ({ params: { id: v.source, shareId: v.share }, body: { enabled: v.enabled } }),
      reads: LISTS,
      lock: CHANGE_LOCK, lockKey: (v: EnabledVars) => ({ share: v.share }),
      identity: (v: EnabledVars) => ({ share: v.share, source: v.source, path: v.path, enabled: v.enabled }),
      acrossRealms: true,
      holds: changeHolds,
      proves: enabledProved,
    },
    setMode: {
      route: shareRoutes.update,
      input: (v: ModeVars) => ({ params: { id: v.source, shareId: v.share }, body: { mode: v.mode } }),
      reads: LISTS,
      lock: CHANGE_LOCK, lockKey: (v: ModeVars) => ({ share: v.share }),
      identity: (v: ModeVars) => ({ share: v.share, source: v.source, path: v.path, mode: v.mode }),
      acrossRealms: true,
      holds: changeHolds,
      proves: modeProved,
    },
    // The API retries a failed share when it is turned on again.
    retry: {
      route: shareRoutes.update,
      input: (v: RetryVars) => ({ params: { id: v.source, shareId: v.share }, body: { enabled: true } }),
      reads: LISTS,
      lock: CHANGE_LOCK, lockKey: (v: RetryVars) => ({ share: v.share }),
      identity: (v: RetryVars) => ({ share: v.share, source: v.source, path: v.path, retry: true }),
      acrossRealms: true,
      holds: changeHolds,
      proves: retryProved,
    },
    stop: {
      route: shareRoutes.remove,
      input: (v: StopVars) => ({ params: { shareId: v.share } }),
      reads: LISTS,
      lock: STOP_LOCK, lockKey: (v: StopVars) => ({ share: v.share }),
      identity: (v: StopVars) => ({ share: v.share, source: v.source, path: v.path, target: v.target }),
      acrossRealms: true,
      holds: changeHolds,
      proves: stopProved,
    },
  },
};

const source = coreSource('files-shares', sharesTable);

/** One share list: what `computer` gives or receives ('this'), or every computer's ('all', `computer` unused). */
export function useShares(side: 'given' | 'received', scope: ShareScope, computer: string, fast: boolean) {
  const key = scope === 'all' ? (side === 'given' ? 'allGiven' : 'allReceived') : side;
  return source.useQuery<ShareList, ShareListParams>(key, { computer: scope === 'all' ? '' : computer }, { enabled: scope === 'all' || !!computer, refetchInterval: fast ? 5_000 : 30_000 });
}

export type ShareChangeKey = 'create' | 'setEnabled' | 'setMode' | 'retry' | 'stop';
export const useCreateShare = () => source.useMutation<unknown, CreateVars>('create');
export const useSetShareEnabled = () => source.useMutation<unknown, EnabledVars>('setEnabled');
export const useSetShareMode = () => source.useMutation<unknown, ModeVars>('setMode');
export const useRetryShare = () => source.useMutation<unknown, RetryVars>('retry');
export const useStopShare = () => source.useMutation<unknown, StopVars>('stop');
/** Whether a held share change is this page's own (core tells a hold's sender by its change key). */
export const shareHeldBy = (key: ShareChangeKey, h: HeldChange): 'self' | 'other' | undefined => source.heldBy(key, h);
