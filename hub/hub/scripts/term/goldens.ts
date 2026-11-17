// Page goldens: the acceptance run of every page. Cases come from the shared manifests the web uses: every fixture state
// of the page's fixtures.ts (the `fx` names) and every shot of its shots.ts that needs no web action (a state and/or a
// path such as `?sel=...`), each drawn headless at 80x24 and 120x40 and compared to plain-text frames kept beside it:
//
//   src/pages/<id>/term-golden/<case>.80x24.txt, <case>.120x40.txt   the frames (trailing spaces trimmed)
//   src/pages/<id>/term-golden/allowance.json                        the page's reviewed, shrink-only debt
//
// READ-ONLY unless --update (the only command that writes). Without it, each of these FAILS:
//   a missing golden or allowance file, a changed frame, a frame for a case that no longer exists, a render that did not
//   settle before its deadline, a crash or error screen, and anything beyond the allowance: placeholder components
//   drawn, holes touched, strict-global traps, refused element members, unsupported raw-HTML events, console errors,
//   and the count of untranslatable classes, and the kit table check on every frame (table-gate.ts: list `tableFaults`,
//   rows `<cols>x<rows>|<kind>`; a row that no longer happens fails too). --update writes missing/changed frames and SHRINKS the allowance (what is
//   gone is dropped); it never adds to an existing allowance (a reviewed hand edit is the only way, and it shows in the
//   diff). A first allowance is written by --update only.
// Frames are drawn on a frozen clock (clock.ts); every message is passed through safeDiagnostic (prim/safe.ts).
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import { installGroupReaper, spawnGroup, stopGroup } from './child-group';
import { globalChangeWhy, hashGlobalInputs } from './global-inputs';
import { frameRefusal, REVEAL_CASES, secretToolsFor, type SecretTools } from './golden-guard';
import fs from 'node:fs';
import path from 'node:path';
import { HUB, SRC } from './resolve';
import { FIXTURE_WEB_ORIGIN } from './fixture-origin';

const FIXTURE_HOST = new URL(FIXTURE_WEB_ORIGIN).host;
import { ACT_WARNING, type PageSession } from './render';
import { tableProblems, type TableHit } from './table-gate';
import { holdFixtureClock } from './clock';
import { actionNoop, awaitText, debtListed, waitShown, WAIT_SIZE, waitTextProblems, type WaitDebt, type WaitHit } from './wait-text';
import { rendererHitAt, rendererOwns, replay, shotSteps, staticSkip, type Node as SemLike, type ReplayStep } from './shot-replay';
import { crashShown } from './crash-shown';
import { closureOf as importClosure } from './static-imports';

export const SIZES: ReadonlyArray<readonly [number, number]> = [[80, 24], [120, 40]];
/** A larger terminal, for a page's wide cases only (its default state and main states, `wide` on the case): stored
 *  frames like SIZES (not just by looks). */
export const WIDE_SIZE = [200, 50] as const;
/** Wider still, layout only: the layout and table gates judge the frame, nothing is stored (no golden file). */
export const LAYOUT_SIZE = [240, 67] as const;
/** The sizes a case is drawn at: SIZES; a wide case also WIDE_SIZE (stored) and LAYOUT_SIZE (judged, never stored). */
export const sizesOf = (c: Pick<Case, 'wide'>): ReadonlyArray<readonly [number, number]> => (c.wide ? [...SIZES, WIDE_SIZE, LAYOUT_SIZE] : SIZES);
const layoutOnly = (cols: number, rows: number): boolean => cols === LAYOUT_SIZE[0] && rows === LAYOUT_SIZE[1];
export const GOLDEN_DIR = 'term-golden';

export interface Problem { file: string; rule: string; message: string; fix: string }
type ListKey = 'crashes' | 'placeholders' | 'holes' | 'traps' | 'domRefused' | 'domUnsupported' | 'consoleErrors' | 'tableFaults';
const LISTS: readonly ListKey[] = ['crashes', 'placeholders', 'holes', 'traps', 'domRefused', 'domUnsupported', 'consoleErrors', 'tableFaults'];
export type Allowance = { _doc?: string; untranslatable: number; /** Shots whose waitForText the frame lacks (wait-text.ts), owned rows. */ waitTextDebt?: WaitDebt[] } & Record<ListKey, string[]>;
export interface Case { name: string; fx: string | null; path?: string; /** The case opens scrolled on purpose (a shot's `scrolled: true`, e.g. a deep link to an anchor). */ scrolled?: boolean;
  /** null: the host gives no web origin (an added `-no-origin` case); absent: FIXTURE_WEB_ORIGIN. */ webOrigin?: null;
  /** A deliberate loading state (the page's fixtures.ts `loadingStates`): drawn after a short deadline, never settles. */ loading?: boolean;
  /** Also drawn at WIDE_SIZE (stored) and LAYOUT_SIZE (layout only): the page's default state and its main states. */ wide?: boolean;
  /** A shot's waitForText: the frame at WAIT_SIZE must show it (wait-text.ts); an acting shot's frame BEFORE its steps. */ waitForText?: string;
  /** An acting shot that expects its steps to change nothing (else `shot-action-noop`). */ noChange?: boolean;
  /** A shot's web action after load (click, keys, act), replayed on the semantics tree before the frame (shot-replay.ts). */ steps?: ReplayStep[] }
export interface PageResult { page: string; states: string[]; cases: string[]; crashes: Record<string, string>; frames: number; changed: number; problems: Problem[]; zeroPlaceholders: boolean; placeholders: string[]; ms: number;
  /** Layout faults by kind over every case and size (overdraw, cut, text-cut, offscreen, top-row). */
  layout: Record<string, number>;
  /** Time split summed over every draw: fixture boot, mount, settle loop, and settle frames rendered. */
  timing?: { boot: number; mount: number; settle: number; settleFrames: number };
  /** Every hub/src module this page's run loaded (relative to hub/): the --affected closure. */
  closure?: string[];
  /** Table faults seen (`<cols>x<rows>|<kind>`, table-gate.ts): what `table-gate.ts --seed` writes. */
  tableSeen?: string[];
  /** Shot cases not drawn, with why: an action the terminal cannot replay (shot-replay.ts), found when the cases are
   *  read or when a replay finds no target. Never drawn without the action, never a golden. */
  skipped?: Record<string, string> }

const DOC = 'Terminal page acceptance debt (scripts/term/goldens.ts). Shrink-only: `bun scripts/term/check.ts --page <id> --update` drops what is gone and never adds. Fix the cause instead of listing it.';

export const goldenDir = (page: string): string => path.join(SRC, 'pages', page, GOLDEN_DIR);
const rel = (f: string): string => path.relative(HUB, f);
const normal = (frame: string): string => frame.split('\n').map((l) => l.trimEnd()).join('\n').trimEnd() + '\n';
const fileSafe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]/g, '_');
let diag: (t: unknown, n?: number) => string = (t) => String(t);
/** Error text as a stable allowance key: digits and hex ids masked, one line, bounded. */
const keyOf = (m: string): string => diag(m, 160).split('\n')[0]!.replace(/\b[0-9a-f]{8,}\b/gi, '<id>').replace(/\d+/g, '0');

