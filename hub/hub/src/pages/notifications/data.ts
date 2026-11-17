// The notifications page's data: its routes, queries and mutations, declared in one place, on core
// (defineQuery / defineMutation): live in the Hub, core's fixture transport in dev, shots and tests.
// Routes (base scope): GET /notifications?unread_only|read_only&limit&page (core's notificationListRoute; the
// newest 100 of a box are read for the table), PUT /notifications/{id}/read, PUT /notifications/read-all.
// A done acknowledgement re-reads both boxes and tells the bell (noteNotificationsRead); a pending one may have
// gone through: it is never sent again before it was read back (core refuses READ_BACK_FIRST).
import {
  defineMutation,
  defineQuery,
  defineRoute,
  heldChanges,
  noteAllNotificationsRead,
  noteNotificationsRead,
  notificationListRoute,
  notificationRow,
  useChangesVersion,
  useCore,
  type NoticeSeverity,
  type NoticeType as CoreNoticeType,
  type BrowserEnv,
  type NotificationRow, pageFixtures } from '@core';
import type { OutcomeKind } from '@kit';
import type { RunOutcome } from '@core';
import { useCallback, useRef } from 'react';
import { markAllProves, markReadProves } from './logic';

export type Severity = NoticeSeverity;
export type NoticeType = CoreNoticeType;
export type Notice = NotificationRow;

export type Box = 'unread' | 'archive';

export interface NoticePage {
  rows: Notice[];
  /** All the account holds in this box. */
  total: number;
}

export interface Change {
  outcome: OutcomeKind;
  /** A refusal's code: READ_BACK_FIRST means an earlier press may have gone through. */
  code?: string;
}

/** How many notices of a box the table reads (newest first). */
const LIST_LIMIT = 100;

export const routes = {
  list: notificationListRoute,
  markRead: defineRoute({
    method: 'PUT',
    path: '/notifications/:id/read',
    scope: 'base',
  }),
  markAllRead: defineRoute({
    method: 'PUT',
    path: '/notifications/read-all',
    scope: 'base',
  }),
} as const;

type ListWire = { data?: unknown[]; pagination?: { total?: unknown } };

const listQ = defineQuery<ListWire, NoticePage, Box>(routes.list, {
  input: (box) => ({
    query: {
      [box === 'unread' ? 'unread_only' : 'read_only']: 'true',
      limit: LIST_LIMIT,
      page: 1,
    },
  }),
  select: (r) => {
    const rows = (Array.isArray(r?.data) ? r.data : []).map(notificationRow);
    const total = typeof r?.pagination?.total === 'number' ? r.pagination.total : rows.length;
    return { rows, total: Math.max(total, rows.length) };
  },
});

/** One box of the inbox, newest first. `data` is undefined while loading. */
export function useNotices(box: Box) {
  return listQ.use(box);
}

/** How many notices are unread now (the Inbox tab's count). */
export function useUnreadCount(): number | undefined {
  return useNotices('unread').data?.total;
}

/** The lock of a mark-read: core holds one per notice while its outcome is unknown, across mounts, tabs of the
 * page and realm switches, until a fresh list proves it (markReadProves) or the person dismisses it. */
export const READ_LOCK = 'notifications.read';
const markReadM = defineMutation<{ id: string }>(routes.markRead, {
  input: (v) => ({ params: { id: v.id } }),
  reads: [listQ],
  lock: READ_LOCK,
  lockKey: (v) => ({ id: v.id }),
  proves: markReadProves,
});

/** The notices whose mark-read may have gone through (this account), oldest first. */
export function usePendingReads(): readonly string[] {
  useChangesVersion();
  return heldChanges(READ_LOCK)
    .map((h) => (h.identity as { id?: unknown } | undefined)?.id)
    .filter((id): id is string => typeof id === 'string');
}
/** The hold of each notice whose mark-read may have gone through, as shown now (core's incarnation token, never
 * displayed): a Forget it passes the one shown, so it frees exactly that send. A notice whose hold carries no token
 * is left out: it is shown as held but offers no Forget (nothing to name it by). */
export function useReadHolds(): ReadonlyMap<string, string> {
  useChangesVersion();
  const out = new Map<string, string>();
  for (const h of heldChanges(READ_LOCK)) {
    const id = (h.identity as { id?: unknown } | undefined)?.id;
    if (typeof id === 'string' && h.hold) out.set(id, h.hold);
  }
  return out;
}
/** Mark all read's lock: one hold while its outcome is unknown, until a fresh list proves it (markAllProves)
 * or the person forgets it. Its identity is the unread ids the page held at the press (ids, never a secret). */
