// Knowledge → Memory reads and changes, on core. Everything follows the top bar's computer and realm
// and names that realm on every request: memory is kept per realm (Global apart, never a union), so with All realms nothing
// is read. Global is a store of its own that the top bar cannot choose: the page asks for it (?realm=global) and every
// request then names 'global'. An edit, a delete and the on/off switch are filed under the store they name
// (explicitRealm: Global's under Global, whatever the top bar shows) and work in Global too. Changes are sent once and
// never resent (C9): a lost answer is held under its lock until a fresh read proves it (an edit: the record, or for a
// content or type edit its successor (a new id whose parent is the edited record), read back showing every value sent;
// on/off: the status read shows it; a delete: the record is gone from a realm the agent still serves) or the person stops
// waiting. The source id 'ai-memory' is the held change's sender name.
import { alive, api, capture, coreSource, defineRoute, heldChanges, isRealmId, isRealmOrGlobal, sendingChanges, useChangesVersion, useCurrentComputer, useRealms, useRunner, useShownRealm, type HeldChange, type HubError, type SourceTable, type Target, useCore } from '@core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAiRealm } from '../../aiRealm';
import {
  createAnswered, createCandidates, editAnswered, graphPageOf, hitsOf, searchKindOf, manyAnswered, createReplyOf, dataHostOf, editProved, editReplyOf, enabledProved, itemPageOf, successorRows,
  projectsOf, recordOf, statusOf, type CreateFields, type CreateIdentity, type DataHost, type EditFields, type EditIdentity, type GraphPage, type ItemPage, type Kind, type MemoryRecord, type MemoryStatus, type ProjectRow,
} from './logic';

/** The memory requests (agent routes, realm named on every call; core refuses All realms unsent). */
export const memoryRoutes = {
  host: defineRoute({ method: 'GET', path: '/memory/datahost', scope: 'agent', realm: 'realm' }),
  status: defineRoute({ method: 'GET', path: '/memory/status', scope: 'agent', realm: 'realm', query: ['project'] }),
  projects: defineRoute({ method: 'GET', path: '/memory/projects', scope: 'agent', realm: 'realm', query: ['page', 'limit'] }),
  items: defineRoute({ method: 'GET', path: '/memory/items', scope: 'agent', realm: 'realm', query: ['project', 'kind', 'query', 'page', 'limit'] }),
  item: defineRoute({ method: 'GET', path: '/memory/items/:id', scope: 'agent', realm: 'realm', query: ['project', 'kind'] }),
  /** The refusals that say nothing was written (every other failed or lost answer may have gone through, and is held):
   *  realm_mismatch (409), expect_realm is not the realm the request acts in; memory_edit_conflict (409), another edit
   *  changed or replaced the version first; store_unavailable (503), the store could not be opened (an edit is one
   *  write: one that may have landed answers 502 memory_outcome_unknown instead, memAdminWriteErrReply); service_unavailable (503), the realm's memory is not
   *  connected on the agent (its memory_realm_cold, refused before any write). */
  edit: defineRoute({
    method: 'PATCH', path: '/memory/items/:id', scope: 'agent', realm: 'realm',
    body: ['project', 'kind', 'content', 'type', 'strength', 'concepts', 'files', 'tier', 'ttl_days', 'context', 'confidence', 'expect_realm'],
    refuses: ['realm_mismatch', 'memory_edit_conflict', 'store_unavailable', 'service_unavailable'],
  }),
  /** A new memory (saveMemoryItem). It takes no idempotency key and every save makes a new record, so a lost answer is
   *  never resent. Refusals that say nothing was written: realm_mismatch, store_unavailable (the store could not be
   *  opened; one that may have written answers 502 memory_outcome_unknown), service_unavailable (memory_realm_cold). */
  create: defineRoute({
    method: 'POST', path: '/memory/items', scope: 'agent', realm: 'realm',
    body: ['project', 'content', 'type', 'concepts', 'files', 'ttl_days', 'strength', 'expect_realm'],
    refuses: ['realm_mismatch', 'store_unavailable', 'service_unavailable'],
  }),
  /** realm_mismatch and service_unavailable as edit. NOT store_unavailable: a lesson delete works in chunks of 500 ids and
   *  can answer 503 store_unavailable (with deleted and incomplete) after an earlier chunk committed
   *  (the agent's own answer), so on this route it may have gone through and is held like any other 5xx. */
  remove: defineRoute({
    method: 'DELETE', path: '/memory/items', scope: 'agent', realm: 'realm', deleteBody: true,
    body: ['ids', 'name', 'project', 'kind', 'expect_realm'], refuses: ['realm_mismatch', 'service_unavailable'],
  }),
  /** Always sent with the realm: without one the agent writes Global and its active realm. service_unavailable: the named
   *  realm's memory is not connected, refused before the setting is written. */
  enabled: defineRoute({ method: 'PUT', path: '/memory/enabled', scope: 'agent', realm: 'realm', body: ['enabled'], refuses: ['service_unavailable'] }),
  /** The agent's ranked search (searchMemory: BM25, vector and graph fused). A POST that writes nothing (the read is
   *  no-touch: it never changes future ranking), so it is called directly (useRankedSearch), never as a change. */
  search: defineRoute({ method: 'POST', path: '/memory/search', scope: 'agent', realm: 'realm', body: ['project', 'query', 'limit', 'kinds'] }),
  /** A project's relation graph (getMemoryGraph): one read of entities by link count and the relations between them. */
  graph: defineRoute({ method: 'GET', path: '/memory/graph', scope: 'agent', realm: 'realm', query: ['project', 'node_type', 'limit'] }),
} as const;

