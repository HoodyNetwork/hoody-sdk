// Fake files-program answers for remote storage, for the preview and the tests: one store per computer, so a
// connect adds a backend, a mount adds a folder, and closing or removing takes it away. `pending` answers every
// change with a gateway error (its outcome unknown) and changes nothing; `refuse` refuses every connect (wrong keys).
// Nothing a connect carries is kept: only the provider and the account name, as the program lists them. Pending
// uploads (files not yet in the storage): deliver marks an item delivering, stop holds an uploading item, discard
// removes it; `meanwhile` stands in for the program or another client finishing or ending one.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { storageRoutes } from './routes';

/** A pending upload as GET /api/v1/pending-uploads lists it, and its files as the files page lists them. */
export interface HeldFixture { id: string; backend_id?: string; mount_id?: string; state: 'uploading' | 'pending' | 'delivering'; since: number; file_count: number; incomplete_count: number; total_bytes: number; reasons: Record<string, number>; deliverable: boolean; last_error?: string; files?: { path_b64: string; path?: string; path_display?: string; size: number; modified_at: number; reason: string; complete: boolean; bytes?: string }[] }
export interface StorageFixture {
  backends: { id: string; backend_type: string; server: string; user?: string; connected: boolean; created_at: string; mount_paths: string[] }[];
  /** A mount row as the program lists it, its delivery fields included when the seed gives them. */
  mounts: ({ id: string; backend_id: string; mount_path: string; label?: string; status: string } & Record<string, unknown>)[];
  held: HeldFixture[];
}
export interface StorageOpts {
  pending?: boolean;
  /** Changes are applied, then answered with a gateway error: the outcome the page sees is unknown. */
  appliedThenLost?: boolean;
  refuse?: boolean;
  /** How long a refused connect takes to answer (default at once). */
  refuseDelayMs?: number;
  listFails?: boolean;
  seed?: Partial<StorageFixture>;
  /** Tests only: sees each change request as it arrives (the preview passes none). */
  onSend?: (r: FixtureRequest) => void;
  /** The status a new mount is listed with (default active). */
  mountStatus?: string;
  /** Called for every list read. */
  /** How the lists answer now (read on each request): ok (default), fail (500) or slow (one minute). */
  lists?: (which: 'backends' | 'mounts' | 'held') => 'ok' | 'fail' | 'slow';
  /** A stop whose upload process does not confirm its exit: the cancel is under way, the item still delivering,
   *  and the program answers 409 PENDING_UPLOAD_BUSY. */
  stopUnconfirmed?: boolean;
  /** A stop that meets the upload's own end: it stops, the item ends and leaves the list, and the program answers 404
   *  PENDING_UPLOAD_NOT_FOUND (its stop reads the item back after stopping). */
  stopThenGone?: boolean;
  /** A removal that meets folders of the storage opened elsewhere after the page's own re-read: the program closes the
   *  first `closed` of `opened` such folders one by one, keeps the storage and the rest, and answers 409 with `code`
   *  (the folders it closed stay closed). */
  removeRefused?: { code: string; opened: number; closed: number };
  /** Every folder-list read after the first answers only after this long (a slow computer). */
  mountsSlowMs?: number;
  /** Changes the computer's state before each list read (another client acting meanwhile). */
  meanwhile?: (st: StorageFixture) => void;
  onRead?: (r: FixtureRequest) => void;
  /** The computer's own disk as the API's stats read gives it (bytes): `fail` answers 500, `slow` one minute
   *  (default 12.4 GiB of 40 GiB used). */
  disk?: { usage: number; total: number } | 'fail' | 'slow';
}

const GIB = 1024 ** 3;
/** The API's stats answer of a computer with this root disk (only the fields the tab reads, and a few beside them). */
const statsAnswer = (d: { usage: number; total: number }) => ({ success: true, data: { cpu: { usage_percent: 4 }, memory: { usage: 2 * GIB, total: 8 * GIB }, disk: { root: d }, processes: 42 } });

