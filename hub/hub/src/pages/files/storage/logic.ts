// Pure helpers of remote storage: the files program's backend and mount lists in the page's
// shape, the connect body from the form, and what a fresh list proves about a change whose answer was lost. No
// route takes an idempotency key, so only these proofs (or the sender's warned Dismiss) free a held change.
// Delivery to storage is write-back: a write answered OK is on the computer, not yet in the
// storage. The mount's delivery fields and the pending uploads say where it stands; anything not seen in full is
// unknown, and a pending upload gone from the list proves only that it is no longer held on the computer.
import { providerOf, type ProviderId } from './providers';

export interface Backend { id: string; type: string; user: string; mountPaths: string[] }
export interface Mount { id: string; backend: string; path: string; label: string; status: string; error: string; delivery: Delivery }
/** What a mount reports about files not yet in its storage. `pending`/`uploads` null: not reported, or not readable
 *  (never read as 0). `waitsOn`: the pending upload a mount still opening delivers first ('' when none). The program's
 *  own status text is not kept. */
export interface Delivery {
  auto: boolean;
  pending: { count: number; bytes: number } | null;
  uploads: { state: 'idle' | 'busy' | 'unknown'; dirty: number | null; open: number | null } | null;
  waitsOn: string;
}
/** listed: the answer carried the list at all; complete: every row of it was read (an absence proves something). */
export interface Listed<T> { listed: boolean; complete: boolean; items: T[]; computer?: string }

const BACKEND_ID = /^[0-9a-f]{16}$/;
const MOUNT_ID = /^mount_[0-9a-f]{32}$/;
const HELD_ID = /^[0-9a-f]{32}$/;
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined);

/** GET /api/v1/backends → its rows. A row without a valid id is left out, and the list is then not complete. */
export function backendsOf(raw: unknown): Listed<Backend> {
  const rows = obj(raw)?.backends;
  if (!Array.isArray(rows)) return { listed: false, complete: false, items: [] };
  const items = rows.flatMap((r): Backend[] => {
    const x = obj(r);
    if (!x || typeof x.id !== 'string' || !BACKEND_ID.test(x.id) || typeof x.backend_type !== 'string' || !x.backend_type) return [];
    // Whether it has a folder open decides whether it may be removed: a row whose folders cannot be read is left out.
    if (!Array.isArray(x.mount_paths) || !x.mount_paths.every((p) => typeof p === 'string')) return [];
    return [{ id: x.id, type: x.backend_type, user: text(x.user), mountPaths: x.mount_paths as string[] }];
  });
  return { listed: true, complete: items.length === rows.length, items };
}

/** GET /api/v1/mounts → its rows, the same way. */
export function mountsOf(raw: unknown): Listed<Mount> {
  const rows = obj(raw)?.mounts;
  if (!Array.isArray(rows)) return { listed: false, complete: false, items: [] };
  const items = rows.flatMap((r): Mount[] => {
    const x = obj(r);
    if (!x || typeof x.id !== 'string' || !MOUNT_ID.test(x.id) || typeof x.backend_id !== 'string' || typeof x.mount_path !== 'string') return [];
    return [{ id: x.id, backend: x.backend_id, path: x.mount_path, label: text(x.label), status: text(x.status), error: text(x.error), delivery: deliveryOf(x) }];
  });
  return { listed: true, complete: items.length === rows.length, items };
}

/** A mount row's delivery fields (as the files program sends them). A field the program did not send, or sent in another
 *  shape, is unknown (null); the row itself stays. */
function deliveryOf(x: Record<string, unknown>): Delivery {
  const p = obj(x.pending_uploads);
  const pc = count(p?.count), pb = count(p?.bytes);
  const u = obj(x.uploads);
  const state = u?.state === 'idle' || u?.state === 'busy' || u?.state === 'unknown' ? u.state : undefined;
  const nullable = (v: unknown): number | null | undefined => (v === null ? null : count(v));
  const dirty = nullable(u?.dirty), open = nullable(u?.open_handles);
  // An unknown state carries no counts; a seen one carries both (UploadsView: never a guessed 0).
  const uploadsOk = state !== undefined && dirty !== undefined && open !== undefined && (state === 'unknown' ? dirty === null && open === null : dirty !== null && open !== null);
  const d = obj(x.delivery);
  return {
    auto: x.auto_deliver !== false,
    pending: pc !== undefined && pb !== undefined ? { count: pc, bytes: pb } : null,
    uploads: uploadsOk ? { state: state!, dirty: dirty!, open: open! } : null,
    waitsOn: typeof d?.pending_upload_id === 'string' && HELD_ID.test(d.pending_upload_id) ? d.pending_upload_id : '',
  };
}