export const MEMORY_EDIT_LOCK = 'agent.memory_edit';
export const MEMORY_CREATE_LOCK = 'agent.memory_create';
/** Every delete of the page (one record, or several of a store) shares this lock and one key per store (computer,
 *  project, kind): core admission (changes.ts admit) refuses a second delete of a store, from any tab, while one is out
 *  or held. The accepted cost: deletes of one store run one at a time. */
export const MEMORY_DELETE_LOCK = 'agent.memory_delete';
export const MEMORY_ENABLED_LOCK = 'agent.memory_enabled';
const SOURCE = 'ai-memory';
export const PAGE_SIZE = 50;
/** How long typing pauses before a store search is sent (at least 400 ms: each search is a fused read on the agent). */
export const SEARCH_PAUSE_MS = 400;

/** Where memory is read: the computer and one realm ('global' or a 24-hex id). */
export interface MemoryAt { target: Target; realm: string }
export interface ProjectAt extends MemoryAt { project: string }
export interface ItemsQuery extends ProjectAt { kind: Kind; q: string; page: number }
/** A ranked search of one store (memories or observations) of one project. */
export interface SearchQuery extends ProjectAt { kind: Kind; q: string }
export interface ItemAt extends ProjectAt { kind: Kind; id: string }
export interface EditVars extends ItemAt { fields: EditFields }
/** A record's delete. `perRecord`: the held delete an older build sent under a key per record (its identity carries no
 *  `key: 'store'`): set only when Check again or Stop tracking names that hold, so core finds it under its own key. A
 *  new delete is never sent with it. */
export type DeleteVars = ItemAt & { perRecord?: boolean };
/** A delete of several records of one store (never slots): their ids, in the order the list showed them. */
export interface DeleteManyVars extends ProjectAt { kind: Kind; ids: string[] }
/** A create: the fields, the ids of the project's memories the page had read when it was sent, and the Hub's clock at
 *  Save (CreateIdentity; neither is sent). */
export interface CreateVars extends ProjectAt { fields: CreateFields; before: string[]; sentAt: number }
export interface EnableVars extends MemoryAt { enabled: boolean }

const computerOf = (a: MemoryAt) => a.target.container.id;

