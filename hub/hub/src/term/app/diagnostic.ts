// Diagnostics as allowlisted records: what a mount keeps, shows and returns about a
// failure is a code, a kind, an error class name from a fixed list and a component path, never an error object, its
// message, cause, stack, a response body or a client's configuration. Messages can carry anything (a token echoed in
// an answer, an address, a path). Every field is checked against a fixed vocabulary by VALUE, not by shape:
// a code is one the Hub's own source names (diagnostic-codes.gen.ts, else UNHANDLED), `what` is a
// trapped global's name from STRICT_GLOBALS or a console method (any other window/self member reads `window.*`), a
// class name comes from SAFE_NAMES. A string shaped like a code (TOKEN_CANARY_ABC123) is therefore UNHANDLED.
//
// `detail` (the sanitised message) exists only when the mount asked for it (TermHubOptions.diagnosticDetail: dev.ts on
// a developer's own terminal); the ship entry never sets it, and nothing returned to the host carries it.
import { safeDiagnostic } from '../prim/safe';
import { sessionSlot } from '../env/session';
import { STRICT_GLOBALS } from '../env/strict-globals';
import { DIAGNOSTIC_CODES } from './diagnostic-codes.gen';

/** This mount's diagnostics switch (TermHubOptions.diagnosticDetail), set by the lifecycle at start; off outside a mount. */
export const diagnosticsOf = sessionSlot('app.diagnostics', () => ({ detail: false }));

export type DiagnosticKind = 'page' | 'crash' | 'trap' | 'boot' | 'dispose' | 'console';

export interface Diagnostic {
  readonly kind: DiagnosticKind;
  /** A fixed code: the error's own (`code`, or a `CODE:` message prefix) when it is one, else UNHANDLED. */
  readonly code: string;
  /** The error's class when it is a standard one (TypeError ...), else 'Error'. */
  readonly name: string;
  /** Component names, innermost first (page and crash). */
  readonly where?: readonly string[];
  /** The page id (page kind). */
  readonly page?: string;
  /** console method (console kind) or trapped global name (trap kind; a name from STRICT_GLOBALS). */
  readonly what?: string;
  /** Sanitised message, ONLY with diagnosticDetail on. */
  readonly detail?: string;
}

export const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
/** A code in the vocabulary, else UNHANDLED. */
const known = (c: string): string => (SAFE_CODE.test(c) && DIAGNOSTIC_CODES.has(c) ? c : 'UNHANDLED');
const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'assert']);
const GLOBALS = new Set(STRICT_GLOBALS);
/** A trap's global as it may be shown: a STRICT_GLOBALS name, `window.`/`self.` + one, else `window.*` / `self.*`
 *  (the member a caller asked for is any text: never echoed). */
export function trapLabel(name: string): string {
  if (GLOBALS.has(name)) return name;
  const m = /^(window|self)\.(.*)$/s.exec(name);
  if (m) return GLOBALS.has(m[2]!) ? `${m[1]}.${m[2]}` : `${m[1]}.*`;
  return 'global';
}
/** `what` by kind: a trap's label, a console method; nothing else is kept. */
function whatOf(kind: DiagnosticKind, what: string | undefined): string | undefined {
  if (!what) return undefined;
  if (kind === 'trap') return trapLabel(what);
  if (kind === 'console') return CONSOLE_METHODS.has(what) ? what : undefined;
  return undefined;
}
const SAFE_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError', 'AggregateError', 'AbortError', 'TimeoutError', 'TermGlobalError']);
const SAFE_IDENT = /^[A-Za-z_$][\w$.]{0,63}$/;
const SAFE_PAGE = /^[a-z][a-z0-9-]{0,40}$/;
// A source frame of the Hub's own code: a src-relative file and line (`kit/widgets/agentHints.ts:73`). No absolute
// path, no `..`, nothing outside src: an install path or home directory never matches.
const SRC_FRAME = /^(?:[a-z][\w-]*\/){0,6}[A-Za-z][\w.-]{0,80}\.(?:ts|tsx):\d{1,6}$/;

/** The first `max` frames of a stack that lie in hub/src, as src-relative `file:line`, skipping the strict-globals trap
 *  itself. A ship bundle's frames (hub-term.js, not under src) give none. */
export function srcFrames(stack: string, max = 3): string[] {
  const out: string[] = [];
  for (const line of stack.split('\n').slice(1)) {
    const m = /\/src\/((?:[\w-]+\/)*[\w.-]+\.(?:ts|tsx)):(\d+)(?::\d+)?\)?\s*$/.exec(line);
    if (!m || m[1] === 'term/env/strict-globals.ts') continue;
    const f = `${m[1]}:${m[2]}`;
    if (SRC_FRAME.test(f) && !out.includes(f)) out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

/** The code an error carries, or UNHANDLED: `{code}` when it is a fixed code, else a leading `CODE:` in the message. */
export function codeOf(e: unknown): string {
  if (e && typeof e === 'object') {
    const c = (e as { code?: unknown }).code;
    if (typeof c === 'string' && SAFE_CODE.test(c)) return known(c);
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') { const p = /^([A-Z][A-Z0-9_]{2,63})(?::|$)/.exec(m); if (p) return known(p[1]!); }
  }
  if (typeof e === 'string') { const p = /^([A-Z][A-Z0-9_]{2,63})(?::|$)/.exec(e); if (p) return known(p[1]!); }
  return 'UNHANDLED';
}

export function nameOf(e: unknown): string {
  const n = e && typeof e === 'object' ? (e as { name?: unknown }).name : undefined;
  return typeof n === 'string' && SAFE_NAMES.has(n) ? n : 'Error';
}

function detailOf(e: unknown): string {
  const m = e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : (() => { try { return JSON.stringify(e) ?? String(e); } catch { return String(e); } })();
  return safeDiagnostic(m, 500);
}

/** A record for this failure. `detail` only when asked. */
export function diagnosticOf(kind: DiagnosticKind, e: unknown, o: { where?: readonly string[]; page?: string; what?: string; detail?: boolean } = {}): Diagnostic {
  const where = (o.where ?? []).filter((w) => SAFE_IDENT.test(w) || SRC_FRAME.test(w)).slice(0, 8);
  const what = whatOf(kind, o.what);
  return Object.freeze({
    kind,
    code: codeOf(e),
    name: nameOf(e),
    ...(where.length ? { where: Object.freeze(where) } : {}),
    ...(o.page && SAFE_PAGE.test(o.page) ? { page: o.page } : {}),
    ...(what ? { what } : {}),
    ...(o.detail ? { detail: detailOf(e) } : {}),
  });
}

/** The record without `detail`: what leaves the mount (receipt, host). */
export function publicDiagnostic(d: Diagnostic): Diagnostic {
  const { detail: _gone, ...rest } = d;
  return Object.freeze(rest);
}

/** One line for a record (codes and names only, plus detail when present). */
export function diagnosticLine(d: Diagnostic): string {
  const at = d.page ? ` ${d.page}` : '';
  const what = d.what ? ` ${d.what}` : '';
  const where = d.where?.length ? ` in ${d.where.join(' < ')}` : '';
  return `${d.kind}${at}${what}: ${d.code} (${d.name})${where}` + (d.detail ? ` - ${d.detail}` : '');
}
