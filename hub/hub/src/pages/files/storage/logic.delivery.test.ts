// Delivery to storage is write-back: the mount list's delivery fields read as they are
// (never a guessed 0), a mount's sync state, a write's sync state, the pending-upload list and files, and what a fresh
// list proves about a lost deliver, stop or discard. A pending upload that is gone from the list proves only that it
// is no longer held on the computer: delivered or discarded, the list cannot tell which.
import { describe, expect, it } from 'vitest';
import { deliverProved, heldFilesOf, heldGone, heldOf, mountsOf, stopProved, syncOf, writeSync, type Held, type Mount } from './logic';

const M = 'mount_' + 'b'.repeat(32);
const B = 'a'.repeat(16);
const P = 'c'.repeat(32);
const row = (extra: Record<string, unknown> = {}) => ({ id: M, backend_id: B, mount_path: '/mnt/hoody/box', label: 'Box', status: 'active', ...extra });
const idle = { auto_deliver: true, pending_uploads: { count: 0, bytes: 0 }, uploads: { state: 'idle', dirty: 0, open_handles: 0 } };
const one = (extra: Record<string, unknown> = {}): Mount => mountsOf({ mounts: [row({ ...idle, ...extra })] }).items[0]!;

describe('mount delivery fields', () => {
  it('reads uploads, pending uploads and the automatic delivery as the program sends them', () => {
    const m = one({ pending_uploads: { count: 2, bytes: 70 }, uploads: { state: 'busy', dirty: 3, open_handles: 1 }, delivery: { pending_upload_id: P, stop: `POST /api/v1/pending-uploads/${P}/stop` }, status: 'mounting', status_message: 'delivering 2 files that were waiting to upload' });
    expect(m.delivery).toEqual({ auto: true, pending: { count: 2, bytes: 70 }, uploads: { state: 'busy', dirty: 3, open: 1 }, waitsOn: P });
  });
  it('an unknown upload state keeps its counts unknown (null), never 0', () => {
    const m = one({ uploads: { state: 'unknown', dirty: null, open_handles: null } });
    expect(m.delivery.uploads).toEqual({ state: 'unknown', dirty: null, open: null });
  });
  it('absent or malformed delivery fields read as unknown; the row itself stays, and the list stays complete', () => {
    const l = mountsOf({ mounts: [row(), row({ id: 'mount_' + 'd'.repeat(32), uploads: { state: 'sleepy', dirty: -1 }, pending_uploads: { count: 'x' } })] });
    expect(l.complete).toBe(true);
    expect(l.items.map((m) => m.delivery)).toEqual([
      { auto: true, pending: null, uploads: null, waitsOn: '' },
      { auto: true, pending: null, uploads: null, waitsOn: '' },
    ]);
  });
  it('no server-side text is kept from the mount: status_message is not read', () => {
    const m = one({ status_message: 'delivering 2 files that were waiting to upload' });
    expect(JSON.stringify(m)).not.toContain('delivering 2 files');
  });
});

describe('a mount\'s sync state', () => {
  it('idle with nothing pending: synced', () => expect(syncOf(one())).toBe('synced'));
  it('busy or changed files not uploaded yet: syncing', () => {
    expect(syncOf(one({ uploads: { state: 'busy', dirty: 2, open_handles: 0 } }))).toBe('syncing');
    expect(syncOf(one({ uploads: { state: 'busy', dirty: 0, open_handles: 1 } }))).toBe('syncing');
    // Synced needs idle and no changed file left.
    expect(syncOf(one({ uploads: { state: 'idle', dirty: 1, open_handles: 0 } }))).toBe('syncing');
  });
  it('files waiting in a pending upload: waiting (not failed: they may still be uploading)', () => {
    expect(syncOf(one({ pending_uploads: { count: 1, bytes: 5 } }))).toBe('waiting');
  });
  it('unknown, an unreadable state, or a mount that is not open: unknown', () => {
    expect(syncOf(one({ uploads: { state: 'unknown', dirty: null, open_handles: null } }))).toBe('unknown');
    expect(syncOf(mountsOf({ mounts: [row()] }).items[0]!)).toBe('unknown');
    expect(syncOf(one({ status: 'error' }))).toBe('unknown');
    expect(syncOf(one({ status: 'mounting' }))).toBe('unknown');
  });
});

describe("a write's sync state (Files)", () => {
  const synced = one();
  it('no mount read since the write: sent to the computer, syncing (never synced from an older read)', () => {
    expect(writeSync({ mount: synced, readAfterWrite: false }, 'none')).toBe('sent');
  });
  it('synced only from a read after the write, an idle mount, and the file in no pending upload', () => {
    expect(writeSync({ mount: synced, readAfterWrite: true }, 'none')).toBe('synced');
  });
  it('whether the file is in a pending upload not known: never synced', () => {
    expect(writeSync({ mount: synced, readAfterWrite: true }, undefined)).toBe('unknown');
  });
  it('the file held in a pending upload: held; uploading or being delivered: syncing', () => {
    expect(writeSync({ mount: synced, readAfterWrite: true }, 'pending')).toBe('held');
    expect(writeSync({ mount: synced, readAfterWrite: true }, 'uploading')).toBe('syncing');
    expect(writeSync({ mount: synced, readAfterWrite: true }, 'delivering')).toBe('syncing');
  });
  it('a busy mount read after the write: syncing; unknown or no mount: unknown', () => {
    expect(writeSync({ mount: one({ uploads: { state: 'busy', dirty: 1, open_handles: 0 } }), readAfterWrite: true }, 'none')).toBe('syncing');
    expect(writeSync({ mount: one({ uploads: { state: 'idle', dirty: 2, open_handles: 0 } }), readAfterWrite: true }, 'none')).toBe('syncing');
    expect(writeSync({ mount: one({ uploads: { state: 'unknown', dirty: null, open_handles: null } }), readAfterWrite: true }, 'none')).toBe('unknown');
    expect(writeSync({ mount: undefined, readAfterWrite: true }, 'none')).toBe('unknown');
  });
});

