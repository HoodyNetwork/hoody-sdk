// Rules of the quick command box: what may be sent, what
// is kept in the history, how the computer's answer is read. Everything the computer prints is
// untrusted text: cleanText strips terminal escapes, bidi marks and control characters, and the
// view draws it as text only.
import { utf8Bytes as utf8 } from '@core/pure';
import type { CommandResult } from './types';

export const LIMITS = {
  /** Bytes sent. */
  command: 8192,
  /** Characters kept in the history. */
  keep: 1000,
  history: 10,
  runSeconds: 60,
  /** Characters drawn per stream. */
  show: 65536,
} as const;

// Terminal escapes first, then every control character but newline and tab, bidi marks and the BOM.
const RE_OSC = /(?:\x1b[\]PX^_]|[\x90\x98\x9d\x9e\x9f])[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c|$)/g;
const RE_CSI = /(?:\x1b\[|\x9b)[0-?]*[ -/]*(?:[@-~]|$)/g;
const RE_ESC2 = /\x1b[()*+\-./][ -~]?|\x1b[ -/]*[0-~]?/g;
const RE_LINES = /\r\n|\r|\u2028|\u2029/g;
const RE_CTRL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff\ufff9-\ufffb]/g;

export function cleanText(s: unknown, max?: number): { text: string; cut: boolean } {
  let out = typeof s === 'string' ? s : '';
  out = out.replace(RE_OSC, '').replace(RE_CSI, '').replace(RE_ESC2, '').replace(RE_LINES, '\n').replace(RE_CTRL, '');
  let cut = false;
  if (max && out.length > max) {
    let end = max;
    const c = out.charCodeAt(end - 1);
    if (c >= 0xd800 && c <= 0xdbff) end--;
    out = out.slice(0, end);
    cut = true;
  }
  return { text: out, cut };
}

/** One printable line for a history entry or a message. */
export function line(s: unknown, max?: number): string {
  return cleanText(s, max).text.replace(/[\n\t]+/g, ' ');
}

export type CheckResult = { ok: true; command: string } | { ok: false; why: 'empty' | 'long' | 'control' };

export function check(raw: unknown): CheckResult {
  const c = typeof raw === 'string' ? raw.trim() : '';
  if (!c) return { ok: false, why: 'empty' };
  if (/[\x00-\x08\x0a-\x1f\x7f-\x9f\u2028\u2029]/.test(c)) return { ok: false, why: 'control' };
  if (utf8(c) > LIMITS.command) return { ok: false, why: 'long' };
  return { ok: true, command: c };
}

// A command that carries a credential is never kept (and never pinned): best effort and wide on purpose.
const NAME_RE = /key|token|passw(?:or)?d|passphrase|secret|credential/i;
const SECRETS: RegExp[] = [
  /(?:^|\s)-p\S/,
  /\bsshpass\b[^;&|]*\s-p\s+\S/,
  /\bredis-cli\b[^;&|]*\s-a\s+\S/,
  /(?:^|\s)-u\s*[^\s:]+:\S/,
  /(?:^|\s)--user[\s=]+[^\s:]+:\S/,
  /\bbearer\s+\S/i,
  /\bauthorization\s*[:=]/i,
  /\bcookie\s*[:=]/i,
  /\bpass:\S/,
  /\b(?:chpasswd|htpasswd)\b/,
  /:\/\/[^\s/:@]+:[^\s/@]+@/,
  /(?:^|[^\w])(?:hdy_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{8,}\.[\w-]{8,}\.)/,
];

// NAME=value, "NAME": value, Name: value: the word before every = or : holds a secret name. A scan, not a backtracking pattern.
function namedPair(c: string): boolean {
  const re = /[=:]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(c))) {
    const i = m.index;
    let j = i - 1;
    let q = 0;
    while (j >= 0 && q < 8 && /[\s"'\\]/.test(c.charAt(j))) {
      j--;
      q++;
    }
    let k = j;
    while (k >= 0 && j - k < 128 && /[\w.-]/.test(c.charAt(k))) k--;
    if (j <= k || !NAME_RE.test(c.slice(k + 1, j + 1))) continue;
    if (c.charAt(i) === '=') return true;
    let n = i + 1;
    while (n < c.length && /\s/.test(c.charAt(n))) n++;
    if (n < c.length) return true;
  }
  return false;
}

// --token abc, --password=abc: a flag that names a secret, with a value that is not another flag.
function namedFlag(c: string): boolean {
  const toks = c.match(/\S+/g) ?? [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] ?? '';
    if (t.charAt(0) !== '-') continue;
    const eq = t.indexOf('=');
    const name = eq < 0 ? t : t.slice(0, eq);
    if (name.length > 128 || !(/^--?[\w-]+$/.test(name) && (NAME_RE.test(name) || /^--?pass(?:wd|phrase)?$/i.test(name)))) continue;
    if (eq >= 0 ? t.length > eq + 1 && t.charAt(eq + 1) !== '-' : i + 1 < toks.length && (toks[i + 1] ?? '').charAt(0) !== '-') return true;
  }
  return false;
}

export function looksSecret(cmd: unknown): boolean {
  const c = typeof cmd === 'string' ? cmd : '';
  return SECRETS.some((r) => r.test(c)) || namedPair(c) || namedFlag(c);
}

