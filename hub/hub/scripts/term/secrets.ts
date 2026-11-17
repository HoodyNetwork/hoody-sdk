// Secret gate for the terminal Hub: no fixture secret, vault value, full token or typed secret may appear in what a page
// shows a person OR an agent, or in anything the page writes on the side. Every page x case (each fixture state, plus
// each shots.ts shot that needs no web action, as goldens.ts enumerates them) is drawn headless at BOTH golden sizes
// (120x40, then resized to 80x24) and driven through its secret states:
//   <case>@<size>            as drawn
//   <case>/typed@80x24       a canary typed into every secret input (SecretInput, OtpField: semantics `secret` + type)
//   <case>/revealed@<size>   every reveal control pressed (Show, Show codes, Show what you typed)
// Searched in every state: the frame, the semantics text (semText, what agents read) and JSON (semJson). Searched once
// per case (all states): console (error/warn/log/info/debug), process stdout/stderr writes, clipboard (OSC 52), the
// terminal title and every other engine control (OSC), page failures (diagnostics) and the unsettled text.
// Only the visible frame of a revealed secret may hold it: in a `/revealed` state the cells inside each `secret`
// semantics node's box are blanked before the frame is searched; everywhere else the value is a leak.
//
//   NODE_ENV=test bun scripts/term/secrets.ts [page ...]        every page when none is named; exit 1 on any leak
//   ... --changed <path> [...]                                 only the pages those changed files can reach
//   ... --json                                                 machine-readable result
//
// Needles (what must never show), per page:
//   1. every string the page's fixtures ANSWERED while drawing any of its cases (app/fixtures.ts `answer` is wrapped in
//      memory by a source hook: computed values such as "hdy_" + hex count too), taken under a secret-named key
//      (SECRET_KEY) at any depth, or anywhere when it has a known token shape (TOKEN_SHAPE);
//   2. the same two rules over the string literals of the page's fixtures.ts and *.vectors.ts sources;
//   3. the canaries this gate typed.
//   Strings shorter than MIN_LEN are not needles (a 4-hex public prefix is a label, not a secret), except one-time
//   codes (MIN_CODE_LEN) and canaries.
// Matching (hitOf): the whole value; the value with all whitespace removed against the text with all whitespace removed
// (spaced letters `J B S W`, a value split over two lines); its first 8 characters after a scheme prefix (hdy_, sk-…);
// any 12-character window. The tree and JSON are also searched as one run of their strings (a value split over nodes).
// A needle is never printed: reports name it by key, length and a sha256 prefix, and every free text this gate prints
// (child errors, unsettled text) is redacted first (redactSecrets). A reviewed exception is a row in
// scripts/term/secrets.allow.json: { "<page>/<case>/<sha12>": "why showing it is intended" } (`*` as the case matches
// every case of the page); a row that matches nothing fails (stale), as contract.debt.json does.
// Pages known to hold secrets (SECRET_PAGES) fail when no reveal control was found and pressed in any of their cases:
// a renamed button would otherwise make the revealed state unchecked, silently.
// Each page runs in its own child process (a page's leaked state cannot hide another's), one at a time.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import { spawnSync } from 'node:child_process';
import { noInputs } from './fail-closed';
import { holdFixtureClock } from './clock';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HUB = path.resolve(import.meta.dir, '../..');
const SRC = path.join(HUB, 'src');
const ALLOW = path.join(import.meta.dir, 'secrets.allow.json');
const MIN_LEN = 12;
export const SECRET_KEY = /^(secret|secrets|[a-z0-9]+_?secret|secret_[a-z0-9_]+|token|[a-z0-9]+_?token|access_token|refresh_token|password|[a-z0-9]+_?password|passphrase|pass|passwd|pin|api_?key|apikey|private_?key|env_values|envelope|ciphertext|plaintext|cipher|otp_?secret|totp|otp_?uri|otpauth|manual_?key|recovery_codes|backup_codes|credential|credentials|curl|curl_.*|mnemonic|seed|key_material|hbk|authorization|cookie|session_token)$/i;
// `value` is a secret only in a secret's context: a vault entry (`{ value, metadata }` / `encrypted`) or anything under a
// vault / secret / env / credential key. A spec row `{ label, value }` or a setting `{ value, source }` is meant to show.
const VALUE_KEY = /^(value|values)$/i;
const SECRET_CONTEXT = /vault|secret|^env|_env$|environment|credential|token/i;
// One-time codes are short (`4k7p-9xqa`): `codes` counts, from 8 characters, beside a 2FA secret (`manualKey`, `qr`,
// `otp…`) or under a backup / recovery / new-codes / two-factor key; elsewhere `codes` is a list of error codes.
const CODES_KEY = /^(codes|backup_codes|recovery_codes)$/i;
const CODES_CONTEXT = /backup|recovery|new_?codes|two_?factor|2fa|otp/i;
const MIN_CODE_LEN = 8;
export const TOKEN_SHAPE = /^(hdy_|hbk_|sk-|sk_live_|ghp_|gho_|xox[bp]-|AKIA)[A-Za-z0-9_-]{8,}$/;

const sha12 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
export interface Needle { value: string; key: string; from: 'answer' | 'source' }

