#!/usr/bin/env bun
// The ship gate: build the bundle, then MOUNT IT the way the CLI does and look at what it draws.
//   bun scripts/term/build/ship-gate.ts [--out dir] [--pages home,billing,schedules,keys] [--modes error,empty] [--keep] [--json out.json] [--update]
// Demo checks (DEMO_CHECKS): the same bundle on the demo mount with the sample account (ship-run.ts `demo`), one route
// each, judged by the words drawn (no golden: the sample account's times move with the clock). They run when their
// page is gated. They exist because the terminal tests build the Hub with fixtures on, and a page that picks a hook by
// __HUB_FIXTURES__ (pages/billing/data.ts useListing) draws there what the shipped Hub never runs.
// Per page: build/ship-run.ts imports the built hub-term.js by absolute path from an empty working directory, mounts
// it with the entry's DEFAULT options (strict globals on, the bundle's styles) and the fake client, in a real pty
// (termshot, 120x40). The bundle is built MINIFIED (as shipped). Fails on: a build refusal or artifact finding (incl.
// class/function name comparisons), a receipt that is not ok (trap, crash, dispose error), a mount error, nothing
// drawn, an empty page pane, a page title not drawn, Tab moving nothing.
// Golden comparison: the fixture goldens are drawn from the fixture world, which the bundle does not carry, so each
// gated page has its own ship goldens, one per fake-client mode (measure.ts): `error` (every page read refused:
// ship-golden/<id>.120x40.txt) and `empty` (an account that owns nothing, fake-empty.ts: ship-golden/empty/<id>.120x40.txt).
// A frame that differs, or a missing one, fails; --update writes them. A page whose two modes draw the same frame fails
// too (the empty answers reached nothing). Each frame is also printed.
import '../netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HUB } from '../resolve';
import { shipBuild } from '../build';
import { FAKE_MODES, type FakeMode } from './measure';