export const memoryTable: SourceTable = {
  reads: {
    'memory.host': {
      route: memoryRoutes.host,
      input: (p: MemoryAt) => ({ target: p.target, realm: p.realm }),
      select: (raw) => dataHostOf(raw),
    },
    'memory.status': {
      route: memoryRoutes.status,
      input: (p: MemoryAt & { project?: string }) => ({ target: p.target, realm: p.realm, query: p.project ? { project: p.project } : {} }),
      select: (raw, p: MemoryAt) => statusOf(raw, p.realm),
    },
    'memory.projects': {
      route: memoryRoutes.projects,
      input: (p: MemoryAt) => ({ target: p.target, realm: p.realm, query: { limit: '0' } }),
      select: (raw) => projectsOf(raw),
    },
    'memory.items': {
      route: memoryRoutes.items,
      // Called with no params while the read is off (no query yet): it builds nothing.
      input: (p?: ItemsQuery) => (!p ? {} : {
        target: p.target, realm: p.realm,
        // ?query= is only taken with the memory store (the agent refuses it with another kind).
        query: { project: p.project, kind: p.kind, page: String(p.page), limit: String(PAGE_SIZE), ...(p.kind === 'memory' && p.q ? { query: p.q } : {}) },
      }),
      select: (raw, p: ItemsQuery) => itemPageOf(raw, p.kind),
    },
    'memory.graph': {
      route: memoryRoutes.graph,
      // One read: the first ?limit= of the agent's entities by link count (most first).
      input: (p?: GraphAt) => (!p ? {} : {
        target: p.target, realm: p.realm,
        query: { project: p.project, limit: String(p.limit), ...(p.type ? { node_type: p.type } : {}) },
      }),
      select: (raw) => graphPageOf(raw),
    },
    'memory.item': {
      route: memoryRoutes.item,
      input: (p?: ItemAt) => (!p ? {} : { target: p.target, realm: p.realm, params: { id: p.id }, query: { project: p.project, kind: p.kind } }),
      // The read's realm and project ride with the record: an edit's proof reads only its own.
      select: (raw, p: ItemAt) => ({ ...recordOf(raw, p.kind), at: { realm: p.realm, project: p.project } }),
    },
  },
  changes: {
    edit: {
      route: memoryRoutes.edit,
      input: (v: EditVars) => ({
        target: v.target, realm: v.realm, params: { id: v.id },
        body: { project: v.project, kind: v.kind, ...v.fields, expect_realm: v.realm },
      }),
      reads: ['memory.item', 'memory.items'],
      explicitRealm: true,
      lock: MEMORY_EDIT_LOCK,
      lockKey: (v: EditVars) => ({ computer: computerOf(v), project: v.project, kind: v.kind, id: v.id }),
      identity: (v: EditVars): EditIdentity => ({ computer: computerOf(v), realm: v.realm, project: v.project, kind: v.kind, id: v.id, ...v.fields }),
      // The record's id now: a content, type, concepts or files edit answers a new one (the edited record stays as history).
      select: (raw) => editReplyOf(raw),
      // A 2xx that does not name the record (status ok and its id, a slot's name) is no proof it ran: held.
      settles: (raw, v: EditVars) => editAnswered(raw, v.kind),
      proves: editProved,
    },
    create: {
      route: memoryRoutes.create,
      input: (v: CreateVars) => ({ target: v.target, realm: v.realm, body: { project: v.project, ...v.fields, expect_realm: v.realm } }),
      reads: ['memory.item', 'memory.items', 'memory.projects', 'memory.status'],
      explicitRealm: true,
      // One create held per project, until the person's Stop tracking: no read proves a create (no proves). The page
      // shows a record that may be it (createShownBy) and offers it to open.
      lock: MEMORY_CREATE_LOCK,
      lockKey: (v: CreateVars) => ({ computer: computerOf(v), project: v.project }),
      identity: (v: CreateVars): CreateIdentity => ({ computer: computerOf(v), realm: v.realm, project: v.project, ...v.fields, before: v.before, sentAt: v.sentAt }),
      select: (raw) => createReplyOf(raw),
      // A 2xx without status ok and the new id is no proof it ran (nor that it did not): held.
      settles: (raw) => createAnswered(raw),
    },
    remove: {
      route: memoryRoutes.remove,
      input: (v: DeleteVars) => ({
        target: v.target, realm: v.realm,
        body: { ...(v.kind === 'slot' ? { name: v.id } : { ids: [v.id] }), project: v.project, kind: v.kind, expect_realm: v.realm },
      }),
      reads: ['memory.item', 'memory.items', 'memory.projects', 'memory.status'],
      explicitRealm: true,
      lock: MEMORY_DELETE_LOCK,
      // The store's key, not the record's: shared with removeMany, so core refuses any second delete of the store. A
      // hold an older build sent under the record's key is checked and stopped under that key (perRecord).
      lockKey: (v: DeleteVars) => (v.perRecord ? { computer: computerOf(v), project: v.project, kind: v.kind, id: v.id } : { computer: computerOf(v), project: v.project, kind: v.kind }),
      // `key: 'store'` marks a delete sent under the store's key; an older build's hold has none.
      identity: (v: DeleteVars) => ({ computer: computerOf(v), realm: v.realm, project: v.project, kind: v.kind, id: v.id, ...(v.perRecord ? {} : { key: 'store' }) }),
      select: () => undefined,
      // No read of these lists proves a delete (a page can miss a row). Check again proves it with the record read
      // (useDeleteProof); until then it stays held.
    },
    removeMany: {
      route: memoryRoutes.remove,
      input: (v: DeleteManyVars) => ({ target: v.target, realm: v.realm, body: { ids: v.ids, project: v.project, kind: v.kind, expect_realm: v.realm } }),
      reads: ['memory.item', 'memory.items', 'memory.projects', 'memory.status'],
      explicitRealm: true,
      lock: MEMORY_DELETE_LOCK,
      // remove's key (one per store): one delete of a store at a time, a record's or several, whichever tab sends it.
      lockKey: (v: DeleteManyVars) => ({ computer: computerOf(v), project: v.project, kind: v.kind }),
      identity: (v: DeleteManyVars) => ({ computer: computerOf(v), realm: v.realm, project: v.project, kind: v.kind, ids: v.ids }),
      select: () => undefined,
      // A 2xx without status ok and a deleted count is held. No list read proves it: Check again reads every record
      // (useDeleteMany's records) and only all of them gone frees it (manyProved).
      settles: (raw) => manyAnswered(raw),
    },
    enable: {
      route: memoryRoutes.enabled,
      input: (v: EnableVars) => ({ target: v.target, realm: v.realm, body: { enabled: v.enabled } }),
      reads: ['memory.status'],
      explicitRealm: true,
      lock: MEMORY_ENABLED_LOCK,
      lockKey: (v: EnableVars) => ({ computer: computerOf(v), realm: v.realm }),
      identity: (v: EnableVars) => ({ computer: computerOf(v), realm: v.realm, enabled: v.enabled }),
      select: () => undefined,
      proves: enabledProved,
    },
  },
};