export const READ_ALL_LOCK = 'notifications.readAll';
const markAllM = defineMutation<{ ids: readonly string[] | null }>(routes.markAllRead, {
  input: () => ({}),
  reads: [listQ],
  lock: READ_ALL_LOCK,
  lockKey: () => ({}),
  identity: (v) => ({ ids: v.ids }),
  proves: markAllProves,
});

/** True while a Mark all read of this account may have gone through (across mounts). */
export function usePendingReadAll(): boolean {
  useChangesVersion();
  return heldChanges(READ_ALL_LOCK).length > 0;
}

/** The holds of a Mark all read that may have gone through, as shown now (see useReadHolds): none, no Forget. */
export function useReadAllHolds(): readonly string[] {
  useChangesVersion();
  return heldChanges(READ_ALL_LOCK).flatMap((h) => (h.hold ? [h.hold] : []));
}

const kindOf = (o: string): OutcomeKind => (o === 'done' || o === 'pending' || o === 'failed' || o === 'not_sent' || o === 'stale' ? o : 'failed');

export interface ChangeHook<A extends unknown[]> {
  run: (...args: A) => Promise<Change>;
  running: boolean;
  /** core's outcome of the last run ('idle' | 'running' | 'read' | a kind). */
  outcome: RunOutcome;
  /** After a pending outcome: re-read the shown boxes. True only when a fresh list proved the change (logic.ts). */
  readBack: () => Promise<boolean>;
}

/** Mark one notice read (one request per press, never resent). */
export function useMarkRead(): ChangeHook<[id: string]> & { forget: (shown: { id: string; hold: string }) => Promise<boolean> } {
  const m = markReadM.use();
  const run = useCallback(
    async (id: string): Promise<Change> => {
      const r = await m.run({ id });
      if (r.outcome === 'done') noteNotificationsRead(1);
      return {
        outcome: kindOf(r.outcome),
        ...(r.error?.code && { code: r.error.code }),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- m.run is stable per mutation
    [m.run],
  );
  return {
    run,
    running: m.running,
    outcome: m.outcome,
    readBack: () => markReadM.readBack(),
    // The hold that was shown frees exactly that send; false when it no longer holds the lock (freed, sent again).
    forget: (shown) => markReadM.dismiss({ id: shown.id }, shown.hold),
  };
}

/** Mark every notice read. The unread ids shown at the press go with the hold, so a read can prove it. */
export function useMarkAllRead(): ChangeHook<[]> & { forget: (holds: readonly string[]) => Promise<boolean> } {
  const m = markAllM.use();
  const unread = useNotices('unread').data;
  const idsRef = useRef<readonly string[] | null>(null);
  // Only a whole, non-empty box names what the press covers; otherwise no list (markAllProves).
  idsRef.current = unread && unread.rows.length > 0 && unread.rows.length >= unread.total ? unread.rows.map((n) => n.id) : null;
  const run = useCallback(
    async (): Promise<Change> => {
      const r = await m.run({ ids: idsRef.current });
      if (r.outcome === 'done') noteAllNotificationsRead();
      return {
        outcome: kindOf(r.outcome),
        ...(r.error?.code && { code: r.error.code }),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- m.run is stable per mutation
    [m.run],
  );
  return {
    run,
    running: m.running,
    outcome: m.outcome,
    readBack: () => markAllM.readBack(),
    // Each hold that was shown; true when any of them freed its send.
    forget: async (holds) => {
      let any = false;
      for (const hold of holds) any = (await markAllM.dismiss({ ids: null }, hold)) || any;
      return any;
    },
  };
}

/** The shown account's id: the key of this browser's per-account choices. */
export function useAccountId(): { data: { id: string } | undefined } {
  const account = useCore().account;
  return { data: account ? { id: account } : undefined };
}

// BRIDGE (fixtures only, by nature): a browser the fixtures pretend to run in, for hub:dev and shots. The real
// page reads the real browser; this key is answered from the same fixture states (see fixtures.ts).
// Fixture build only: the ship build (__HUB_FIXTURES__ false) holds no fixture module. The hooks below call it only
// in a fixture build (a build constant, so the hook order never changes within one build); live, its answer was
// never used (fixture queries fail at once there: no fixture loaders).
const source = __HUB_FIXTURES__ ? pageFixtures('notifications')! : null;

/** A browser the fixtures pretend to run in (hub:dev and shots only; the real page reads the real one). */
export interface BrowserOverride {
  env: BrowserEnv;
  alerts: 'on' | 'off' | null;
  broken: boolean;
}

export function useBrowserOverride(): {
  loading: boolean;
  override: BrowserOverride | null;
} {
  // Live there is no override (the fixture read failed at once there): not loading, none.
  if (!__HUB_FIXTURES__) return { loading: false, override: null };
  const q = source!.useQuery<BrowserOverride>('browser');
  return { loading: q.isPending && !q.isError, override: q.data ?? null };
}