const argv = process.argv.slice(2);
const arg = (n: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
// The pty driver (termshot, not a dependency of the repository yet): $TERMSHOT, no default. The gate runs inside the
// test boundary (netns.sh), which does not show paths beside the repository, so the path must lie inside it.
const TERMSHOT = process.env.TERMSHOT ?? '';
/** Why the driver cannot be loaded (unset, or not visible here), else undefined. */
const termshotMissing = (): string | undefined => (TERMSHOT && fs.existsSync(TERMSHOT) ? undefined
  : `set TERMSHOT=<path to termshot/src/index.ts> inside the repository (the pty driver; no default; the test boundary does not show paths beside the repository)${TERMSHOT ? `; not found here: ${TERMSHOT}` : ''}`);
const PAGES: Record<string, { path: string; title: RegExp }> = {
  home: { path: '/', title: /Home/ },
  billing: { path: '/billing', title: /Billing|Plans/ },
  schedules: { path: '/schedules', title: /Schedules/ },
  keys: { path: '/keys', title: /Keys/ },
};

interface TermSession {
  waitForText(what: RegExp, timeout?: number): Promise<void>;
  waitIdle(quietMs?: number, timeout?: number): Promise<void>;
  waitExit(timeout?: number): Promise<unknown>;
  key(spec: string): Promise<void>;
  text(): Promise<string>;
  /** Every cell with its colours and attributes (a focus mark is often only a colour change), and the cursor. */
  cells(): Promise<unknown>;
  close(): Promise<void>;
}

export interface GateProblem { page: string | null; rule: string; message: string }
/** `frames` keys: `<page>` for mode error, `<page>@empty` for mode empty. */
export interface GateResult { ok: boolean; problems: GateProblem[]; frames: Record<string, string>; buildMs: number }

/** The frame key and golden file of a page in a mode. */
export const frameKey = (page: string, mode: FakeMode): string => (mode === 'error' ? page : `${page}@${mode}`);
export const goldenFile = (dir: string, page: string, mode: FakeMode): string => (mode === 'error' ? path.join(dir, `${page}.120x40.txt`) : path.join(dir, mode, `${page}.120x40.txt`));

/** Pages whose modes all drew the same (non-blank) frame: the empty answers changed nothing they show. */
export function sameAcrossModes(frames: Readonly<Record<string, string>>, pages: readonly string[], modes: readonly FakeMode[]): string[] {
  if (modes.length < 2) return [];
  return pages.filter((p) => { const f = modes.map((m) => frames[frameKey(p, m)]); return f.every((x) => x !== undefined && x.trim() !== '' && x === f[0]); });
}

export interface DemoCheck { id: string; page: string; path: string; until: RegExp; want: readonly string[]; never: readonly string[] }
/** What the demo executable must draw. billing-rent: the rent drawer of demo-answers.ts's first listing (Singapore M,
 *  30 days) shows the offer, its first payment and the money hand-off, never a failed read or a payment step. No
 *  amount is named here: demo-world.term.test.ts judges the prices. */
export const DEMO_CHECKS: readonly DemoCheck[] = [
  {
    id: 'billing-rent',
    page: 'billing',
    path: '/billing?view=servers&checkout=rent&item=5e00000000000000000000a1&days=30',
    until: /Total first payment|Couldn't load the offer|Couldn't check the price/,
    want: ['Singapore M', 'Total first payment', 'Payments and plan changes are made in the web Hub. The terminal sends none: nothing was sent and nothing was charged.', '[c Copy link]'],
    // A payment step's failure and "may have gone through" words (pages/billing strings.en.json mkt.failedTitle,
    // notSent, band.unknownTitle, co.unknownBody, mkt.notFoundTitle, mkt.posting): no press is made, so they could
    // only come from a step drawn at open.
    never: ["Couldn't load the offer.", "Couldn't check the price.", 'Confirm and pay', 'Purchase not completed', "didn't go through", 'may have gone through', 'may already have gone through', "couldn't confirm", 'Charging your wallet'],
  },
];
/** A frame's words: frame and box rules, the scroll bar and the shaded backdrop dropped, every run of space one space (a sentence
 *  wrapped inside a box reads as one line). */
export const frameWords = (frame: string): string => frame.replace(/[│┃░█]/g, ' ').replace(/\s+/g, ' ');
/** The drawer's own text: each row right of the column where most rows carry ┃ (the panel's edge over the page), so a
 *  sentence wrapped inside the drawer reads as one even where the page behind it is drawn (no shaded backdrop in
 *  colour). A frame with no such edge on at least half its rows is returned whole. */
export function drawerPaneText(frame: string): string {
  const rows = frame.split('\n').map((l) => Array.from(l));
  const seen = new Map<number, number>();
  for (const r of rows) r.forEach((c, i) => { if (c === '┃') seen.set(i, (seen.get(i) ?? 0) + 1); });
  let col = -1, most = 0;
  for (const [i, n] of seen) if (n > most || (n === most && i < col)) { col = i; most = n; }
  if (col < 0 || most * 2 < rows.length) return frame;
  return rows.filter((r) => r[col] === '┃').map((r) => r.slice(col + 1).join('')).join('\n');
}
/** What a demo check finds wrong with a frame: wanted words are read in the drawer, refused words anywhere. */
export function demoCheckProblems(check: DemoCheck, frame: string): GateProblem[] {
  const at = `${check.id}@demo`;
  const all = frameWords(frame);
  if (!all.trim()) return [{ page: at, rule: 'blank', message: 'nothing was drawn' }];
  const words = frameWords(drawerPaneText(frame));
  return [
    ...check.want.filter((w) => !words.includes(w)).map((w) => ({ page: at, rule: 'demo-missing', message: `not drawn: "${w}"` })),
    ...check.never.filter((w) => words.includes(w) || all.includes(w)).map((w) => ({ page: at, rule: 'demo-refused', message: `drawn: "${w}"` })),
  ];
}

/** The page pane: everything right of the shell's first column rule (│), rows 2..n-1. */
export function pagePaneText(frame: string): string {
  const lines = frame.split('\n');
  const col = lines.map((l) => l.indexOf('│')).find((i) => i > 0) ?? -1;
  return lines.slice(1, -1).map((l) => (col > 0 ? l.slice(col + 1) : l)).join('\n');
}

export async function shipGate(o: { outdir: string; pages: string[]; modes?: readonly FakeMode[]; update?: boolean }): Promise<GateResult> {
  const modes = o.modes ?? FAKE_MODES;
  const problems: GateProblem[] = [];
  const frames: Record<string, string> = {};
  // Minified, as it ships: class and function names are renamed, so code that compares them breaks HERE, not later.
  const b = await shipBuild({ outdir: o.outdir, minify: true });
  for (const r of b.refusals) problems.push({ page: null, rule: 'build', message: `${r.message.startsWith(r.code) ? '' : `${r.code}: `}${r.message}${r.importers ? ` (imported by ${r.importers.slice(0, 5).join(', ')}${r.importers.length > 5 ? ', ...' : ''})` : ''}` });
  for (const f of b.artifact?.findings ?? []) problems.push({ page: null, rule: 'artifact', message: f });
  const bundle = path.join(o.outdir, 'hub-term.js');
  if (!fs.existsSync(bundle)) return { ok: false, problems: [...problems, { page: null, rule: 'build', message: 'no bundle was written' }], frames, buildMs: b.ms };
  const missing = termshotMissing();
  if (missing) return { ok: false, problems: [...problems, { page: null, rule: 'gate', message: missing }], frames, buildMs: b.ms };
  // termshot is a screenshot tool outside the hub's typed program: typed here by the four calls the gate makes.
  const { runTerm } = (await import(TERMSHOT)) as { runTerm(o: { cmd: string[]; cwd: string; cols: number; rows: number; env: Record<string, string> }): Promise<TermSession> };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-ship-cwd-'));
  try {
    for (const mode of modes) for (const page of o.pages) {
      const spec = PAGES[page];
      const key = frameKey(page, mode);
      if (!spec) { if (mode === modes[0]) problems.push({ page, rule: 'gate', message: `no ship-gate route for page ${page}` }); continue; }
      const result = path.join(cwd, `${key}.result.json`);
      const stop = path.join(cwd, `${key}.stop`);
      const s = await runTerm({ cmd: [process.execPath, path.join(import.meta.dirname, 'ship-run.ts'), bundle, page, spec.path, result, stop, mode], cwd, cols: 120, rows: 40, env: { HOME: cwd, PATH: process.env.PATH ?? '', TMPDIR: cwd } });
      const at = key;
      try {
        // Cold import takes seconds and writes nothing meanwhile: wait for the first drawn character, then for quiet.
        await s.waitForText(/\S/, 30_000).catch(() => undefined);
        await s.waitIdle(1_500, 30_000).catch(() => undefined);
        const frame = (await s.text()).split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
        frames[key] = frame;
        // Focus on the minified bundle: Tab must move something visible (a focus mark, a row) on a page that drew. The
        // cells are compared, colours included: a focus mark is often a colour alone (the kit's FocusInk), which the text
        // never shows (Tab moved the focus on home and the text-only check said it did not).
        if (frame.trim() && !/hoody hub: stopped/.test(frame)) {
          const cellsBefore = JSON.stringify(await s.cells());
          await s.key('tab');
          await s.waitIdle(800, 10_000).catch(() => undefined);
          const cellsAfter = JSON.stringify(await s.cells());
          if (cellsAfter === cellsBefore) problems.push({ page: at, rule: 'focus', message: 'Tab changed nothing on the minified bundle (focus does not move)' });
        }
        fs.writeFileSync(stop, '');
        await s.waitExit(15_000).catch(() => undefined);
      } finally {
        await s.close().catch(() => undefined);
      }
      const frame = frames[key] ?? '';
      if (!frame.trim()) problems.push({ page: at, rule: 'blank', message: 'nothing was drawn' });
      else {
        if (!spec.title.test(frame.split('\n').slice(0, 3).join('\n'))) problems.push({ page: at, rule: 'title', message: `the page title (${spec.title.source}) is not drawn in the first rows` });
        const pane = pagePaneText(frame).replace(/\s+/g, '');
        if (pane.length < 20) problems.push({ page: at, rule: 'blank-pane', message: `the page pane is empty (${pane.length} characters drawn)` });
      }
      let r: { receipt?: { ok?: boolean; exitCode?: number; problems?: unknown[] } | null; error?: string | null } = {};
      try { r = JSON.parse(fs.readFileSync(result, 'utf8')); } catch { problems.push({ page: at, rule: 'receipt', message: 'the mount wrote no result (it did not end when asked)' }); }
      if (r.error) problems.push({ page: at, rule: 'mount', message: r.error });
      if (r.receipt && r.receipt.ok === false) {
        for (const x of (r.receipt.problems ?? []) as Array<{ kind: string; code: string; what?: string; where?: string[] }>) {
          problems.push({ page: at, rule: `receipt-${x.kind}`, message: `${x.code}${x.what ? ` ${x.what}` : ''}${x.where?.length ? ` at ${x.where.slice(0, 3).join(' < ')}` : ''}` });
        }
        if (!r.receipt.problems?.length) problems.push({ page: at, rule: 'receipt', message: `receipt not ok (exit ${r.receipt.exitCode})` });
      }
      // The ship golden: the page as the BUILT bundle draws it on the fake client (an empty account), beside the
      // fixture goldens. Missing or different = failure; --update writes it (review it in the diff), never for a page
      // that has problems (a broken frame is never a golden).
      const golden = goldenFile(path.join(import.meta.dirname, 'ship-golden'), page, mode);
      const broken = problems.some((x) => x.page === at);
      if (o.update && broken) problems.push({ page: at, rule: 'ship-golden', message: 'golden not updated: this page has problems' });
      else if (o.update) { fs.mkdirSync(path.dirname(golden), { recursive: true }); fs.writeFileSync(golden, frame + '\n'); }
      else if (!fs.existsSync(golden)) problems.push({ page: at, rule: 'ship-golden-missing', message: `no ship golden ${path.relative(HUB, golden)}; \`bun scripts/term/build/ship-gate.ts --update\` writes it once the page draws, review it before committing` });
      else if (fs.readFileSync(golden, 'utf8').replace(/\n$/, '') !== frame) problems.push({ page: at, rule: 'ship-golden', message: `the built bundle draws ${at} differently from ${path.relative(HUB, golden)}; if intended: --update and review` });
    }
    for (const check of DEMO_CHECKS.filter((d) => o.pages.includes(d.page))) {
      const key = `${check.id}@demo`;
      const result = path.join(cwd, `${key}.result.json`);
      const stop = path.join(cwd, `${key}.stop`);
      const s = await runTerm({ cmd: [process.execPath, path.join(import.meta.dirname, 'ship-run.ts'), bundle, check.page, check.path, result, stop, 'demo'], cwd, cols: 120, rows: 40, env: { HOME: cwd, PATH: process.env.PATH ?? '', TMPDIR: cwd } });
      try {
        // The drawer that never settles is named (the words below then name what is missing).
        await s.waitForText(check.until, 60_000).catch(() => { problems.push({ page: key, rule: 'demo-timeout', message: `nothing matching ${check.until.source} was drawn within 60 s` }); });
        // A read that fails after the first draw still has time to show it.
        await s.waitIdle(1_500, 30_000).catch(() => undefined);
        frames[key] = (await s.text()).split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
        fs.writeFileSync(stop, '');
        await s.waitExit(15_000).catch(() => undefined);
      } finally {
        await s.close().catch(() => undefined);
      }
      problems.push(...demoCheckProblems(check, frames[key] ?? ''));
      let r: { receipt?: { ok?: boolean; exitCode?: number } | null; error?: string | null } = {};
      try { r = JSON.parse(fs.readFileSync(result, 'utf8')); } catch { problems.push({ page: key, rule: 'receipt', message: 'the mount wrote no result (it did not end when asked)' }); }
      if (r.error) problems.push({ page: key, rule: 'mount', message: r.error });
      if (r.receipt && r.receipt.ok === false) problems.push({ page: key, rule: 'receipt', message: `receipt not ok (exit ${r.receipt.exitCode})` });
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  for (const p of sameAcrossModes(frames, o.pages, modes)) problems.push({ page: p, rule: 'modes-same', message: `${p} draws the same frame on the empty account as on the refused reads: the empty answers (build/fake-empty.ts) reach nothing it shows` });
  return { ok: problems.length === 0, problems, frames, buildMs: b.ms };
}

if (import.meta.main) {
  const missing = termshotMissing();
  if (missing) { process.stderr.write(`ship-gate: ${missing}\n`); process.exit(2); }
  const keep = argv.includes('--keep');
  const outdir = arg('out') ? path.resolve(arg('out')!) : fs.mkdtempSync(path.join(os.tmpdir(), 'hub-ship-gate-'));
  const pages = (arg('pages') ?? 'home,billing,schedules,keys').split(',');
  try {
    const modes = (arg('modes') ?? FAKE_MODES.join(',')).split(',') as FakeMode[];
    const bad = modes.filter((m) => !FAKE_MODES.includes(m));
    if (bad.length) { process.stderr.write(`ship-gate: unknown mode ${bad.join(', ')} (modes: ${FAKE_MODES.join(', ')})\n`); process.exit(2); }
    const r = await shipGate({ outdir, pages, modes, update: argv.includes('--update') });
    for (const [p, f] of Object.entries(r.frames)) process.stdout.write(`--- ${p} (120x40, what ships)\n${f}\n`);
    for (const x of r.problems) process.stdout.write(`SHIP ${x.page ?? '(build)'}  ${x.rule}  ${x.message}\n`);
    process.stdout.write(`ship gate: ${r.ok ? 'OK' : `FAILED (${r.problems.length} problems)`}\n`);
    const json = arg('json');
    if (json) fs.writeFileSync(json, JSON.stringify(r, null, 1) + '\n');
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    if (!keep && !arg('out')) fs.rmSync(outdir, { recursive: true, force: true });
  }
}
