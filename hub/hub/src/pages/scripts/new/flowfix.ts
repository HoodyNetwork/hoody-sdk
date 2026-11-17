// Test fixtures of the New script flow (vitest only): computers of the overview, the shown computer and the address
// check, as the page's data module would give them.
import { dropDraftRecord, dropScriptAsks, fixtureWorld, readDraftRecords, readScriptAsks } from '@core';
import { useMemo, useSyncExternalStore } from 'react';
import { toItems } from '../logic';

/** The page's store through core only: every stored ask and draft record removed (between tests). */
export async function clearScriptStore(): Promise<void> {
  const asks = readScriptAsks();
  if (Array.isArray(asks)) await dropScriptAsks(asks);
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
}

export const ATLAS = 'c0a7150000000000000000a1';
// The world's own computers (core/world.ts), so the account's containers list names them as the overview does.
export const BOREALIS = 'c0a7150000000000000000b2';
export const CEDAR = 'c0a7150000000000000000c3';

export const comp = (id: string, name: string, handle: string, serverName: string, o: { on?: boolean; writer?: boolean; templates?: boolean; owner?: string } = {}) => ({
  id, name, handle, state: o.on === false ? 'off' : 'on', serverName, realmIds: [], origin: `https://${name}-exec-1.example`, err: null,
  caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
  agent: { templates: o.templates ?? true, writer: o.writer ?? true, writerOwner: 'owner' in o ? o.owner : 'fp1', guardedDelete: true }, agentRealm: 'global', rows: [], summary: {}, instances: {}, aliases: [], deleted: [],
});

/** The shown computer the flow reads, settable by a test (the top-bar switch): setting it re-renders what reads it, as the
 *  shell's own switch does. */
const shownListeners = new Set<() => void>();
let shownId = ATLAS;
export const shown = {
  get id(): string { return shownId; },
  set id(v: string) { if (v === shownId) return; shownId = v; for (const l of [...shownListeners]) l(); },
};
const useShownId = (): string => useSyncExternalStore((l) => { shownListeners.add(l); return () => { shownListeners.delete(l); }; }, () => shownId);

/** The overview as the live agent gives it: the shown computer only (the account's other computers come from the containers list). */
export function overviewOf(computers: ReturnType<typeof comp>[]) {
  return () => {
    const id = useShownId();
    const data = useMemo(() => ({ computers: computers.filter((c) => c.id === id) as never[] }), [id]);
    const items = useMemo(() => toItems(data.computers), [data]);
    return { data, items, isPending: false, isError: false, error: null, refetch: async () => ({}) };
  };
}

/** The shown target as the shell gives it: a world computer in its own project (the containers list's), any other in p1. */
export const targetOf = (id: string) => ({ project: { id: fixtureWorld.computers.find((c) => c.id === id)?.project_id ?? 'p1' }, container: { id } });
