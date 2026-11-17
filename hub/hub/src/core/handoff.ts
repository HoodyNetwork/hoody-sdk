// handoff.ts: the round trip from a model chooser to the AI page and back.
// A page that sends the person to the AI page ("Your own endpoint", "Claude Code", "Set up on the AI page") writes one
// small record; the AI page reads it to say who it is setting up for and to offer Go back; the origin page rebuilds its
// form from it when it loads again.
//
// Storage: `hub_model_handoff_v1`, session storage of this tab, per account and per target computer (the raw computer
// id is the part; one entry per account and computer, a new trip replaces the old one), purged at sign-out. An entry
// lives 30 minutes; an expired entry is removed when read.
//
// Secrets never go in: every write and every read rebuilds the record from an allowlist of fields with fixed types
// and bounded lengths (`parseHandoff`), so a key, a sign-in code, a created secret or any field a caller adds is
// dropped, never stored. A record that does not parse reads as none.
import { capture, realm as currentRealm } from './ctx';
import { partitioned, type Partitioned } from './kit-io';
import { isRecord } from './shape';

export const HANDOFF_KEY = 'hub_model_handoff_v1';
/** How long a trip may take before the record is ignored and removed. */
export const HANDOFF_TTL_MS = 30 * 60 * 1000;

export interface NewBotDraft {
  kind: 'newBot';
  name: string;
  instructions: string;
  link: boolean;
  computer: string;
  model: { spec: string; consent: boolean };
}
export interface SettingsDraft {
  kind: 'settings';
  botKey: string;
  uid: string;
  revision: number;
  name: string;
  role: string;
  instructions: string;
  rules: string;
}
/** A thinking level as a model picker drafts it ('' = the caller's default). */
export type PickThinking = '' | 'off' | 'on' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** The model a picker was choosing when the person left to set its provider up: handed back on return, then judged
 *  again against what the page reads then. */
export interface PickTrip {
  intent: 'pick';
  spec: string;
  thinking: PickThinking;
}
export type HandoffDest = 'endpoint' | 'claude' | 'connect';
export interface HandoffResult {
  status: 'done' | 'created' | 'left';
  provider?: string;
}
export interface Handoff {
  v: 1;
  /** 16 random hex characters. */
  id: string;
  /** When the trip began (ms). */
  at: number;
  scope: { account: string; realm: string; computer: string; gen: number; boot: string };
  /** href: a same-origin hash path that reopens the origin; label: public words; focus: the control to focus on return. */
  origin: { page: 'bots' | 'logs'; href: string; label: string; focus: string };
  /** The computer the setup is for (it may differ from the shell's when the trip began). */
  target: { computer: string; name: string };
  dest: HandoffDest;
  provider?: string;
  draft?: NewBotDraft | SettingsDraft;
  pick?: PickTrip;
  result?: HandoffResult;
}

const ID = /^[0-9a-f]{16}$/;
const PART = /^(?!__proto__$)[A-Za-z0-9_.:-]{1,64}$/;
const PROVIDER = /^[A-Za-z0-9_.:-]{1,64}$/;
// Field bounds: the record stays far under the store's 64 KiB per key, and a field over its bound fails the parse
// (never cut: a cut draft would come back as something the person did not type).
const SHORT = 256, TEXT = 16384, HREF = 2048;

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const nonEmpty = (v: unknown, max: number): v is string => str(v, max) && v !== '';
const int = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A same-origin hash path ('/bots?drawer=new'): never a scheme, a host or a protocol-relative '//'. */
function localHref(v: unknown): v is string {
  return nonEmpty(v, HREF) && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') && !/[\u0000-\u001f\u007f]/.test(v);
}

function parseDraft(v: unknown): NewBotDraft | SettingsDraft | null {
  if (!isRecord(v)) return null;
  if (v.kind === 'newBot') {
    const m = v.model;
    if (!str(v.name, SHORT) || !str(v.instructions, TEXT) || typeof v.link !== 'boolean' || !str(v.computer, SHORT)) return null;
    if (!isRecord(m) || !str(m.spec, SHORT) || typeof m.consent !== 'boolean') return null;
    return { kind: 'newBot', name: v.name, instructions: v.instructions, link: v.link, computer: v.computer, model: { spec: m.spec, consent: m.consent } };
  }
  if (v.kind === 'settings') {
    if (!nonEmpty(v.botKey, SHORT) || !nonEmpty(v.uid, SHORT) || !int(v.revision)) return null;
    if (!str(v.name, SHORT) || !str(v.role, SHORT) || !str(v.instructions, TEXT) || !str(v.rules, TEXT)) return null;
    return { kind: 'settings', botKey: v.botKey, uid: v.uid, revision: v.revision, name: v.name, role: v.role, instructions: v.instructions, rules: v.rules };
  }
  return null;
}

