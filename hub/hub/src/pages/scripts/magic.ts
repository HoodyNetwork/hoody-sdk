// A script's magic comments, drawn from the computer's own schema (GET magic-comments/schema) and read (GET magic-comments/read).
// Nothing here names a directive except the four secret ones: the field list, types, enums and ranges all come from the
// computer, so a directive the kit adds shows up without a release. Pure functions: the panel is parts/MagicPanel.tsx.

/** How a field is edited. Anything the panel cannot edit safely is 'readonly' (shown, never sent). */
export type Kind = 'bool' | 'enum' | 'int' | 'num' | 'text' | 'list' | 'boolInt' | 'boolEnum' | 'secret' | 'readonly';

/** The keys whose values the computer never shows (a read answers `[REDACTED]`) and the page never prefills or echoes. */
export const SECRET_KEYS: readonly string[] = ['token', 'tokens', 'ai-key', 'remote-token'];
export const REDACTED = '[REDACTED]';
export const isSecretKey = (key: string): boolean => SECRET_KEYS.includes(key);

export interface Field {
  key: string;
  directive: string;
  category: string;
  type: string;
  kind: Kind;
  enums: string[];
  min?: number;
  max?: number;
  description: string;
  /** What applies when the directive is absent (the schema's `defaults.when_omitted`). */
  fallback: unknown;
  /** What the computer runs with when the directive is absent (the schema's `defaults.runtime`); null when not given. */
  runtime: unknown;
  examples: string[];
}

export interface Schema {
  fields: Field[];
  /** The categories in display order: the known ones first, then any the computer added. */
  categories: string[];
}

const CATEGORY_ORDER = ['execution', 'auth', 'metadata', 'logging', 'cors', 'ai', 'remote'];
const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

const kindOf = (key: string, type: string): Kind => {
  if (isSecretKey(key)) return 'secret';
  switch (type) {
    case 'boolean': return 'bool';
    case 'enum': return 'enum';
    case 'integer': return 'int';
    case 'number': return 'num';
    case 'string':
    case 'string|null': return 'text';
    case 'string[]': return 'list';
    case 'boolean|integer': return 'boolInt';
    case 'boolean|enum': return 'boolEnum';
    default: return 'readonly';
  }
};

/** The computer's schema document as fields in display order, or null when it is not one (an old kit, an unreadable answer). */
export function parseSchema(raw: unknown): Schema | null {
  const doc = rec(raw);
  if (!Array.isArray(doc.fields)) return null;
  const fields: Field[] = [];
  for (const f of doc.fields) {
    const o = rec(f);
    if (typeof o.key !== 'string' || !o.key || typeof o.type !== 'string') continue;
    // A key the object prototype already has (`constructor`, `toString`...) would read as present in every draft and patch.
    if (o.key in Object.prototype) continue;
    const range = rec(o.range);
    fields.push({
      key: o.key,
      directive: typeof o.directive === 'string' ? o.directive : `@${o.key}`,
      category: typeof o.category === 'string' && o.category ? o.category : 'execution',
      type: o.type,
      kind: kindOf(o.key, o.type),
      enums: strs(o.enum_values),
      ...(typeof range.min === 'number' ? { min: range.min } : {}),
      ...(typeof range.max === 'number' ? { max: range.max } : {}),
      description: typeof o.description === 'string' ? o.description : '',
      fallback: rec(o.defaults).when_omitted,
      runtime: rec(o.defaults).runtime ?? null,
      examples: strs(o.examples),
    });
  }
  if (fields.length === 0) return null;
  const seen = new Set(fields.map((f) => f.category));
  const categories = [...CATEGORY_ORDER.filter((c) => seen.has(c)), ...[...seen].filter((c) => !CATEGORY_ORDER.includes(c))];
  return { fields, categories };
}

/**
 * The order the Hub shows the settings it knows in, inside their group: the switch first, then what a person sets most.
 * A setting the Hub does not know follows in the computer's own order.
 */
const KEY_ORDER = [
  'enabled', 'schedule', 'schedule-timeout', 'timeout', 'mode', 'concurrent', 'websocket', 'websocket-pre',
  'token',
  'description', 'label', 'tags',
  'log-level', 'debug', 'log-request-body', 'log-response-body', 'log-max-body-size', 'log-exclude-headers', 'log-retention-days', 'debug-instrument',
  'cors', 'cors-credentials', 'cors-methods', 'cors-headers', 'cors-max-age',
  'ai', 'ai-model', 'ai-temperature', 'ai-max-tokens', 'ai-key',
  'remote-messages', 'remote-call', 'remote-eval', 'remote-token',
];
const rank = (key: string): number => { const i = KEY_ORDER.indexOf(key); return i < 0 ? KEY_ORDER.length : i; };
/** One group's fields in display order (a stable sort: unknown fields keep the computer's order after the known ones). */
export const inShowOrder = (fields: readonly Field[]): Field[] => [...fields].sort((a, b) => rank(a.key) - rank(b.key));