async function boot(): Promise<void> {
  (await import('./loader')).installTermLoader({ flavour: 'dev', fixtures: true });
  await import(path.join(SRC, 'term/env/preinstall.ts'));
  diag = ((await import(path.join(SRC, 'term/prim/safe.ts'))) as typeof import('../../src/term/prim/safe')).safeDiagnostic;
}

/** The fixture states of a page: its default first, then the rest in declaration order. */
export async function statesOf(page: string): Promise<string[]> {
  await boot();
  const fx = await import(path.join(SRC, 'app/fixtures.ts')) as typeof import('../../src/app/fixtures');
  const f = (await fx.loadFixtures(page)) as unknown as { default: string; states: Record<string, unknown> } | null;
  if (!f) return ['default'];
  return [f.default, ...Object.keys(f.states).filter((s) => s !== f.default)];
}

/** Every case of a page: its fixture states, then the shots of its shots.ts that need no web action. */
/** Fixture states a page declares as deliberately loading for ever (`export const loadingStates = ['loading']` in its
 *  fixtures.ts): the gate draws them after LOADING_MS and does not fail them as unsettled; one that settles fails. */
export async function loadingStatesOf(page: string): Promise<string[]> {
  const f = path.join(SRC, 'pages', page, 'fixtures.ts');
  if (!fs.existsSync(f)) return [];
  const m = (await import(f)) as { loadingStates?: unknown };
  return Array.isArray(m.loadingStates) ? m.loadingStates.filter((x): x is string => typeof x === 'string') : [];
}
const LOADING_MS = 3000;
/** A page's main states, drawn wide too (fixtures.ts `wideStates`, optional). Without it: the dense list states
 *  `many` and `long` where the page has them. The default state is always wide. */
export async function wideStatesOf(page: string): Promise<string[] | null> {
  const f = path.join(SRC, 'pages', page, 'fixtures.ts');
  if (!fs.existsSync(f)) return null;
  const m = (await import(f)) as { wideStates?: unknown };
  return Array.isArray(m.wideStates) ? m.wideStates.filter((x): x is string => typeof x === 'string') : null;
}
const DEFAULT_WIDE = ['many', 'long'];

export async function casesOf(page: string, skipped?: Record<string, string>): Promise<Case[]> {
  const states = await statesOf(page);
  const loading = new Set(await loadingStatesOf(page));
  const wide = new Set([states[0]!, ...((await wideStatesOf(page)) ?? DEFAULT_WIDE)]);
  const cases: Case[] = states.map((s) => ({ name: s, fx: s === 'default' ? null : s, ...(loading.has(s) ? { loading: true } : {}), ...(wide.has(s) && !loading.has(s) ? { wide: true } : {}) }));
  const shotsFile = path.join(SRC, 'pages', page, 'shots.ts');
  if (!fs.existsSync(shotsFile)) return cases;
  const pageDef = ((await import(path.join(SRC, 'pages', page, 'page.ts'))) as { default: { path: string } }).default;
  const shots = ((await import(shotsFile)) as { default: ShotLike[] }).default;
  for (const s of shots) {
    const c = shotCase(s, pageDef.path);
    if (c) { cases.push(c); continue; }
    const why = shotSkip(s);
    if (why && skipped) skipped['shot-' + s.name] = why;
  }
  return cases;
}

/** A crash's allowance key: its case and its (redacted, digit-folded) message. */
export const crashKey = (caseName: string, message: string): string => `${caseName} — ${message}`;
/** Whether `key` is allowed by `allowed`: the same key, or a bare case name stored before the key rule. */
export function crashAllowed(allowed: readonly string[], key: string): boolean {
  return allowed.some((a) => a === key || (!a.includes(' — ') && key.startsWith(a + ' — ')));
}

/** The fields of a shot (src/app/shots.types.ts) the gate reads. */
/** A case whose first frame may show a scroll box off its top on purpose: it declares `scrolled`, a
 *  replayed action ran (a click or keys, and the wheel that brings their target into view), or it opens a deep link to
 *  one item (`sel=` in the query: the list scrolls to it). With none of these a page opens at the top (`scrolled-open`). */
export const opensScrolledOnPurpose = (c: { scrolled?: boolean; steps?: readonly unknown[]; path?: string }): boolean =>
  !!c.scrolled || !!c.steps?.length || /[?&]sel=/.test(c.path ?? '');
export interface ShotLike { name: string; state?: string; path?: string; act?: readonly unknown[]; click?: string; keys?: readonly string[]; realm?: string; computer?: false; scrolled?: boolean; waitForText?: string; noChange?: boolean }

/**
 * A shot's golden case, or null when the terminal gate cannot draw what the shot names:
 *   - `act`, `click` or `keys`: a web action after load (Playwright selectors and key names). Replayed on the semantics
 *     tree (shot-replay.ts, `steps`) so the frame is the page AFTER the action; an action with no terminal mapping (css=,
 *     xpath=, hover, a Meta key) is no case (shotSkip says why). Never drawn without its action: that frame was the page
 *     BEFORE the action under the action's name (ai shot-impact stored the picker).
 *   - `realm`, `computer: false`: another world than the fixtures boot.
 *   - no `path` and no action: a state-only shot is a state case already (an acting shot opens the page's own path).
 * `waitForText` alone is drawn (the gate's settle waits for the page) and its frame must show that text (wait-text.ts).
 * On an acting shot it is judged on the frame BEFORE the replayed action, as the web runner does (shots.spec.ts waits
 * for the text, then acts): the text names the screen the action starts from. It used to be judged after the
 * action, which failed correct frames whose action leaves that screen (account: "Save name" is the button pressed).
 * The frame after the action must differ from the one before it (`shot-action-noop`), unless the shot says `noChange`.
 */
export function shotCase(s: ShotLike, pagePath: string): Case | null {
  if (s.realm || s.computer === false) return null;
  const wait = s.waitForText ? { waitForText: s.waitForText } : {};
  const steps = shotSteps(s);
  if (steps.length) {
    if (staticSkip(steps)) return null;
    return { name: 'shot-' + s.name, fx: s.state ?? null, path: pagePath + (s.path ?? ''), steps, ...(s.scrolled ? { scrolled: true } : {}), ...(s.noChange ? { noChange: true } : {}), ...wait };
  }
  if (!s.path) return null;
  return { name: 'shot-' + s.name, fx: s.state ?? null, path: pagePath + s.path, ...(s.scrolled ? { scrolled: true } : {}), ...wait };
}

/** Why an ACTING shot is no case (an action the terminal cannot replay; another realm or no computer), else null. A
 *  shot with no action that is no case (a state-only shot) is no skip: its state is drawn as a state case. */
export function shotSkip(s: ShotLike): string | null {
  const steps = shotSteps(s);
  if (!steps.length) return null;
  if (s.realm) return `another realm (${s.realm}) than the fixtures boot`;
  if (s.computer === false) return 'no current computer (the fixtures boot one)';
  return staticSkip(steps);
}