const THINKING: readonly string[] = ['', 'off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'];

/** The pick rebuilt from its allowlist, or null when out of shape. Unlike the draft, a malformed pick is dropped alone:
 *  the trip still goes back to its origin, which then simply has no pick to hand back. */
function parsePick(v: unknown): PickTrip | null {
  if (!isRecord(v) || v.intent !== 'pick' || !nonEmpty(v.spec, SHORT) || typeof v.thinking !== 'string' || !THINKING.includes(v.thinking)) return null;
  return { intent: 'pick', spec: v.spec, thinking: v.thinking as PickThinking };
}

function parseResult(v: unknown): HandoffResult | null {
  if (!isRecord(v) || (v.status !== 'done' && v.status !== 'created' && v.status !== 'left')) return null;
  if (v.provider !== undefined && !(typeof v.provider === 'string' && PROVIDER.test(v.provider))) return null;
  return { status: v.status, ...(v.provider !== undefined ? { provider: v.provider } : {}) };
}

/**
 * The record rebuilt from its allowlist, or null when anything required is missing or out of shape. Fields that are
 * not in the allowlist (a key, a code, a secret) are dropped; an optional field that is present but malformed fails
 * the whole record, so a half-understood record is never used.
 */
export function parseHandoff(v: unknown): Handoff | null {
  if (!isRecord(v) || v.v !== 1 || !(typeof v.id === 'string' && ID.test(v.id)) || !int(v.at)) return null;
  const sc = v.scope, o = v.origin, tg = v.target;
  if (!isRecord(sc) || !nonEmpty(sc.account, SHORT) || !nonEmpty(sc.realm, SHORT) || !nonEmpty(sc.computer, SHORT) || !int(sc.gen) || !str(sc.boot, SHORT)) return null;
  if (!isRecord(o) || (o.page !== 'bots' && o.page !== 'logs') || !localHref(o.href) || !nonEmpty(o.label, SHORT) || !str(o.focus, SHORT)) return null;
  if (!isRecord(tg) || !(typeof tg.computer === 'string' && PART.test(tg.computer)) || !str(tg.name, SHORT)) return null;
  if (v.dest !== 'endpoint' && v.dest !== 'claude' && v.dest !== 'connect') return null;
  if (v.provider !== undefined && !(typeof v.provider === 'string' && PROVIDER.test(v.provider))) return null;
  const draft = v.draft === undefined ? undefined : parseDraft(v.draft);
  const result = v.result === undefined ? undefined : parseResult(v.result);
  if (draft === null || result === null) return null;
  const pick = v.pick === undefined ? null : parsePick(v.pick);
  return {
    v: 1,
    id: v.id,
    at: v.at,
    scope: { account: sc.account, realm: sc.realm, computer: sc.computer, gen: sc.gen, boot: sc.boot },
    origin: { page: o.page, href: o.href, label: o.label, focus: o.focus },
    target: { computer: tg.computer, name: tg.name },
    dest: v.dest,
    ...(v.provider !== undefined ? { provider: v.provider } : {}),
    ...(draft ? { draft } : {}),
    ...(pick ? { pick } : {}),
    ...(result ? { result } : {}),
  };
}

function store(): Partitioned | null {
  try {
    return partitioned(HANDOFF_KEY, { scope: 'account+computer', area: 'session', purge: true });
  } catch {
    return null;
  }
}

/** A fresh trip id: 16 random hex characters. */
export function newHandoffId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Writes the trip under its target computer, replacing any earlier trip for that account and computer. False when the
 * record does not parse, the target computer id is not a valid part, or the store refuses (no storage, over 64 KiB):
 * the caller then says "Leaving loses what you typed."
 */
export function writeHandoff(h: Handoff): boolean {
  const clean = parseHandoff(h);
  const box = store();
  if (!clean || !box) return false;
  return box.set(clean, clean.target.computer);
}

/**
 * The trip stored for this computer, when its id is `id`, it has not expired and it parses; else null. An expired or
 * unreadable entry is removed (only this account's entry for this computer).
 */
export function readHandoff(computer: string, id: string, now: number = Date.now()): Handoff | null {
  if (!ID.test(id)) return null;
  const h = stored(computer, now);
  return h && h.id === id ? h : null;
}

