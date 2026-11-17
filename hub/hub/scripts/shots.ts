// bun run hub:shots --page <id> [--shot <name>] [--agent <name>]   (or --kit for the /_kit gallery)
// Renders every state of the page's shots.ts at 1440 light, 1920 light, 1440 dark, 1100 light,
// 768 light and 390 light into <shots dir>/<id>/<shot>-<variant>.png (HUB_SHOTS_DIR, else the work dir's shots folder). When the run ends it writes index.json (each
// PNG's time and problems) and the index.html contact sheet, and moves
// any PNG the current shot list does not produce into <shots dir>/<id>/.old/ (moved, never deleted).
import fs from 'node:fs';
import path from 'node:path';
import { HUB, agentName, assertPage, parseArgs, runPlaywright, shotsDir, startDevServer, str, workDir } from './lib';
import { PROBLEMS_DIR, blocking, loadShots, pngName, variantsOf, writeShotIndex } from './shots-lib';

/** Moves stale PNGs (and their problem notes) into <out>/.old/, so reviewers see only the current list. */
function moveOrphans(out: string, expected: Set<string>): string[] {
  const old = path.join(out, '.old');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
  const moved: string[] = [];
  for (const f of fs.readdirSync(out)) {
    if (!f.endsWith('.png') || expected.has(f)) continue;
    fs.mkdirSync(old, { recursive: true });
    const dest = fs.existsSync(path.join(old, f)) ? `${f.slice(0, -4)}.${stamp}.png` : f;
    fs.renameSync(path.join(out, f), path.join(old, dest));
    const note = path.join(out, PROBLEMS_DIR, `${f}.txt`);
    if (fs.existsSync(note)) fs.renameSync(note, path.join(old, `${dest}.problems.txt`));
    moved.push(f);
  }
  return moved;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const agent = agentName(args);
  const kit = args.kit === true;
  const page = kit ? undefined : assertPage(str(args.page));
  const id = kit ? '_kit' : (page as string);
  const out = path.join(shotsDir(agent), id);
  fs.mkdirSync(out, { recursive: true });
  // The gallery is framed with the demo page in the sidebar, so the shell looks lived-in.
  const kitPage = fs.existsSync(path.join(HUB, 'src', 'pages', 'demo', 'page.ts')) ? 'demo' : '__none__';
  const only = str(args.shot) ?? null;
  const server = await startDevServer({ page: kit ? kitPage : page, agent });
  let code = 1;
  try {
    // Test titles are "<shot> <variant>" under the spec file's name: match the shot as a whole word
    // followed by a variant id ("save" must not match "save-unknown").
    const grep = only ? ['--grep', `(^|\\s)${only.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d{3,4}-`] : [];
    code = await runPlaywright(['test', '--config', path.join(HUB, 'playwright.shots.config.ts'), ...grep], {
      HUB_BASE_URL: server.url,
      HUB_SHOTS_PAGE: kit ? '' : (page as string),
      HUB_SHOTS_KIT: kit ? '1' : '',
      HUB_SHOTS_OUT: out,
      HUB_PW_OUT: path.join(workDir(agent), 'playwright-shots'),
    });
  } finally {
    await server.stop();
  }
  const { shots } = loadShots(kit ? null : (page as string));
  const moved = moveOrphans(out, new Set(shots.flatMap((s) => variantsOf(s).map((v) => pngName(s, v)))));
  if (moved.length)
    console.log(
      `shots: moved ${moved.length} PNG(s) the shot list no longer produces to ${path.join(out, '.old')}/: ${moved.slice(0, 10).join(', ')}${moved.length > 10 ? ' …' : ''}`,
    );
  const index = writeShotIndex({
    out,
    page: id,
    title: kit ? 'Kit gallery' : `Page ${id}`,
    shots,
    runExit: code,
    only,
  });
  const missing = index.entries.filter((e) => e.takenAt === null).length;
  // With --shot, only that state's PNGs decide the exit; the others keep their last result in the index.
  const mine = (e: { file: string }) => !only || (e.file.startsWith(`${only}-`) && /^\d{3,4}-/.test(e.file.slice(only.length + 1)));
  const bad = index.entries.filter((e) => blocking(e.problems).length > 0 && mine(e));
  const warned = index.entries.filter((e) => e.problems.length > blocking(e.problems).length && mine(e));
  console.log(`\nshots: ${out}/index.html (index.json: ${index.entries.length} PNGs, ${missing} missing, ${bad.length} with problems)`);
  for (const e of bad) for (const p of blocking(e.problems)) console.log(`  ${e.file}: ${p}`);
  if (warned.length) {
    console.log(`  design warnings (report-only) on ${warned.length} PNG(s):`);
    for (const e of warned) for (const p of e.problems.filter((x) => !blocking([x]).length)) console.log(`    ${e.file}: ${p}`);
  }
  // Say why the exit is non-zero even when no shot check fired (a timeout, a crash, a missing PNG).
  const missingFiles = index.entries.filter((e) => e.takenAt === null && mine(e)).map((e) => e.file);
  if (code !== 0 && bad.length === 0) {
    console.log(`\nshots: FAIL: Playwright exited ${code} with no shot-check problems. A test errored or timed out (see its error above, under "✘").`);
    if (missingFiles.length)
      console.log(`  not written: ${missingFiles.slice(0, 20).join(', ')}${missingFiles.length > 20 ? ` (+${missingFiles.length - 20})` : ''}`);
    if (code === 137) console.log('  exit 137: the memory cap killed the run; report it.');
  } else if (code === 0 && bad.length === 0 && missingFiles.length && !only) {
    console.log(`\nshots: FAIL: ${missingFiles.length} PNG(s) not written: ${missingFiles.slice(0, 20).join(', ')}`);
    return 1;
  } else if (bad.length) console.log(`\nshots: FAIL: ${bad.length} PNG(s) with problems (listed above; also in index.html).`);
  else console.log('\nshots: ok');
  return code !== 0 ? code : bad.length > 0 ? 1 : 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
