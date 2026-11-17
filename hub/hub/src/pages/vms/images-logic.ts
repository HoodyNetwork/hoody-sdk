// Pure rules of the Images view: no React, no I/O.
//
// Contract, in plain words:
//   - One parser per wire shape of the VM program's image store (parseImages, parseDownloads, parseDownload,
//     parseCatalogue). Each checks every field it reads and returns a typed value, or null when the answer is not that
//     shape or contradicts itself. A list with one unreadable row is unreadable whole: a list with a hole in it would
//     read as "that image is gone".
//   - A download is `moving` while it fetches or is being checked; only a fetching one can be cancelled, a finished one
//     (done, failed, cancelled, cut off) can be cleared, and one being checked can be neither.
//   - linkCheck and shaCheck say whether what the person typed can be sent at all. The VM program decides the rest (a
//     private address, a link that does not answer).
//   - The proofs read fresh lists only: an image delete is proved by lists without that image, a download's cancel or
//     clear by lists without that job (or with it cancelled). A list that still holds it proves nothing: the request
//     may not have been worked yet. A lost "add" has no proof (the same link can be two jobs).
import type { VmCode } from './logic';

// ── small readers ────────────────────────────────────────────────────────────────────

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const text = (v: unknown, max = 4096): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null => (typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : null);
const BAD = Symbol('bad');
/** An optional field: absent reads as null; present and unreadable is BAD. */
function opt<T>(o: Record<string, unknown>, key: string, read: (v: unknown) => T | null): T | null | typeof BAD {
  if (!Object.hasOwn(o, key) || o[key] === undefined) return null;
  const v = read(o[key]);
  return v === null ? BAD : v;
}

const SHA256 = /^[0-9a-f]{64}$/;
const JOB_ID = /^[0-9a-f]{32}$/;
const sha = (v: unknown): string | null => (typeof v === 'string' && SHA256.test(v) ? v : null);
/** The one architecture a VM here can start from. */
export const BOOT_ARCH = 'x86_64';

// ── images ───────────────────────────────────────────────────────────────────────────

export interface Image {
  /** The image's identity. */
  readonly sha256: string;
  /** `uploading`: its bytes are still arriving (sent with the CLI); only a `ready` image can be used. */
  readonly phase: 'ready' | 'uploading';
  /** Bytes stored so far: the whole size once ready. */
  readonly bytes: number;
  readonly modifiedUnix: number;
  /** The system the image was recognised as ("Debian 13"); null: not recognised. */
  readonly system: string | null;
  /** The name the image gives itself; null: none. */
  readonly volumeId: string | null;
  /** False: it was recognised and is for another kind of machine, so no VM here starts from it. Null: not known. */
  readonly bootable: boolean | null;
}

function imageOf(v: unknown): Image | null {
  const r = rec(v);
  if (!r) return null;
  const id = sha(r.sha256), phase = oneOf(r.phase, ['ready', 'uploading'] as const), bytes = count(r.bytes), partSize = count(r.part_size), modifiedUnix = count(r.modified_unix);
  const nextPart = opt(r, 'next_part', count);
  if (id === null || phase === null || bytes === null || partSize === null || modifiedUnix === null || nextPart === BAD) return null;
  // A finished image has no part left to send.
  if (phase === 'ready' && nextPart !== null) return null;
  let system: string | null = null, volumeId: string | null = null, bootable: boolean | null = null;
  if (r.media !== undefined) {
    const m = rec(r.media);
    if (!m || !Array.isArray(m.os)) return null;
    // What an image says about itself is read only once its bytes were checked.
    if (phase !== 'ready') return null;
    const vol = opt(m, 'volume_id', (x) => text(x, 512));
    if (vol === BAD) return null;
    volumeId = vol && vol.trim() ? vol.trim() : null;
    const arches: string[] = [];
    for (const it of m.os) {
      const o = rec(it);
      if (!o || text(o.id, 512) === null || flag(o.live) === null || flag(o.installer) === null) return null;
      const name = opt(o, 'name', (x) => text(x, 256)), arch = opt(o, 'arch', (x) => text(x, 64));
      if (name === BAD || arch === BAD) return null;
      if (system === null && name && name.trim()) system = name.trim();
      if (arch) arches.push(arch);
    }
    if (arches.length > 0) bootable = arches.includes(BOOT_ARCH);
  }
  return { sha256: id, phase, bytes, modifiedUnix, system, volumeId, bootable };
}

/** The image list, or null when the answer is not one. */
export function parseImages(wire: unknown): Image[] | null {
  if (!Array.isArray(wire)) return null;
  const out: Image[] = [];
  const seen = new Set<string>();
  for (const it of wire) {
    const im = imageOf(it);
    // One identity, one image: two rows under one cannot both be read.
    if (!im || seen.has(im.sha256)) return null;
    seen.add(im.sha256);
    out.push(im);
  }
  return out;
}

/** The start of an image's identity, enough to tell two apart on screen. */
export const shortSha = (sha256: string): string => sha256.slice(0, 12);