const source = coreSource(SOURCE, memoryTable);

/** Where memory is read now: the top bar's computer and, with `global`, the Global store, else the page's realm (the top
 *  bar's, or under All realms the computer's own one realm, aiRealm.ts); null with no computer, no one realm without
 *  `global`, or `global` in a token session pinned to one realm (useGlobalOpen). */
export function useMemoryAt(global = false): MemoryAt | null {
  const target = useCurrentComputer();
  const open = useGlobalOpen();
  const { realm: page } = useAiRealm();
  const realm = global ? (open ? 'global' : '') : isRealmId(page) ? page : '';
  return useMemo(() => (target && isRealmOrGlobal(realm) ? { target, realm } : null), [target, realm]);
}

/** Whether this session can read Global. A token session pinned to one realm cannot: its every agent call carries that
 *  realm whatever the page asks (core/kit.ts agentRealm), so its "Global" would read, and change, that realm. One pinned
 *  to every realm (an access key with no realm limit) sends the realm each call names, as an account session does. */
export const useGlobalOpen = (): boolean => {
  const pinned = useRealms().pinned;
  return pinned === null || pinned === 'all';
};

/** Whether the page sends edits, deletes and the on/off switch to this store: in a realm and in Global alike. Each names
 *  its store (explicitRealm), so core files its lock and finds its held outcome under that store, never the top bar's
 *  realm (core/query.ts explicitRealmRefusal). A token session never opens Global (useMemoryAt), and core refuses one
 *  naming a realm other than its pin unsent. */