const hex = (n: number, len: number) => n.toString(16).padStart(len, '0').slice(-len);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function storageRules(opts: StorageOpts = {}): FixtureRule[] {
  const stores = new Map<string, StorageFixture>();
  let seq = 0;
  let mountReads = 0;
  const done = (body: unknown) => (opts.appliedThenLost ? answers.pending5xx() : answers.ok(body));
  const of = (r: FixtureRequest): StorageFixture => {
    const k = r.target?.container.id ?? '';
    let st = stores.get(k);
    if (!st) {
      st = { backends: [...(opts.seed?.backends ?? [])], mounts: [...(opts.seed?.mounts ?? [])], held: (opts.seed?.held ?? []).map((h) => ({ ...h })) };
      stores.set(k, st);
    }
    return st;
  };
  const pathsOf = (st: StorageFixture, id: string) => st.mounts.filter((m) => m.backend_id === id).map((m) => m.mount_path);
  const listAnswer = (which: 'backends' | 'mounts' | 'held', body: unknown) => {
    const how = opts.listFails ? 'fail' : (opts.lists?.(which) ?? 'ok');
    return how === 'fail' ? answers.refused(500, 'BROKEN') : how === 'slow' ? answers.slow(body, 60_000) : answers.ok(body);
  };
  const lastPart = (r: FixtureRequest, from: number) => decodeURIComponent((r.path.split('?')[0] ?? '').split('/')[from] ?? '');
  return [
    reply(storageRoutes.backends, (r) => {
      opts.onRead?.(r);
      const st = of(r);
      opts.meanwhile?.(st);
      return listAnswer('backends', { backends: st.backends.map((b) => ({ ...b, mount_paths: pathsOf(st, b.id) })), count: st.backends.length });
    }),
    reply(storageRoutes.mounts, (r) => {
      opts.onRead?.(r);
      opts.meanwhile?.(of(r));
      const a = listAnswer('mounts', { mounts: of(r).mounts, count: of(r).mounts.length });
      return opts.mountsSlowMs && mountReads++ > 0 ? { ...a, delayMs: opts.mountsSlowMs } : a;
    }),
    reply(storageRoutes.test, () => answers.ok({ status: 'connected', message: 'ok' })),
    reply(storageRoutes.stats, () => {
      const d = opts.disk ?? { usage: Math.round(12.4 * GIB), total: 40 * GIB };
      return d === 'fail' ? answers.refused(500, 'BROKEN') : d === 'slow' ? answers.slow(statsAnswer({ usage: 0, total: 0 }), 60_000) : answers.ok(statsAnswer(d));
    }),
    reply(storageRoutes.held, (r) => {
      opts.onRead?.(r);
      const st = of(r);
      opts.meanwhile?.(st);
      return listAnswer('held', { success: true, message: 'ok', data: st.held.map(({ files: _f, ...h }) => h) });
    }),
    reply(storageRoutes.heldFiles, (r) => {
      opts.onRead?.(r);
      const h = of(r).held.find((x) => x.id === lastPart(r, 4));
      if (!h) return answers.refused(404, 'PENDING_UPLOAD_NOT_FOUND');
      const files = (h.files ?? []).map(({ bytes: _b, ...f }) => f);
      const at = Number(r.query.cursor ?? 0) || 0, limit = Number(r.query.limit ?? 1000) || 1000;
      const page = files.slice(at, at + limit);
      return answers.ok({ success: true, message: 'ok', data: { files: page, ...(at + limit < files.length ? { next_cursor: String(at + limit) } : {}) } });
    }),
    reply(storageRoutes.heldFile, (r) => {
      opts.onRead?.(r);
      const h = of(r).held.find((x) => x.id === lastPart(r, 4));
      const f = h?.files?.find((x) => x.path_b64 === r.query.path_b64);
      if (!h || !f) return answers.refused(404, 'PENDING_UPLOAD_FILE_NOT_FOUND');
      if (h.state === 'uploading') return answers.refused(409, 'PENDING_UPLOAD_BUSY');
      return answers.ok(f.bytes ?? 'held');
    }),
    reply(storageRoutes.deliver, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      const h = of(r).held.find((x) => x.id === lastPart(r, 4));
      if (!h) return answers.refused(404, 'PENDING_UPLOAD_NOT_FOUND');
      if (h.state !== 'pending') return answers.refused(409, 'PENDING_UPLOAD_BUSY');
      if (!h.deliverable) return answers.refused(409, 'PENDING_UPLOAD_NOT_DELIVERABLE');
      h.state = 'delivering';
      h.deliverable = false;
      delete h.last_error;
      const { files: _f, ...item } = h;
      return opts.appliedThenLost ? answers.pending5xx() : { status: 202, body: { success: true, message: 'ok', data: item } };
    }),
    reply(storageRoutes.stopHeld, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      const h = of(r).held.find((x) => x.id === lastPart(r, 4));
      if (!h) return answers.refused(404, 'PENDING_UPLOAD_NOT_FOUND');
      if (h.state === 'pending') return answers.refused(409, 'PENDING_UPLOAD_BUSY');
      if (opts.stopUnconfirmed) return answers.refused(409, 'PENDING_UPLOAD_BUSY');
      if (opts.stopThenGone) {
        of(r).held = of(r).held.filter((x) => x.id !== h.id);
        return answers.refused(404, 'PENDING_UPLOAD_NOT_FOUND');
      }
      h.state = 'pending';
      const { files: _f, ...item } = h;
      return done({ success: true, message: 'ok', data: item });
    }),
    reply(storageRoutes.discard, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      const st = of(r);
      const h = st.held.find((x) => x.id === lastPart(r, 4));
      if (!h) return answers.refused(404, 'PENDING_UPLOAD_NOT_FOUND');
      if (h.state !== 'pending') return answers.refused(409, 'PENDING_UPLOAD_BUSY');
      st.held = st.held.filter((x) => x.id !== h.id);
      return opts.appliedThenLost ? answers.pending5xx() : { status: 204 };
    }),
    reply(storageRoutes.connect, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      if (opts.refuse) return { ...answers.refused(400, 'BAD_REQUEST'), delayMs: opts.refuseDelayMs };
      const type = lastPart(r, 4);
      const user = typeof obj(r.body).user === 'string' ? (obj(r.body).user as string) : undefined;
      const id = hex(++seq + 0xabc000, 16);
      of(r).backends.push({ id, backend_type: type, server: `${type}:generic`, ...(user ? { user } : {}), connected: true, created_at: new Date(0).toISOString(), mount_paths: [] });
      return done({ success: true, message: 'connected', data: { id, type, mount_paths: [] } });
    }),
    reply(storageRoutes.mount, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      const b = obj(r.body);
      const st = of(r);
      if (!st.backends.some((x) => x.id === b.backend_id)) return answers.refused(404, 'BACKEND_NOT_FOUND');
      const id = 'mount_' + hex(++seq, 32);
      const m = { id, backend_id: String(b.backend_id), mount_path: `/mnt/hoody/${typeof b.mount_path === 'string' ? b.mount_path : id.slice(-8)}`, ...(typeof b.label === 'string' ? { label: b.label } : {}), status: opts.mountStatus ?? 'active' };
      st.mounts.push(m);
      return done({ success: true, message: 'mounted', data: m });
    }),
    reply(storageRoutes.unmount, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      const st = of(r);
      const id = lastPart(r, 4);
      if (!st.mounts.some((m) => m.id === id)) return answers.refused(404, 'MOUNT_NOT_FOUND');
      st.mounts = st.mounts.filter((m) => m.id !== id);
      return done({ success: true, message: 'removed' });
    }),
    reply(storageRoutes.remove, (r) => {
      opts.onSend?.(r);
      if (opts.pending) return answers.pending5xx();
      const st = of(r);
      const id = lastPart(r, 4);
      if (!st.backends.some((b) => b.id === id)) return answers.refused(404, 'BACKEND_NOT_FOUND');
      const rr = opts.removeRefused;
      if (rr) {
        const elsewhere = Array.from({ length: rr.opened }, (_, i) => ({ id: 'mount_' + hex(++seq, 32), backend_id: id, mount_path: `/mnt/hoody/elsewhere-${i + 1}`, label: `Opened elsewhere ${i + 1}`, status: 'active' }));
        st.mounts.push(...elsewhere.slice(rr.closed));
        return answers.refused(409, rr.code);
      }
      st.backends = st.backends.filter((b) => b.id !== id);
      st.mounts = st.mounts.filter((m) => m.backend_id !== id);
      return done({ success: true, message: 'removed' });
    }),
  ];
}
