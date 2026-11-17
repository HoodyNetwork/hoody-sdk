// Secret-value rules of the scripts page.
// Pure functions: no React, no I/O. A "known secret" is any value the person typed or the page minted
// (a caller key, an env value, a Key field, a literal found in code). Its text must never reach the
// screen, storage or the AI in any spelling the person could have sent it in.
import { stringOrEmpty as str } from '@core';

// ── sensitive names (hoody-exec's own rule) ─────────────────────────────────────

const WORDS = [
  'password', 'passwd', 'secret', 'token', 'credential', 'credentials', 'apikey', 'api_key', 'api-key',
  'authorization', 'mfa', 'otp', 'cvv', 'ssn', 'privatekey', 'private_key', 'private-key',
];
const QWORDS = [
  'key', 'auth', 'sig', 'signature', 'hmac', 'session', 'sessionid', 'sid', 'jwt', 'cookie', 'pass', 'pwd',
  'passphrase', 'jsessionid', 'phpsessid', 'aspsessionid', 'clientsecret', 'aikey', 'ai_key', 'bearer',
];

function wordRe(list: readonly string[]): RegExp {
  return new RegExp(`(^|[_-])(${list.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})([_-]|$)`, 'i');
}
const KEY_RE = wordRe(WORDS);
const QKEY_RE = wordRe(QWORDS);

const caseBounds = (n: string): string => n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
const separate = (n: string): string => n.replace(/[.[\]\s\u0000-\u001f\u007f]+/g, '_');

export function isSensitiveKey(n: unknown): boolean {
  return typeof n === 'string' && (KEY_RE.test(n) || KEY_RE.test(caseBounds(n)));
}

export function isSensitiveField(n: unknown): boolean {
  if (typeof n !== 'string') return false;
  if (isSensitiveKey(n)) return true;
  const s = separate(n);
  return s !== n && isSensitiveKey(s);
}

export function isSensitiveQuery(n: unknown): boolean {
  if (typeof n !== 'string') return false;
  if (isSensitiveField(n)) return true;
  const s = separate(n);
  return QKEY_RE.test(s) || QKEY_RE.test(caseBounds(s));
}

/** The shape hoody-exec takes for a secret value's name (its own pattern and length limit):
 *  letters, digits and _, not starting with a digit, at most 256 characters. Its reserved names (PATH, HOME…) are left to
 *  its own refusal (INVALID_ENV_KEY), which the page words. */
export const envNameOk = (name: string): boolean => name.length <= 256 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/** A test field's name: every segment of a nested name is tested; query names use the wider list. */
export function isSensitiveName(name: unknown, kind: 'field' | 'query' = 'field'): boolean {
  if (typeof name !== 'string' || !name) return false;
  const test = kind === 'query' ? isSensitiveQuery : isSensitiveField;
  if (test(name)) return true;
  return name.split(/[.[\]]+/).some((seg) => seg && test(seg));
}

// ── forms a value can take inside another string ─────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function b64(bytes: ArrayLike<number>): string {
  const at = (i: number): number => bytes[i] ?? 0;
  let o = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (at(i) << 16) | (at(i + 1) << 8) | at(i + 2);
    o += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + B64.charAt((n >> 6) & 63) + B64.charAt(n & 63);
  }
  const r = bytes.length - i;
  if (r === 1) {
    const a = at(i) << 16;
    o += `${B64.charAt((a >> 18) & 63)}${B64.charAt((a >> 12) & 63)}==`;
  } else if (r === 2) {
    const b = (at(i) << 16) | (at(i + 1) << 8);
    o += `${B64.charAt((b >> 18) & 63)}${B64.charAt((b >> 12) & 63)}${B64.charAt((b >> 6) & 63)}=`;
  }
  return o;
}

export function b64url(bytes: ArrayLike<number>): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function hex(bytes: ArrayLike<number>): string {
  let o = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    o += (b < 16 ? '0' : '') + b.toString(16);
  }
  return o;
}

/**
 * The ways a value s may appear inside another string: raw, percent-encoded (both cases and `+`),
 * JSON-escaped, and base64 at all three byte alignments (only the characters that depend on s alone
 * are kept, so s inside a longer encoded value is still found).
 */
