// bun run hub:check [--page <id>] [--agent <name>] [--skip e2e,term]
// One page's gate, in order: the page-anatomy ratchet (app/conformance.anatomy.test.ts), tsc (app, kit,
// shell, core and that page, so another page's half-written file never blocks it), ESLint + stylelint
// (that page), Vitest (that page plus every app/conformance test), Playwright (that page's spec on a
// fixtures dev server). Without --page it is the same gate over the whole Hub, plus the terminal Hub's term step
// (its bundle, tsc on its configs and scripts, its Node test run; --skip term leaves it out).
// Without --page: the whole hub (kit, shell, app and every page), and ESLint also covers hub/e2e-live (the live harness: shared, not a page's).
// The page-anatomy static ratchet (app/conformance.anatomy.test.ts) runs first, so layout debt that grew fails in seconds.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { API_ROOT, HUB, agentName, assertPage, ownerOf, pageDir, pageSpecs, parseArgs, playwrightReport, runPlaywright, runTool, runToolCapture, searchProofGate, startDevServer, str, workDir } from './lib';
import { childEnv } from './term/child-env';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const agent = agentName(args);
  const page = str(args.page) ? assertPage(str(args.page)) : undefined;
  const skip = new Set((str(args.skip) ?? '').split(',').filter(Boolean));
  const work = workDir(agent);
  const scope = page ? path.relative(process.cwd(), pageDir(page)) : 'hub/src';
  const results: Array<[string, number]> = [];
  const step = async (name: string, fn: () => Promise<number>) => {
    console.log(`\n── ${name} ──`);
    const code = await fn();
    results.push([name, code]);
    return code;
  };

  // Static page-anatomy ratchet first: the second, whole run of the vitest step skips it (HUB_ANATOMY_DONE).
  await step('anatomy', () =>
    runTool('vitest-hub', ['run', '--config', path.join(HUB, 'vite.config.mts'), 'hub/src/app/conformance.anatomy.test.ts'], {
      HUB_CACHE_DIR: path.join(work, 'vite-test'),
      ...(page ? { HUB_CHECK_PAGE: page } : {}),
    }),
  );

  let tsconfig = path.join(HUB, 'tsconfig.json');
  if (page) {
    // Beside hub/tsconfig.json so its `types` resolve from the same node_modules.
    const dir = path.join(HUB, '.check', agent);
    fs.mkdirSync(dir, { recursive: true });
    tsconfig = path.join(dir, `tsconfig.${page}.json`);
    const include = ['app', 'kit', 'shell', 'core'].map((d) => path.join(HUB, 'src', d)).concat(pageDir(page));
    fs.writeFileSync(tsconfig, JSON.stringify({ extends: path.join(HUB, 'tsconfig.json'), include }, null, 2));
  }
  await step('tsc', async () => {
    const { code, output } = await runToolCapture('tsc', ['-p', tsconfig, '--noEmit', '--incremental', '--tsBuildInfoFile', path.join(work, `tsc.${page ?? 'all'}.tsbuildinfo`)]);
    if (code === 0) return 0;
    return reportTsc(output, page);
  });
  const lintKey = lintCacheKey(work);
  const cache = (tool: string) => ['--cache', '--cache-strategy', 'content', '--cache-location', path.join(work, `${tool}cache-${lintKey}`)];
  await step('eslint', () =>
    runTool('eslint', [...cache('eslint'), scope, ...(page ? [] : [path.relative(process.cwd(), path.join(HUB, 'e2e-live'))])]),
  );
  await step('stylelint', () =>
    runTool('stylelint', [...cache('stylelint'), '--config', path.join(HUB, 'stylelint.config.mjs'), '--allow-empty-input', `${scope}/**/*.css`]),
  );
  await step('vitest', () =>
    runTool('vitest-hub', ['run', '--config', path.join(HUB, 'vite.config.mts'), ...(page ? [scope, 'hub/src/app/conformance' /* every conformance*.test.ts */] : [])], {
      HUB_CACHE_DIR: path.join(work, 'vite-test'),
      HUB_ANATOMY_DONE: '1',
      ...(page ? { HUB_CHECK_PAGE: page } : {}),
    }),
  );

  // The terminal Hub, whole-Hub runs: its own gate (scripts/term/check.ts: graph rules, contract, typecheck of the
  // executed graph, term tests, page goldens), the scenarios, the secret gate, the docs check, then the ship gate
  // (build + mount of the built bundle). All run; the step fails if any failed. Each runs under Bun from the hub dir
  // with a minimal env and NODE_ENV=test on the child (term/child-env.ts: never a .env's or the caller's values).
  // With --page: the terminal checks a page change can break (scripts/term/check.ts --page <id>): the static gates whole
  // (graph rules, sibling contract, kit classes; about 35 s), then the page's own terminal tests, the typecheck and the
  // scenario files (terminal and web) of what the page loads, its own mutants, its goldens and secret gate.
  if (page && !skip.has('term')) {
    await step('term', () => new Promise<number>((resolve) => {
      const c = spawn('bun', ['scripts/term/check.ts', '--page', page, '--only', 'graph,contract,kit,types,tests,scenarios,web-scenarios,mutants,pages,secrets'], { cwd: HUB, stdio: 'inherit', env: childEnv() });
      c.on('exit', (code) => resolve(code ?? 1));
      c.on('error', () => resolve(127));
    }));
  }
  if (!page && !skip.has('term')) {
    await step('term', async () => {
      const bun = (args: string[]): Promise<number> => new Promise((resolve) => {
        const c = spawn('bun', args, { cwd: HUB, stdio: 'inherit', env: childEnv() });
        c.on('exit', (code) => resolve(code ?? 1));
        c.on('error', () => resolve(127));
      });
      // Every terminal gate runs, so one run reports every failure; the step fails if any did.
      const results: Array<[string, number]> = [];
      // Includes the shared behaviour scenarios (scenarios gate) and the secret gate (no fixture secret, vault value
      // or token in any page's frame or semantics).
      results.push(['scripts/term/check.ts', await bun(['scripts/term/check.ts'])]);
      // Every test file is matched by a runner that can run it (no silent never-run test).
      results.push(['scripts/term/test-runners.ts', await bun(['scripts/term/test-runners.ts'])]);
      // The terminal docs against the code (paths, flags, TERM_* codes, prim exports).
      results.push(['scripts/term/docs-check.ts', await bun(['scripts/term/docs-check.ts'])]);
      // The ship gate: build the strict bundle, then mount THAT bundle with its default options (strict globals on)
      // from an empty working directory in a pty, on Home, Billing, Schedules and Keys; any build refusal, artifact
      // finding, trap, crash, dropped error or blank pane fails (scripts/term/build/ship-gate.ts). A per-run output
      // directory, removed after: two checks never share one bundle.
      const out = fs.mkdtempSync(path.join(work, 'term-ship-'));
      try {
        results.push(['scripts/term/build/ship-gate.ts', await bun(['scripts/term/build/ship-gate.ts', '--out', out])]);
        const failed = results.filter(([, c]) => c !== 0);
        for (const [cmd, c] of failed) console.error(`term: ${cmd} failed (exit ${c}); re-run \`cd hub && NODE_ENV=test bun ${cmd}\` (docs: src/term/docs/gates.md)`);
        return failed.length ? failed[0]![1] : 0;
      } finally {
        fs.rmSync(out, { recursive: true, force: true });
      }
    });
  }

  const specs = page ? pageSpecs(page) : null;
  if (!skip.has('e2e') && (!specs || specs.length > 0)) {
    await step('playwright', async () => {
      // The whole-hub run serves every page whatever its status ('*'), so each page spec can reach its page.
      const server = await startDevServer({ page: page ?? '*', agent });
      const out = path.join(work, 'playwright');
      const report = playwrightReport(out);
      let code: number;
      try {
        code = await runPlaywright(['test', '--config', path.join(HUB, 'playwright.config.ts'), ...(specs ?? []).map((s) => path.relative(process.cwd(), s))], {
          HUB_BASE_URL: server.url,
          HUB_PAGE: page ?? '*',
          HUB_PW_OUT: out,
          HUB_PW_REPORT: report,
        });
      } finally {
        await server.stop();
      }
      // The search-test inventory against what this run did: every listed search test ran, passed and completed its proof.
      try {
        return searchProofGate(report, specs) || code;
      } finally {
        fs.rmSync(report, { force: true });
      }
    });
  }

  console.log('\n── hub:check summary ──');
  for (const [name, code] of results) console.log(`${code === 0 ? 'ok  ' : 'FAIL'}  ${name}${code === 0 ? '' : ` (exit ${code})`}`);
  return results.every(([, c]) => c === 0) ? 0 : 1;
}