const item = (extra: Record<string, unknown> = {}) => ({
  id: P, backend_id: B, mount_id: M, state: 'pending', since: 1_700_000_000, file_count: 3, incomplete_count: 1, total_bytes: 900,
  reasons: { open_when_stopped: 1, unconfirmed_at_stop: 2, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 },
  deliverable: true, ...extra,
});

describe('pending uploads', () => {
  it('reads the list (the answer\'s data) with each item\'s state, counts and reasons; no kit text is kept', () => {
    const l = heldOf({ success: true, message: 'Pending uploads', data: [item({ last_error: 'the storage refused the upload' })] });
    expect(l.listed && l.complete).toBe(true);
    expect(l.items[0]).toEqual({ id: P, backend: B, mount: M, state: 'pending', since: 1_700_000_000, files: 3, incomplete: 1, bytes: 900, deliverable: true, lastFailed: true, reasons: { open_when_stopped: 1, unconfirmed_at_stop: 2 } });
    expect(JSON.stringify(l)).not.toContain('refused the upload');
  });
  it('an item with an unknown state or a bad id is left out, and the list is then not complete', () => {
    const l = heldOf({ data: [item(), item({ id: 'nope' }), item({ id: 'd'.repeat(32), state: 'sleeping' })] });
    expect(l.items.map((x) => x.id)).toEqual([P]);
    expect(l.complete).toBe(false);
  });
  it('no list in the answer: not listed', () => expect(heldOf({ data: null }).listed).toBe(false));
  it('reads a files page: each file by its path bytes (path_b64), the shown name, size, reason and whether it is whole', () => {
    const page = heldFilesOf({ data: { files: [
      { path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 4, modified_at: 1, reason: 'open_when_stopped', complete: false },
      { path_b64: 'eP8', path_display: 'x�', size: 2, modified_at: 1, reason: 'cannot_verify', complete: true },
    ], next_cursor: 'abc' } });
    expect(page.files).toEqual([
      { key: 'ZG9jcy9hLnR4dA', name: 'docs/a.txt', exact: true, size: 4, reason: 'open_when_stopped', complete: false },
      { key: 'eP8', name: 'x�', exact: false, size: 2, reason: 'cannot_verify', complete: true },
    ]);
    expect(page.more).toBe(true);
    expect(page.complete).toBe(true);
  });
  it('a files page with a row it cannot read, or a cursor it cannot read, is not complete', () => {
    expect(heldFilesOf({ data: { files: [{ path_b64: 'eA', size: 'x', complete: true }] } }).complete).toBe(false);
    expect(heldFilesOf({ data: { files: [], next_cursor: 7 } }).complete).toBe(false);
    expect(heldFilesOf({ data: { files: [], next_cursor: null } }).complete).toBe(true);
  });
});

describe('what a fresh pending-upload list proves', () => {
  const list = (items: Held[], complete = true) => [[{ listed: true, complete, items, computer: 'c1' }]] as const;
  const held = (state: Held['state']): Held => heldOf({ data: [item({ state })] }).items[0]!;
  const id = { computer: 'c1', item: P };
  it('a deliver is proved by the item being delivered now; held still, or gone, proves nothing', () => {
    expect(deliverProved(id, list([held('delivering')]))).toBe('applied');
    expect(deliverProved(id, list([held('pending')]))).toBeUndefined();
    expect(deliverProved(id, list([]))).toBeUndefined();
  });
  it('a stop is proved by the item held now; uploading still, or gone, proves nothing', () => {
    expect(stopProved(id, list([held('pending')]))).toBe('applied');
    expect(stopProved(id, list([held('uploading')]))).toBeUndefined();
    expect(stopProved(id, list([]))).toBeUndefined();
  });
  it('a list of another computer proves nothing', () => {
    expect(deliverProved({ computer: 'c2', item: P }, list([held('delivering')]))).toBeUndefined();
    expect(stopProved({ computer: 'c2', item: P }, list([held('pending')]))).toBeUndefined();
  });
  it('heldGone: a complete list of this computer without the item (for the words, never as proof of delivery)', () => {
    expect(heldGone(P, { listed: true, complete: true, items: [], computer: 'c1' })).toBe(true);
    expect(heldGone(P, { listed: true, complete: false, items: [], computer: 'c1' })).toBe(false);
    expect(heldGone(P, { listed: true, complete: true, items: [held('pending')], computer: 'c1' })).toBe(false);
    expect(heldGone(P, undefined)).toBe(false);
  });
});