/** Settings the computer still reads but that change nothing (hoody-exec says "No effect"): never offered as a control. */
const RETIRED = new Set(['await-promises']);
export const isRetired = (f: Field): boolean => RETIRED.has(f.key) || /^no effect\b/i.test(f.description);

/** A switch's value when the script has no line for it: the stated default, else what the computer runs with, else off. */
export function boolDefault(f: Field): boolean {
  if (typeof f.fallback === 'boolean') return f.fallback;
  return f.runtime === true;
}

/**
 * The help line under a field: the Hub's own words for a setting it knows (`magic.h.<key>`), else the first sentence of the
 * computer's description (a setting newer than this Hub).
 */
export function helpOf(f: Field, table: Record<string, string>): string {
  return table[`magic.h.${f.key}`] ?? shortHelp(f.description);
}

/** One sentence of the computer's own description, for the help line under a field. */
export function shortHelp(description: string): string {
  const first = description.split(/(?<=[.!?])\s/)[0] ?? '';
  return first.length > 180 ? `${first.slice(0, 177)}...` : first;
}

/** Is a secret field set on the stored script? A read shows it only as the sentinel (a string, or a list of them). */
export function secretIsSet(f: Field, comments: Record<string, unknown>): boolean {
  const v = comments[f.key];
  if (typeof v === 'string') return v !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (f.key === 'token') return Array.isArray(comments.tokens) && comments.tokens.length > 0;
  return v !== undefined && v !== null;
}

/** The most `@token` lines the computer takes through its update (hoody-exec's own limit). */
export const MAX_KEYS = 16;

/** How many keys the stored script has: the read's `tokens` lists one sentinel per `@token` line. null: the read sets a key but
 *  does not list them, so how many there are is not known. */
export function keyCount(comments: Record<string, unknown>): number | null {
  if (Array.isArray(comments.tokens)) return comments.tokens.length;
  const v = comments.token;
  return v === undefined || v === null || v === '' ? 0 : null;
}

/**
 * The patch with a key made here sent so that no stored key is lost. One token is written as the
 * script's only key, so on a script with several `@token` lines the made key goes beside them: a `[REDACTED]` per stored line
 * keeps that line's key at its place (the kit resolves it at the checked revision), the made key last. With one key or none the
 * made key replaces it. Any other patch is returned as it is.
 * null: the patch carries the made key, but it cannot be sent safely. Either the read does not say how many
 * keys there are, so one token could replace them all, or the script already has the most keys the computer takes. Nothing is
 * checked or saved then. This also covers a draft made before a read again found either case.
 */
export function keepKeys(patch: Patch, made: string | null, count: number | null): Patch | null {
  if (made === null || patch.token !== made) return patch;
  if (count === null || count >= MAX_KEYS) return null;
  if (count < 2) return patch;
  return { ...patch, token: [...Array.from({ length: count }, () => REDACTED), made] };
}

/** How a key that may be live was sent and never shown: 'beside' the other keys (it works until removed), or as the 'whole' key
 *  list (it replaced every key; making a new key gets one you can copy). */
export type UnseenKind = 'beside' | 'whole';
/** A key that may be live: how it was sent, and the revision that save was sent against (it writes only at that revision, so a
 *  read still at it cannot show whether the key landed: it may predate the save). */
export type UnseenMark = { kind: UnseenKind; sentRev: string };
/** The places (`<computer id>\u0000<script path>`) where a key may be live and was never shown, after a warned close gave up on
 *  knowing (MagicPanel liveUnseen). They live outside the panel, so the line survives a remount: another script and back, or
 *  another tab of the page. A reload ends them, because the Hub keeps no record of an unseen key across loads. The key itself
 *  still counts in "N keys set (hidden)", and Remove all keys still ends it. */
export const unseenPlaces = new Map<string, UnseenMark>();
/** The places whose held save (its answer lost, not settled yet) sent a made key, and how. A remount forgets
 *  the panel's own record of that send, but core still shows the hold: this keeps the line while it is held, and lets the warned
 *  close after a remount keep it as unseenPlaces. Nothing secret: the place, the kind and a revision only. */
export const heldKeyPlaces = new Map<string, UnseenMark>();

/** Whether a sent token value carries the key made here (alone, or last beside the kept ones). */
export const sendsMade = (token: unknown, made: string | null): boolean =>
  made !== null && (token === made || (Array.isArray(token) && token.length > 0 && token[token.length - 1] === made));

/** The stored value as the text a control shows (empty when the directive is absent). Secrets have none. */
export function textOf(f: Field, comments: Record<string, unknown>): string {
  const v = comments[f.key];
  if (v === undefined || v === null || f.kind === 'secret' || f.kind === 'readonly') return '';
  if (Array.isArray(v)) return v.map(String).join(', ');
  return String(v);
}

/** Drafts: only the fields the person changed. A string or boolean is the new value; null removes the directive. */
export type Raw = string | boolean | null;
export type Draft = Record<string, Raw>;

/** The stored boolean of a switch (undefined when the directive is absent or not a boolean). */
export const storedBool = (f: Field, comments: Record<string, unknown>): boolean | undefined => (typeof comments[f.key] === 'boolean' ? (comments[f.key] as boolean) : undefined);