/**
 * The name of the ESLint and stylelint caches. Both keep a file's result while the file and the config object are
 * unchanged, not while what the rules read beside the file is: the rule code (scripts/lint), the configs, the
 * exceptions (app/conformance/exceptions.ts), the tokens (kit/tokens.css) and the installed plugins (package.json,
 * bun.lock). Their hash names the cache, so an edit to any of them starts a fresh one; older caches are deleted.
 * hub/anatomy and hub/page-anatomy-css read the whole tree: warnings only, a cached file can show a stale one.
 */
function lintCacheKey(work: string): string {
  const lint = path.join(HUB, 'scripts', 'lint');
  const files = [
    ...fs.readdirSync(lint, { recursive: true, encoding: 'utf8' }).map((f) => path.join(lint, f)).filter((f) => fs.statSync(f).isFile()),
    path.join(HUB, 'eslint.config.js'),
    path.join(HUB, 'stylelint.config.mjs'),
    path.join(HUB, 'src', 'app', 'conformance', 'exceptions.ts'),
    path.join(HUB, 'src', 'kit', 'tokens.css'),
    path.join(API_ROOT, 'package.json'),
    path.join(API_ROOT, 'bun.lock'),
  ].sort();
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(`${path.relative(API_ROOT, f)}\0`).update(fs.existsSync(f) ? fs.readFileSync(f) : 'missing').update('\0');
  const key = h.digest('hex').slice(0, 12);
  for (const f of fs.readdirSync(work)) {
    if (/^(eslint|stylelint)cache(-[0-9a-f]{12})?$/.test(f) && !f.endsWith(`-${key}`)) fs.unlinkSync(path.join(work, f));
  }
  return key;
}

