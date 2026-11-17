// The Notes page's fixture Api (hub:dev, hub:shots, tests): each call reads the current fixture state. Fixture-only:
// fixtures.ts installs it through fixtureApiSeam.ts, so no live module imports this file (the terminal ship build
// refuses any fixture module as an input).
import { LATENCY_MS, fixtureStore, loadFixtures, type MutationAnswer, type QueryAnswer } from '@app/fixtures';
import type { NotesApi, Settled } from './api';
import type { Computer, FxNotes, Loaded, NoteRow, Rejection } from './types';

// ── the Api over the page's fixtures (hub:dev, hub:shots, tests): no hooks; each call reads the current state ──
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function answer(key: string): Promise<QueryAnswer | MutationAnswer | null> {
  const fx = await loadFixtures('notes');
  if (!fx) return null;
  const st = fx.states[fixtureStore.get().state ?? ''] ?? fx.states[fx.default];
  return (st?.[key] ?? null) as QueryAnswer | MutationAnswer | null;
}
const wait = (ans: { delayMs?: number } | null) => sleep(ans?.delayMs ?? LATENCY_MS[fixtureStore.get().latency]);

const notes = (code: string, message: string) => ({ code, message });
function refusal(kind: string, status: number, code?: string): Rejection {
  return { kind, status, ...(code ? { code, data: notes(code, 'refused') } : {}) };
}

let takenOnce = false;
const REFUSALS: Record<string, Rejection> = {
  cantAdd: refusal('private', 403, 'notebook_readonly'),
  protected: refusal('private', 403),
  noPlace: refusal('bad_request', 400, 'parent_required'),
  gone: refusal('not_found', 404, 'notebook_not_found'),
  taken: refusal('bad_request', 409, 'unknown'),
};

// A fixture state may answer a delete under the key `remove` (a MutationAnswer; codes below). Without one the delete is done.
const REMOVE_REFUSALS: Record<string, Rejection> = {
  cantRemove: refusal('private', 403, 'forbidden'),
  protected: refusal('private', 403),
  gone: refusal('not_found', 404, 'not_found'),
};

export function fixtureApi(): NotesApi {
  // Notes made through this Api (a create answered created, or read back by Check again): the next read of that
  // computer lists them first, as the real Notes does. Kept per Api, so per page mount.
  const made: Record<string, NoteRow[]> = {};
  // Notes deleted through this Api: the next read of that computer no longer lists them, and a read of one says not found.
  const removed: Record<string, string[]> = {};
  const isRemoved = (c: Computer, id: string) => removed[c.id]?.includes(id) ?? false;
  const add = (c: Computer, id: string, title: string) => {
    if (!made[c.id]?.some((n) => n.id === id)) made[c.id] = [{ id, title, section: '', at: Date.now(), hasBody: false }, ...(made[c.id] ?? [])];
  };
  return {
    async load(c: Computer): Promise<Loaded | null> {
      const a = await answer('notes');
      await wait(a as { delayMs?: number } | null);
      const all = (a && 'data' in a ? (a.data as Record<string, FxNotes>) : {}) ?? {};
      const f = all[c.id];
      if (!f) return { state: 'unreachable' };
      if (f.hang) return new Promise<never>(() => undefined);
      if (f.state !== 'ok') return { state: f.state };
      const me = { userId: 'a1b2c3d4e5f6a7b8c9d0e1f2', notebookId: f.notebookId ?? 'b2c3d4e5f6a7b8c9d0e1f2a3', role: 'owner' };
      const create = f.place === undefined ? { parentId: 'c3d4e5f6a7b8c9d0e1f2a3b4', section: 'Work' } : f.place;
      const items = [...(made[c.id] ?? []).map((n) => ({ ...n, section: create?.section ?? '' })), ...(f.notes ?? [])].filter((n) => !isRemoved(c, n.id));
      return { state: 'ok', me, recent: { items, partial: f.partial ?? false, create } };
    },
    async send(c, _nb, body): Promise<Settled> {
      const a = (await answer('create')) as MutationAnswer | null;
      await wait(a);
      if (!a || !('outcome' in a)) return { ok: false, err: { kind: 'unreachable', code: 'NETWORK' } };
      if (a.outcome === 'done') {
        add(c, body.id, body.attributes.name);
        return { ok: true, body: { id: body.id, type: 'page' } };
      }
      if (a.outcome === 'not_sent') return { ok: false, err: { notSent: true } };
      if (a.outcome === 'pending') return { ok: false, err: { kind: 'unreachable', code: 'NETWORK' } };
      if (a.code === 'taken') {
        if (takenOnce) {
          add(c, body.id, body.attributes.name);
          return { ok: true, body: { id: body.id, type: 'page' } };
        }
        takenOnce = true;
      }
      return { ok: false, err: REFUSALS[a.code ?? ''] ?? { kind: 'unavailable', status: 500 } };
    },
    async node(c, _nb, sent): Promise<Settled> {
      const a = (await answer('node')) as QueryAnswer | null;
      await wait(a as { delayMs?: number } | null);
      if (a && 'data' in a && (a.data as { matching?: boolean }).matching) {
        add(c, sent.id, sent.name);
        return { ok: true, body: { id: sent.id, type: 'page', parentId: sent.parentId, name: sent.name } };
      }
      return { ok: false, err: refusal('not_found', 404, 'not_found') };
    },
    async remove(c, _nb, id): Promise<Settled> {
      const a = (await answer('remove')) as MutationAnswer | null;
      await wait(a);
      if (!a || !('outcome' in a) || a.outcome === 'done') {
        if (isRemoved(c, id)) return { ok: false, err: REMOVE_REFUSALS.gone as Rejection };
        removed[c.id] = [...(removed[c.id] ?? []), id];
        return { ok: true, body: { success: true } };
      }
      if (a.outcome === 'not_sent') return { ok: false, err: { notSent: true } };
      if (a.outcome === 'pending') return { ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } };
      return { ok: false, err: REMOVE_REFUSALS[a.code ?? ''] ?? { kind: 'unavailable', status: 500, pending: true } };
    },
    async present(c, _nb, id): Promise<Settled> {
      await wait(null);
      return isRemoved(c, id) ? { ok: false, err: REMOVE_REFUSALS.gone as Rejection } : { ok: true, body: { id, type: 'page' } };
    },
    async download() {
      const a = (await answer('download')) as MutationAnswer | null;
      await wait(a);
      return a?.outcome === 'done' ? 'saved' : a?.code === 'TOO_BIG' ? 'tooBig' : 'failed';
    },
  };
}

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  takenOnce = false;
}
