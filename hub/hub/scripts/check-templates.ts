// bun hub/scripts/check-templates.ts [--agent <name>] [--run]
// Keeps hub/templates/* compiling and lint-clean as the kit moves: each template is filled in as a
// probe page under hub/.check/<agent>/tpl-<layout>/, then type-checked and linted, then removed.
// --run (for changes that touch templates/ or app/e2e-search.ts, in a copy of the tree only) then runs
// the templates' Playwright specs, so the search-proof inventory's templates/ rows are proved by a run, not only by the
// lint. Each template is filled in as a page under src/pages/zz<layout>/, the only
// place both the router's page glob and Playwright's testMatch see; the specs run on a dev server that serves every
// page; the gate checks the templates/ rows against that run through a fileMap (report file -> template spec), and
// every template the inventory holds rows for must be there. The pages this run made are removed whatever happens
// (finally; a SIGINT/SIGTERM stops Playwright, slot wait included, and goes through the same cleanup). An entry already at
// src/pages/zz<layout> is refused and never touched.
import fs from 'node:fs';
import path from 'node:path';
import { templatePageId, templateRowFiles } from '../src/app/search-proofs-run';
import { API_ROOT, HUB, agentName, pageDir, parseArgs, playwrightReport, runPlaywright, runTool, searchProofGate, startDevServer, workDir } from './lib';

/** Copies one template into dir with its id and title filled in (the same fill as hub:new-page, title "Probe"). */
function fill(layout: string, dir: string): void {
  const id = templatePageId(layout);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(path.join(HUB, 'templates', layout))) {
    const text = fs.readFileSync(path.join(HUB, 'templates', layout, f), 'utf8');
    fs.writeFileSync(path.join(dir, f), text.replaceAll('__ID__', id).replaceAll('__TITLE__', 'Probe').replaceAll('__PASCAL__', 'Probe'));
  }
}

async function checkStatic(agent: string, layouts: readonly string[]): Promise<number> {
  const base = path.join(HUB, '.check', agent);
  const dirs: string[] = [];
  for (const t of layouts) {
    const dir = path.join(base, `tpl-${t.slice(5)}`);
    fill(t, dir);
    dirs.push(dir);
  }
  const tsconfig = path.join(base, 'tsconfig.templates.json');
  fs.writeFileSync(tsconfig, JSON.stringify({ extends: path.join(HUB, 'tsconfig.json'), include: [...dirs, path.join(HUB, 'src', 'app', 'env.d.ts')] }, null, 2));
  try {
    const tsc = await runTool('tsc', ['-p', tsconfig, '--noEmit']);
    const eslint = await runTool('eslint', ['--max-warnings', '0', '--rule', 'hub/no-text-literal: off', ...dirs]);
    console.log(`templates: tsc ${tsc === 0 ? 'ok' : 'FAIL'}, eslint ${eslint === 0 ? 'ok' : 'FAIL'} (${layouts.join(', ')})`);
    return tsc || eslint ? 1 : 0;
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    fs.rmSync(tsconfig, { force: true });
  }
}

async function runSpecs(agent: string, layouts: readonly string[]): Promise<number> {
  const withSpec = layouts.filter((t) => fs.existsSync(path.join(HUB, 'templates', t, 'page.spec.ts')));
  // Every template the inventory holds rows for must run: a deleted or renamed spec is red, never a
  // row skipped as out of scope.
  const required = templateRowFiles();
  const missing = required.filter((f) => !withSpec.some((t) => f === `templates/${t}/page.spec.ts`));
  if (missing.length) {
    for (const f of missing) console.error(`templates: ${f} holds search proof rows but is not there to run`);
    return 1;
  }
  // A signal never exits mid-run: it is remembered, no new step starts, a running Playwright is stopped,
  // its slot wait included (runPlaywright's signal stops every process of that run,
  // browsers included, and settles when none is left), and the run goes through its own cleanup (the dev server
  // stopped, the pages removed) before the exit.
  let interrupted = false;
  const abort = new AbortController();
  const onSignal = () => {
    interrupted = true;
    abort.abort();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  // Only the folders this run made, recorded once made, are removed: mkdir without `recursive` fails on
  // any entry already there (a page, another run's page, a dangling symlink), and then nothing of it is touched.
  const made: string[] = [];
  try {
    const fileMap: Record<string, string> = {};
    for (const t of withSpec) {
      const dir = pageDir(templatePageId(t));
      try {
        fs.mkdirSync(dir);
      } catch (e) {
        console.error(`templates: cannot make ${path.relative(HUB, dir)} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}); --run never writes into a page it did not make`);
        return 2;
      }
      made.push(dir);
      fill(t, dir);
      fileMap[path.relative(HUB, path.join(dir, 'page.spec.ts'))] = `templates/${t}/page.spec.ts`;
    }
    if (interrupted) return 130;
    const server = await startDevServer({ page: '*', agent });
    const out = path.join(workDir(agent), 'playwright-templates');
    const report = playwrightReport(out);
    let code: number;
    try {
      code = interrupted
        ? 130
        : await runPlaywright(['test', '--config', path.join(HUB, 'playwright.config.ts'), ...Object.keys(fileMap).map((f) => path.relative(API_ROOT, path.join(HUB, f)))], {
            HUB_BASE_URL: server.url,
            HUB_PAGE: '*',
            HUB_PW_OUT: out,
            HUB_PW_REPORT: report,
          }, { signal: abort.signal });
    } finally {
      await server.stop();
    }
    try {
      if (interrupted) return 130;
      const gate = searchProofGate(report, [...new Set([...required, ...Object.values(fileMap)])], undefined, fileMap);
      console.log(`templates: specs ${code === 0 ? 'ok' : 'FAIL'}, search proofs ${gate === 0 ? 'ok' : 'FAIL'} (${withSpec.join(', ')})`);
      return gate || code;
    } finally {
      fs.rmSync(report, { force: true });
    }
  } finally {
    for (const d of made) fs.rmSync(d, { recursive: true, force: true });
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const agent = agentName(args);
  const layouts = fs.readdirSync(path.join(HUB, 'templates')).filter((d) => d.startsWith('page-'));
  const lint = await checkStatic(agent, layouts);
  if (lint || args.run !== true) return lint;
  return runSpecs(agent, layouts);
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