export function forms(s: string): string[] {
  const out = [s];
  const add = (v: string): void => {
    if (v && v.length >= 6 && !out.includes(v)) out.push(v);
  };
  let pct = '';
  try {
    pct = encodeURIComponent(s);
  } catch {
    pct = '';
  }
  add(pct);
  add(pct.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()));
  add(pct.replace(/%20/g, '+'));
  add(JSON.stringify(s).slice(1, -1));
  const u = utf8(s);
  for (let k = 0; k < 3; k++) {
    const bytes = [0, 0].slice(0, k).concat(u);
    const bits = bytes.length * 8;
    const enc = b64(bytes).replace(/=+$/, '');
    const core = enc.slice(k === 0 ? 0 : k + 1, Math.floor(bits / 6));
    add(core);
    add(core.replace(/\+/g, '-').replace(/\//g, '_'));
  }
  return out;
}

/** The index in S of the first known secret (length >= 6) contained in text, or -1. */
export function containsSecret(text: unknown, S: readonly string[]): number {
  const t = str(text);
  if (!t) return -1;
  for (let i = 0; i < S.length; i++) {
    const s = str(S[i]);
    if (s.length < 6) continue;
    if (forms(s).some((f) => t.includes(f))) return i;
  }
  return -1;
}

export interface Field {
  name: string;
  value: string;
}

/** Fields about to be stored: {ok:false, field} names the field, never the value. */
export function checkPersist(fields: readonly Field[], S: readonly string[]): { ok: true } | { ok: false; field: string } {
  for (const f of fields) if (f && containsSecret(f.value, S) !== -1) return { ok: false, field: str(f.name) };
  return { ok: true };
}

const SHAPES =
  /(?:\bsk-[A-Za-z0-9_-]{16,}|\bhbk_[A-Za-z0-9_-]{20,}|\bhdy_[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const ASSIGN = /([A-Za-z_$][\w$-]*|"[^"\n]{1,64}"|'[^'\n]{1,64}')\s*[:=]\s*(["'`])((?:\\.|(?!\2)[^\\\n]){12,})\2/g;
const QUOTED = /(["'`])([A-Za-z0-9+/=_-]{32,})\1/g;

/** Literals in source that look like secrets: a sensitive name assigned 12+ characters, key shapes, long quoted base64 or hex. */
export function detectLiterals(source: unknown): string[] {
  const src = str(source);
  const out: string[] = [];
  const add = (v: string | undefined): void => {
    if (v && v !== '[REDACTED]' && !out.includes(v)) out.push(v);
  };
  let m: RegExpExecArray | null;
  ASSIGN.lastIndex = 0;
  while ((m = ASSIGN.exec(src))) if (isSensitiveName((m[1] ?? '').replace(/^["']|["']$/g, ''))) add(m[3]);
  SHAPES.lastIndex = 0;
  while ((m = SHAPES.exec(src))) add(m[0]);
  QUOTED.lastIndex = 0;
  while ((m = QUOTED.exec(src))) if (/[0-9]/.test(m[2] ?? '') && /[A-Za-z]/.test(m[2] ?? '')) add(m[2]);
  return out;
}

export const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

type Span = [number, number];

/**
 * Every match of every form of every known secret (>= 6 chars) on t, plus the last n characters,
 * overlapping matches merged, in text order. cut: controls removed from each form first, for a t that
 * has none (a removed control must not rebuild a secret).
 */
export function spans(t: string, S: readonly string[], cut?: boolean, n?: number): Span[] {
  const reach = new Int32Array(t.length + 1);
  const seen: string[] = [];
  const out: Span[] = [];
  let e = 0;
  for (const s of S) {
    if (str(s).length < 6) continue;
    for (let f of forms(str(s))) {
      if (cut) f = f.replace(CTRL, '');
      if (!f || seen.includes(f)) continue;
      seen.push(f);
      for (let i = t.indexOf(f); i !== -1; i = t.indexOf(f, i + 1)) reach[i] = Math.max(reach[i] ?? 0, i + f.length);
    }
  }
  if (n) reach[t.length - n] = t.length;
  for (let i = 0; i < t.length; i++) {
    const r = reach[i] ?? 0;
    if (r > e) {
      const last = out[out.length - 1];
      if (i < e && last) last[1] = r;
      else out.push([i, r]);
      e = r;
    }
  }
  return out;
}

/** The longest end of t (6 or more characters) that starts a form of a known secret, cut short. */
export function tail(t: string, S: readonly string[]): number {
  let n = 0;
  for (const s of S) {
    if (str(s).length < 6) continue;
    for (let f of forms(str(s))) {
      f = f.replace(CTRL, '');
      for (let k = Math.min(f.length - 1, t.length); k > n && k >= 6; k--) {
        if (t.slice(-k) === f.slice(0, k)) {
          n = k;
          break;
        }
      }
    }
  }
  return n;
}

/** t with each span's text replaced by rep(text). */
export function swap(t: string, sp: readonly Span[], rep: (text: string) => string): string {
  let o = '';
  let p = 0;
  for (const x of sp) {
    o += t.slice(p, x[0]) + rep(t.slice(x[0], x[1]));
    p = x[1];
  }
  return o + t.slice(p);
}

export interface Masked {
  text: string;
  map: Array<{ ph: string; value: string }>;
}

/** AI context: each merged span of known secrets becomes __HOODY_SECRET_n__, one n per distinct text, longest first. */
export function mask(text: unknown, S: readonly string[]): Masked | { error: 'placeholder_in_text' } {
  const t = str(text);
  if (t.includes('__HOODY_SECRET_')) return { error: 'placeholder_in_text' };
  const all: string[] = [];
  const sp = spans(t, S);
  const vals: string[] = [];
  for (const s of S) {
    if (str(s).length < 6) continue;
    for (const f of forms(str(s))) if (!all.includes(f)) all.push(f);
  }
  for (const x of sp) {
    const v = t.slice(x[0], x[1]);
    if (!vals.includes(v)) vals.push(v);
  }
  const map = vals
    .map((value, i) => {
      const k = all.indexOf(value);
      return { value, rank: k === -1 ? all.length + i : k };
    })
    .sort((a, b) => b.value.length - a.value.length || a.rank - b.rank)
    .map((e, n) => ({ ph: `__HOODY_SECRET_${n}__`, value: e.value }));
  return {
    text: swap(t, sp, (v) => map.find((m) => m.value === v)?.ph ?? '[hidden]'),
    map,
  };
}

export interface Unmasked {
  text: string;
  vanished: string[];
  duplicated: string[];
  unknown: string[];
}

/** A proposal back from the AI: placeholders restored byte-exactly; vanished/duplicated need a confirm; unknown ones block. */
export function unmask(text: unknown, map: ReadonlyArray<{ ph: string; value: string }>): Unmasked {
  let t = str(text);
  const vanished: string[] = [];
  const duplicated: string[] = [];
  for (const e of map) {
    const n = t.split(e.ph).length - 1;
    if (n === 0) vanished.push(e.ph);
    else if (n > 1) duplicated.push(e.ph);
    t = t.split(e.ph).join(e.value);
  }
  return { text: t, vanished, duplicated, unknown: t.match(/__HOODY_SECRET_\d+__/g) ?? [] };
}

/**
 * The whole raw text scrubbed once, before any split, select, strip, cut or normalize: controls removed
 * (\n kept), each merged span of known secrets shown once as [hidden], and, when the text was already cut
 * at its end, the span holding the trailing run that starts a form dropped. An output that still holds a
 * form is a bare [hidden]. `strip` (the Logs scrubber) runs last.
 */
export function scrubAll(text: unknown, S: readonly string[], cut?: boolean, strip?: (t: string) => string): string {
  let t = str(text).replace(CTRL, '');
  const n = cut ? tail(t, S) : 0;
  const sp = spans(t, S, true, n);
  if (n) {
    const last = sp.pop();
    if (last) t = t.slice(0, last[0]);
  }
  t = swap(t, sp, () => '[hidden]');
  if (spans(t, S, true).length) t = '[hidden]';
  return strip ? strip(t) : t;
}

/** Each typed value in every spelling it can be sent in: raw, trimmed, and a Bearer form's token. */
export function spellings(vs: readonly unknown[]): string[] {
  const o: string[] = [];
  for (const v of vs) {
    const a = str(v).trim();
    for (const x of [str(v), a, a.replace(/^bearer\s+/i, '')]) if (x && !o.includes(x)) o.push(x);
  }
  return o;
}

/** Text for the screen (raw error details under Advanced): scrubAll, then capped. */
export function scrubDisplay(text: unknown, S: readonly string[], max = 2000, cut?: boolean): string {
  const t = scrubAll(text, S, cut);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** A caller key: 32 random bytes, base64url (43 characters). */
export function newKey(rand: (n: number) => Uint8Array): string {
  return b64url(rand(32));
}