function readAllowance(page: string, dir = goldenDir(page)): Allowance | null {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(dir, 'allowance.json'), 'utf8')) as Partial<Allowance>;
    for (const k of LISTS) a[k] ??= [];
    a.untranslatable ??= 0;
    return a as Allowance;
  } catch { return null; }
}
function writeAllowance(page: string, a: Allowance, dir = goldenDir(page)): void {
  fs.mkdirSync(dir, { recursive: true });
  const out: Record<string, unknown> = { _doc: DOC };
  for (const k of LISTS) out[k] = [...a[k]].sort();
  if (a.waitTextDebt) out.waitTextDebt = [...a.waitTextDebt].sort((x, y) => (x.case + x.text).localeCompare(y.case + y.text));
  out.untranslatable = a.untranslatable;
  fs.writeFileSync(path.join(dir, 'allowance.json'), JSON.stringify(out, null, 2) + '\n');
}

/** The first differing lines of two frames. */
export function frameDiff(want: string, got: string, max = 6): string {
  const a = want.split('\n');
  const b = got.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < max * 2; i++) {
    if (a[i] === b[i]) continue;
    out.push(`  line ${i + 1} want: ${JSON.stringify(a[i] ?? '')}`, `  line ${i + 1} got:  ${JSON.stringify(b[i] ?? '')}`);
  }
  return out.join('\n');
}

export { crashShown };

type Render = (opts: { page: string; fx: string | null; cols: number; rows: number; path?: string; strictGlobals?: boolean; settleMs?: number }) => Promise<PageSession>;

/**
 * Every frame is drawn with the strict DOM-global traps on, as the live mount runs: a trap is a hard `trap` problem
 * naming the case and the hub/src line, never accepted by an allowance.
 */
/** runPageGoldens on the fixture clock, held for the run only (clock.ts holdFixtureClock): a test file that runs a
 *  page's goldens leaves the real clock to the next file. */
