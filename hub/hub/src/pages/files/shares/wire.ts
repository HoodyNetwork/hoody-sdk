// Share rows as the Hub reads them from the storage share answers. Only the computer-named shape is read
// (source_computer_id, target_computer_id): an API still on the old container-named shape gives no rows, so the
// section shows empty rather than wrong. A row that cannot be read is dropped and counted, never guessed at.

export type ShareMode = 'readonly' | 'readwrite';

export interface ShareRow {
  readonly id: string;
  readonly sourceComputerId: string;
  readonly sourcePath: string;
  /** Where the folder appears on the receiver; null when the answer does not carry the field. */
  readonly mountPath: string | null;
  readonly targetType: 'computer' | 'project';
  readonly targetComputerId: string | null;
  readonly targetProjectId: string | null;
  readonly mode: ShareMode;
  readonly enabled: boolean;
  /** 'other' is a status this Hub does not know (the API publishes active and failed only). */
  readonly status: 'active' | 'failed' | 'other';
  readonly statusMessage: string | null;
  /** Unix seconds, or null for no end (or an end not known: see expiryKnown). */
  readonly expiresAt: number | null;
  /** False when the answer gave no clear end (absent or not finite seconds): the share may already have expired. */
  readonly expiryKnown: boolean;
}

export interface ShareList {
  readonly rows: readonly ShareRow[];
  /** Rows the answer held that could not be read. */
  readonly dropped: number;
  /** Which list this is, when its read says (data.ts): 'given:<computer>', 'received:<computer>', 'allGiven' or
   *  'allReceived'. A change's read-back needs it to tell whose list lacks a share (changes.ts stopProved). */
  readonly of?: string;
}

// The API's own rule for a mount path (its expression and its check).
export const MOUNT_PATH_RE = /^\/hoody\/shares\/([A-Za-z0-9._-]{1,40})-([0-9a-f]{8,16})$/;

/** The API's mount path check: one folder under /hoody/shares, a name and 8 to 16 hex digits, no leading dot or '..'. */
export function mountPathOk(path: string): boolean {
  const m = MOUNT_PATH_RE.exec(path);
  if (!m) return false;
  const name = m[1] ?? '';
  return !name.startsWith('.') && !name.includes('..');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function boolOf(v: unknown): boolean | null {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  return null;
}

/** One share as the source computer's list or an incoming list carries it, or null. */
export function shareRowOf(raw: unknown): ShareRow | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id), sourceComputerId = str(raw.source_computer_id), sourcePath = str(raw.source_path);
  if (!id || !sourceComputerId || !sourcePath) return null;
  const mode = raw.mode === 'readonly' || raw.mode === 'readwrite' ? raw.mode : null;
  const enabled = boolOf(raw.enabled);
  if (!mode || enabled === null) return null;
  const targetComputerId = str(raw.target_computer_id), targetProjectId = str(raw.target_project_id);
  const targetType = raw.target_type === 'computer' ? 'computer' : raw.target_type === 'project' ? 'project' : null;
  if (targetType === 'computer' ? !targetComputerId : targetType === 'project' ? !targetProjectId : true) return null;
  const mountPath = typeof raw.mount_path === 'string' ? raw.mount_path : null;
  const status = raw.status === 'active' || raw.status === 'failed' ? raw.status : 'other';
  // null is the API's "no end"; only finite seconds are an end. Anything else (absent, a string, NaN) is not known.
  const expiresAt = typeof raw.expires_at === 'number' && Number.isFinite(raw.expires_at) ? raw.expires_at : null;
  const expiryKnown = raw.expires_at === null || expiresAt !== null;
  return {
    id, sourceComputerId, sourcePath, mountPath, targetType: targetType as 'computer' | 'project',
    targetComputerId: targetType === 'computer' ? targetComputerId : null,
    targetProjectId: targetType === 'project' ? targetProjectId : null,
    mode, enabled, status, statusMessage: str(raw.status_message), expiresAt, expiryKnown,
  };
}

/** A list answer ({data: [...]}) as rows. Anything but an array under data reads as no list at all (null). */
export function shareListOf(answer: unknown): ShareList | null {
  const data = isObj(answer) ? answer.data : undefined;
  if (!Array.isArray(data)) return null;
  const rows: ShareRow[] = [];
  for (const item of data) {
    const row = shareRowOf(item);
    if (row) rows.push(row);
  }
  return { rows, dropped: data.length - rows.length };
}

/** The row a create or update answers ({data: share}), or null. */
export function shareAnswerOf(answer: unknown): ShareRow | null {
  return isObj(answer) ? shareRowOf(answer.data) : null;
}