/** Secret-looking strings inside a value (answer data): under a secret-named key, or token-shaped anywhere. */
export function needlesOf(v: unknown, out: Map<string, Needle>, key = '', depth = 0, seen = new Set<unknown>(), ctx = false, entry = false, codesCtx = false): void {
  if (depth > 40 || v === null || v === undefined) return;
  if (typeof v === 'string') {
    const code = CODES_KEY.test(key) && (codesCtx || entry) && v.length >= MIN_CODE_LEN;
    const secretKey = SECRET_KEY.test(key) || (VALUE_KEY.test(key) && (ctx || entry));
    if (((v.length >= MIN_LEN && (secretKey || TOKEN_SHAPE.test(v))) || code) && !out.has(v)) out.set(v, { value: v, key: key || '(shape)', from: 'answer' });
    return;
  }
  if (typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  const inCtx = ctx || SECRET_CONTEXT.test(key);
  const inCodes = codesCtx || CODES_CONTEXT.test(key);
  if (Array.isArray(v)) { for (const x of v) needlesOf(x, out, key, depth + 1, seen, inCtx, entry, inCodes); return; }
  if (v instanceof Map) { for (const [k, x] of v) needlesOf(x, out, String(k), depth + 1, seen, inCtx, false, inCodes); return; }
  const keys = Object.keys(v);
  const isEntry = keys.includes('metadata') || keys.includes('encrypted') || keys.some((k) => /^(manual_?key|qr|otp.*)$/i.test(k));
  for (const [k, x] of Object.entries(v)) needlesOf(x, out, k, depth + 1, seen, inCtx || SECRET_CONTEXT.test(k), isEntry, inCodes || CODES_CONTEXT.test(k));
}

/** The same rules over a source file's literals: `key: 'literal'` pairs, and token-shaped literals anywhere. */
export function sourceNeedles(text: string, out: Map<string, Needle>): void {
  for (const m of text.matchAll(/["']?([A-Za-z_][\w-]*)["']?\s*:\s*(["'`])((?:(?!\2)[^\\\n]|\\.)*)\2/g)) {
    const [, k, , val] = m as unknown as [string, string, string, string];
    // In source text the context is the line: a `value:` beside `metadata` (a vault row) counts.
    const line = text.slice(text.lastIndexOf('\n', m.index) + 1, text.indexOf('\n', m.index) === -1 ? undefined : text.indexOf('\n', m.index));
    const secretKey = SECRET_KEY.test(k) || (VALUE_KEY.test(k) && /\bmetadata\b|\bencrypted\b/.test(line));
    if (val.length >= MIN_LEN && !val.includes('${') && secretKey && !out.has(val)) out.set(val, { value: val, key: k, from: 'source' });
  }
  for (const m of text.matchAll(/(["'`])([^"'`\s\\]{12,})\1/g)) {
    const val = m[2]!;
    if (TOKEN_SHAPE.test(val) && !out.has(val)) out.set(val, { value: val, key: '(shape)', from: 'source' });
  }
}

/** Pages that hold secrets: each must offer at least one reveal control somewhere in its cases (else the gate is blind). */
export const SECRET_PAGES = ['account', 'bots', 'keys', 'vault'] as const;
// The computers create drawer up to a typed environment value: "More options" is a fold whose one pressable line is
// named by its title and its description (Disclosure), so the step names both.
const ENV_TYPED = [
  'press|Get a computer', 'press|More options Colour, software, SSH key, a note and variables. All optional.',
  'press|Add variable', 'type|Variable 1 name|GATE_VAR', 'secret|Variable 1 value|Qz7cnryEnv1x4Lp9Tv', 'shot|env-typed',
] as const;
/** Why a `shot|<tag>` tag is refused, or null. `typed` and `revealed` name the gate's own states (`<case>/typed@80x24`,
 *  `<case>/revealed@<size>`): a flow shot under one of them would share its name with the canary or reveal pass. A tag
 *  is one name part: not empty, no `/`, `@` or `|`. */
export function shotTagRefusal(tag: string | undefined): string | null {
  if (!tag) return 'a shot needs a tag';
  if (tag === 'typed' || tag === 'revealed') return `the tag "${tag}" is the gate's own state name`;
  if (/[/@|]/.test(tag)) return `the tag "${tag}" holds / @ or |`;
  return null;
}
/** Secret states that no fixture state or no-action shot draws (a mint's one-time view, a setup sheet): reached from a
 *  case by pressing and typing by accessible name. `type|<field>|<value>` types fixture input (into a secret input,
 *  the value becomes a needle too); `secret|<field>|<value>` types a value the flow declares secret: it is a needle in
 *  every state whatever the field says, and the step fails when the field is not marked secret (a lost mark is a
 *  finding, never a reason to stop looking) or the value is shorter than 6; `press|<name>` presses;
 *  `absent|<role>|<name>` fails the flow while such a node exists; `shot|<tag>` judges the state at that step as well
 *  (`<case>+<flow>/<tag>@120x40` and `@80x24`, the focus read before the resize and kept through it), so a value is
 *  also looked for while its field still holds it; `shotTagRefusal` refuses the tags `typed` and `revealed`. A step
 *  that finds nothing, or of an unknown kind, fails the gate; its error names a secret value by its length only. */
export const SECRET_FLOWS: Readonly<Record<string, ReadonlyArray<{ case: string; name: string; steps: readonly string[] }>>> = {
  keys: [{ case: 'many', name: 'mint', steps: ['press|New key', 'type|Name|gate-key', 'press|Make key'] }],
  // shot key-secret is the web's click on Make key (a `click` shot: the gate draws no case for it); the flow starts
  // from its drawer shot, key-new, and presses Make key itself.
  bots: [{ case: 'shot-key-new', name: 'mint', steps: ['press|Make key'] }],
  account: [
    { case: 'many', name: 'new-codes', steps: ['press|New backup codes', 'secret|Current password|gate-password-1', 'secret|6-digit code|123456', 'press|Make new codes'] },
    { case: 'many', name: 'password', steps: ['press|Change password'] },
    { case: 'twofa-off', name: 'setup', steps: ['press|Turn on', 'secret|Current password|gate-password-2', 'press|Continue'] },
  ],
  // Environment values are secrets (create is a secret route; the drawer empties the field when it closes or the page
  // is left): while it is typed the field masks it (`shot|env-typed`), and once the drawer is gone the typed value must be
  // nowhere, frame, tree or any side channel.
  computers: [
    { case: 'many', name: 'env-create', steps: [...ENV_TYPED, 'press|Get computer', 'absent|dialog|Get a computer'] },
    { case: 'many', name: 'env-create-leave', steps: [...ENV_TYPED, 'press|Get computer', 'absent|dialog|Get a computer', 'press|Home', 'absent|button|Get a computer'] },
    { case: 'many', name: 'env-cancel', steps: [...ENV_TYPED, 'press|Cancel', 'press|Discard', 'absent|dialog|Get a computer'] },
  ],
  vault: [
    { case: 'default', name: 'new', steps: ['press|New entry'] },
    { case: 'shot-detail', name: 'replace', steps: ['press|Replace value'] },
  ],
};
/** The reveal controls: the kit's names (kit/forms/forms.strings.en.json `secret.show`, `secret.showCodes`,
 *  `secretInput.show`) anywhere, and any button named "Show …" inside a `secret` node (a page's own "Show value"). */
export const REVEAL_NAME = /^(Show|Show codes|Show what you typed)$/;
const REVEAL_IN_SECRET = /^Show\b/;
/** What the gate types into secret inputs. Letters + digits, never a word, so a hit is never a coincidence. */
export const CANARY_TEXT = (i: number): string => `Qz7cnryW${i}x4Lp9Tv`;
/** One-time-code inputs take digits only. */
export const CANARY_CODE = (i: number): string => String(493817 + i * 1111).padStart(6, '0');
const CODE_INPUT = /code|otp|one.?time|verification|digits/i;
const SCHEME = /^(hdy_|hbk_|sk-live-|sk-|sk_live_|ghp_|gho_|xox[bp]-|AKIA)/;
const PREFIX_LEN = 8;
const WINDOW = 12;
const strip = (t: string): string => t.replace(/\s+/g, '');

/** How `needle` shows in `hay`, or null. Exact; whitespace-free (spaced or split); an 8-char prefix after the scheme;
 *  any 12-char window. Short needles (codes, canaries) match whole only. */
export function hitOf(needle: string, hay: string, hayStripped = strip(hay)): 'exact' | 'spaced' | 'prefix' | 'window' | null {
  if (!needle) return null;
  if (hay.includes(needle)) return 'exact';
  // A composite value (a curl command, a header line) holds public words around its secret: only its secret parts are
  // matched in pieces, else its boilerplate (`curl -sS -H`, the URL) would hit every page that shows the command.
  const parts = secretParts(needle);
  if (parts.length !== 1 || parts[0] !== needle) {
    for (const p of parts) { const h = hitOf(p, hay, hayStripped); if (h) return h; }
    return null;
  }
  const n = strip(needle);
  if (n.length >= 6 && hayStripped.includes(n)) return 'spaced';
  if (n.length < MIN_LEN) return null;
  const scheme = SCHEME.exec(n)?.[0] ?? '';
  if (n.length - scheme.length >= PREFIX_LEN && hayStripped.includes(n.slice(0, scheme.length + PREFIX_LEN))) return 'prefix';
  for (let k = 0; k + WINDOW <= n.length; k++) if (hayStripped.includes(n.slice(k, k + WINDOW))) return 'window';
  return null;
}

/** The secret parts of a value: the value itself, unless it is a long phrase (whitespace and over 32 characters
 *  without it), whose secret parts are its token-shaped words and its long letter-and-digit words (not URLs). */
export function secretParts(v: string): string[] {
  if (!/\s/.test(v) || strip(v).length <= 32) return [v];
  return v.split(/[\s"'`=,;]+/).map((w) => w.replace(/^[(<[{]+|[)>\]}.:]+$/g, ''))
    .filter((w) => TOKEN_SHAPE.test(w) || (w.length >= 16 && /\d/.test(w) && /[A-Za-z]/.test(w) && !/^[a-z]+:\/\//i.test(w) && !w.includes('/')));
}

/** `text` with every needle hit replaced by «secret <sha12>» (printing reports, problem lists, errors). */
export function redactSecrets(text: string, needles: Iterable<string>): string {
  let out = text;
  for (const whole of needles) {
    if (!whole) continue;
    const mark = `«secret ${sha12(whole)}»`;
    out = out.split(whole).join(mark);
    for (const v of secretParts(whole)) {
      const n = strip(v);
      const pieces = [v, n];
      if (n.length >= MIN_LEN) { const sc = SCHEME.exec(n)?.[0] ?? ''; pieces.push(n.slice(0, sc.length + PREFIX_LEN)); for (let k = 0; k + WINDOW <= n.length; k++) pieces.push(n.slice(k, k + WINDOW)); }
      for (const p of pieces) if (p.length >= 6) out = out.split(p).join(mark);
    }
  }
  return out;
}

/** Responders are functions run per request (a mint answers only when sent, so drawing never calls it): call every
 *  rule's responder once with a synthetic request and harvest its answer (errors and hangs past 2 s are skipped). */
async function responderNeedles(states: Record<string, unknown>, needles: Map<string, Needle>): Promise<void> {
  for (const st of Object.values(states)) for (const r of (Array.isArray(st) ? st : (st as { rules?: unknown[] })?.rules ?? []) as Array<{ route?: { id?: string }; answer?: unknown }>) {
    if (typeof r?.answer !== 'function') continue;
    const req = { route: r.route, method: 'POST', path: '/', query: {}, body: {}, target: null, n: 1 };
    try { needlesOf(await Promise.race([Promise.resolve((r.answer as (q: unknown) => unknown)(req)), new Promise((res) => setTimeout(res, 2000))]), needles); } catch { /* a responder that needs a real request */ }
  }
}

/**
 * The needles the responders of one fixtures module answer with, harvested in a WORKER (a thread with a module graph
 * of its own; a test process may start one, never a subprocess: test-net-guard.ts). Responders have side effects (a
 * create pushes onto a store, counters move), and a page's stores often live in modules its fixtures.ts imports (vms:
 * fixtures.images.ts, fixtures.create.ts): a second instance of fixtures.ts alone still shares those, so a scan in
 * this thread left its synthetic rows (a download with no url, a VM with no name) in the stores the goldens then drew
 * (the vms frames said "This didn't load"). No scan, no needles: a worker that gives no result is an error
 * (what it sent is never put in the message: it holds the needles).
 */
export async function responderScan(fixturesFile: string): Promise<Needle[]> {
  const file = path.resolve(fixturesFile);
  if (!fs.existsSync(file)) return [];
  const w = new Worker(path.join(import.meta.dir, 'responder-scan.worker.ts'));
  try {
    const got = await new Promise<{ ok: boolean; needles?: Needle[] }>((res) => {
      const t = setTimeout(() => res({ ok: false }), SCAN_TIMEOUT_MS);
      const end = (v: { ok: boolean; needles?: Needle[] }): void => { clearTimeout(t); res(v); };
      w.onmessage = (e: MessageEvent) => end(e.data as { ok: boolean; needles?: Needle[] });
      w.onerror = () => end({ ok: false });
      w.postMessage({ file });
    });
    if (!got.ok || !Array.isArray(got.needles)) throw new Error(`the responder scan of ${path.relative(HUB, file)} gave no result`);
    return got.needles;
  } finally { w.terminate(); }
}
const SCAN_TIMEOUT_MS = 300_000;
/** The worker's side (responder-scan.worker.ts): the fixtures module loaded as the gate's renders load it, on the
 *  fixture clock, and every responder of its states called once. */
export async function responderScanHere(file: string): Promise<Needle[]> {
  const needles = new Map<string, Needle>();
  holdFixtureClock();
  const loader = await import(path.join(import.meta.dir, 'loader.ts')) as typeof import('./loader');
  if (!loader.installedContext()) loader.installTermLoader({ flavour: 'fixture', fixtures: true });
  const mod = (await import(file)) as { default?: { states?: Record<string, unknown> } };
  await responderNeedles(mod.default?.states ?? {}, needles);
  return [...needles.values()];
}

/** The static needles of a page (fixture states and fixture sources; no drawing): what goldens/check should redact
 *  from problem text and refuse in an --update. */
export async function pageNeedles(page: string): Promise<string[]> {
  const release = holdFixtureClock();
  try { return await pageNeedlesHeld(page); } finally { release(); }
}
async function pageNeedlesHeld(page: string): Promise<string[]> {
  // The fixture clock first (clock.ts): fixture modules compute their dates from Date.now() when they load, and
  // loadFixtures caches the module the goldens then draw. Loaded here at the real time, a page's dates would drift
  // with the real date while its frames are drawn at GOLDEN_NOW. Held by pageNeedles for this read only.
  const needles = new Map<string, Needle>();
  // The fixture modules import kit code: load them as the gate's renders do (terminal siblings). A process that already
  // has a loader (goldens: dev flavour) keeps it; a second install with another flavour would throw TERM_LOADER_INSTALLED.
  const loader = await import(path.join(import.meta.dir, 'loader.ts')) as typeof import('./loader');
  if (!loader.installedContext()) loader.installTermLoader({ flavour: 'fixture', fixtures: true });
  const fx = await import(path.join(SRC, 'app/fixtures.ts')) as typeof import('../../src/app/fixtures');
  const all = (await fx.loadFixtures(page)) as unknown as { states: Record<string, unknown> } | null;
  if (all) for (const st of Object.values(all.states)) needlesOf(st, needles);
  // Responders have side effects (a create pushes onto the world's live list, counters move): they are called in a
  // worker (responderScan), never on the modules the drawing reads, so the scan changes no world a golden then draws
  // (seen with keys, whose deleteUnknownListed listed a key twice, and vms, whose stores are in modules its
  // fixtures.ts imports).
  if (all) for (const n of await responderScan(path.join(SRC, 'pages', page, 'fixtures.ts'))) if (!needles.has(n.value)) needles.set(n.value, n);
  const dir = path.join(SRC, 'pages', page);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^fixtures.*\.ts$|\.vectors\.ts$/.test(f) && !/\.test\.|\.spec\./.test(f)) sourceNeedles(fs.readFileSync(path.join(dir, f), 'utf8'), needles);
  return [...needles.keys()];
}

export type Where = 'frame' | 'tree' | 'json' | 'console' | 'stdio' | 'clipboard' | 'osc' | 'diagnostics' | 'unsettled';
export interface Leak { page: string; case: string; where: Where; key: string; length: number; sha12: string; how: string; allowed?: string }
export interface PageOut {
  page: string; cases: string[]; states: number; needles: number; needleKeys?: Record<string, number>; empty?: string[];
  reveals: number; canaries: number; leaks: Leak[]; unsettled: string[]; error?: string; ms: number;
}

interface Shot { name: string; frame: string; tree: string; json: string; strings: string; revealed: boolean }
type Sem = typeof import('../../src/term/prim/semantics');

function walkStrings(v: unknown, out: string[]): void {
  if (typeof v === 'string') { out.push(v); return; }
  if (Array.isArray(v)) { for (const x of v) walkStrings(x, out); return; }
  if (v && typeof v === 'object') for (const x of Object.values(v)) walkStrings(x, out);
}

/** The frame with the cells of every `secret` node blanked (a revealed value may show there and nowhere else). */
export function blankSecrets(frame: string, nodes: readonly import('../../src/term/prim/semantics').SemNode[]): string {
  const lines = frame.split('\n').map((l) => [...l]);
  const visit = (ns: readonly import('../../src/term/prim/semantics').SemNode[]): void => {
    for (const n of ns) {
      if (n.states.secret) {
        const [x, y, w, h] = n.box;
        for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (lines[r] && c < lines[r]!.length) lines[r]![c] = ' ';
      }
      visit(n.children);
    }
  };
  visit(nodes);
  return lines.map((l) => l.join('')).join('\n');
}

function flat(nodes: readonly import('../../src/term/prim/semantics').SemNode[], out: import('../../src/term/prim/semantics').SemNode[] = []): import('../../src/term/prim/semantics').SemNode[] {
  for (const n of nodes) { out.push(n); flat(n.children, out); }
  return out;
}

/** Reveal controls in a tree, in order (see REVEAL_NAME). */
export function revealControls(nodes: readonly import('../../src/term/prim/semantics').SemNode[], inSecret = false, out: import('../../src/term/prim/semantics').SemNode[] = []): import('../../src/term/prim/semantics').SemNode[] {
  for (const n of nodes) {
    if (n.role === 'button' && !n.states.disabled && n.states.pressed !== true && n.states.expanded === undefined && !n.popup && (REVEAL_NAME.test(n.name) || (inSecret && REVEAL_IN_SECRET.test(n.name)))) out.push(n);
    revealControls(n.children, inSecret || n.states.secret === true, out);
  }
  return out;
}

async function child(page: string): Promise<PageOut> {
  const t0 = performance.now();
  const { addSourceHook } = await import(path.join(SRC, 'term/scenario/source-hooks.ts')) as typeof import('../../src/term/scenario/source-hooks');
  const ANSWER = "  const ans = stateAnswer(state, key);\n  if (!ans) throw new FixtureError('missing');\n  return ans;";
  // Two answer paths: keyed table answers (app/fixtures.ts `answer`) and core's request rules (core/transport.ts
  // `answerFor`, what defineFixtures pages use). Both are wrapped; a changed shape fails the gate instead of blinding it.
  const RULE = "      return typeof r.answer === 'function' ? r.answer(req) : r.answer;";
  const hooked = { table: false, rules: false };
  addSourceHook((f, s) => {
    if (f.endsWith('/src/app/fixtures.ts')) {
      if (!s.includes(ANSWER)) throw new Error('secrets.ts: app/fixtures.ts `answer` changed shape; update the hook (the gate would be blind)');
      hooked.table = true;
      return s.replace(ANSWER, "  const ans = stateAnswer(state, key);\n  if (!ans) throw new FixtureError('missing');\n  (globalThis as { __hubFxAnswers?: unknown[] }).__hubFxAnswers?.push(ans);\n  return ans;");
    }
    if (f.endsWith('/src/core/transport.ts')) {
      if (!s.includes(RULE)) throw new Error('secrets.ts: core/transport.ts `answerFor` changed shape; update the hook (the gate would be blind)');
      hooked.rules = true;
      return s.replace(RULE, "      { const __a = await (typeof r.answer === 'function' ? r.answer(req) : r.answer); (globalThis as { __hubFxAnswers?: unknown[] }).__hubFxAnswers?.push(__a); return __a; }");
    }
    return s;
  });
  const answers: unknown[] = [];
  (globalThis as { __hubFxAnswers?: unknown[] }).__hubFxAnswers = answers;
  // Side channels, per case: console (render.ts keeps console.error itself), process stdio, engine controls (title …).
  const side = { console: [] as string[], stdio: [] as string[], osc: [] as string[], clipboard: [] as string[] };
  const txt = (a: unknown[]): string => a.map((x) => (x instanceof Error ? `${x.message}\n${x.stack ?? ''}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ');
  for (const m of ['log', 'warn', 'info', 'debug', 'trace'] as const) console[m] = (...a: unknown[]) => { side.console.push(txt(a)); };
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((c: string | Uint8Array) => { side.stdio.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf8')); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((c: string | Uint8Array) => { side.stdio.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf8')); return true; }) as typeof process.stderr.write;
  try {
    const { renderPage } = await import(path.join(import.meta.dir, 'render.ts')) as typeof import('./render');
    const { casesOf } = await import(path.join(import.meta.dir, 'goldens.ts')) as typeof import('./goldens');
    const sem = await import(path.join(SRC, 'term/prim/semantics.ts')) as Sem;
    // Clipboard (OSC 52), the title and every other engine control, from the first render on (a page may copy or set
    // the title while it mounts): the engine's own classes are wrapped, resolved from hub/src as the Hub resolves them.
    const engine = await import(Bun.resolveSync('@opentui/core', SRC)) as unknown as { CliRenderer: { prototype: Record<string, unknown> }; NativeSession: { prototype: Record<string, unknown> } };
    const wrap = (proto: Record<string, unknown>, name: string, rec: (a: unknown[]) => void): void => {
      const real = proto[name];
      if (typeof real !== 'function') throw new Error(`secrets.ts: the engine has no ${name} to watch (the gate would be blind)`);
      proto[name] = function (this: unknown, ...a: unknown[]) { rec(a); return (real as (...x: unknown[]) => unknown).apply(this, a); };
    };
    wrap(engine.CliRenderer.prototype, 'copyToClipboardOSC52', (a) => side.clipboard.push(String(a[0])));
    wrap(engine.CliRenderer.prototype, 'setTerminalTitle', (a) => side.osc.push(`title ${String(a[0])}`));
    wrap(engine.NativeSession.prototype, 'control', (a) => side.osc.push(txt(a)));
    // SECRETS_CASES: a regex over case names (the gate's own tests draw one case; a full run never sets it).
    const only = process.env.SECRETS_CASES ? new RegExp(process.env.SECRETS_CASES) : null;
    const cases = (await casesOf(page)).filter((c) => !only || only.test(c.name));
    const shots: Shot[] = [];
    const caseSide: Array<{ name: string; channels: Array<[Where, string]> }> = [];
    const canaries = new Map<string, Needle>();
    const unsettled: string[] = [];
    let reveals = 0;
    const flowErrors: string[] = [];
    // One state: drawn at 120x40 and 80x24, flow steps (if any), canaries typed, reveals pressed, side channels read.
    const drive = async (label: string, fxName: string | null, at: string | undefined, steps: readonly string[]): Promise<void> => {
      side.console.length = 0; side.stdio.length = 0; side.osc.length = 0; side.clipboard.length = 0;
      const s = await renderPage({ page, fx: fxName, cols: 120, rows: 40, ...(at ? { path: at } : {}) });
      try {
        const r = s.renderer as unknown as { root: unknown; stdin: unknown };
        const root = (): import('../../src/term/prim/semantics').SemRoot => ({ root: r.root, stdin: r.stdin } as never);
        const shot = (name: string, revealed: boolean): void => {
          const tree = sem.semanticsOf(root());
          const json = sem.semJson(tree);
          const strs: string[] = [];
          walkStrings(json, strs);
          shots.push({ name, frame: revealed ? blankSecrets(s.frame, tree) : s.frame, tree: sem.semText(tree, { actions: true }), json: JSON.stringify(json), strings: strs.join(''), revealed });
          if (!s.settled) unsettled.push(`${name}: ${s.pendingText}`);
        };
        // A flow (SECRET_FLOWS): press / type by accessible name, as a person would; a step that finds nothing, or a
        // page that crashes on the way, fails the gate (a renamed button must not turn the flow off silently).
        const failed0 = s.failures.length;
        for (const st of steps) {
          const [kind, name, value] = st.split('|') as [string, string, string | undefined];
          // What an error prints of this step: a value only by its length, unless it is a `type` step's fixture input
          // (or `absent`'s name). A secret step's value is not a needle yet when its lookup fails, so the report's
          // redaction could not hide it; a misspelt step kind may carry one too.
          const said = value !== undefined && kind !== 'type' && kind !== 'absent'
            ? `${kind}|${name}|«${value.length} chars»` : st;
          // `shot|<tag>`: this state is judged too, as the end of the flow is (frame, tree, json; side channels per
          // flow), at both sizes: the narrow drawer is where a clip or a leak would show. Then 120x40 again for the
          // steps that follow.
          if (kind === 'shot') {
            const refused = shotTagRefusal(name);
            if (refused) { flowErrors.push(`${label}: step "${said}": ${refused}`); break; }
            shot(`${label}/${name}@120x40`, false);
            // The focused control is read BEFORE the resize: a resize that drops the focus must fail the flow, not
            // leave nothing to bring back.
            const was = flat(sem.semanticsOf(root())).find((x) => x.states.focused);
            await s.resize(80, 24);
            let lost = false;
            if (was) {
              const after = flat(sem.semanticsOf(root())).find((x) => x.states.focused);
              if (after?.role !== was.role || after?.name !== was.name) {
                lost = true;
                flowErrors.push(`${label}: step "${said}": the resize to 80x24 lost the focus`);
                // The flow fails either way, but the narrow state is still judged: put the focus back on the control
                // it was on, so that state shows the field (a field that remounts on a narrow terminal may also draw
                // its value there, and that leak must be caught, not hidden behind the lost focus).
                const back = flat(sem.semanticsOf(root())).find((x) => x.role === was.role && x.name === was.name && x.actions.includes('focus'));
                if (back) { sem.act(back, 'focus'); await s.settle(); }
              }
            }
            // A resize leaves the scroll where it was, and a scroll follows the focus only when the focus moves: the
            // field just typed into may sit below the narrow fold. Tab away and back, as a person would, to bring it
            // into view.
            if (was && !lost) {
              await s.keys.press('tab');
              await s.keys.press('tab', { shift: true });
              await s.settle();
              const now = flat(sem.semanticsOf(root())).find((x) => x.states.focused);
              lost = now?.role !== was.role || now?.name !== was.name;
              if (lost) flowErrors.push(`${label}: step "${said}": at 80x24 Tab, Shift+Tab did not bring the focus back`);
            }
            shot(`${label}/${name}@80x24`, false);
            await s.resize(120, 40);
            if (lost) break;
            continue;
          }
          if (kind === 'absent') {
            // `absent|<role>|<name>`: the state the flow must have reached (the drawer closed, the page left).
            if (flat(sem.semanticsOf(root())).some((x) => x.role === name && x.name === value)) { flowErrors.push(`${label}: step "${said}": it is still there`); break; }
            continue;
          }
          if (kind !== 'press' && kind !== 'type' && kind !== 'secret') { flowErrors.push(`${label}: step "${said}": unknown step kind`); break; }
          const types = kind === 'type' || kind === 'secret';
          const n = flat(sem.semanticsOf(root())).find((x) => x.name === name && !x.states.disabled && (types ? x.actions.includes('type') : x.actions.includes('press')));
          if (!n) { flowErrors.push(`${label}: step "${said}" found no control`); break; }
          if (types) {
            if (kind === 'secret') {
              // Declared by the flow, not read from the field: the value is looked for in every state even if the field
              // lost its mark, and the lost mark fails the flow.
              if (!n.states.secret) flowErrors.push(`${label}: step "${said}": the field is not marked secret`);
              if (!value || value.length < 6) flowErrors.push(`${label}: step "${said}": a secret step types at least 6 characters`);
              else canaries.set(value, { value, key: 'typed', from: 'source' });
            }
            if (!n.states.focused && n.actions.includes('focus')) { sem.act(n, 'focus'); await s.settle(); }
            let live = n;
            try { live = sem.getByRef(sem.semanticsOf(root()), n.ref); } catch { /* moved */ }
            sem.act(live, 'type', value ?? '');
            // What a flow types into a SECRET input (a password) must never show either; a name typed is meant to.
            if (kind === 'type' && value && value.length >= 6 && n.states.secret) canaries.set(value, { value, key: 'typed', from: 'source' });
          } else sem.act(n, 'press');
          await s.settle();
          await s.releaseHeld();
        }
        if (s.failures.length > failed0) flowErrors.push(`${label}: the page failed during the flow (${s.failures.length - failed0} failure(s))`);
        shot(`${label}@120x40`, false);
        await s.resize(80, 24);
        shot(`${label}@80x24`, false);
        // Type a canary into every secret input (masked: the frame must not show it either).
        let typed = 0;
        for (const n of flat(sem.semanticsOf(root()))) {
          if (!n.states.secret || !n.actions.includes('type') || n.states.disabled || n.states.readonly) continue;
          const i = canaries.size;
          const v = CODE_INPUT.test(`${n.name} ${n.description ?? ''}`) ? CANARY_CODE(i) : CANARY_TEXT(i);
          canaries.set(v, { value: v, key: 'canary', from: 'source' });
          let live = n;
          try { live = sem.getByRef(sem.semanticsOf(root()), n.ref); } catch { /* moved */ }
          if (!live.states.focused && live.actions.includes('focus')) { sem.act(live, 'focus'); await s.settle(); try { live = sem.getByRef(sem.semanticsOf(root()), n.ref); } catch { /* moved */ } }
          try { sem.act(live, 'type', v); await s.settle(); typed++; } catch { /* it refused typing: the next state shows it */ }
        }
        if (typed) shot(`${label}/typed@80x24`, false);
        typedTotal += typed;
        // Press every reveal control until none is left (a press may re-render; the Hide that replaces it is skipped).
        const pressed = new Set<string>();
        for (let round = 0; round < 24; round++) {
          const next = revealControls(sem.semanticsOf(root())).find((n) => !pressed.has(n.ref));
          if (!next) break;
          pressed.add(next.ref);
          try { sem.act(next, 'press'); await s.settle(); reveals++; } catch { /* not pressable after all */ }
        }
        if (pressed.size) {
          shot(`${label}/revealed@80x24`, true);
          await s.resize(120, 40);
          shot(`${label}/revealed@120x40`, true);
        }
        await s.releaseHeld();
        caseSide.push({ name: label, channels: [
          ...side.console.map((x) => ['console', x] as [Where, string]), ...s.errors.map((x) => ['console', x] as [Where, string]),
          ...side.stdio.map((x) => ['stdio', x] as [Where, string]), ...side.osc.map((x) => ['osc', x] as [Where, string]),
          ...side.clipboard.map((x) => ['clipboard', x] as [Where, string]), ...s.failures.map((f) => ['diagnostics', `${f.message} ${f.where ?? ''}`] as [Where, string]),
          ...(s.settled ? [] : [['unsettled', s.pendingText] as [Where, string]]),
        ] });
      } finally { s.close(); }
    };
    let typedTotal = 0;
    for (const c of cases) await drive(c.name, c.fx, c.path, []);
    const flows = (SECRET_FLOWS[page] ?? []).filter((f) => !only || only.test(`${f.case}+${f.name}`));
    const all0 = await casesOf(page);
    for (const f of flows) {
      const c = all0.find((x) => x.name === f.case);
      if (!c) { flowErrors.push(`flow ${f.name}: the page has no case ${f.case}`); continue; }
      await drive(`${f.case}+${f.name}`, c.fx, c.path, f.steps);
    }
    if (!hooked.table || !hooked.rules) throw new Error(`secrets.ts: not loaded through the hook: ${Object.entries(hooked).filter(([, v]) => !v).map(([k]) => k).join(', ')} (the gate would be blind)`);
    const needles = new Map<string, Needle>();
    for (const a of answers) needlesOf(a, needles);
    // Every state's static answers too (a rule never asked while drawing, such as a mint's reply, still names a secret).
    const fx = await import(path.join(SRC, 'app/fixtures.ts')) as typeof import('../../src/app/fixtures');
    const all = (await fx.loadFixtures(page)) as unknown as { states: Record<string, unknown> } | null;
    if (all) for (const st of Object.values(all.states)) needlesOf(st, needles);
    if (all) await responderNeedles(all.states, needles);
    const dir = path.join(SRC, 'pages', page);
    for (const f of fs.readdirSync(dir)) if (/^fixtures.*\.ts$|\.vectors\.ts$/.test(f) && !/\.test\.|\.spec\./.test(f)) sourceNeedles(fs.readFileSync(path.join(dir, f), 'utf8'), needles);
    for (const [k, v] of canaries) if (!needles.has(k)) needles.set(k, v);
    const leaks: Leak[] = [];
    const seen = new Set<string>();
    const add = (cs: string, where: Where, n: Needle, how: string): void => {
      const k = `${cs}|${where}|${n.value}`;
      if (seen.has(k)) return;
      seen.add(k);
      leaks.push({ page, case: cs, where, key: n.key, length: n.value.length, sha12: sha12(n.value), how });
    };
    for (const sh of shots) {
      const fs0 = strip(sh.frame);
      const ts0 = strip(sh.tree) + strip(sh.strings);
      const js0 = strip(sh.json);
      for (const n of needles.values()) {
        const hf = hitOf(n.value, sh.frame, fs0); if (hf) add(sh.name, 'frame', n, hf);
        const ht = hitOf(n.value, sh.tree + '\n' + sh.strings, ts0); if (ht) add(sh.name, 'tree', n, ht);
        const hj = hitOf(n.value, sh.json, js0); if (hj) add(sh.name, 'json', n, hj);
      }
    }
    for (const cs of caseSide) for (const [where, text] of cs.channels) {
      const st = strip(text);
      for (const n of needles.values()) { const h = hitOf(n.value, text, st); if (h) add(cs.name, where, n, h); }
    }
    const needleKeys: Record<string, number> = {};
    for (const n of needles.values()) needleKeys[n.key] = (needleKeys[n.key] ?? 0) + 1;
    // A blank frame or tree would pass every search: it is an error, not a clean case.
    const empty = shots.filter((x) => !x.frame.trim() || !x.tree.trim()).filter((x) => !x.revealed).map((x) => x.name);
    const red = (t: string): string => redactSecrets(t, needles.keys());
    return { page, cases: [...cases.map((x) => x.name), ...flows.map((f) => `${f.case}+${f.name}`)], states: shots.length, needles: needles.size, needleKeys, empty, reveals, canaries: typedTotal, leaks, unsettled: unsettled.map(red), ...(flowErrors.length ? { error: red(`secret flows: ${flowErrors.join('; ')}`) } : {}), ms: Math.round(performance.now() - t0) };
  } finally {
    process.stdout.write = realOut as typeof process.stdout.write;
    process.stderr.write = realErr as typeof process.stderr.write;
  }
}

/** Pages a set of changed files can reach: a file under src/pages/<id>/ is that page; any other file under src/ (kit,
 *  core, app, term), this gate and its allow file reach every page (a kit control is drawn on many pages, and the
 *  import graph of a page is not narrower than "anything it draws"). Docs and other scripts reach none. */
export function pagesForChanged(files: readonly string[], all: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of files) {
    const f = raw.replace(/\\/g, '/').replace(/^.*?\bhub\//, '').replace(/^\.\//, '');
    if (/\.(md|txt|png)$/.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /\.scenario\.ts$/.test(f)) continue;
    const m = /^src\/pages\/([^/]+)\//.exec(f);
    if (m) { if (all.includes(m[1]!)) out.add(m[1]!); continue; }
    if (/^src\//.test(f) || /^scripts\/term\/(secrets|render|goldens|shots|loader)\b/.test(f)) return [...all];
  }
  return [...out];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--child');
  if (ci >= 0) {
    const page = args[ci + 1]!;
    const realOut = process.stdout.write.bind(process.stdout);
    let out: PageOut;
    try { out = await child(page); } catch (e) {
      let red = String((e as Error)?.message ?? e).split('\n')[0]!.slice(0, 300);
      try { red = redactSecrets(red, await pageNeedles(page)); } catch { red = '(error text withheld: needles could not be read to redact it)'; }
      out = { page, cases: [], states: 0, needles: 0, reveals: 0, canaries: 0, leaks: [], unsettled: [], error: red, ms: 0 };
    }
    realOut('\n@@SECRETS@@' + JSON.stringify(out) + '\n');
    process.exit(0);
  }
  const { allPageIds } = await import(path.join(import.meta.dir, 'goldens.ts')) as typeof import('./goldens');
  const chi = args.indexOf('--changed');
  const changed = chi >= 0 ? args.slice(chi + 1).filter((a) => !a.startsWith('--')) : null;
  const named = (chi >= 0 ? args.slice(0, chi) : args).filter((a) => !a.startsWith('--'));
  const pages = changed ? pagesForChanged(changed, allPageIds()) : named.length ? named : allPageIds();
  if (changed && !pages.length) { process.stdout.write(`secrets: no page reached by ${changed.length} changed file(s); nothing to check\n`); process.exit(0); }
  const allow = fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')) as Record<string, string> : {};
  const used = new Set<string>();
  const results: PageOut[] = [];
  const json = args.includes('--json');
  for (const p of pages) {
    // SECRETS_PRELOAD: a module preloaded into each child (the gate's own attack tests, secrets.attacks.ts).
    const pre = process.env.SECRETS_PRELOAD ? ['--preload', process.env.SECRETS_PRELOAD] : [];
    const r = spawnSync(process.execPath, [...pre, import.meta.path, '--child', p], { cwd: HUB, env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8', timeout: Number(process.env.SECRETS_PAGE_TIMEOUT_MS ?? 2_400_000), maxBuffer: 256 << 20 });
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@SECRETS@@'));
    const out: PageOut = line ? JSON.parse(line.slice(11)) : { page: p, cases: [], states: 0, needles: 0, reveals: 0, canaries: 0, leaks: [], unsettled: [], error: `child exited ${r.status ?? r.signal} with no result`, ms: 0 };
    for (const l of out.leaks) {
      const base = l.case.replace(/[@/].*$/, '');
      for (const k of [`${l.page}/${l.case}/${l.sha12}`, `${l.page}/${base}/${l.sha12}`, `${l.page}/*/${l.sha12}`]) if (allow[k] !== undefined) { l.allowed = allow[k]; used.add(k); break; }
    }
    if (out.empty?.length && !out.error) out.error = `blank frame or tree: ${out.empty.join(' ')}`;
    if (!out.error && (SECRET_PAGES as readonly string[]).includes(p) && out.reveals === 0) out.error = `no reveal control pressed in any of ${out.cases.length} cases (a page holding secrets must show at least one ${REVEAL_NAME}; renamed?)`;
    results.push(out);
    if (!json) {
      const bad = out.leaks.filter((l) => !l.allowed);
      process.stdout.write(`${out.error ? 'ERROR' : bad.length ? 'FAIL ' : 'ok   '} ${p}: ${out.cases.length} cases, ${out.states} states, ${out.reveals} reveals, ${out.canaries} canaries, ${out.needles} needles${out.needles ? ` (${Object.entries(out.needleKeys ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}, ${bad.length} leaks${out.unsettled.length ? `, ${out.unsettled.length} unsettled` : ''}, ${(out.ms / 1000).toFixed(1)} s${out.error ? `  ${out.error}` : ''}\n`);
      for (const l of bad) process.stdout.write(`       ${l.case}: ${l.where} shows a ${l.key} value (${l.how}; ${l.length} chars, sha ${l.sha12})\n`);
    }
  }
  // A row is stale only when its page was checked and nothing matched it.
  const stale = Object.keys(allow).filter((k) => pages.includes(k.split('/')[0]!) && !used.has(k));
  const leaks = results.flatMap((r) => r.leaks.filter((l) => !l.allowed)).length;
  const errors = results.filter((r) => r.error).length;
  const noNeedles = results.filter((r) => !r.error && r.needles === 0).map((r) => r.page);
  const sum = (f: (r: PageOut) => number): number => results.reduce((n, r) => n + f(r), 0);
  if (json) process.stdout.write(JSON.stringify({ results, stale }, null, 2) + '\n');
  else {
    for (const k of stale) process.stdout.write(`STALE allow row ${k}: nothing matches it; remove it\n`);
    process.stdout.write(`secrets: ${results.length} pages, ${sum((r) => r.cases.length)} cases, ${sum((r) => r.states)} states, ${sum((r) => r.reveals)} reveal controls driven, ${sum((r) => r.canaries)} canaries typed, ${sum((r) => r.needles)} needles, ${leaks} leaks, ${errors} errors, ${stale.length} stale allow rows${noNeedles.length ? ` (no needles: ${noNeedles.join(' ')})` : ''}\n`);
  }
  // Fail closed (fail-closed.ts): no page, or pages that drew no case, checked nothing.
  const secretsEmpty = noInputs('secrets.ts', named.length ? `page named ${named.join(' ')}` : 'page', pages.length)
    ?? noInputs('secrets.ts', 'drawn case', sum((r) => r.cases.length));
  if (secretsEmpty) process.stderr.write(secretsEmpty + '\n');
  process.exit(leaks || errors || stale.length || secretsEmpty ? 1 : 0);
}