export async function runPageGoldens(page: string, o: { update: boolean; render: Render; strict?: boolean; /** Also write every normalised frame here (<dir>/<page>/<file>): identity checks. */ framesOut?: string; /** Golden directory (tests): default the page's own. */ dir?: string; /** Loading states (tests): default the page's fixtures.ts `loadingStates`. */ loading?: string[]; /** The page's secret tools (tests: a canary); default secretToolsFor(page). */ secrets?: SecretTools; /** Reveal cases (tests): default REVEAL_CASES[page]. */ reveal?: readonly string[] }): Promise<PageResult> {
  const release = holdFixtureClock();
  try { return await runPageGoldensHeld(page, o); } finally { release(); }
}
async function runPageGoldensHeld(page: string, o: { update: boolean; render: Render; strict?: boolean; /** Also write every normalised frame here (<dir>/<page>/<file>): identity checks. */ framesOut?: string; /** Golden directory (tests): default the page's own. */ dir?: string; /** Loading states (tests): default the page's fixtures.ts `loadingStates`. */ loading?: string[]; /** The page's secret tools (tests: a canary); default secretToolsFor(page). */ secrets?: SecretTools; /** Reveal cases (tests): default REVEAL_CASES[page]. */ reveal?: readonly string[] }): Promise<PageResult> {
  const t0 = performance.now();
  // The fixture clock (held by runPageGoldens) before anything loads a fixture module (the secrets read below does):
  // see secrets.ts pageNeedles.
  const dir = o.dir ?? goldenDir(page);
  const problems: Problem[] = [];
  const skipped: Record<string, string> = {};
  const cases = await casesOf(page, skipped);
  const semMod = (await import(path.join(SRC, 'term/prim/semantics.ts'))) as typeof import('../../src/term/prim/semantics');
  if (o.loading) for (const c of cases) { if (o.loading.includes(c.name)) c.loading = true; else delete c.loading; }
  const domMod = (await import(path.join(SRC, 'term/jsx/dom.ts'))) as typeof import('../../src/term/jsx/dom');
  const lc = (await import(path.join(SRC, 'term/prim/layoutcheck.ts'))) as typeof import('../../src/term/prim/layoutcheck');
  const tc = (await import(path.join(SRC, 'term/prim/TableCheck.ts'))) as typeof import('../../src/term/prim/TableCheck');
  const tableHits: TableHit[] = [];
  const waitHits: WaitHit[] = [];
  const waitJudged = new Set<string>();
  const waitDebt = readAllowance(page, dir)?.waitTextDebt ?? [];
  const layout: Record<string, number> = {};
  const timing = { boot: 0, mount: 0, settle: 0, settleFrames: 0 };
  const layoutSeen = new Set<string>();
  const now: Allowance = { crashes: [], placeholders: [], holes: [], traps: [], domRefused: [], domUnsupported: [], consoleErrors: [], tableFaults: [], untranslatable: 0 };
  const sets = Object.fromEntries(LISTS.map((k) => [k, new Set<string>()])) as Record<ListKey, Set<string>>;
  const crashes = new Map<string, string>();
  const untranslatable = new Set<string>();
  // The page's fixture secrets (golden-guard.ts): a frame holding one is never stored, a stored one fails.
  let sec: SecretTools | null = null;
  try { sec = o.secrets ?? await secretToolsFor(page); } catch (e) {
    problems.push({ file: rel(dir), rule: 'golden-secrets-unreadable', message: `the fixture secrets of "${page}" could not be read: ${keyOf(String((e as Error)?.message ?? e))}`, fix: 'Fix the page fixtures (scripts/term/secrets.ts pageNeedles reads them); no golden is judged without them.' });
  }
  const refusal = (f: string) => frameRefusal(f, crashShown, sec);
  const reveal = new Set(o.reveal ?? REVEAL_CASES[page] ?? []);
  // Redact BEFORE keyOf: its digit folding (and the 160-character cut) would turn a secret into a near-copy that no
  // longer matches the needle.
  const keyR = (m: string): string => keyOf(sec ? sec.redact(m, sec.needles) : m);
  const checked = new Set<string>();
  let frames = 0;
  let changed = 0;
  const seen = new Set<string>();
  const record = (s: PageSession): void => {
    for (const r of s.placeholders.rendered) sets.placeholders.add(r.name);
    for (const r of s.placeholders.touched) sets.holes.add(r.name);
    for (const k of Object.keys(s.dom.refused)) sets.domRefused.add(k);
    for (const k of Object.keys(domMod.domLedger().unsupported)) sets.domUnsupported.add(k);
    for (const c of s.styles.untranslatable) untranslatable.add(c);
    // React's act() note is dropped by its exact text only; a TERM_GLOBAL read is judged as a trap (rule `trap`).
    for (const e of s.errors) if (!ACT_WARNING.test(e) && !/TERM_GLOBAL/.test(e)) sets.consoleErrors.add(keyR(e));
  };
  let noOriginAdded = false;
  for (const c of cases) {
    for (const [cols, rows] of sizesOf(c)) {
      if (skipped[c.name]) break;
      const file = path.join(dir, `${fileSafe(c.name)}.${cols}x${rows}.txt`);
      if (!layoutOnly(cols, rows)) seen.add(path.basename(file));
      let s: PageSession;
      try {
        s = await o.render({ page, fx: c.fx, cols, rows, ...(c.path ? { path: c.path } : {}), ...(c.webOrigin === null ? { webOrigin: null } : {}), ...(c.loading ? { settleMs: LOADING_MS } : {}) });
      } catch (e) {
        crashes.set(c.name, `threw: ${keyR(String((e as Error)?.message ?? e))}`);
        continue;
      }
      // A shot's action (shot-replay.ts): replayed before the frame is judged; a target the terminal does not draw skips
      // the case (both sizes, with its reason), never a frame without the action.
      // What the page shows and is (drawn text + semantics tree), read before an acting shot's steps: its wait text is
      // judged on that frame, and the steps must change it (wait-text.ts).
      // A shot's wait text, at EVERY size, before the frame is taken and before an acting shot's steps (wait-text.ts):
      // the settle above ends when the page is idle, which it also is for a moment before a late read is asked for.
      const atWait = cols === WAIT_SIZE[0] && rows === WAIT_SIZE[1];
      const treeText = (): string => { const r = s.renderer as unknown as { root: unknown; stdin?: unknown }; return semMod.semText(semMod.semanticsOf({ root: r.root, stdin: r.stdin } as never)); };
      const waits = c.waitForText !== undefined && c.webOrigin !== null && !c.loading && s.settled;
      const waitMiss = waits && !(await awaitText(s, () => waitShown(s.frame, atWait ? null : treeText(), c.waitForText!)));
      const pageNow = (): string => { const r = s.renderer as unknown as { root: unknown; stdin?: unknown }; return `${s.frame}\n${semMod.semText(semMod.semanticsOf({ root: r.root, stdin: r.stdin } as never), { actions: true })}`; };
      const pageBefore = c.steps ? pageNow() : null;
      if (c.steps) {
        let why: string | null;
        try {
          const r0 = s.renderer as unknown as { root: unknown; stdin?: { emit(e: 'data', b: Buffer): unknown } };
          const wheel = async (x: number, y: number, dir: 'up' | 'down') => {
            r0.stdin?.emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`));
            await s.settle();
          };
          const hitAt = rendererHitAt(s.renderer);
          const owns = rendererOwns(s.renderer, (n) => semMod.renderableOf(n as never));
          why = await replay(s, c.steps, { tree: () => semMod.semanticsOf({ root: r0.root, stdin: r0.stdin }) as unknown as SemLike[], cols, rows, wheel, ...(hitAt ? { hitAt } : {}), ...(owns ? { owns } : {}) });
        } catch (e) { why = `replay threw: ${String((e as Error)?.message ?? e)}`; }
        if (why) {
          // A trap or page failure during the replay is still a hard fail (it is often WHY the step found nothing): the
          // skip never hides it, and its reason says so.
          const traps = s.trapsAt;
          for (const t of traps) {
            const k = `trap|${t}`;
            if (layoutSeen.has(k)) continue;
            layoutSeen.add(k);
            problems.push({ file: rel(file), rule: 'trap', message: diag(`"${page}" case "${c.name}" at ${cols}x${rows} reads the DOM global ${t} during its replayed action: the live terminal Hub crashes there`, 600), fix: 'Route the read through hostEnv() (src/term/env) or a .term sibling of the reading module. No allowance accepts a trap.' });
          }
          for (const f of s.failures) if (!crashes.has(c.name)) crashes.set(c.name, keyR(`${f.message}${f.where ? ` (in ${f.where})` : ''}`));
          if (traps.length) why += ` (a DOM-global trap fired during the replay: ${traps[0]})`;
          // Redacted, never folded (keyOf folds digits and cuts at 160): the reason names the selector part the terminal lacks.
          skipped[c.name] = `${cols}x${rows}: ${(sec ? sec.redact(why, sec.needles) : why).split('\n')[0]!.slice(0, 500)}`;
          s.close();
          for (const [c2, r2] of sizesOf(c)) seen.delete(`${fileSafe(c.name)}.${c2}x${r2}.txt`);
          break;
        }
      }
      try {
        frames++;
        record(s);
        // Strict-global traps (every case is drawn strict, as a live mount): a hard fail no allowance accepts. The live
        // terminal crashes on the same read, so a frame drawn past it would show a page that never appears.
        for (const t of s.trapsAt) {
          const k = `trap|${t}`;
          if (layoutSeen.has(k)) continue;
          layoutSeen.add(k);
          problems.push({ file: rel(file), rule: 'trap', message: diag(`"${page}" case "${c.name}" at ${cols}x${rows} reads the DOM global ${t}: the live terminal Hub crashes there`, 600), fix: 'Route the read through hostEnv() (src/term/env) or a .term sibling of the reading module. No allowance accepts a trap.' });
        }
        // A frame that shows the fixture origin draws a hand-off's link form: the same case also runs with no origin
        // (`<case>-no-origin`), once per page, so the path form a host without a web origin gets has its golden too.
        if (c.webOrigin !== null && !noOriginAdded && s.frame.includes(FIXTURE_HOST)) { noOriginAdded = true; cases.push({ ...c, name: `${c.name}-no-origin`, webOrigin: null }); }
        const shown = crashShown(s.frame);
        if (shown && !crashes.has(c.name)) crashes.set(c.name, keyR(shown));
        for (const f of s.failures) if (!crashes.has(c.name)) crashes.set(c.name, keyR(`${f.message}${f.where ? ` (in ${f.where})` : ''}`));
        // Layout gate (never allowed, never golden-updated away): no two boxes on the same cells, nothing laid out past
        // its box unless the owner declared it drops (`<Box drops>`), the app exactly the terminal with its top bar on row 0.
        const faults = lc.layoutFaults((s.renderer as unknown as { root: never }).root, { cols, rows });
        // Table gate: every kit table on the frame (a `-no-origin` case repeats a frame already judged).
        if (c.webOrigin !== null) for (const f of tc.tableFaults((s.renderer as unknown as { root: never }).root, { cols, rows })) tableHits.push({ cols, rows, kind: f.kind, case: c.name, path: f.path, detail: diag(f.detail, 300) });
        // A page opens at the top: no scroll box moved on the first frame (an auto focus never scrolls), unless the case
        // scrolls on purpose (an action ran, a deep link, `scrolled: true`).
        if (!opensScrolledOnPurpose(c)) for (const b of lc.scrolledBoxes((s.renderer as unknown as { root: never }).root)) faults.push({ kind: 'scrolled-open', path: b.path, detail: `opened scrolled to ${b.top} (declare \`scrolled: true\` on a shot that opens scrolled on purpose)` });
        const rows0 = s.frame.replace(/\n$/, '').split('\n');
        if (rows0.length !== rows || rows0.some((l) => [...l].length > cols)) faults.push({ kind: 'offscreen', path: 'frame', detail: `frame ${Math.max(...rows0.map((l) => [...l].length))}x${rows0.length} in a ${cols}x${rows} terminal` });
        // The top bar from the layout (layoutcheck topBarFault), never the frame text: a modal layer over row 0 (a
        // full-screen drawer) leaves the bar where it is.
        const barFault = c.path?.startsWith('/_') ? null : lc.topBarFault((s.renderer as unknown as { root: never }).root, { cols, rows });
        if (barFault) faults.push({ kind: 'offscreen', path: 'frame', detail: `row 0 is not the top bar: ${barFault} (row 0: "${diag(rows0[0] ?? '', 80)}")` });
        for (const f of faults) {
          layout[f.kind] = (layout[f.kind] ?? 0) + 1;
          const k = `${f.kind}|${f.path}`;
          if (layoutSeen.has(k)) continue;
          layoutSeen.add(k);
          problems.push({ file: rel(file), rule: `layout-${f.kind}`, message: diag(`"${page}" case "${c.name}" at ${cols}x${rows}: ${f.path}: ${f.detail}`, 600), fix: f.kind === 'overdraw' ? 'Two siblings share cells: give the row room to wrap (`wrap`), or let one side shrink with a truncating Text, or drop the one that does not fit (`<Box drops>`).' : f.kind === 'offscreen' ? 'The root must be exactly the terminal (src/term/prim mount): a fault of the mount in src/term/prim, not of the page.' : f.kind === 'explosion' ? 'A box laid out many screens tall or wide: a percentage of an indefinite size, or a loop of sizes. It is a fault of src/term/prim (layout or clipping), not of the page: report it with this path.' : f.kind === 'scrolled-open' ? 'Something scrolled the page on open: a focus the person did not ask for, or a scroll effect. A page opens at the top.' : f.kind === 'popup-clipped' ? 'An absolutely placed popup is cut by the boxes around it (every box clips): put it on the overlay Layer (prim/Overlay `Layer` + `useAnchor`).' : 'Content laid out past its box is lost: make room (wrap, scroll) or declare the box drops what does not fit (`<Box drops>`, a truncating Text).' });
        }
        if (c.loading && s.settled) problems.push({ file: rel(file), rule: 'loading-settled', message: `"${page}" case "${c.name}" is declared a loading state (fixtures.ts loadingStates) but settled at ${cols}x${rows}`, fix: 'Remove it from `loadingStates` in the page\'s fixtures.ts (it is an ordinary state), or make the fixture keep loading.' });
        if (!s.settled && !c.loading) problems.push({ file: rel(file), rule: 'unsettled', message: `unsettled: ${s.pendingText ?? 'unknown'} ("${page}" case "${c.name}" at ${cols}x${rows} did not settle before its deadline)`, fix: 'A query that never answers, a short timer re-armed for ever (a deliberate loading state: list it in `loadingStates` of the page\'s fixtures.ts), a loop of renders or a lazy view that never resolves: find it with `bun scripts/term/render.ts --page <id> --fx <state>`.' });
        // LAYOUT_SIZE: judged by the layout and table gates above, never stored or compared.
        if (layoutOnly(cols, rows)) continue;
        const got = normal(s.frame);
        // A shot's waitForText (wait-text.ts): waited for above at every size; a `-no-origin` repeat is not judged. One
        // hit per case. An acting shot's text was waited for on the page before its steps.
        if (waits && atWait) waitJudged.add(c.name);
        if (waitMiss && !waitHits.some((h) => h.case === c.name)) waitHits.push({ case: c.name, text: c.waitForText!, file: rel(file), size: `${cols}x${rows}` });
        // Once per case, at the same size: the steps of an acting shot changed the page.
        if (c.webOrigin !== null && atWait && actionNoop(c, pageBefore, pageNow()))
          problems.push({ file: rel(file), rule: 'shot-action-noop', message: `"${page}" shot "${c.name}" at ${cols}x${rows}: its replayed steps changed nothing (the same frame and the same tree as before them)`, fix: 'The frame is the page BEFORE the action under the action\'s name: make the terminal sibling act on the step (the control is disabled, or the press lands nowhere), or correct the shot. A shot that expects no change says `noChange: true`.' });
        if (s.timing) { timing.boot += s.timing.boot; timing.mount += s.timing.mount + s.timing.app; timing.settle += s.timing.settle; timing.settleFrames += s.timing.settleFrames; }
        // The text never came: the frame is some other screen under the shot's name, never stored or compared (a
        // listed debt row keeps its frame, as before).
        if (waitMiss && !debtListed(waitDebt, c.name, c.waitForText!)) continue;
        // Never a golden (golden-guard.ts): an error screen or stopped frame is judged by the crash allowance, never
        // stored; a frame with a fixture secret fails. A stored golden that is one fails until refreshed.
        const refuse = refusal(got);
        // An identity copy is a frame on disk too: never one holding a secret.
        if (o.framesOut && refuse?.kind !== 'secret') { const d = path.join(o.framesOut, page); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, path.basename(file)), got); }
        const want = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        checked.add(path.basename(file));
        const stored = want !== null ? refusal(want) : null;
        // A reveal case (golden-guard REVEAL_CASES): the secret is the point of the frame; nothing of it is stored.
        if (reveal.has(c.name)) {
          if (want !== null) {
            if (o.update) fs.unlinkSync(file);
            else problems.push({ file: rel(file), rule: 'golden-reveal-stored', message: `"${page}" case "${c.name}" shows a secret on purpose and is never stored, but a golden exists at ${cols}x${rows}`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` removes it.` });
          }
          if (refuse?.kind !== 'secret' && refuse?.kind !== 'crash') problems.push({ file: rel(file), rule: 'reveal-missing', message: `"${page}" case "${c.name}" is a reveal case (golden-guard REVEAL_CASES) but its frame at ${cols}x${rows} shows no fixture secret`, fix: 'The reveal no longer reveals: fix the shot or the page, or drop the case from REVEAL_CASES.' });
          if (refuse?.kind !== 'crash') continue;
        }
        if (refuse?.kind === 'secret') {
          problems.push({ file: rel(file), rule: 'golden-secret', message: `frame of "${page}" case "${c.name}" at ${cols}x${rows} ${refuse.why}: not stored`, fix: 'A secret is on screen: blank it in the page (SecretField / the reveal flow), never in the golden.' });
          continue;
        }
        if (refuse?.kind === 'crash') {
          if (want !== null && o.update && stored) fs.unlinkSync(file);
          else if (stored) problems.push({ file: rel(file), rule: `golden-${stored.kind}-stored`, message: `the stored golden of "${page}" case "${c.name}" at ${cols}x${rows} is not a page (${stored.why})`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` removes it (a crash frame is never a golden; the crash is judged by the allowance).` });
          continue;
        }
        if (stored && !o.update) {
          changed++;
          problems.push({ file: rel(file), rule: `golden-${stored.kind}-stored`, message: `the stored golden of "${page}" case "${c.name}" at ${cols}x${rows} is not a page (${stored.why}); the page now draws`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` and review the new frame.` });
          continue;
        }
        if (want === got) continue;
        if (o.update) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file, got);
          if (want !== null) changed++;
          continue;
        }
        changed++;
        problems.push(want === null
          ? { file: rel(file), rule: 'golden-missing', message: `no golden for "${page}" case "${c.name}" at ${cols}x${rows}`, fix: `\`bun scripts/term/check.ts --page ${page} --update\`, then review the new file before committing it.` }
          : { file: rel(file), rule: 'golden', message: `frame of "${page}" case "${c.name}" at ${cols}x${rows} changed:\n${diag(frameDiff(want, got), 2000)}`, fix: `If intended: \`bun scripts/term/check.ts --page ${page} --update\` and review \`${rel(file)}\` in the diff; else fix what moved.` });
      } finally {
        s.close();
      }
    }
  }
  // Every case above is drawn strict (render.ts default): the old separate strict pass is gone (`strict` is ignored;
  // the CLI refuses --no-strict).
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.txt')) continue;
      // A case whose render threw never reached the comparison: its stored golden is still judged.
      if (seen.has(f) && !checked.has(f)) {
        const r = refusal(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (r && o.update && r.kind === 'crash') fs.unlinkSync(path.join(dir, f));
        else if (r) problems.push({ file: rel(path.join(dir, f)), rule: `golden-${r.kind}-stored`, message: `the stored golden ${f} of "${page}" is not a page (${r.why})`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` removes a crash frame; a secret must be fixed in the page.` });
        continue;
      }
      if (seen.has(f)) continue;
      if (o.update) fs.unlinkSync(path.join(dir, f));
      else problems.push({ file: rel(path.join(dir, f)), rule: 'golden-stale', message: `golden of a case or size no longer drawn: ${f}`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` removes it.` });
    }
  }
  const table = tableProblems(page, rel(path.join(dir, 'allowance.json')), tableHits, readAllowance(page, dir)?.tableFaults ?? [], { complete: crashes.size === 0, update: o.update });
  for (const x of table.seen) sets.tableFaults.add(x);
  // What is kept (allowance.json) or printed (GOLDEN_RESULT) never carries a fixture secret: error texts, placeholder
  // names and crash messages pass the secrets gate's redaction before they are compared, stored or returned.
  const red = (t: string): string => (sec ? sec.redact(t, sec.needles) : t);
  for (const k of LISTS) now[k] = [...new Set([...sets[k]].map(red))];
  for (const [k, v] of crashes) crashes.set(k, red(v));
  sets.placeholders = new Set(now.placeholders);
  // A crash is allowed by case AND message (`<case> — <message>`): a new throw in an allowed case is a new crash.
  now.crashes = [...crashes].map(([k, v]) => crashKey(k, v));
  now.untranslatable = untranslatable.size;
  const was = readAllowance(page, dir);
  const allowFile = rel(path.join(dir, 'allowance.json'));
  const wait = waitTextProblems(page, allowFile, waitHits.map((h) => ({ ...h, text: red(h.text) })), waitJudged, was?.waitTextDebt ?? [], { complete: crashes.size === 0, update: o.update });
  // A page with no allowance file yet: its misses are new (the debt was seeded once).
  if (!was) problems.push(...wait.problems);
  if (!was) {
    if (o.update) writeAllowance(page, now, dir);
    else problems.push({ file: allowFile, rule: 'allowance-missing', message: `page "${page}" has no allowance file`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` writes the first one; review it like code.` });
  } else {
    const fixOf: Record<ListKey, string> = {
      crashes: `The page throws while drawing (${diag([...crashes.entries()].map(([k, v]) => `${k}: ${v}`).slice(0, 2).join(' | '), 400)}). Fix the throw at its source (a .term sibling or a hostEnv seam).`,
      placeholders: 'Port the component (`bun scripts/term/new.ts <its file>`) or keep the page off it.',
      holes: 'A missing non-visual export was read or called (a black hole): port it; a hole is never acceptance.',
      traps: 'A DOM global is read while drawing: route it through hostEnv() or a .term sibling.',
      domRefused: 'Shared code asks an element ref for a member the terminal does not answer (src/term/jsx/element.ts): port the caller.',
      domUnsupported: 'Raw HTML carries an event the compat runtime does not honour (jsx/dom.ts SUPPORTED_EVENTS): port the component.',
      consoleErrors: 'Something logs an error while drawing: fix it (React key warnings, failed queries in a non-error state, caught throws).',
      tableFaults: '',
    };
    // Traps are judged per case above (rule `trap`), never through the allowance: a stored traps list is not honoured
    // and --update writes it empty.
    was.traps = [];
    // Table faults: judged per fault, with its case and screen row (table-gate.ts), stale rows included.
    problems.push(...table.problems);
    problems.push(...wait.problems);
    for (const k of LISTS) {
      if (k === 'tableFaults') continue;
      const grew = k === 'crashes' ? now.crashes.filter((x) => !crashAllowed(was.crashes, x)) : now[k].filter((x) => !was[k].includes(x));
      if (grew.length) problems.push({ file: allowFile, rule: `new-${k}`, message: diag(`page "${page}" now has ${k} not in its allowance: ${grew.join(', ')}`, 1200), fix: fixOf[k] });
    }
    if (now.untranslatable > was.untranslatable) problems.push({ file: allowFile, rule: 'untranslatable-grew', message: `page "${page}" uses ${now.untranslatable} untranslatable classes (allowed ${was.untranslatable}): ${[...untranslatable].slice(0, 6).join(', ')}`, fix: 'Simplify the CSS (see the css-translate report) or port the component.' });
    if (o.update) {
      const shrunk = { untranslatable: Math.min(was.untranslatable, now.untranslatable) } as Allowance;
      for (const k of LISTS) shrunk[k] = was[k].filter((x) => now[k].includes(x));
      // Crashes: what is allowed now, keyed by case and message (an entry from before the key rule, a bare case name,
      // is re-keyed to the crash its case shows today: never a new case).
      shrunk.crashes = now.crashes.filter((x) => crashAllowed(was.crashes, x));
      if (was.waitTextDebt) shrunk.waitTextDebt = wait.kept;
      writeAllowance(page, shrunk, dir);
    }
  }
  // Problem text never carries a fixture secret (a diff line, an error message): the secrets gate's redaction.
  if (sec) for (const p of problems) { p.message = sec.redact(p.message, sec.needles); p.fix = sec.redact(p.fix, sec.needles); }
  return { page, states: cases.filter((c) => !c.path && c.webOrigin !== null).map((c) => c.name), cases: cases.map((c) => c.name), crashes: Object.fromEntries(crashes), frames, changed, problems, zeroPlaceholders: sets.placeholders.size === 0, placeholders: [...sets.placeholders].sort(), ms: Math.round(performance.now() - t0), layout, timing,
    closure: await closureOf(), tableSeen: table.seen, skipped };
}

