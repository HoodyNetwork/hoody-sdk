// The Free badge's reads: the person's whole server list and whole subscription list, user-wide (base scope: a realm
// view would hide servers kept in other realms and so show "free" for a person who has a paid one elsewhere). Read only.
// A second core source of the billing page under its own keys. A token session reads through its pinned realm's host
// whatever the scope says, so it never sees the whole account: there the badge stays off and nothing is read.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { commerce, hostEnv, useCan } from '@core';
import { FRESH_MS, answersCurrent, freeOnly, type FreeVerdict } from './FreeBadge.logic';
import { source, store, subscribe, version, cutoff, pendingNow, syncPending, purchaseStoresChanged } from './FreeBadge.data.pure';
export { purchaseStoresChanged, usePurchaseActivity, useFreeNetworkMbps, freeBadgeStateForTests, resetFreeBadgeForTests } from './FreeBadge.data.pure';

/** The verdict of the two lists: only 'free' shows the badge. A read that is pending, failed (also a failed refresh over older data), old or older than the last cutoff, or a purchase in flight, is unknown. */
export function useFreeVerdict(): FreeVerdict {
  // 'account' is never part of a token's access: true exactly when this session sees the whole account.
  const account = useCan('account');
  // The generation is only part of the key (neither route reads it): after a cutoff the reads are new queries.
  const at = store.cutoff;
  const a = source.useQuery<unknown, { g: number }>('freeServers', { g: at }, { enabled: account });
  const b = source.useQuery<unknown, { g: number }>('freeSubs', { g: at }, { enabled: account });
  useSyncExternalStore(subscribe, version, version);
  // A market rent is core's: its marker, and every change to it, count the same way; so do the other tabs' writes.
  useEffect(() => {
    const changed = () => purchaseStoresChanged();
    // Another tab's write to anything of the Hub's (a retained purchase among it), or a clear of all storage.
    const offStored = hostEnv().onExternalChange((_area, key) => {
      if (!key || /^hub[._]/.test(key)) purchaseStoresChanged();
    });
    const off = commerce.subscribeRentPending(changed);
    return () => {
      offStored();
      off();
    };
  }, []);
  const pending = pendingNow();
  // Seeing it clear is a cutoff (an effect, not render: it notifies); until that took effect the answers do not count.
  const clearing = store.hadPending && !pending;
  useEffect(() => {
    syncPending();
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // The window or tab being shown again is a cutoff too (after it, only answers read from then on count).
  useEffect(() => {
    if (!account) return;
    const again = () => {
      setNow(Date.now());
      cutoff();
    };
    const env = hostEnv();
    const visible = () => {
      if (env.visible()) again();
    };
    const offs = [env.onLifecycle('focus', again), env.onVisibilityChange(visible)];
    return () => { for (const off of offs) off(); };
  }, [account]);
  if (!account) return 'unknown';
  if (store.busy.size > 0 || pending || clearing) return 'unknown';
  if (!a.isSuccess || !b.isSuccess || a.isError || b.isError) return 'unknown';
  if (!answersCurrent([a.dataUpdatedAt, b.dataUpdatedAt], now, FRESH_MS)) return 'unknown';
  return freeOnly(a.data, b.data);
}
