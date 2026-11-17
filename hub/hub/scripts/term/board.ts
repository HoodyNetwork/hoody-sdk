#!/usr/bin/env bun
// The terminal Hub's coverage board:  bun scripts/term/board.ts [--md out.md]
// One row per page: fixture states with goldens, crashes, placeholders drawn, strict-global traps, refused element
// members and untranslatable classes (from each page's term-golden/allowance.json, i.e. the last check.ts run), and
// the graph's view (web-only modules still on the page's frontier). Then the kit classification counts.
// Reads; writes nothing unless --md is given. Run `bun scripts/term/check.ts` first for fresh numbers.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
import { goldenDir, type Allowance } from './goldens';

const mdOut = (() => { const i = process.argv.indexOf('--md'); return i >= 0 ? process.argv[i + 1] : undefined; })();
const pagesDir = path.join(HUB, 'src/pages');
const ids = fs.readdirSync(pagesDir).filter((d) => fs.existsSync(path.join(pagesDir, d, 'page.ts'))).sort();

const { runParallel } = await import('./graph');
const g = await runParallel({ hub: HUB, quiet: true });
const { classifyKit } = await import('./kit-classes');
const kit = await classifyKit(g.analysis, { update: false });

const L: string[] = [];
L.push(`# Terminal Hub coverage board (${new Date().toISOString().slice(0, 16)}Z)`, '');
L.push('| page | states | frames | crashes | placeholders | traps | refused members | untranslatable | web-only on frontier |');
L.push('|---|---:|---:|---|---|---|---|---:|---:|');
let zero = 0;
let clean = 0;
for (const id of ids) {
  const dir = goldenDir(id);
  let a: Allowance | null = null;
  try { a = JSON.parse(fs.readFileSync(path.join(dir, 'allowance.json'), 'utf8')) as Allowance; } catch { /* never run */ }
  const frames = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).length : 0;
  const states = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.\d+x\d+\.txt$/, '')) : []).size;
  const front = g.analysis.pages[id]?.blockers?.length ?? 0;
  if (a && a.placeholders.length === 0) zero++;
  if (a && a.placeholders.length === 0 && a.crashes.filter((c) => c !== 'strict').length === 0) clean++;
  const list = (x: string[] | undefined): string => (x === undefined ? '?' : x.length ? x.join(', ') : '—');
  L.push(`| ${id} | ${a ? states : '?'} | ${frames} | ${list(a?.crashes)} | ${list(a?.placeholders)} | ${list(a?.traps)} | ${list(a?.domRefused)} | ${a?.untranslatable ?? '?'} | ${front} |`);
}
L.push('', `Pages drawing zero placeholders: ${zero}/${ids.length}; zero placeholders and no crash outside strict mode: ${clean}/${ids.length}.`, '');
L.push('## Kit exports', '', ...Object.entries(kit.counts).map(([c, n]) => `- ${c}: ${n}`), '');
L.push(`placeholder-allowed: ${kit.rows.filter((r) => r.cls === 'placeholder-allowed').map((r) => r.name).join(', ') || 'none'}`);
const text = L.join('\n') + '\n';
process.stdout.write(text);
if (mdOut) fs.writeFileSync(mdOut, text);