/** Where a storage folder stands: synced (idle with no changed file left to upload, and nothing waits in a pending
 *  upload), syncing (busy, or changed files not uploaded yet), waiting (files wait on the computer in
 *  a pending upload: still uploading, held or being delivered; see the list), or unknown (not open, or not seen). */
export type Sync = 'synced' | 'syncing' | 'waiting' | 'unknown';
export function syncOf(m: Mount): Sync {
  const { uploads: u, pending } = m.delivery;
  if (m.status !== 'active' || !u || u.state === 'unknown') return 'unknown';
  if (u.state === 'busy' || u.dirty !== 0) return 'syncing';
  if (!pending) return 'unknown';
  return pending.count > 0 ? 'waiting' : 'synced';
}

/** Where a file written into a storage folder stands (Files): sent (no mount read since the write: on the computer,
 *  syncing to the storage), syncing, synced (a mount read after the write is idle and the file is in no pending
 *  upload), held (in a held pending upload), or unknown. `inPending`: the state of the pending upload holding the
 *  file, 'none' when every pending upload's files were read and none holds it, undefined when that is not known. */
export type WriteSync = 'sent' | 'syncing' | 'synced' | 'held' | 'unknown';
export function writeSync(read: { mount: Mount | undefined; readAfterWrite: boolean }, inPending: Held['state'] | 'none' | undefined): WriteSync {
  if (!read.readAfterWrite) return 'sent';
  if (inPending === 'pending') return 'held';
  if (inPending === 'uploading' || inPending === 'delivering') return 'syncing';
  const u = read.mount && read.mount.status === 'active' ? read.mount.delivery.uploads : null;
  if (!u || u.state === 'unknown') return 'unknown';
  if (u.state === 'busy' || u.dirty !== 0) return 'syncing';
  return inPending === 'none' ? 'synced' : 'unknown';
}

/** Why a held file was held back (the files program's reasons). */
export const HELD_REASONS = ['open_when_stopped', 'unconfirmed_at_stop', 'metadata_unreadable', 'upload_failing', 'stopped_by_request', 'changed_on_storage', 'check_failed', 'cannot_verify'] as const;
export type HeldReason = (typeof HELD_REASONS)[number];
const isReason = (v: unknown): v is HeldReason => typeof v === 'string' && (HELD_REASONS as readonly string[]).includes(v);

/** A pending upload: files of one mount session not yet in the storage. `uploading`: its own uploads still run;
 *  `pending`: held, waiting for the person; `delivering`: a delivery runs. `backend`/`mount`: '' when gone. `reasons`:
 *  only the reasons with files. `lastFailed`: the last delivery ended early (the program's words are not kept). */
export interface Held {
  id: string; backend: string; mount: string; state: 'uploading' | 'pending' | 'delivering'; since: number;
  files: number; incomplete: number; bytes: number; deliverable: boolean; lastFailed: boolean;
  reasons: Partial<Record<HeldReason, number>>;
}

/** GET /api/v1/pending-uploads → its items (the answer's data). An item without a valid id, state or counts is left
 *  out, and the list is then not complete. */
export function heldOf(raw: unknown): Listed<Held> {
  const rows = obj(raw)?.data;
  if (!Array.isArray(rows)) return { listed: false, complete: false, items: [] };
  const items = rows.flatMap((r): Held[] => {
    const x = obj(r);
    if (!x || typeof x.id !== 'string' || !HELD_ID.test(x.id)) return [];
    if (x.state !== 'uploading' && x.state !== 'pending' && x.state !== 'delivering') return [];
    const files = count(x.file_count), incomplete = count(x.incomplete_count), bytes = count(x.total_bytes), since = count(x.since);
    if (files === undefined || incomplete === undefined || bytes === undefined || since === undefined || typeof x.deliverable !== 'boolean') return [];
    const reasons: Partial<Record<HeldReason, number>> = {};
    for (const [k, v] of Object.entries(obj(x.reasons) ?? {})) { const n = count(v); if (isReason(k) && n) reasons[k] = n; }
    return [{
      id: x.id, backend: text(x.backend_id), mount: text(x.mount_id), state: x.state, since, files, incomplete, bytes,
      deliverable: x.deliverable, lastFailed: typeof x.last_error === 'string' && x.last_error !== '', reasons,
    }];
  });
  return { listed: true, complete: items.length === rows.length, items };
}