// ── Many pages ─────────────────────────────────────────────────────────────────────────────────────────────────────
// One process per page (a page that wedges or kills its process fails alone), up to `jobs` at once. Frames do not
// depend on `jobs` (goldens-identity.ts checks it). --affected runs only the pages whose last run, green or red, loaded
// a file that changed since (content hashes in .term-cache/goldens-runs.json; no version control needed; the files
// include the runner's own scripts/term modules the run loaded), every page never run, and every page when a global
// input changed (a global stylesheet, the lockfile). A page red at its last run and unchanged since is not re-run.

export const allPageIds = (): string[] => fs.readdirSync(path.join(SRC, 'pages')).filter((d) => fs.existsSync(path.join(SRC, 'pages', d, 'page.ts')) || fs.existsSync(path.join(SRC, 'pages', d, 'page.tsx'))).sort();
const STATE = path.join(HUB, '.term-cache', 'goldens-runs.json');
interface RunRecord { at: string; green: boolean; files: Record<string, string> }
interface RunState { global: string; globalFiles?: Record<string, string>; pages: Record<string, RunRecord> }
const hashFile = (f: string): string => { try { return Bun.hash(fs.readFileSync(path.join(HUB, f))).toString(36); } catch { return 'missing'; } };
function walkFiles(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === GOLDEN_DIR) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(f, keep, out); else if (keep(f)) out.push(path.relative(HUB, f));
  }
  return out;
}
/** The files a page's run loaded (relative to hub/): its src modules, the CSS modules they import, and the runner's
 *  own scripts/term modules (so a change to the translator re-runs exactly the pages that loaded it). */