/** The trip stored for this computer when it has not expired and parses; an expired or unreadable entry is removed. */
function stored(computer: string, now: number): Handoff | null {
  const box = store();
  if (!box || !PART.test(computer)) return null;
  const raw = box.get(computer);
  if (raw == null) return null;
  const h = parseHandoff(raw);
  if (!h || now - h.at > HANDOFF_TTL_MS || h.at > now + 60_000) {
    box.remove(computer);
    return null;
  }
  return h;
}

/** True when the trip belongs to this account and realm and was written for `computer` (the record says so too). */
function ours(h: Handoff, computer: string): boolean {
  let account = '';
  try {
    account = String(capture().account ?? '');
  } catch {
    account = '';
  }
  return h.scope.account === account && h.scope.realm === currentRealm() && h.target.computer === computer;
}

/**
 * The trip for the AI page: stored, unexpired, `id` matching, for this account and realm, and for the computer the
 * shell shows now (`computer`, the raw id). null otherwise: the page then opens plainly.
 */
export function receiveHandoff(computer: string | null | undefined, id: string | null | undefined, now: number = Date.now()): Handoff | null {
  if (!computer || !id) return null;
  const h = readHandoff(computer, id, now);
  return h && ours(h, computer) ? h : null;
}

/**
 * A local href as its path and its params (decoded, sorted), without `handoff`: the same place however it was spelled.
 * null for a param named twice (encoded spellings included): the router reads only one of them, so no place is known.
 */
function placeOf(href: string): string | null {
  if (!localHref(href)) return null;
  const hash = href.indexOf('#');
  const base = hash < 0 ? href : href.slice(0, hash);
  const q = base.indexOf('?');
  let params: [string, string][];
  try {
    params = [...new URLSearchParams(q < 0 ? '' : base.slice(q + 1))].filter(([k]) => k !== 'handoff');
  } catch {
    return null;
  }
  if (new Set(params.map(([k]) => k)).size !== params.length) return null;
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([q < 0 ? base : base.slice(0, q), params]);
}

/**
 * The trip whose origin is `href` (browser Back lands on the origin's entry, which carries no
 * `handoff` param): stored for `computer`, unexpired, for this account and realm, and its origin the same path with the
 * same params as `href` (in any order; a `handoff` param is not part of the place, and a param named twice makes no
 * place). It only reads: the page that takes the trip removes it.
 */
export function handoffAtOrigin(computer: string | null | undefined, href: string, now: number = Date.now()): Handoff | null {
  if (!computer) return null;
  const here = placeOf(href);
  const h = here === null ? null : stored(computer, now);
  return h && ours(h, computer) && placeOf(h.origin.href) === here ? h : null;
}

/** Records what happened on the AI page; false when the trip is gone or the write fails. */
export function setHandoffResult(computer: string, id: string, result: HandoffResult, now: number = Date.now()): boolean {
  const h = readHandoff(computer, id, now);
  const clean = parseResult(result);
  if (!h || !clean) return false;
  return writeHandoff({ ...h, result: clean });
}

/** Removes the trip (the origin consumed it). Only this account's entry for this computer. */
export function removeHandoff(computer: string): boolean {
  const box = store();
  return !!box && PART.test(computer) && box.remove(computer);
}

/** Whether a query segment's key (before the first `=`), percent-decoded, is `handoff`. A key that does not decode is read as written. */
function isHandoffParam(segment: string): boolean {
  const key = segment.split('=')[0] ?? '';
  try { return decodeURIComponent(key) === 'handoff'; } catch { return key === 'handoff'; }
}

/**
 * The origin's href with the trip id as its `handoff` search param, so the origin finds the entry when it loads
 * again. The param goes before any fragment, and one the origin already carries (its key read percent-decoded) is
 * replaced; every other segment is kept byte for byte, an empty one too.
 */
export function handoffReturnHref(h: Handoff): string {
  const href = h.origin.href, cut = href.indexOf('#');
  const base = cut < 0 ? href : href.slice(0, cut), hash = cut < 0 ? '' : href.slice(cut);
  const q = base.indexOf('?');
  const path = q < 0 ? base : base.slice(0, q);
  const query = q < 0 ? '' : base.slice(q + 1);
  const kept = (query === '' ? [] : query.split('&')).filter((p) => !isHandoffParam(p));
  return `${path}?${[...kept, `handoff=${h.id}`].join('&')}${hash}`;
}
