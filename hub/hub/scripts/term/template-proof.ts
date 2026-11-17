// template-proof.ts: a page made from a template passes the terminal page gate's settle rules on its first run (once:
// list-detail template once declared no loadingStates, so a hub:new-page page failed `unsettled`).
//   NODE_ENV=test bun scripts/term/template-proof.ts [--layout <l>[,<l>]] | --all [--templates <dir>]   exit 0 = all pass
// Never in the checkout itself (a probe page would show in a running dev server's sidebar): the hub is first synced into a private
// copy, <HUB_WORK_DIR or TMPDIR>/template-proof/api/hub (rsync -a --delete, incremental, no node_modules/dist/caches;
// node_modules is a link back). Each layout is filled in there as src/pages/zzterm-<layout>/ (the
// same fill as hub:new-page), drawn by that copy's page gate (goldens.ts --page, frames into a scratch dir), and removed
// in `finally`, signal or not. The copy is kept for the next run.
// Judged: no crash, no `unsettled`, no `loading-settled`, no trap. Missing goldens and allowance are expected (a new page).
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installGroupReaper, runGroup } from './child-group';
import { childEnv, ioLocked } from './child-env';

const LIVE = path.resolve(import.meta.dir, '../..');
const ROOT = path.join(process.env.HUB_WORK_DIR ?? process.env.TMPDIR ?? os.tmpdir(), 'template-proof', 'api');
const HUB = path.join(ROOT, 'hub');
if (path.resolve(HUB) === LIVE) { process.stderr.write('template-proof: the copy would be the live tree; set HUB_WORK_DIR\n'); process.exit(2); }
{
  fs.mkdirSync(HUB, { recursive: true });
  const ex = ['node_modules', 'dist', '.term-cache', '.check', 'test-results', 'playwright-report'].flatMap((e) => ['--exclude', `/${e}`]);
  const sync = ['rsync', '-a', '--delete', ...ex, `${LIVE}/`, `${HUB}/`];
  const locked = ioLocked(sync);
  const r = Bun.spawnSync(locked);
  const r2 = r.exitCode === 0 || locked === sync ? r : Bun.spawnSync(sync);
  if (r2.exitCode !== 0) { process.stderr.write(`template-proof: sync into ${HUB} failed: ${r2.stderr.toString().trim()}\n`); process.exit(2); }
  for (const f of ['package.json', 'tsconfig.json', 'tsconfig.scripts.json']) { const from = path.join(LIVE, '..', f); if (fs.existsSync(from)) fs.copyFileSync(from, path.join(ROOT, f)); }
  for (const l of ['node_modules', 'public']) {
    const to = path.join(ROOT, l); const from = path.join(LIVE, '..', l);
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.symlinkSync(fs.realpathSync(from), to);
  }
  const nm = path.join(HUB, 'node_modules');
  if (fs.existsSync(path.join(LIVE, 'node_modules')) && !fs.existsSync(nm)) fs.symlinkSync(fs.realpathSync(path.join(LIVE, 'node_modules')), nm);
}
const argv = process.argv.slice(2);
const ti = argv.indexOf('--templates');
// --templates <dir>: files there (a staged copy, possibly a few files) are laid over the live templates.
const OVER = ti >= 0 ? path.resolve(argv[ti + 1]!) : null;
const TPL = path.join(HUB, 'templates');
const all = fs.readdirSync(TPL).filter((d) => d.startsWith('page-')).map((d) => d.slice(5)).sort();
const li = argv.indexOf('--layout');
const layouts = argv.includes('--all') ? all : li >= 0 ? argv[li + 1]!.split(',') : ['list-detail'];
const made: string[] = [];
const cleanup = (): void => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => { cleanup(); process.exit(130); });
installGroupReaper();

const BAD = new Set(['unsettled', 'loading-settled', 'trap', 'crash', 'golden-crash-stored', 'golden-secrets-unreadable']);
let failed = 0;
for (const layout of layouts) {
  const id = `zzterm-${layout}`;
  const dir = path.join(HUB, 'src/pages', id);
  if (fs.existsSync(dir)) { process.stdout.write(`REFUSED ${layout}: src/pages/${id} exists (not ours; not touched)\n`); failed++; continue; }
  const src = path.join(TPL, `page-${layout}`);
  made.push(dir);
  const title = 'Probe';
  const fill = (t: string): string => t.replaceAll('__ID__', id).replaceAll('__TITLE__', title).replaceAll('__PASCAL__', 'Probe');
  const copy = (from: string, to: string): void => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copy(path.join(from, e.name), path.join(to, e.name));
      else fs.writeFileSync(path.join(to, e.name), fill(fs.readFileSync(path.join(from, e.name), 'utf8')));
    }
  };
  try {
    copy(src, dir);
    if (OVER && fs.existsSync(path.join(OVER, `page-${layout}`))) copy(path.join(OVER, `page-${layout}`), dir);
    const scratch = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'template-proof-'));
    const r = await runGroup(['bun', path.join(HUB, 'scripts/term/goldens.ts'), '--page', id, '--frames-out', scratch], { cwd: HUB, env: childEnv(), timeoutMs: 900_000 });
    fs.rmSync(scratch, { recursive: true, force: true });
    const line = r.out.split('\n').find((l) => l.startsWith('GOLDEN_RESULT '));
    if (!line) { process.stdout.write(`FAIL ${layout}: the page gate died (exit ${r.code}): ${r.out.trim().split('\n').slice(-3).join(' | ')}\n`); failed++; continue; }
    const res = JSON.parse(line.slice('GOLDEN_RESULT '.length)) as { cases: string[]; crashes: Record<string, string>; problems: { rule: string; message: string }[] };
    const bad = [...res.problems.filter((p) => BAD.has(p.rule)).map((p) => `${p.rule}: ${p.message.slice(0, 160)}`), ...Object.entries(res.crashes).map(([k, v]) => `crash ${k}: ${v.slice(0, 160)}`)];
    const rules: Record<string, number> = {};
    for (const p of res.problems) rules[p.rule] = (rules[p.rule] ?? 0) + 1;
    process.stdout.write(`${bad.length ? "FAIL" : "ok  "} ${layout}: ${res.cases.length} cases; other findings (expected on a new page): ${JSON.stringify(rules)}${bad.length ? `\n     ${bad.slice(0, 6).join('\n     ')}` : ''}\n`);
    if (bad.length) failed++;
  } finally { cleanup(); }
}
process.stdout.write(failed ? `FAIL: ${failed} layout(s)\n` : `ok: ${layouts.join(', ')} pass the page gate's settle rules on a first run\n`);
process.exit(failed ? 1 : 0);
