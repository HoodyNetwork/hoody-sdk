// The Files page's read-only helpers (split out of ro.ts so the terminal build shares them; the contract is at the top
// of ro.ts). ro.ts re-exports every name here and keeps openLink (window.open).
import { portAddress } from '@core';
import { ALIAS_FIRST, partOk, partsOf, type Entry } from './logic';

export type LinkKind = 'download' | 'zip' | 'view' | 'edit';
const QUERY: Record<LinkKind, string> = { download: '?download=1', zip: '?zip&download=1', view: '?view', edit: '?edit' };
const LOSSY = '�';

/** Enough of a computer to build its files-program address. */
export interface LinkComputer { readonly id: string; readonly project_id: string; readonly server_name: string }

/** First parts the WebDAV-style surface reads as the program itself, not a file. */
export const reservedWebdav = (parts: readonly string[]): boolean =>
  (parts[0] === 'api' && parts[1] === 'v1') || parts[0] === '__hoody-files__' || !!parts[0]?.startsWith('hoody-files-assets_');

export function fileLink(c: LinkComputer, path: string, kind: LinkKind): string {
  const base = portAddress({ id: c.project_id }, { id: c.id, server_name: c.server_name }, 1, 'files');
  if (!base.startsWith('https://')) return '';
  const parts = partsOf(path);
  // What blockedPath refuses (a lossy name, a part core can't send) is refused here too; only depth is no limit for
  // a link.
  if (parts.length === 0 || parts.some((p) => p.includes(LOSSY) || !partOk(p))) return '';
  const enc = parts.map(encodeURIComponent);
  const root = base.replace(/\/+$/, '');
  if (kind === 'zip' || kind === 'download') {
    // The REST read, never the WebDAV-style `/<path>?download`: on a folder (one that replaced the file since the
    // listing) that path starts a download INTO the folder, a change. The REST path's first part may be one of the
    // program's own commands (stat, glob ...): not addressable here.
    if (ALIAS_FIRST.has(parts[0]!)) return '';
    return `${root}/api/v1/files/${enc.join('/')}${QUERY[kind]}`;
  }
  // The WebDAV-style surface keeps these first parts for the program itself: its API, its openapi, its page assets.
  if (reservedWebdav(parts)) return '';
  return `${root}/${enc.join('/')}${QUERY[kind]}`;
}

// ── Previews ─────────────────────────────────────────────────────────────────────────────────────────
/** The thumbnail is asked at this box and read at most this many bytes. */
export const THUMB_SIZE = '1024';
export const THUMB_BYTES = 512 * 1024;
/** Text previews read the first lines, at most this many bytes. */
export const TEXT_LINES = 400;
export const TEXT_BYTES = 256 * 1024;

const IMAGE_EXT: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'heic']);
export type PreviewKind = 'image' | 'text';
export function previewKind(name: string): PreviewKind {
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXT.has(name.slice(dot + 1).toLowerCase()) ? 'image' : 'text';
}

const starts = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);
function imageType(b: Uint8Array): string | null {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(b, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}
export function imageDataUrl(b: Uint8Array): string | null {
  const type = imageType(b);
  if (!type) return null;
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

// C0 and C1 controls but tab and line feed, DEL, and the bidirectional and invisible format characters:
// written out, so a preview cannot redraw itself or reorder what it shows.
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const hex = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, '0');
/** Writes out the characters above as `\xNN` / `\uNNNN` (tab and line feed kept). Shared: Open with's safeLabel. */
export function escapeUnsafe(s: string): string {
  return s.replace(UNSAFE, (ch) => {
    const n = ch.charCodeAt(0);
    return n < 0x100 ? `\\x${hex(n, 2)}` : `\\u${hex(n, 4)}`;
  });
}
export function textOf(b: Uint8Array): string | null {
  if (b.includes(0)) return null;
  // ignoreBOM: a leading BOM is kept, so it is written out like any other.
  return escapeUnsafe(new TextDecoder('utf-8', { ignoreBOM: true }).decode(b).replace(/\r\n/g, '\n'));
}

// ── Find by name (?q=) ──────────────────────────────────────────────────────────────────────────────────
export const FIND_MAX_BYTES = 512;
/** The program stops a search at this many matches. */
export const FIND_CAP = 1000;
const enc = new TextEncoder();
export function findQuery(raw: string): string | null {
  const q = raw.trim();
  if (!q.replace(/[/\\]/g, '')) return null;
  if (enc.encode(q).length > FIND_MAX_BYTES || enc.encode(q.toLowerCase()).length > FIND_MAX_BYTES) return null;
  return q;
}

/** One match: its full path, and an Entry named by its path below the searched folder. */
export interface Found extends Entry { readonly path: string }
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function foundOf(raw: unknown, base: string): { items: Found[]; capped: boolean } | null {
  const d = obj(raw);
  if (!d || !Array.isArray(d.entries) || typeof d.path !== 'string') return null;
  const norm = (p: string) => '/' + partsOf(p).join('/');
  // The answer names the folder it searched; another folder's answer is not this search's, even when empty.
  if (norm(d.path) !== norm(base)) return null;
  const prefix = base === '/' ? '/' : `${norm(base)}/`;
  const items: Found[] = [];
  for (const e of d.entries) {
    const x = obj(e);
    if (!x || typeof x.name !== 'string' || typeof x.is_dir !== 'boolean') return null;
    const parts = partsOf(x.name);
    if (!x.name.startsWith('/') || parts.some((p) => p === '.' || p === '..')) return null;
    const path = '/' + parts.join('/');
    // Matches come back as paths from the computer's top; one outside the searched folder is no answer to this search.
    if (!path.startsWith(prefix) || path.length === prefix.length) return null;
    const secs = count(x.modified);
    items.push({ path, name: path.slice(prefix.length), dir: x.is_dir, size: x.is_dir ? null : count(x.size), modified: secs === null ? null : secs * 1000, lossy: path.includes(LOSSY) });
  }
  return { items, capped: d.entries.length >= FIND_CAP };
}