/** A held file. `key`: its path bytes (path_b64), the only way to name it to the program; `name`: its path, or the
 *  program's display form when the name is not UTF-8 (`exact` false: for showing only). */
export interface HeldFile { key: string; name: string; exact: boolean; size: number; reason: HeldReason | ''; complete: boolean }
/** GET /api/v1/pending-uploads/{id}/files → one page of files, and whether more follow. `complete`: every row read
 *  and the cursor (absent, or a string) understood; otherwise the page is partial and never reads as "no files". */
export interface HeldFiles { listed: boolean; complete: boolean; files: HeldFile[]; more: boolean; cursor: string }
export function heldFilesOf(raw: unknown): HeldFiles {
  const d = obj(obj(raw)?.data);
  if (!d || !Array.isArray(d.files)) return { listed: false, complete: false, files: [], more: false, cursor: '' };
  const files = d.files.flatMap((r): HeldFile[] => {
    const x = obj(r);
    const size = count(x?.size);
    if (!x || typeof x.path_b64 !== 'string' || !/^[A-Za-z0-9_-]+$/.test(x.path_b64) || size === undefined || typeof x.complete !== 'boolean') return [];
    const exact = typeof x.path === 'string';
    return [{ key: x.path_b64, name: exact ? (x.path as string) : text(x.path_display), exact, size, reason: isReason(x.reason) ? x.reason : '', complete: x.complete }];
  });
  const cursor = text(d.next_cursor);
  const cursorOk = d.next_cursor === undefined || d.next_cursor === null || cursor !== '';
  return { listed: true, complete: files.length === d.files.length && cursorOk, files, more: cursor !== '', cursor };
}

/** An address that carries a password or token in it (user:password@, or a query such as ?token=): refused, since
 *  only the password fields are cleared and kept secret. */
export function addressHasCredentials(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    return !!(u.username || u.password || u.search);
  } catch {
    return /[@?]/.test(v);
  }
}

/** The longest token text taken (rclone's are well under 4 KiB). */
export const TOKEN_MAX = 16_384;
/** The fields of rclone's token (Go oauth2.Token as rclone prints it) and the type of each. */
const TOKEN_FIELDS: Readonly<Record<string, 'string' | 'number'>> = { access_token: 'string', token_type: 'string', refresh_token: 'string', expiry: 'string', expires_in: 'number' };
/** rclone's token text from what the person pasted: the one JSON object in it (rclone authorize prints it between
 *  two marker lines, which may come along), returned written again from its checked fields. It holds only
 *  rclone's token fields, each a plain value of its type (nothing else rides along to the computer), on one line as
 *  rclone prints it, with a non-empty access_token and a refresh_token or an expiry. Null otherwise. */
export function tokenText(pasted: string): string | null {
  const a = pasted.indexOf('{');
  const b = pasted.lastIndexOf('}');
  if (a < 0 || b <= a || b - a + 1 > TOKEN_MAX) return null;
  const t = pasted.slice(a, b + 1);
  if (/[\r\n]/.test(t)) return null;
  let o: Record<string, unknown> | undefined;
  try {
    o = obj(JSON.parse(t));
  } catch {
    return null;
  }
  if (!o || Object.keys(o).some((k) => !Object.prototype.hasOwnProperty.call(TOKEN_FIELDS, k) || typeof o[k] !== TOKEN_FIELDS[k])) return null;
  // Whole seconds that JSON.stringify writes back unchanged: a bigger or odd number would change on the way.
  if (o.expires_in !== undefined && !(Number.isSafeInteger(o.expires_in) && (o.expires_in as number) >= 0)) return null;
  if (typeof o.access_token !== 'string' || !o.access_token) return null;
  const refresh = typeof o.refresh_token === 'string' && !!o.refresh_token;
  const expiry = typeof o.expiry === 'string' && !!o.expiry;
  if ((o.refresh_token !== undefined && typeof o.refresh_token !== 'string') || (!refresh && !expiry)) return null;
  // Written again from the checked values, in rclone's order: a repeated field name hides its first copy from
  // JSON.parse, so the pasted text itself could carry a value the checks never saw.
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(TOKEN_FIELDS)) if (o[k] !== undefined) out[k] = o[k];
  return JSON.stringify(out);
}

/** A plain name, safe inside a shell command shown to the person (a client id); it never starts with a dash or a
 *  dot, so rclone cannot read it as one of its own options. */