export const writable = (at: MemoryAt): boolean => isRealmOrGlobal(at.realm);

/** Whether "Manage memory" (tidy, erase, write pending, use this computer) is offered. Not in Global: those changes are
 *  useLockedChange ones, filed under the top bar's realm (core/locked.ts changeScope), so a lost Global answer could be
 *  sent again after a realm switch or lose its Check again. */
export const manageable = (at: MemoryAt): boolean => at.realm !== 'global';

export const useDataHost = (at: MemoryAt) => source.useQuery<DataHost, MemoryAt>('memory.host', at);
export const useMemoryStatus = (at: MemoryAt, project?: string) =>
  source.useQuery<MemoryStatus, MemoryAt & { project?: string }>('memory.status', project ? { ...at, project } : at);
export const useProjects = (at: MemoryAt, enabled: boolean) => source.useQuery<ProjectRow[], MemoryAt>('memory.projects', at, { enabled });
/** One read of a project's relation graph, all entity types or one (`type`): the `limit` most-linked entities and the
 *  relations between them. GRAPH_CHUNK is the agent's default and the step of Read more; GRAPH_MAX is the agent's cap. */
export interface GraphAt extends MemoryAt { project: string; type: string; limit: number }
export const GRAPH_CHUNK = 500;
export const GRAPH_MAX = 5000;
export const useGraph = (p: GraphAt | null) => source.useQuery<GraphPage, GraphAt | undefined>('memory.graph', p ?? undefined, { enabled: p !== null });
export const useItems = (q: ItemsQuery | null, enabled: boolean) =>
  source.useQuery<ItemPage, ItemsQuery | undefined>('memory.items', q ?? undefined, { enabled: enabled && q !== null });
export const useRecord = (p: ItemAt | null) =>
  source.useQuery<MemoryRecord & { at: { realm: string; project: string } }, ItemAt | undefined>('memory.item', p ?? undefined, { enabled: p !== null });

/** A failed search as the page shows it: a read that failed (with the answer's status, code and trace id), never a
 *  change whose outcome is unknown. The search writes nothing, so a lost answer or a 5xx is only a failed search. */
export function searchErrorOf(e: unknown): Record<string, unknown> {
  const x = (e && typeof e === 'object' ? e : {}) as Partial<HubError> & { traceId?: unknown };
  const notSent = x.notSent === true || x.kind === 'not_sent';
  return {
    outcome: notSent ? 'not_sent' : 'failed',
    ...(typeof x.status === 'number' ? { status: x.status } : {}),
    ...(typeof x.code === 'string' ? { code: x.code } : {}),
    ...(typeof x.traceId === 'string' ? { traceId: x.traceId } : {}),
  };
}

/** One search's state. `search`: the search it answers (computer, realm, project, store, text, core generation);
 *  `send`: which send of it (a change that moved, or a refetch, sends the same search again); `done`: that send ended.
 *  The rows of the same search stay while it is sent again; another search starts with none. */
interface SearchState { search: string; send: string; done: boolean; data?: ItemPage; error?: Record<string, unknown> }

/** The ranked search of a store (searchMemory), for a query with text in a store the agent indexes; null reads nothing.
 *  Sent again whenever the query, project, store, realm, computer or core context changes, a change moves, and on
 *  refetch. Only the answer to the newest send of a live context is kept: an older one, or one whose context ended, is
 *  dropped. Nothing is cached. It is a read: its outcome is never held, and core never announces it as a change that
 *  may have gone through (pendingShown, also after its context ended; the page shows its own failure and Retry). */