// ── downloads ────────────────────────────────────────────────────────────────────────

export const DOWNLOAD_STATES = ['running', 'verifying', 'ready', 'failed', 'cancelled', 'interrupted'] as const;
export type DownloadState = (typeof DOWNLOAD_STATES)[number];

export interface Download {
  readonly id: string;
  readonly state: DownloadState;
  /** The site the image comes from (the link's host); '' when the link the program kept is not a web link. */
  readonly host: string;
  readonly fetchedBytes: number;
  /** The size the site announced; null: it gave none. */
  readonly expectedBytes: number | null;
  /** The image it became; null until it is done. */
  readonly sha256: string | null;
  /** Whether the bytes were checked against a SHA-256 the person gave; null until it is done. */
  readonly checked: boolean | null;
  /** The program's sentence for a failed download; null: none. */
  readonly error: string | null;
}

/** The host of a web link, or '' when it is not one. Never the whole link: a link may carry a key. */
export function linkHost(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.host : '';
  } catch {
    return '';
  }
}

/** One download job, or null when the answer is not one. */
export function parseDownload(v: unknown): Download | null {
  const r = rec(v);
  if (!r) return null;
  const id = typeof r.id === 'string' && JOB_ID.test(r.id) ? r.id : null;
  const state = oneOf(r.state, DOWNLOAD_STATES), url = text(r.url, 8192), fetchedBytes = count(r.fetched_bytes);
  const expectedBytes = opt(r, 'expected_bytes', count), digest = opt(r, 'sha256', sha), error = opt(r, 'error', (x) => text(x));
  const verification = opt(r, 'verification', (x) => oneOf(x, ['asserted', 'tofu'] as const));
  if (id === null || state === null || url === null || fetchedBytes === null || expectedBytes === BAD || digest === BAD || error === BAD || verification === BAD) return null;
  // A finished download names the image it became; one that is not finished names none.
  if ((state === 'ready') !== (digest !== null)) return null;
  return {
    id, state, host: linkHost(url), fetchedBytes, expectedBytes, sha256: digest, checked: verification === null ? null : verification === 'asserted',
    error: error && error.trim() ? error.trim() : null,
  };
}

/** The download list, or null when the answer is not one. */
export function parseDownloads(wire: unknown): Download[] | null {
  if (!Array.isArray(wire)) return null;
  const out: Download[] = [];
  const seen = new Set<string>();
  for (const it of wire) {
    const d = parseDownload(it);
    if (!d || seen.has(d.id)) return null;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

/** Still at work: fetching, or being checked. */
export const downloadMoving = (d: Pick<Download, 'state'>): boolean => d.state === 'running' || d.state === 'verifying';

/** What can be done with a download's row: `cancel` stops a fetch (what was fetched is removed); `clear` removes a
 *  finished row (never the image it made); `wait`: it is being checked and can be neither until that ends. */
export function downloadAction(d: Pick<Download, 'state'>): 'cancel' | 'clear' | 'wait' {
  if (d.state === 'running') return 'cancel';
  return d.state === 'verifying' ? 'wait' : 'clear';
}

export const DOWNLOADS_FAST_MS = 3_000;
export const DOWNLOADS_SLOW_MS = 30_000;
/** How often the downloads are read again: fast while one is at work, slow otherwise. */
export const downloadsPollMs = (rows: readonly Pick<Download, 'state'>[] | null | undefined): number =>
  (rows ?? []).some(downloadMoving) ? DOWNLOADS_FAST_MS : DOWNLOADS_SLOW_MS;

// ── the catalogue of systems ─────────────────────────────────────────────────────────

export interface SystemChoice {
  /** The vendor's link to the image. */
  readonly url: string;
  /** The system's name ("Debian 13"). */
  readonly name: string;
  /** Which image of that system ("netinst"); '' when the catalogue names none. */
  readonly variant: string;
  /** It starts without installing. */
  readonly live: boolean;
}

export interface Catalogue {
  /** False: the computer has no list of systems (or a damaged one) to pick from. */
  readonly available: boolean;
  readonly choices: readonly SystemChoice[];
}

/** The catalogue of systems, cut to the images a VM here can start from, or null when the answer is not one. */
export function parseCatalogue(wire: unknown): Catalogue | null {
  const w = rec(wire);
  if (!w || !Array.isArray(w.entries)) return null;
  const available = flag(w.available), status = oneOf(w.status, ['healthy', 'damaged', 'absent'] as const), unreadable = count(w.unreadable);
  if (available === null || status === null || unreadable === null || (w.arch !== null && text(w.arch, 64) === null)) return null;
  // A list with nothing in it is not available, and a healthy one lost no file.
  if ((available && status === 'absent') || (status === 'healthy' && unreadable > 0)) return null;
  const choices: SystemChoice[] = [];
  const seen = new Set<string>();
  for (const it of w.entries) {
    const e = rec(it);
    const id = text(e?.id, 512);
    if (!e || id === null || !Array.isArray(e.media)) return null;
    const name = opt(e, 'name', (x) => text(x, 256)), shortId = opt(e, 'short_id', (x) => text(x, 256));
    if (name === BAD || shortId === BAD) return null;
    const title = (name && name.trim()) || (shortId && shortId.trim()) || '';
    for (const mv of e.media) {
      const m = rec(mv);
      const url = text(m?.url, 2048), live = flag(m?.live);
      if (!m || url === null || live === null || flag(m.installer) === null || flag(m.identifiable) === null) return null;
      const arch = opt(m, 'arch', (x) => text(x, 64)), variant = opt(m, 'variant', (x) => text(x, 128));
      if (arch === BAD || variant === BAD) return null;
      // Only what can start here, by a link that can be sent, under a name a person can pick.
      if (arch !== BOOT_ARCH || title === '' || linkCheck(url) !== 'ok' || seen.has(url)) continue;
      seen.add(url);
      choices.push({ url, name: title, variant: variant ? variant.trim() : '', live });
    }
  }
  choices.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.variant.localeCompare(b.variant, 'en'));
  return { available, choices };
}

// ── what the person types ────────────────────────────────────────────────────────────

export const LINK_MAX = 2048;

/** Whether a typed link can be sent: `empty`, `ok`, or `invalid` (not an http(s) link, one that carries a user name or
 *  password, or one too long). */
export function linkCheck(typed: string): 'empty' | 'ok' | 'invalid' {
  const v = typed.trim();
  if (v === '') return 'empty';
  if (v.length > LINK_MAX || /\s/.test(v)) return 'invalid';
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '' && u.username === '' && u.password === '' ? 'ok' : 'invalid';
  } catch {
    return 'invalid';
  }
}