export const validName = (v: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(v);

/** The folder list counts as old after this long without a fresh read (it is read every 30 s while shown; a hidden
 *  page or a slow computer can leave it older): its sync words then say when they were checked. */
export const STALE_MS = 90_000;
export const staleRead = (updatedAt: number, now: number): boolean => updatedAt > 0 && now - updatedAt > STALE_MS;

/** A boolean field's value: '' (left to the program's default), 'true' or 'false'. */
export const boolShown = (value: string, def: unknown): boolean => (value === '' ? def === true : value === 'true');

/** A port as the connect body takes it: a whole number from 1 to 65535. The form's field uses the same rule, so a port the
 *  body would refuse (0, 70000) shows its error at the field and never leaves Connect off with nothing said. */
export const portOk = (v: string): boolean => /^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535;

/** The form's values → the connect body: only filled fields, numbers as numbers, a pasted key with its line ends
 *  written as \n (the program takes a key on one line), a boolean only when set against the program's default, and
 *  the type's fixed values. Null when a required field is empty, a number is not one, or a choice is not offered. */
export function connectBody(type: ProviderId, values: Readonly<Record<string, string>>): Record<string, string | number | boolean> | null {
  const p = providerOf(type);
  if (!p) return null;
  const body: Record<string, string | number | boolean> = {};
  for (const f of p.fields) {
    const raw = values[f.key] ?? '';
    if (f.kind === 'boolean') {
      if (raw !== '' && raw !== 'true' && raw !== 'false') return null;
      if (raw !== '' && (raw === 'true') !== (f.default === true)) body[f.key] = raw === 'true';
      continue;
    }
    const v = f.kind === 'secret' || f.kind === 'pem' || f.kind === 'token' ? raw : raw.trim();
    if (!v.trim()) {
      if (f.required) return null;
      continue;
    }
    if (f.address && addressHasCredentials(v)) return null;
    if (f.name && !validName(v)) return null;
    if (f.kind === 'number') {
      if (!portOk(v)) return null;
      body[f.key] = Number(v);
    } else if (f.kind === 'int') {
      // A whole number JSON carries exactly (no sign: the program's whole-number options count up from 0).
      if (!/^\d{1,15}$/.test(v)) return null;
      body[f.key] = Number(v);
    } else if (f.kind === 'select') {
      if (f.options && !f.options.includes(v)) return null;
      body[f.key] = v;
    } else if (f.kind === 'token') {
      const t = tokenText(v);
      if (t === null) return null;
      body[f.key] = t;
    } else if (f.kind === 'pem') {
      body[f.key] = v.trim().replace(/\r\n|\r|\n/g, '\\n');
    } else body[f.key] = v;
  }
  for (const [k, v] of Object.entries(p.fixed ?? {})) body[k] = v;
  if (p.oneOf && !p.oneOf.some((k) => body[k] !== undefined)) return null;
  if (p.fields.some((f) => f.needs && body[f.key] !== undefined && body[f.needs] === undefined)) return null;
  return body;
}

/** A mount's name: shown in the list and how a lost mount is found again, so it is unique on the computer. */
export const LABEL_MAX = 64;
export const validLabel = (label: string, mounts: readonly Mount[]): boolean => {
  const l = label.trim();
  return l.length > 0 && l.length <= LABEL_MAX && !/[\u0000-\u001f\u007f]/.test(l) && !mounts.some((m) => m.label === l);
};
/** The suggested name: the provider and the account, made unique with a number. */
export function suggestLabel(base: string, mounts: readonly Mount[]): string {
  const b = base.trim().slice(0, LABEL_MAX - 4) || 'Storage';
  if (validLabel(b, mounts)) return b;
  for (let n = 2; n < 100; n++) if (validLabel(`${b} ${n}`, mounts)) return `${b} ${n}`;
  return '';
}

type Answers = readonly (readonly unknown[])[];
/** The fresh lists of the change's own computer (a list names the computer it was read from). */
const lists = <T>(answers: Answers, computer: unknown): Listed<T>[] =>
  typeof computer === 'string' && computer
    ? (answers[0] ?? []).filter((a): a is Listed<T> => !!a && typeof a === 'object' && Array.isArray((a as Listed<T>).items) && (a as Listed<T>).computer === computer)
    : [];

/** A connect is never proved by a list. A list row names only the type and the account, not the host, bucket or
 *  address, so a backend someone else connected meanwhile would look the same; and a connect of storage already
 *  listed keeps its id. A lost connect stays held until its sender looks at the list and dismisses it. */
export function connectProved(_identity: unknown, _answers: Answers): 'applied' | undefined {
  return undefined;
}

/** The folder a mount is opened at, under the program's mount folder: the name made plain, plus a random part, so no
 *  other mount can have it (the program allows one mount per folder) and a lost mount is found by it alone. */
export function folderLeaf(label: string, random: string = randomHex(8)): string {
  const plain = label.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return `${plain || 'storage'}-${random}`;
}
const randomHex = (bytes: number): string => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
const leafOf = (path: string): string => path.replace(/\/+$/, '').split('/').pop() ?? '';

/** A mount is proved by an open mount of that backend at the folder it was sent with (that folder is its own:
 *  random, and one mount per folder), under the sent name. A mount still opening may yet fail, so it proves nothing. */
export function mountProved(identity: unknown, answers: Answers): 'applied' | undefined {
  const i = (identity ?? {}) as { backend?: string; label?: string; leaf?: string; computer?: string };
  if (!i.backend || !i.label || !i.leaf) return undefined;
  return lists<Mount>(answers, i.computer).some((l) =>
    l.listed && l.items.some((m) => m.backend === i.backend && m.label === i.label && leafOf(m.path) === i.leaf && m.status === 'active'),
  )
    ? 'applied'
    : undefined;
}
/** An unmount is proved by a complete mount list without it. */
export function unmountProved(identity: unknown, answers: Answers): 'applied' | undefined {
  const i = (identity ?? {}) as { mount?: string ; computer?: string };
  if (!i.mount) return undefined;
  return lists<Mount>(answers, i.computer).some((l) => l.complete && !l.items.some((m) => m.id === i.mount)) ? 'applied' : undefined;
}
/** A removal is proved by a complete backend list without it. */
export function removeProved(identity: unknown, answers: Answers): 'applied' | undefined {
  const i = (identity ?? {}) as { backend?: string ; computer?: string };
  if (!i.backend) return undefined;
  return lists<Backend>(answers, i.computer).some((l) => l.complete && !l.items.some((b) => b.id === i.backend)) ? 'applied' : undefined;
}

/** The pending upload in a fresh list of the change's own computer (undefined when no list of it shows it). */
const heldIn = (answers: Answers, i: { item?: string; computer?: string }): Held | undefined => {
  if (!i.item) return undefined;
  for (const l of lists<Held>(answers, i.computer)) {
    const h = l.listed ? l.items.find((x) => x.id === i.item) : undefined;
    if (h) return h;
  }
  return undefined;
};
/** A deliver is proved by its item being delivered now (the delivery is recorded: what the 202 says, and no more;
 *  delivered is claimed only by Files' size check). Held still proves nothing (the delivery may
 *  have ended early, or never arrived); gone proves nothing either: delivered or discarded, the list cannot tell. */
export function deliverProved(identity: unknown, answers: Answers): 'applied' | undefined {
  return heldIn(answers, (identity ?? {}) as { item?: string; computer?: string })?.state === 'delivering' ? 'applied' : undefined;
}
/** A stop is proved by its item held now; still uploading, or gone, proves nothing. */
export function stopProved(identity: unknown, answers: Answers): 'applied' | undefined {
  return heldIn(answers, (identity ?? {}) as { item?: string; computer?: string })?.state === 'pending' ? 'applied' : undefined;
}
// A discard has no proof but its own 204: an item gone from the list may have been delivered, or discarded
// by someone else, so a lost discard stays held and its band says the item is no longer held (heldGone).
/** Whether a complete list shows the item gone (for a held band's words; never a proof of delivery or discard). */
export const heldGone = (item: string, l: Listed<Held> | undefined): boolean => !!l && l.listed && l.complete && !l.items.some((h) => h.id === item);

/** The computer's own disk from the API's stats answer (GET /computers/:id/stats: `data.disk.root`, bytes): its use
 *  and size, or null when the answer does not say both (a missing or non-number field, no size, or a use above the
 *  size: never read as 0). */
export function diskOf(raw: unknown): { used: number; total: number } | null {
  const root = obj(obj(obj(obj(raw)?.data)?.disk)?.root);
  const used = root?.usage;
  const total = root?.total;
  if (typeof used !== 'number' || typeof total !== 'number' || !Number.isFinite(used) || !Number.isFinite(total)) return null;
  return used >= 0 && total > 0 && used <= total ? { used, total } : null;
}

/** Whether a backend still has a mount (its own paths, or a mount row naming it): it is unmounted first. */
export const isMounted = (b: Backend, mounts: readonly Mount[]): boolean => b.mountPaths.length > 0 || mounts.some((m) => m.backend === b.id);