// A command that can destroy data or take the computer down asks first; it is still the user's call.
const B = '(?:^|[\\s;&|(`\'"]|/s?bin/)';
const DESTRUCTIVE: RegExp[] = [
  'rm\\s+(?:[^;&|]*\\s)?(?:-[a-z]*[rf][a-z]*|--recursive|--force|--no-preserve-root)\\b',
  'mkfs(?:\\.\\w+)?\\b',
  'dd\\b[^;&|]*\\bof=',
  '(?:shutdown|reboot|poweroff|halt)\\b',
  '(?:init|telinit)\\s+[06]\\b',
  'systemctl\\s+(?:[^;&|]*\\s)?(?:poweroff|reboot|halt|kexec)\\b',
  '(?:wipefs|shred|fdisk|sfdisk|parted|cryptsetup\\s+(?:luksFormat|erase))\\b',
]
  .map((src) => new RegExp(B + src, 'i'))
  .concat([/>\s*\/dev\/(?:sd|nvme|vd|xvd|hd|mmcblk)/i, /:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/]);

export function destructive(cmd: unknown): boolean {
  const c = typeof cmd === 'string' ? cmd : '';
  return DESTRUCTIVE.some((r) => r.test(c));
}

// ── history ────────────────────────────────────────────────────────────────────────────

export function keepable(cmd: string): boolean {
  const r = check(cmd);
  return r.ok && r.command.length <= LIMITS.keep && !looksSecret(r.command);
}

/** The stored document {v: 1, c: [...]}; anything else, and any entry that does not check, is dropped. */
export function readHistory(doc: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const d = doc as { v?: unknown; c?: unknown } | null;
  const list = d && typeof d === 'object' && d.v === 1 && Array.isArray(d.c) ? (d.c as unknown[]) : [];
  for (const c of list) {
    if (out.length >= LIMITS.history) break;
    if (typeof c !== 'string' || !keepable(c) || c !== c.trim() || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** The list with `cmd` first (an earlier copy moves up), or the same list when the command is not keepable. */
export function addHistory(list: readonly string[], cmd: string): string[] {
  if (!keepable(cmd)) return [...list];
  const c = cmd.trim();
  return [c, ...list.filter((x) => x !== c)].slice(0, LIMITS.history);
}

export function historyDoc(list: readonly string[]): { v: 1; c: string[] } {
  return { v: 1, c: list.slice(0, LIMITS.history) };
}

// ── the answer ─────────────────────────────────────────────────────────────────────────

export function seconds(ms: unknown): string {
  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '';
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${ms < 10000 ? (ms / 1000).toFixed(1) : String(Math.round(ms / 1000))} s`;
}

function decodeB64(b64: unknown): string | null {
  if (typeof b64 !== 'string') return null;
  if (b64 === '') return '';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

/** The finished raw result, or null when the body is not one (the run's outcome is then unknown). */
export function fromAnswer(a: unknown): CommandResult | null {
  const r = a as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.mode !== 'raw') return null;
  const out = decodeB64(r.stdout_b64);
  const err = decodeB64(r.stderr_b64);
  if (out === null || err === null) return null;
  const o = cleanText(out, LIMITS.show);
  const e = cleanText(err, LIMITS.show);
  const sig = typeof r.signal === 'string' && /^SIG[A-Z0-9]{1,12}$/.test(r.signal) ? r.signal : '';
  const code = typeof r.exit_code === 'number' && Number.isInteger(r.exit_code) ? r.exit_code : null;
  const state: CommandResult['state'] | null = r.completion === 'timeout' || r.timed_out === true ? 'timeout' : sig ? 'signal' : code !== null ? 'exit' : null;
  if (!state) return null;
  return { state, code, signal: sig, time: seconds(r.duration_ms), out: o.text, err: e.text, outCut: o.cut || r.stdout_truncated === true, errCut: e.cut || r.stderr_truncated === true, cwd: folderOf(r.cwd) };
}

/** The body of one run, in the folder `cwd` (absolute). The folder is always sent: without it the terminal program
 *  starts from its own default folder (its --cwd, else the user's home), never from /. */
export function requestBody(command: string, cwd: string): { command: string; mode: 'raw'; wait: true; timeout: number; cwd: string } {
  return { command, mode: 'raw', wait: true, timeout: LIMITS.runSeconds, cwd: cwd || '/' };
}

// ── folder ─────────────────────────────────────────────────────────────────────────────

/** The terminal program's refusals of the folder: it answers them before anything runs. */
export const CWD_CODES = ['INVALID_CWD', 'CWD_PERMISSION_DENIED', 'CWD_PREPARE_FAILED'] as const;
export type CwdCode = (typeof CWD_CODES)[number];
export const isCwdCode = (c: unknown): c is CwdCode => typeof c === 'string' && (CWD_CODES as readonly string[]).includes(c);

const CONTROL = /[\x00-\x1f\x7f-\x9f]/;
const MAX_FOLDER = 4096;

/** An absolute folder path as the program reports it (starts with /, no control characters, at most 4096 bytes), else
 *  null (not reported). */
export function folderOf(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('/') && !CONTROL.test(v) && utf8(v) <= MAX_FOLDER ? v : null;
}

export type FolderCheck = { ok: true; cwd: string } | { ok: false; why: 'up' | 'control' | 'long' };

/** The Folder field, written from the computer's top folder (the field shows the "/" before it): empty is /, a typed
 *  leading or trailing / changes nothing, and a ".." part is refused (the folder is named from the top, never by a way
 *  up). Spaces are kept as typed, outer ones too: " tmp" and "tmp" are two folders, and the one sent is the one
 *  shown. A field holding only spaces is the top folder. */
export function checkFolder(raw: string): FolderCheck {
  const v = raw.trim() ? raw : '';
  if (CONTROL.test(v)) return { ok: false, why: 'control' };
  const parts = v.split('/').filter(Boolean);
  if (parts.includes('..')) return { ok: false, why: 'up' };
  const cwd = '/' + parts.join('/');
  if (utf8(cwd) > MAX_FOLDER) return { ok: false, why: 'long' };
  return { ok: true, cwd };
}