async function closureOf(): Promise<string[]> {
  const l = await import('./loader');
  const rel = (f: string) => path.relative(HUB, path.isAbsolute(f) ? f : path.join(SRC, f));
  const scripts = path.join(HUB, 'scripts', 'term') + path.sep;
  const runner = [import.meta.path, ...Object.keys(require.cache)].filter((f) => f.startsWith(scripts)).map(rel);
  return [...new Set([...l.loadRecords().map((r) => rel(r.file)), ...l.stylesheetRecords().map(rel), ...runner])].sort();
}

/** A stylesheet every page depends on: a plain one (tokens.css, base.css: custom properties and element rules) or a
 *  CSS module with a :global rule (it styles what other modules draw). Any other CSS module affects only the pages
 *  whose modules import it (their closure). */
export function isGlobalStylesheet(abs: string): boolean {
  if (!/\.module\.(css|scss)$/.test(abs)) return true;
  try { return /:global\b|composes\s*:[^;]*\bfrom\b/.test(fs.readFileSync(abs, 'utf8')); } catch { return true; }
}

/** The JSON tables of scripts/term a page run reads: those named by a runner module the run loads (the static and
 *  literal-dynamic import closure of goldens.ts, within scripts/term). A gate's own data (graph/baseline.json, kit-classes,
 *  typecheck.allow, translator fixtures) is named by no such module, so changing it selects no page (check --changed
 *  widened to every page on any of them). Named in a string literal (a path it opens), not in a comment. */
