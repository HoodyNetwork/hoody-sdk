// Share answers as the storage share routes give them, for tests and the Shared folders fixtures. The ids are
// the Files fixtures' computers: atlas (…a1) gives, granite (…0107) receives. Field names and values follow the
// published share object (openapi.json, storageShareObjectSchema): seconds for expires_at, booleans for enabled.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { shareRoutes } from './routes';
import { SHARE_SENTENCES } from './state';

export const ATLAS_ID = 'c0a7150000000000000000a1';
export const GRANITE_ID = 'c0a715000000000000000107';

type Wire = Readonly<Record<string, unknown>>;

/** One share from atlas to granite, read only and on; `over` replaces any field. */
export function shareWire(over: Wire = {}): Wire {
  return {
    id: 'sh_0001',
    source_computer_id: ATLAS_ID,
    source_path: '/home/ada/projects',
    mount_path: '/hoody/shares/projects-3f9a1c2e',
    target_computer_id: GRANITE_ID,
    target_project_id: null,
    target_type: 'computer',
    mode: 'readonly',
    alias: null,
    label: null,
    description: null,
    enabled: true,
    status: 'active',
    status_message: null,
    expires_at: null,
    expiry_notified: false,
    created_by: 'u_ada',
    realm_ids: [],
    created_at: '2026-11-10T09:00:00.000Z',
    updated_at: '2026-11-10T09:00:00.000Z',
    ...over,
  };
}

/** The same share as the receiver reads it: no alias, label, description, expiry_notified or realm_ids. */
export function incomingWire(over: Wire = {}): Wire {
  const { alias: _a, label: _l, description: _d, expiry_notified: _e, realm_ids: _r, ...rest } = shareWire(over);
  return rest;
}

/** A list answer. */
export const listAnswer = (...items: readonly Wire[]): Wire => ({ statusCode: 200, message: 'ok', data: items });

/** A share in each stored state the section shows. */
export const shareStates = {
  on: shareWire(),
  readWrite: shareWire({ id: 'sh_0002', mode: 'readwrite', source_path: '/srv/data', mount_path: '/hoody/shares/data-0a1b2c3d4e' }),
  off: shareWire({ id: 'sh_0003', enabled: false }),
  failed: shareWire({ id: 'sh_0004', status: 'failed', status_message: SHARE_SENTENCES.SETUP_FAILED }),
  waiting: shareWire({ id: 'sh_0005', status_message: SHARE_SENTENCES.DEFERRED }),
  ownerDown: shareWire({ id: 'sh_0006', status_message: SHARE_SENTENCES.OWNER_UNREACHABLE_RELEASED }),
  legacy: shareWire({ id: 'sh_0007', source_path: '/home/ada/old', mount_path: '/home/ada/old' }),
} as const;

/** cedar, atlas's stopped neighbour in the fixtures' home realm (core world.ts): granite is in another realm, so the
 *  shares state joins atlas and cedar, which one realm view lists. */
export const CEDAR_ID = 'c0a7150000000000000000c3';

/** A share the other way, cedar to atlas: atlas's "Shared with this computer" row. */
export const sharedWithAtlas: Wire = shareWire({
  id: 'sh_0101', source_computer_id: CEDAR_ID, target_computer_id: ATLAS_ID, source_path: '/data/photos', mount_path: '/hoody/shares/photos-7e5d9c1b',
});

/** How a write answers: 'ok' applies it; 'lostApplied' applies it and loses the answer; 'lost' loses it unapplied;
 *  a pair refuses it with that status and code. */
export type ShareWriteAnswer = 'ok' | 'lost' | 'lostApplied' | readonly [status: number, code: string];

export interface ShareRulesOpts {
  /** The shares there are (default: one in each state from atlas to cedar, and one from cedar to atlas). */
  shares?: readonly Wire[];
  /** Every list answers 500. */
  listFails?: boolean;
  /** How Share a folder, a change of a share (off/on, access, try again) and Stop sharing answer (default 'ok'). */
  create?: ShareWriteAnswer;
  change?: ShareWriteAnswer;
  stop?: ShareWriteAnswer;
  /** Every write that reached the API, as "METHOD path body", in order: a test counts its sends here. */
  sent?: string[];
  /** Filled by shareRules: changes the set of shares, or makes every list fail, as of the next read (a test's
   *  "something changed elsewhere since the list was read"). */
  control?: { add?: (w: Wire) => void; failLists?: (on: boolean) => void };
}

