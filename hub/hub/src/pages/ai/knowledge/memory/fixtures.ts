// Knowledge → Memory in fixture mode (dev and shots): one store per computer and realm named in the
// request's query, Global apart. A realm's store holds the project "shop" and the realm-wide lessons and slots (key '');
// Global holds the project "notes". The fixture transport hands rules the built query without the realm core appends to
// the URL (core/transport.ts FixtureRequest), so the dev server and shots serve the realm store for every choice, Global
// included; the keying holds once the transport passes the realm.
// Reads only: the page's changes (edit, delete, on/off) are answered ok and change nothing here. The ranked search
// answers the project's memories whose title holds a word of the query, the most words first (a stand-in for the
// agent's fusion: the page reads only the order and the heads).
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { memoryRoutes } from './data';

interface Store {
  projects: Array<{ key: string; root: string; memories: number; observations: number; sessions: number; lessons: number; slots: number; updated_at?: string }>;
  memories: Record<string, Array<{ id: string; type: string; title: string; strength: number; version: number; updated_at: string }>>;
  lessons: Record<string, Array<{ ID: number; Content: string; Confidence: number; UpdatedAt: string }>>;
  slots: Record<string, Array<{ Name: string; Content: string; UpdatedAt: string }>>;
}

/** What the agent's stores hold: agent data, not page text. */
const said = { staging: 'Deploys go through staging first', nightly: 'The test DB resets nightly', markdown: 'Notes are written in Markdown' };

const SHOP = 'v1:5h0p';
/** A project with a long name, one unbroken word, holding the same graph: how the page's title line holds up on a phone. */
const LONG = 'v1:10n6';
const hasGraph = (project: string) => project === SHOP || project === LONG;
const shopNode = (ID: string, Type: string, Name: string, Degree: number) => ({ ID, Project: SHOP, Type, Name, NormalizedName: Name, Degree, LastSeenAt: '2026-10-27T08:00:00Z' });
const shopEdge = (ID: string, SourceID: string, TargetID: string, Type: string) => ({ ID, Project: SHOP, SourceID, TargetID, Type, Weight: 1 });
const shopGraph = {
  nodes: [shopNode('g1', 'file', 'deploy.sh', 3), shopNode('g2', 'tool', 'bun', 1), shopNode('g3', 'project', 'staging', 1), shopNode('g4', 'person', 'ada', 1), shopNode('g5', 'tool', 'docker', 0)],
  edges: [shopEdge('r1', 'g1', 'g2', 'uses'), shopEdge('r2', 'g1', 'g3', 'targets'), shopEdge('r3', 'g4', 'g1', 'edits')],
};

const realmStore = (): Store => ({
  projects: [
    { key: 'v1:5h0p', root: '/home/ada/projects/shop', memories: 2, observations: 0, sessions: 3, lessons: 1, slots: 0, updated_at: '2026-10-27T08:00:00Z' },
    { key: LONG, root: '/home/ada/projects/customer_portal_billing_reconciliation_service_v2', memories: 0, observations: 0, sessions: 0, lessons: 0, slots: 0, updated_at: '2026-10-20T08:00:00Z' },
    { key: '', root: '(global)', memories: 0, observations: 0, sessions: 0, lessons: 1, slots: 1 },
  ],
  memories: {
    'v1:5h0p': [
      { id: 'm1', type: 'decision', title: said.staging, strength: 8, version: 2, updated_at: '2026-10-27T08:00:00Z' },
      { id: 'm2', type: 'gotcha', title: said.nightly, strength: 3, version: 1, updated_at: '2026-10-26T08:00:00Z' },
    ],
  },
  lessons: {
    'v1:5h0p': [{ ID: 7, Content: 'Run the checkout tests before a release', Confidence: 0.8, UpdatedAt: '2026-10-25T00:00:00Z' }],
    '': [{ ID: 9, Content: 'Ask before rotating keys', Confidence: 0.9, UpdatedAt: '2026-10-24T00:00:00Z' }],
  },
  slots: { '': [{ Name: 'style', Content: 'Short sentences, plain words.', UpdatedAt: '2026-10-23T00:00:00Z' }] },
});

const globalStore = (): Store => ({
  projects: [{ key: 'v1:n0te', root: '/home/ada/notes', memories: 1, observations: 0, sessions: 1, lessons: 0, slots: 0, updated_at: '2026-10-22T08:00:00Z' }],
  memories: { 'v1:n0te': [{ id: 'g1', type: 'preference', title: said.markdown, strength: 6, version: 1, updated_at: '2026-10-22T08:00:00Z' }] },
  lessons: {},
  slots: {},
});

const page = <T,>(rows: readonly T[]) => answers.ok({ items: rows, meta: { total: rows.length, page: 1, limit: 50 } });

/** `down`: the realm's memory host is still being chosen and its store cannot be read (degraded, recoverable). */
export interface MemoryFixtureOpts {
  down?: boolean;
}