/** A typed SHA-256: null when none was typed, the 64 lower-case hex digits when it is one, undefined when it is not. */
export function shaCheck(typed: string): string | null | undefined {
  const v = typed.trim().toLowerCase();
  if (v === '') return null;
  return SHA256.test(v) ? v : undefined;
}

// ── proofs ───────────────────────────────────────────────────────────────────────────

type Verdict = 'applied' | 'not_applied' | undefined;
const lists = <T,>(answers: readonly (readonly unknown[])[]): readonly (readonly T[])[] | null => {
  const a = answers[0];
  return a && a.length > 0 && a.every(Array.isArray) ? (a as readonly (readonly T[])[]) : null;
};

/** An image delete: proved by fresh image lists that all lack it. */
export function imageGoneProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = sha(rec(identity)?.image);
  const fresh = lists<Image>(answers);
  if (id === null || !fresh) return undefined;
  return fresh.every((l) => !l.some((x) => x.sha256 === id)) ? 'applied' : undefined;
}

/** A download's cancel or clear (`how` in the identity; they are different things to the VM program). A cancel is
 *  proved by fresh download lists in which the job is cancelled or gone; a clear only by lists in which it is gone:
 *  a row that was already cancelled and is still listed was not cleared. An identity that says neither proves nothing. */
export function downloadGoneProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = rec(identity);
  const job = id?.job, how = id?.how;
  const fresh = lists<Download>(answers);
  if (typeof job !== 'string' || !JOB_ID.test(job) || (how !== 'cancel' && how !== 'clear') || !fresh) return undefined;
  return fresh.every((l) => { const d = l.find((x) => x.id === job); return !d || (how === 'cancel' && d.state === 'cancelled'); }) ? 'applied' : undefined;
}

// ── refusals ─────────────────────────────────────────────────────────────────────────

/** The VM program's codes this view has its own sentence for, per change: definite refusals (4xx). */
export const IMAGE_CODES = {
  add: ['SpecInvalid', 'AlreadyExists', 'OperationInProgress'],
  remove: ['BadState', 'OperationInProgress', 'NotFound'],
  stop: ['BadState', 'NotFound'],
} as const satisfies Record<string, readonly VmCode[]>;
export type ImageChange = keyof typeof IMAGE_CODES;
export type ImageErrKey = { [C in ImageChange]: `images.err.${C}.${(typeof IMAGE_CODES)[C][number]}` }[ImageChange];

/** The string key of a refusal's own sentence (`images.err.<change>.<code>`), or null when the view has none. */
export function imageErrKey(change: ImageChange, code: unknown): ImageErrKey | null {
  return typeof code === 'string' && (IMAGE_CODES[change] as readonly string[]).includes(code) ? (`images.err.${change}.${code}` as ImageErrKey) : null;
}

/** Codes the VM program answers with a 5xx although nothing was started: the outcome stays held (core's rule for a
 *  5xx), and the held note adds what the computer reported. */
export const IMAGE_REASONS = ['InsufficientSpace', 'DownloadFailed'] as const satisfies readonly VmCode[];
export type ImageReasonKey = `images.reason.${(typeof IMAGE_REASONS)[number]}`;
export const imageReasonKey = (code: unknown): ImageReasonKey | null =>
  typeof code === 'string' && (IMAGE_REASONS as readonly string[]).includes(code) ? (`images.reason.${code}` as ImageReasonKey) : null;