const cidOf = (r: FixtureRequest): string => decodeURIComponent(/\/computers\/([^/?]+)/.exec(r.path)?.[1] ?? '');
const sidOf = (r: FixtureRequest): string => decodeURIComponent(/\/shares\/([^/?]+)/.exec(r.path)?.[1] ?? '');
const incomingOf = (w: Wire): Wire => incomingWire(w);

/** The share lists and writes (routes.ts) over one set of shares (the Files fixtures' shares
 *  state). The set lives for the rules' lifetime: a share made, changed or stopped shows in the next list read. */
export function shareRules(opts: ShareRulesOpts = {}): FixtureRule[] {
  let all: Wire[] = [...(opts.shares ?? [...Object.values(shareStates).map((w) => ({ ...w, target_computer_id: CEDAR_ID })), sharedWithAtlas])];
  let made = 0;
  let failing = opts.listFails === true;
  if (opts.control) {
    opts.control.add = (w) => { all = [...all, w]; };
    opts.control.failLists = (on) => { failing = on; };
  }
  const list = (items: readonly Wire[]) => (failing ? answers.refused(500, 'BROKEN') : answers.ok(listAnswer(...items)));
  const write = (how: ShareWriteAnswer | undefined, r: FixtureRequest, apply: () => Wire | null, status = 200) => {
    opts.sent?.push(`${r.method} ${r.path} ${JSON.stringify(r.body ?? null)}`);
    const h = how ?? 'ok';
    if (typeof h !== 'string') return answers.refused(h[0], h[1]);
    if (h === 'lost') return answers.lost(0);
    const data = apply();
    if (h === 'lostApplied') return answers.lost(0);
    return data === null ? answers.refused(404, 'NOT_FOUND') : { status, body: { statusCode: status, message: 'ok', data } };
  };
  return [
    reply(shareRoutes.list, (r) => list(all.filter((w) => w.source_computer_id === cidOf(r)))),
    reply(shareRoutes.incoming, (r) => list(all.filter((w) => w.target_computer_id === cidOf(r)).map(incomingOf))),
    reply(shareRoutes.allShares, () => list(all)),
    reply(shareRoutes.allIncoming, () => list(all.map(incomingOf))),
    reply(shareRoutes.create, (r) => write(opts.create, r, () => {
      const b = r.body as { source_path: string; mode: string; target_computer_id: string; expires_at?: number };
      const name = b.source_path.split('/').filter(Boolean).pop() ?? 'folder';
      const w = shareWire({ id: `sh_new${++made}`, source_computer_id: cidOf(r), source_path: b.source_path, mount_path: `/hoody/shares/${name}-0123abcd`, target_computer_id: b.target_computer_id, mode: b.mode, expires_at: b.expires_at ?? null });
      all = [...all, w];
      return w;
    }, 201)),
    reply(shareRoutes.update, (r) => write(opts.change, r, () => {
      const cur = all.find((w) => w.id === sidOf(r) && w.source_computer_id === cidOf(r));
      if (!cur) return null;
      const b = r.body as { mode?: string; enabled?: boolean };
      // Turning a share on is also the API's retry of a failed one.
      const next: Wire = { ...cur, ...(b.mode ? { mode: b.mode } : {}), ...(b.enabled === undefined ? {} : { enabled: b.enabled }), ...(b.enabled === true ? { status: 'active', status_message: null } : {}) };
      all = all.map((w) => (w === cur ? next : w));
      return next;
    })),
    reply(shareRoutes.remove, (r) => write(opts.stop, r, () => {
      const cur = all.find((w) => w.id === sidOf(r));
      if (!cur) return null;
      all = all.filter((w) => w !== cur);
      return cur;
    })),
  ];
}