export function memoryRules(o: MemoryFixtureOpts = {}): FixtureRule[] {
  const stores = new Map<string, Store>();
  const of = (r: FixtureRequest) => {
    const realm = String(r.query.realm ?? '');
    const id = `${r.target?.container.id ?? ''}\u0000${realm}`;
    if (!stores.has(id)) stores.set(id, realm === 'global' ? globalStore() : realmStore());
    return stores.get(id)!;
  };
  return [
    reply(memoryRoutes.host, (r) => {
      const realm = String(r.query.realm ?? '');
      if (o.down) return answers.ok({ status: 'ok', datahost: { realm, state: 'electing', host: '', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_current: false, is_self: true }] } });
      return answers.ok({ status: 'ok', datahost: { realm, state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_current: true, is_self: true }] } });
    }),
    reply(memoryRoutes.status, (r) => {
      if (o.down) return answers.ok({ enabled: true, available: false, degraded: true, recoverable: true, remote: true, last_consolidated: 'never' });
      const st = of(r);
      const project = String(r.query.project ?? '');
      const sum = (m: Record<string, readonly unknown[]>) => Object.values(m).reduce((n, v) => n + v.length, 0);
      // The agent's units: store totals count every namespace (the realm-wide one too) and every row;
      // coverage counts the project's search documents (memories, observations and session summaries).
      const rows = st.projects;
      const add = (k: 'observations' | 'sessions') => rows.reduce((n, p) => n + p[k], 0);
      const totals = { projects: rows.length, memories: sum(st.memories), observations: add('observations'), lessons: sum(st.lessons), slots: sum(st.slots), sessions: add('sessions'), graph_nodes: shopGraph.nodes.length * rows.filter((p) => hasGraph(p.key)).length };
      const row = rows.find((p) => p.key === project);
      const memories = (st.memories[project] ?? []).length;
      const docs = memories + (row?.observations ?? 0) + (row?.sessions ?? 0);
      const per = project ? { counts: { memories, observations: row?.observations ?? 0, sessions: row?.sessions ?? 0, graph_nodes: hasGraph(project) ? shopGraph.nodes.length : 0, graph_edges: hasGraph(project) ? shopGraph.edges.length : 0 }, embedding_coverage: { embedded: Math.max(0, docs - 1), total: docs, model: 'local-minilm' } } : {};
      return answers.ok({ enabled: true, available: true, degraded: false, recoverable: false, remote: true, last_consolidated: 'never', totals, ...per });
    }),
    reply(memoryRoutes.projects, (r) => answers.ok({ items: of(r).projects, meta: { total: of(r).projects.length } })),
    reply(memoryRoutes.items, (r) => {
      const st = of(r);
      const project = String(r.query.project ?? '');
      const kind = String(r.query.kind ?? 'memory');
      if (kind === 'lesson') return page(st.lessons[project] ?? []);
      if (kind === 'slot') return page(st.slots[project] ?? []);
      if (kind !== 'memory') return page([]);
      const q = String(r.query.query ?? '');
      const rows = st.memories[project] ?? [];
      return page(q ? rows.filter((m) => m.title.includes(q)) : rows);
    }),
    reply(memoryRoutes.search, (r) => {
      const b = (r.body ?? {}) as { project?: string; query?: string; kinds?: string[] };
      if (!b.kinds?.includes('memory')) return answers.ok({ status: 'ok', hits: [] });
      const words = String(b.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const score = (t: string) => {
        const low = t.toLowerCase();
        let n = 0;
        for (const w of words) if (low.includes(w)) n++;
        return n;
      };
      const hits = (of(r).memories[String(b.project ?? '')] ?? []).filter((m) => score(m.title) > 0).sort((a, z) => score(z.title) - score(a.title))
        .map((m) => ({ kind: 'memory', id: m.id, score: score(m.title) / 10, type: m.type, title: m.title, narrative: '', ts: m.updated_at, importance: m.strength }));
      return answers.ok({ status: 'ok', hits });
    }),
    // The relation graph (dev and shots): the shop project's few entities, the agent's Go spelling, nil lists as null.
    reply(memoryRoutes.graph, (r) => {
      const project = String(r.query.project ?? '');
      const known = hasGraph(project);
      const type = String(r.query.node_type ?? '');
      const all = known ? shopGraph.nodes : [];
      const nodes = all.filter((n) => !type || n.Type === type);
      const on = new Set(nodes.map((n) => n.ID));
      const edges = known ? shopGraph.edges.filter((e) => on.has(e.SourceID) && on.has(e.TargetID)) : [];
      const byType: Record<string, number> = {};
      for (const n of all) byType[n.Type] = (byType[n.Type] ?? 0) + 1;
      return answers.ok({
        status: 'ok', nodes: nodes.length > 0 ? nodes.map((n) => ({ ...n, Project: project })) : null, edges: edges.length > 0 ? edges.map((e) => ({ ...e, Project: project })) : null, limit: Number(r.query.limit ?? 500), offset: 0, truncated: false, from_snapshot: false, dirty: false, warning: '',
        stats: { TotalNodes: all.length, TotalEdges: known ? shopGraph.edges.length : 0, NodesByType: byType, EdgesByType: {} },
      });
    }),
    reply(memoryRoutes.item, () => answers.refused(404, 'not_found')),
    reply(memoryRoutes.edit, () => answers.refused(404, 'not_found')),
    reply(memoryRoutes.remove, () => answers.ok({ status: 'ok', deleted: 0 })),
    reply(memoryRoutes.enabled, () => answers.ok({ status: 'ok' })),
  ];
}