export function pageRunJson(): string[] {
  const term = path.join(HUB, 'scripts/term');
  const mods = importClosure([path.join(term, 'goldens.ts')], (f) => f.startsWith(term + path.sep) && !/\.test\.tsx?$/.test(f));
  const text = [...mods].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  // Named inside a string literal (a path the module opens), never in a comment.
  return walkFiles(term, (f) => /\.json$/.test(f)).filter((f) => new RegExp(`['"\`][^'"\`\\n]*\\b${path.basename(f).replace(/\./g, '\\.')}['"\`]`).test(text));
}

/** Inputs every page depends on that its closure does not name: the global stylesheets, the JSON tables of
 *  scripts/term a page run reads (pageRunJson), the lockfile. */
export function globalInputFiles(): Record<string, string> {
  const files = [...pageRunJson(), ...walkFiles(SRC, (f) => /\.(css|scss)$/.test(f) && isGlobalStylesheet(path.join(HUB, f)))].sort();
  for (const lock of ['../../bun.lock', '../bun.lock', 'bun.lock']) if (fs.existsSync(path.join(HUB, lock))) files.push(lock);
  return Object.fromEntries(files.map((f) => [f, hashFile(f)]));
}
export const globalInputsHash = (): string => hashGlobalInputs(globalInputFiles());
const readState = (): RunState => {
  try {
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8')) as RunState;
    return st && typeof st.global === 'string' && st.pages ? st : { global: '', pages: {} };
  } catch { return { global: '', pages: {} }; }
};

/** The files (hub-relative) the page's last golden run loaded, its closure; null when it never ran. */
export function pageClosure(page: string): string[] | null {
  const r = readState().pages[page];
  return r ? Object.keys(r.files).sort() : null;
}

/** Pages not selected by affectedPages whose last run was red (still red: nothing they loaded changed). */
export function unchangedRedPages(ids: readonly string[], selected: readonly string[]): string[] {
  const st = readState();
  const sel = new Set(selected);
  return ids.filter((id) => !sel.has(id) && st.pages[id] && !st.pages[id]!.green);
}

/** The pages to run and why each was selected (empty when nothing they loaded changed since their last run). */
export function affectedPages(ids: readonly string[]): { id: string; why: string }[] {
  const st = readState();
  const gf = globalInputFiles();
  if (st.global !== hashGlobalInputs(gf)) { const why = globalChangeWhy(st.globalFiles, gf); return ids.map((id) => ({ id, why })); }
  const out: { id: string; why: string }[] = [];
  for (const id of ids) {
    const rec = st.pages[id];
    if (!rec) { out.push({ id, why: 'never run (no record)' }); continue; }
    const changed = Object.entries(rec.files).filter(([f, h]) => hashFile(f) !== h).map(([f]) => f);
    if (changed.length) out.push({ id, why: `changed: ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ` (+${changed.length - 4})` : ''}` });
  }
  return out;
}

export interface PagesRun { results: PageResult[]; died: Problem[]; ms: number }

/** The line a page's golden child writes to stderr once its first frame is drawn (runGoldenPages' watchdog). */
export const FIRST_FRAME_MARK = 'GOLDEN_FIRST_FRAME';
/** How long a page child may run without drawing its first frame (boot is 1-4 s; the dev loader import alone takes 17-28 s on a loaded host): past it the child is stopped and
 *  reported as "no first frame" instead of waiting for the 30 min timeout (an import deadlock can draw no frame
 *  for the whole run). HUB_GOLDEN_FIRST_FRAME_MS overrides it (HUB_: passed to check.ts children). */
export const FIRST_FRAME_MS = Number(process.env.HUB_GOLDEN_FIRST_FRAME_MS ?? 120_000);