export function useRankedSearch(q: SearchQuery | null) {
  const core = useCore();
  // A change that moved (an edit, a delete or a create sent, ended or dropped) may have changed what the search finds:
  // it is sent again, the table keeping this search's rows on screen while it loads.
  const moved = useChangesVersion();
  const [tick, setTick] = useState(0);
  const search = q ? JSON.stringify([computerOf(q), q.realm, q.project, q.kind, q.q, core.gen]) : '';
  const send = `${search}\u0000${moved}\u0000${tick}`;
  const [state, setState] = useState<SearchState>({ search: '', send: '', done: false });
  useEffect(() => {
    if (!q) return undefined;
    const ctx = capture(q.target);
    // A search is no change: core keeps quiet about its answer whenever it comes (core/api.ts notifyPending).
    ctx.pendingShown = true;
    const ctl = new AbortController();
    let live = true;
    setState((s) => ({ search, send, done: false, data: s.search === search ? s.data : undefined }));
    const end = (next: Pick<SearchState, 'data' | 'error'>) => {
      if (live && alive(ctx)) setState((s) => ({ search, send, done: true, data: next.data ?? (next.error && s.search === search ? s.data : undefined), error: next.error }));
    };
    api(memoryRoutes.search, {
      target: q.target, realm: q.realm, ctx, recovers: true, signal: ctl.signal,
      body: { project: q.project, query: q.q, limit: PAGE_SIZE, kinds: [searchKindOf(q.kind)] },
    }).then(
      (raw) => {
        let data: ItemPage;
        try {
          data = hitsOf(raw, q.kind);
        } catch {
          end({ error: { outcome: 'failed', code: 'BAD_JSON' } });
          return;
        }
        end({ data });
      },
      (e: unknown) => end({ error: searchErrorOf(e) }),
    );
    return () => {
      live = false;
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q is read through search, which holds every field it sends
  }, [send]);
  const mine = q !== null && state.search === search;
  const now = mine && state.send === send && state.done;
  return {
    /** This search's rows: the newest answer, kept while it is sent again; another search's never. */
    data: mine ? state.data : undefined,
    error: now ? state.error ?? null : null,
    isPending: q !== null && !now,
    refetch: useCallback(() => setTick((n) => n + 1), []),
  };
}

type RecordAt = MemoryRecord & { at: { realm: string; project: string } };

/** While an edit of a superseded memory is held: the reads of its possible successors (the newest memories of the
 *  project at version+1, at most 3). Their answers join the edit's read-back, which proves the edit only by a record
 *  whose parent is the edited one showing every value sent (editProved). */
export function useSuccessors(at: MemoryAt, project: string, rec0: MemoryRecord | undefined, on: boolean) {
  const look = on && rec0?.kind === 'memory' && rec0.latest === false;
  const list = useItems({ ...at, project, kind: 'memory', q: '', page: 1 }, look);
  const rows = look ? successorRows(list.data?.items ?? [], rec0?.version ?? null) : [];
  const params = rows.map((r): ItemAt => ({ ...at, project, kind: 'memory', id: r.id }));
  return source.useQueries<RecordAt, ItemAt>('memory.item', params, { enabled: look });
}

/** While a create is held: the reads of the project's newest first versions of its type that were not read before it
 *  was sent (createCandidates). One showing every value sent (createShownBy) is offered to open; it ends nothing. */
export function useCreateCandidates(at: MemoryAt, project: string, held: Record<string, unknown> | null) {
  const look = held !== null && typeof held.type === 'string' && Array.isArray(held.before);
  const list = useItems({ ...at, project, kind: 'memory', q: '', page: 1 }, look);
  const rows = look ? createCandidates(list.data?.items ?? [], held.type as string, held.before as string[]) : [];
  const params = rows.map((r): ItemAt => ({ ...at, project, kind: 'memory', id: r.id }));
  return { list, records: source.useQueries<RecordAt, ItemAt>('memory.item', params, { enabled: look }) };
}

/** A new memory in this project: sent once, its unknown outcome held (this project's only) until a read shows it. */
export function useCreate(at: MemoryAt, project: string) {
  const m = source.useMutation<{ id: string }, CreateVars>('create');
  const pick = useCallback(
    (i: Record<string, unknown>) => i.computer === computerOf(at) && i.realm === at.realm && i.project === project,
    [at, project],
  );
  const heldBy = useCallback((h: HeldChange) => source.heldBy('create', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): CreateVars => ({
      ...at, project,
      fields: {
        content: typeof i.content === 'string' ? i.content : '',
        type: typeof i.type === 'string' ? i.type : '',
        strength: typeof i.strength === 'number' ? i.strength : 0,
        concepts: strList(i.concepts) ? i.concepts : [],
        files: strList(i.files) ? i.files : [],
        ...(typeof i.ttl_days === 'number' ? { ttl_days: i.ttl_days } : {}),
      },
      before: strList(i.before) ? i.before : [],
      sentAt: typeof i.sentAt === 'number' ? i.sentAt : NaN,
    }),
    [at, project],
  );
  return useRunner<CreateVars>(m, { lock: MEMORY_CREATE_LOCK, pick, vars, heldBy });
}

const pickStore = (at: MemoryAt, project: string, kind: Kind) => (i: Record<string, unknown>) =>
  i.computer === computerOf(at) && i.realm === at.realm && i.project === project && i.kind === kind;

const pickItem = (at: MemoryAt, project: string, kind: Kind, id: string) => (i: Record<string, unknown>) =>
  i.computer === computerOf(at) && i.realm === at.realm && i.project === project && i.kind === kind && i.id === id;

/** One record's edit: sent once, its unknown outcome held (this record's only). */
export function useEdit(at: MemoryAt, project: string, kind: Kind, id: string) {
  const m = source.useMutation<{ id: string }, EditVars>('edit');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the record's identity decides
  const pick = useCallback(pickItem(at, project, kind, id), [at, project, kind, id]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('edit', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): EditVars => ({
      ...at, project, kind, id,
      fields: editFieldsOf(i),
    }),
    [at, project, kind, id],
  );
  return useRunner<EditVars>(m, { lock: MEMORY_EDIT_LOCK, pick, vars, heldBy });
}

const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
/** The fields of a held edit's identity, each only when it holds one of the right type (what was sent). */
function editFieldsOf(i: Record<string, unknown>): EditFields {
  return {
    ...(typeof i.content === 'string' ? { content: i.content } : {}),
    ...(typeof i.type === 'string' ? { type: i.type } : {}),
    ...(typeof i.strength === 'number' ? { strength: i.strength } : {}),
    ...(strList(i.concepts) ? { concepts: i.concepts } : {}),
    ...(strList(i.files) ? { files: i.files } : {}),
    ...(typeof i.tier === 'string' ? { tier: i.tier } : {}),
    ...(typeof i.ttl_days === 'number' ? { ttl_days: i.ttl_days } : {}),
    ...(typeof i.context === 'string' ? { context: i.context } : {}),
    ...(typeof i.confidence === 'number' ? { confidence: i.confidence } : {}),
  };
}

/** One record's delete: sent once, its unknown outcome held until the record read proves it (prove) or a dismiss. */
export function useDelete(at: MemoryAt, project: string, kind: Kind, id: string) {
  const m = source.useMutation<unknown, DeleteVars>('remove');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the record's identity decides
  const pick = useCallback(pickItem(at, project, kind, id), [at, project, kind, id]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('remove', h), []);
  // The held delete's own key: an older build's (no `key: 'store'`) was sent under the record's key.
  const vars = useCallback((i: Record<string, unknown>): DeleteVars => ({ ...at, project, kind, id, ...(i.key === 'store' ? {} : { perRecord: true }) }), [at, project, kind, id]);
  return useRunner<DeleteVars>(m, { lock: MEMORY_DELETE_LOCK, pick, vars, heldBy });
}

/** A delete of several records of one store: sent once, its unknown outcome held (this store's only) until every
 *  record read proves it (prove with manyProved) or the person stops tracking it. `records` reads the held ids only
 *  while it is held. */
export function useDeleteMany(at: MemoryAt, project: string, kind: Kind) {
  const m = source.useMutation<unknown, DeleteManyVars>('removeMany');
  // A delete of several (its identity names ids; a record's names an id) of this store.
  const pick = useCallback((i: Record<string, unknown>) => pickStore(at, project, kind)(i) && strList(i.ids), [at, project, kind]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('removeMany', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): DeleteManyVars => ({ ...at, project, kind, ids: strList(i.ids) ? i.ids : [] }),
    [at, project, kind],
  );
  const runner = useRunner<DeleteManyVars>(m, { lock: MEMORY_DELETE_LOCK, pick, vars, heldBy });
  const held = runner.outcome?.kind === 'pending' ? runner.held : null;
  const ids = held && strList(held.ids) ? held.ids : [];
  const records = source.useQueries<RecordAt, ItemAt>('memory.item', ids.map((id): ItemAt => ({ ...at, project, kind, id })), { enabled: ids.length > 0 });
  return { runner, ids, records };
}

/** One store of one project (computer, realm, project, kind) as a string: what a question or an answer shown in the
 *  list belongs to, so one asked or answered in a store is never confirmed or shown in another. */
export const storeKey = (at: MemoryAt, project: string, kind: Kind): string => JSON.stringify([computerOf(at), at.realm, project, kind]);

/** Whether a delete of this store is out now (any: this tab's or another tab's, as core's storage read shows it; one
 *  core cannot attribute counts, since it may be one; this page's own is busy then anyway) or another one than `mine`
 *  is held (`mine`: the held change this place shows itself). Core admission already refuses it
 *  (one lock, one key per store); this read is what the page shows and the backstop for a hold sent by an older build
 *  under a key per record (same lock and identity, another key), which admission does not see. */
function useOtherDelete(at: MemoryAt, project: string, kind: Kind, mine: (i: Record<string, unknown>) => boolean): boolean {
  const version = useChangesVersion();
  const realm = useShownRealm();
  return useMemo(() => {
    const here = pickStore(at, project, kind);
    return heldChanges(MEMORY_DELETE_LOCK, { realm }).some((h) => { const i = (h.identity ?? {}) as Record<string, unknown>; return here(i) && !mine(i); })
      || sendingChanges(MEMORY_DELETE_LOCK, { realm }).some((x) => !x.attributed || here((x.identity ?? {}) as Record<string, unknown>));
  // `version` re-reads core's lists when they move (useChangesVersion), as runner.ts does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, project, kind, mine, version, realm]);
}

/** Whether a delete of this store other than this record's own is out or held: this record's Delete waits until it
 *  is answered, proved or ended (a delete of several may name it; deletes of one store run one at a time). */
export function useOtherDeleteThan(at: MemoryAt, project: string, kind: Kind, id: string): boolean {
  const mine = useCallback((i: Record<string, unknown>) => i.id === id && !strList(i.ids), [id]);
  return useOtherDelete(at, project, kind, mine);
}

/** Whether a delete of one record of this store is out or held: Delete selected waits until it is answered, proved
 *  or ended (a delete of several of the store is Delete selected's own held change). */
export function useRecordDeleteIn(at: MemoryAt, project: string, kind: Kind): boolean {
  const mine = useCallback((i: Record<string, unknown>) => strList(i.ids), []);
  return useOtherDelete(at, project, kind, mine);
}

/** The realm's memory on/off: sent once with the realm, its unknown outcome held until the status shows it. */
export function useEnable(at: MemoryAt) {
  const m = source.useMutation<unknown, EnableVars>('enable');
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computerOf(at) && i.realm === at.realm, [at]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('enable', h), []);
  const vars = useCallback((i: Record<string, unknown>): EnableVars => ({ ...at, enabled: i.enabled === true }), [at]);
  return useRunner<EnableVars>(m, { lock: MEMORY_ENABLED_LOCK, pick, vars, heldBy });
}
