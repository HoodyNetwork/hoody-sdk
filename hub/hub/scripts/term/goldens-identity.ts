#!/usr/bin/env bun
// Proves a faster golden run draws the SAME frames: runs the chosen pages once as the reference (jobs 1, 10 still frames after
// the idle signal) and once as the candidate (--jobs N, TERM_SETTLE_STILL=K), each writing every normalised frame (--frames-out),
// and compares the two trees file by file. Exit 0 only when every frame is identical and both runs drew the same set.
//
//   bun scripts/term/goldens-identity.ts --out <dir> [--pages a,b] [--jobs 2] [--still 5]
//
// Out: <dir>/ref/<page>/*.txt and <dir>/cand/<page>/*.txt (--out is required: no default), kept for a look.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { allPageIds, runGoldenPages } from './goldens';

const argv = process.argv.slice(2);
const arg = (n: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
const pages = arg('pages')?.split(',') ?? allPageIds();
const jobs = Math.max(1, Number(arg('jobs') ?? 2) || 2);
const still = Math.max(1, Number(arg('still') ?? 3) || 3);
// No default output dir (inside netns a temp dir vanishes at exit): the caller names one.
const out = arg('out') ?? '';
if (!out) { console.error('usage: bun scripts/term/goldens-identity.ts --out <dir> [--pages a,b] [--jobs 2] [--still 5]'); process.exit(2); }
const ref = path.join(out, 'ref');
const cand = path.join(out, 'cand');
for (const d of [ref, cand]) fs.rmSync(d, { recursive: true, force: true });

const t0 = performance.now();
const a = await runGoldenPages(pages, { jobs: 1, strict: false, framesOut: ref, quiet: true, env: { TERM_SETTLE_STILL: '10' } });
const t1 = performance.now();
const b = await runGoldenPages(pages, { jobs, strict: false, framesOut: cand, quiet: true, env: { TERM_SETTLE_STILL: String(still) } });
const t2 = performance.now();

const list = (root: string): string[] => fs.existsSync(root) ? fs.readdirSync(root).flatMap((p) => fs.readdirSync(path.join(root, p)).map((f) => path.join(p, f))).sort() : [];
const ra = list(ref);
const rb = list(cand);
const onlyA = ra.filter((f) => !rb.includes(f));
const onlyB = rb.filter((f) => !ra.includes(f));
const differ = ra.filter((f) => rb.includes(f) && fs.readFileSync(path.join(ref, f), 'utf8') !== fs.readFileSync(path.join(cand, f), 'utf8'));
const died = [...a.died, ...b.died].map((d) => d.file);

process.stdout.write(`reference: ${ra.length} frames, jobs 1, still 10, ${((t1 - t0) / 1000).toFixed(0)} s\n`);
process.stdout.write(`candidate: ${rb.length} frames, jobs ${jobs}, still ${still}, ${((t2 - t1) / 1000).toFixed(0)} s\n`);
for (const f of differ.slice(0, 20)) process.stdout.write(`  DIFFERS ${f}\n`);
for (const f of onlyA.slice(0, 10)) process.stdout.write(`  only in reference: ${f}\n`);
for (const f of onlyB.slice(0, 10)) process.stdout.write(`  only in candidate: ${f}\n`);
for (const d of died) process.stdout.write(`  died: ${d}\n`);
const ok = differ.length === 0 && onlyA.length === 0 && onlyB.length === 0 && died.length === 0 && ra.length > 0;
process.stdout.write(`IDENTITY ${ok ? 'OK' : 'FAIL'}: ${differ.length} differ, ${onlyA.length + onlyB.length} missing, ${died.length} died\n`);
process.exit(ok ? 0 : 1);