/** Reads a child's stream to its end; calls onMark once when FIRST_FRAME_MARK appears (also split across chunks). */
export async function readWatching(stream: ReadableStream<Uint8Array>, onMark: () => void): Promise<string> {
  const dec = new TextDecoder();
  let text = '';
  let seen = false;
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    text += dec.decode(chunk, { stream: true });
    if (!seen && text.includes(FIRST_FRAME_MARK)) { seen = true; onMark(); }
  }
  return text + dec.decode();
}
export async function runGoldenPages(ids: readonly string[], o: { jobs?: number; update?: boolean; strict?: boolean; framesOut?: string; quiet?: boolean; env?: Record<string, string> }): Promise<PagesRun> {
  const t0 = performance.now();
  const sd = ((await import(path.join(SRC, 'term/prim/safe.ts'))) as typeof import('../../src/term/prim/safe')).safeDiagnostic;
  const queue = [...ids];
  const results: PageResult[] = [];
  const died: Problem[] = [];
  const env = { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0', ...(o.env ?? {}) };
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const cmd = ['nice', '-n', '10', 'bun', path.join(HUB, 'scripts/term/goldens.ts'), '--page', id, ...(o.update ? ['--update'] : []), ...(o.strict === false ? ['--no-strict'] : []), ...(o.framesOut ? ['--frames-out', o.framesOut] : [])];
      // Its own process group (child-group.ts): a signal to the runner (check.ts, or this file's CLI) stops it too.
      const p = spawnGroup(cmd, { cwd: HUB, env });
      let killed = false;
      let noFirst = false;
      const timer = setTimeout(() => { killed = true; void stopGroup(p); }, 1_800_000);
      const first = setTimeout(() => { noFirst = true; void stopGroup(p); }, FIRST_FRAME_MS);
      const [out, err] = await Promise.all([new Response(p.stdout).text(), readWatching(p.stderr, () => clearTimeout(first))]);
      const code = await p.exited;
      clearTimeout(timer);
      clearTimeout(first);
      if (noFirst) {
        died.push({ file: `src/pages/${id}`, rule: 'no-first-frame', message: sd(`the golden run of "${id}" drew no first frame in ${Math.round(FIRST_FRAME_MS / 1000)} s and was stopped (a possible import deadlock: scripts/term/goldens-entry.term.test.ts): ${(out + err).trim().split('\n').slice(-2).join(' | ')}`, 400), fix: `\`NODE_ENV=test bun scripts/term/goldens.ts --page ${id}\` and see where it stops before its first render.` });
        continue;
      }
      const line = out.split('\n').find((l) => l.startsWith('GOLDEN_RESULT '));
      if (!line) {
        died.push({ file: `src/pages/${id}`, rule: killed ? 'timeout' : 'crash', message: sd(`the golden run of "${id}" ${killed ? 'was stopped after 30 min (a case that never settles: run the page alone to see which)' : 'died'} (exit ${code}): ${(out + err).trim().split('\n').slice(-2).join(' | ')}`, 400), fix: `\`NODE_ENV=test bun scripts/term/goldens.ts --page ${id}\` and fix what kills it.` });
        continue;
      }
      let r: PageResult;
      try { r = JSON.parse(line.slice('GOLDEN_RESULT '.length)) as PageResult; } catch (e) {
        died.push({ file: `src/pages/${id}`, rule: 'crash', message: sd(`the golden run of "${id}" printed an unreadable result (exit ${code}, ${line.length} characters): ${String((e as Error).message)}`, 400), fix: `\`NODE_ENV=test bun scripts/term/goldens.ts --page ${id}\` and look at its last line.` });
        continue;
      }
      results.push(r);
      if (!o.quiet) process.stdout.write(`  ${summaryRow(r)}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.jobs ?? 1) }, worker));
  results.sort((a, b) => a.page.localeCompare(b.page));
  // Record every page's run, green or red (its closure's hashes), for --affected; a page whose run died loses its
  // record (it runs next time). An identity run (--frames-out without --update) records nothing.
  if (!o.framesOut) {
    const st = readState();
    const gf = globalInputFiles();
    const g = hashGlobalInputs(gf);
    if (st.global !== g) { st.global = g; st.pages = {}; }
    st.globalFiles = gf;
    for (const r of results) {
      if (r.closure) st.pages[r.page] = { at: new Date(Date.now()).toISOString(), green: r.problems.length === 0 && Object.keys(r.crashes).length === 0, files: Object.fromEntries(r.closure.map((f) => [f, hashFile(f)])) };
      else delete st.pages[r.page];
    }
    for (const d of died) delete st.pages[d.file.replace('src/pages/', '')];
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(st, null, 1) + '\n');
  }
  return { results, died, ms: Math.round(performance.now() - t0) };
}

/** One line per page: frames, time, time per frame, the time split, layout faults (run-time regressions show here). */
export function summaryRow(r: PageResult): string {
  const t = r.timing;
  const lay = Object.entries(r.layout ?? {}).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  return `${r.page.padEnd(14)} ${String(r.cases.length).padStart(4)} cases ${String(r.frames).padStart(4)} frames ${(r.ms / 1000).toFixed(0).padStart(5)} s ${String(Math.round(r.ms / Math.max(1, r.frames))).padStart(5)} ms/frame`
    + (t ? `  [settle ${(t.settle / 1000).toFixed(0)} s in ${t.settleFrames} renders; mount ${(t.mount / 1000).toFixed(1)} s; boot ${(t.boot / 1000).toFixed(1)} s]` : '')
    + `  problems ${r.problems.length}  layout: ${lay}${r.zeroPlaceholders ? '' : `  placeholders ${r.placeholders.length}`}`
    + (r.skipped && Object.keys(r.skipped).length ? `  skipped ${Object.keys(r.skipped).length}` : '')
    // Every skipped shot with its reason, one line each (no silent fallback: a shot not drawn says why).
    + Object.entries(r.skipped ?? {}).map(([k, why]) => `\n       skipped ${k}: ${why}`).join('');
}

// CLI
//   bun scripts/term/goldens.ts --page <id> [--update] [--no-strict] [--frames-out <dir>]
//       one page in this process; last stdout line `GOLDEN_RESULT <json>`
//   bun scripts/term/goldens.ts [--pages a,b | --affected] [--jobs N] [--update] [--no-strict] [--frames-out <dir>] [--json f]
//       many pages, one process each (default jobs 1); prints the selection and a per-page summary
if (import.meta.main) {
  installGroupReaper();
  const arg = (n: string): string | undefined => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const page = arg('page');
  const update = process.argv.includes('--update');
  if (process.argv.includes('--no-strict')) { process.stderr.write('--no-strict is refused: every frame is drawn with the strict DOM-global traps, as the live mount runs.\n'); process.exit(2); }
  const strict = true;
  const framesOut = arg('frames-out');
  if (page) {
    const { freezeClock, seedRandom } = await import('./clock');
    freezeClock();
    seedRandom();
    const { renderPage } = await import('./render');
    let drew = false;
    const r = await runPageGoldens(page, { update, strict, render: async (o) => { const s = await renderPage(o); if (!drew) { drew = true; process.stderr.write(`${FIRST_FRAME_MARK}\n`); } return s; }, ...(framesOut ? { framesOut } : {}) });
    // Exit only once the line is out: a large write to a pipe is cut by an immediate exit.
    await new Promise<void>((res) => { process.stdout.write('\nGOLDEN_RESULT ' + JSON.stringify(r) + '\n', () => res()); });
    process.exit(0);
  }
  const all = allPageIds();
  let ids = arg('pages')?.split(',').filter((x) => all.includes(x)) ?? all;
  if (process.argv.includes('--affected')) {
    const sel = affectedPages(ids);
    process.stdout.write(`affected: ${sel.length} of ${ids.length} pages\n${sel.map((x) => `  ${x.id}: ${x.why}`).join('\n')}\n`);
    ids = sel.map((x) => x.id);
  }
  const jobs = Math.max(1, Number(arg('jobs') ?? 1) || 1);
  const r = await runGoldenPages(ids, { jobs, update, strict, ...(framesOut ? { framesOut } : {}) });
  const frames = r.results.reduce((a, x) => a + x.frames, 0);
  const problems = [...r.died, ...r.results.flatMap((x) => x.problems)];
  process.stdout.write(`\n${r.results.length} pages, ${frames} frames in ${(r.ms / 1000).toFixed(0)} s (jobs ${jobs}); ${problems.length} problems; zero placeholders: ${r.results.filter((x) => x.zeroPlaceholders).length}/${r.results.length}\n`);
  const j = arg('json');
  if (j) fs.writeFileSync(j, JSON.stringify(r, null, 1));
  process.exit(problems.length ? 1 : 0);
}