/** What a switch shows: the draft, else the stored value, else what the computer applies when the directive is absent. */
export function effectiveBool(f: Field, comments: Record<string, unknown>, draft: Draft): boolean {
  const d = draft[f.key];
  if (typeof d === 'boolean') return d;
  if (d === null) return boolDefault(f);
  return storedBool(f, comments) ?? boolDefault(f);
}

/**
 * Record one edit. A value equal to what is stored (or, for a switch, to what applies by default) is no edit, so changing a
 * field and changing it back leaves nothing to save. A secret is always an edit: it can never be compared with what is stored.
 */
export function withEdit(draft: Draft, f: Field, comments: Record<string, unknown>, raw: Raw): Draft {
  const next = { ...draft };
  delete next[f.key];
  if (f.kind === 'readonly') return next;
  if (f.kind === 'secret') return typeof raw === 'string' && raw === '' ? next : { ...next, [f.key]: raw };
  if (f.kind === 'bool') {
    const stored = storedBool(f, comments);
    const same = typeof raw === 'boolean' && (stored !== undefined ? raw === stored : raw === boolDefault(f));
    const removing = raw === null && stored === undefined;
    return same || removing ? next : { ...next, [f.key]: raw };
  }
  const now = textOf(f, comments);
  const same = raw === null ? now === '' : typeof raw === 'string' && raw.trim() === now;
  return same ? next : { ...next, [f.key]: raw };
}

export type Problem = 'number' | 'range' | 'choice' | 'sentinel';
export type Patch = Record<string, unknown>;

const DIGITS = /^\d+$/;

/** One field's draft as the value the update sends: a typed value, null to remove, or a problem the person can fix. */
export function valueOf(f: Field, raw: Raw): { value: unknown } | { problem: Problem } {
  if (raw === null) return { value: null };
  if (typeof raw === 'boolean') return f.kind === 'bool' || f.kind === 'boolInt' || f.kind === 'boolEnum' ? { value: raw } : { problem: 'choice' };
  const text = raw.trim();
  if (f.kind === 'secret') return text.toLowerCase().includes('redacted') ? { problem: 'sentinel' } : { value: raw };
  if (text === '') return { value: null };
  switch (f.kind) {
    case 'enum':
      return f.enums.includes(text) ? { value: text } : { problem: 'choice' };
    case 'int': {
      // A bare number is sent as a number; anything else (`90s`, `1mb`) is the computer's own notation and it judges it.
      if (!DIGITS.test(text)) return { value: text };
      const n = Number(text);
      // A digit string past what a number holds would round, or become Infinity (which JSON sends as null: remove the directive).
      return !Number.isSafeInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max) ? { problem: 'range' } : { value: n };
    }
    case 'num': {
      const n = Number(text);
      if (!Number.isFinite(n)) return { problem: 'number' };
      return (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max) ? { problem: 'range' } : { value: n };
    }
    case 'list': {
      const items = text.split(',').map((x) => x.trim()).filter(Boolean);
      return items.length === 0 ? { value: null } : { value: items };
    }
    case 'boolInt':
      if (text === 'true' || text === 'false') return { value: text === 'true' };
      if (!DIGITS.test(text) || Number(text) < 1) return { problem: 'number' };
      return !Number.isSafeInteger(Number(text)) || (f.min !== undefined && Number(text) < f.min) || (f.max !== undefined && Number(text) > f.max) ? { problem: 'range' } : { value: Number(text) };
    case 'boolEnum':
      if (text === 'true' || text === 'false') return { value: text === 'true' };
      return f.enums.includes(text) ? { value: text } : { problem: 'choice' };
    default:
      return { value: text };
  }
}

/** The draft as the `comments` object the update takes, or the problems that stop it (by key). */
export function patchOf(schema: Schema, draft: Draft): { patch: Patch } | { problems: Record<string, Problem> } {
  const patch: Patch = {};
  const problems: Record<string, Problem> = {};
  for (const f of schema.fields) {
    if (!(f.key in draft)) continue;
    const r = valueOf(f, draft[f.key] as Raw);
    if ('problem' in r) problems[f.key] = r.problem;
    else patch[f.key] = r.value;
  }
  return Object.keys(problems).length > 0 ? { problems } : { patch };
}

/** Two patches are the same set of edits (never rendered: they may hold a secret). */
export const samePatch = (a: Patch, b: Patch): boolean => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && JSON.stringify(a[k]) === JSON.stringify(b[k]));
};

/** One before/after line of a dry run for a changed key; a secret never has a value on its line. */
export function changeLine(key: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): { key: string; before: string | null; after: string | null } {
  if (isSecretKey(key)) return { key, before: null, after: null };
  const show = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    const t = Array.isArray(v) ? v.map(String).join(', ') : String(v);
    return t.length > 60 ? `${t.slice(0, 57)}...` : t;
  };
  return { key, before: show(before?.[key]), after: show(after?.[key]) };
}