/**
 * Print tsc's diagnostics grouped by where they are. With --page, errors in another page's files
 * (reached through its links.ts) never block: they are counted and left to that page. Errors in
 * app/kit/shell/core block every page and name the area they are in.
 */
function reportTsc(output: string, page: string | undefined): number {
  const groups = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of output.split('\n')) {
    const m = /^(hub\/src\/[^(]+)\(\d+,\d+\): error TS/.exec(line);
    if (m) {
      const file = m[1] ?? '';
      const otherPage = page !== undefined && /^hub\/src\/pages\/([^/]+)\//.exec(file)?.[1];
      const key = otherPage && otherPage !== page ? `other:${otherPage}` : file.startsWith('hub/src/pages/') ? 'page' : `shared:${ownerOf(file)}`;
      current = groups.get(key) ?? [];
      groups.set(key, current);
      current.push(line);
    } else if (current && line.startsWith(' ')) current.push(line);
    else if (line.trim()) {
      current = groups.get('other-output') ?? [];
      groups.set('other-output', current);
      current.push(line);
    }
  }
  let blocking = 0;
  for (const [key, lines] of groups) {
    const n = lines.filter((l) => / error TS/.test(l)).length;
    if (key.startsWith('other:')) {
      console.log(`tsc: ${n} error(s) in pages/${key.slice(6)} (another page, reached through its links.ts): not blocking ${page}`);
      continue;
    }
    blocking += Math.max(n, key === 'other-output' ? 1 : 0);
    if (key.startsWith('shared:')) console.log(`tsc: ${n} error(s) in shared code (${key.slice(7)}): fix them there, not in the page.`);
    else if (key === 'page') console.log(`tsc: ${n} error(s) in ${page ? `pages/${page}` : 'pages'}`);
    for (const l of lines) console.log(l);
  }
  return blocking > 0 ? 1 : 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
