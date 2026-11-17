// Shared by the shots runner (shots.spec.ts), hub:shots (shots.ts): the
// viewport variants, the shot index (index.json + index.html, one writer, after the run) and
// the rendered-text leak scan.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Shot } from '../src/app/shots.types';

export { scanRenderedText } from './text-scan';

export type { ActStep } from '../src/app/shots.types';
/** The runner's view of a shot (same as app/shots.types.ts Shot, kept as an alias for callers). */
export type ShotSpec = Shot;

/** The Outcome kind a state name promises: pending or unknown → pending, failed → failed. */
export function promisedOutcome(name: string): 'pending' | 'failed' | null {
  if (/(^|-)(pending|unknown)(-|$)/.test(name)) return 'pending';
  if (/(^|-)failed(-|$)/.test(name)) return 'failed';
  return null;
}

/** States named *loading* (or *skeleton*) are meant to show skeletons; every other waits them out. */
export const isLoadingState = (s: Shot): boolean => /(^|-)(loading|skeleton)(-|$)/.test(`${s.name}-${s.state ?? ''}`);

export interface Variant {
  id: string;
  width: number;
  height: number;
  theme: 'light' | 'dark';
  dock?: boolean;
}

export const VARIANTS: readonly Variant[] = [
  { id: '1440-light', width: 1440, height: 900, theme: 'light' },
  { id: '1920-light', width: 1920, height: 1080, theme: 'light' },
  { id: '1440-dark', width: 1440, height: 900, theme: 'dark' },
  // In-between width: toolbars and headers fold here (a laptop, or 1440 with a list pane open).
  { id: '1100-light', width: 1100, height: 800, theme: 'light' },
  // Tablet: light only (cost); a shot asks for dark with extra: ['768-dark'].
  { id: '768-light', width: 768, height: 1024, theme: 'light' },
  { id: '390-light', width: 390, height: 844, theme: 'light' },
];

export const EXTRA: Record<NonNullable<Shot['extra']>[number], Variant> = {
  '1024-light': { id: '1024-light', width: 1024, height: 768, theme: 'light' },
  '1440-dock': {
    id: '1440-dock',
    width: 1440,
    height: 900,
    theme: 'light',
    dock: true,
  },
  '768-dark': { id: '768-dark', width: 768, height: 1024, theme: 'dark' },
  // The model picker's widths: a laptop at 1350, an ultrawide at 3440×1440, and a phone in dark.
  '1350-light': { id: '1350-light', width: 1350, height: 900, theme: 'light' },
  '1350-dark': { id: '1350-dark', width: 1350, height: 900, theme: 'dark' },
  '3440-light': { id: '3440-light', width: 3440, height: 1440, theme: 'light' },
  '3440-dark': { id: '3440-dark', width: 3440, height: 1440, theme: 'dark' },
  '390-dark': { id: '390-dark', width: 390, height: 844, theme: 'dark' },
};

export const variantsOf = (shot: Shot): Variant[] => [...VARIANTS, ...(shot.extra ?? []).map((e) => EXTRA[e])];

export const pngName = (shot: Shot, v: Variant): string => `${shot.name}-${v.id}.png`;

/** Problems a shot test found in the rendered page (string-key leaks, unfilled {{vars}}). */
export const PROBLEMS_DIR = '.problems';
/**
 * Design findings (accent count, clipped headers) are report-only:
 * they carry this prefix, show in index.html and the run's output, and never fail a shot.
 */
export const WARN = 'warn: ';
export const blocking = (problems: readonly string[]): string[] => problems.filter((p) => !p.startsWith(WARN));

export interface ShotIndexEntry {
  shot: string;
  variant: string;
  file: string;
  /** ISO mtime of the PNG, or null when it is missing. */
  takenAt: string | null;
  problems: string[];
}

export interface ShotIndex {
  page: string;
  /** When this index was written (end of the hub:shots run). */
  writtenAt: string;
  /** Exit code of the Playwright run that preceded it. */
  runExit: number;
  /** Only these shots were re-taken in that run (--shot); null = all. */
  only: string | null;
  entries: ShotIndexEntry[];
}

const HUB = path.resolve(__dirname, '..');

/** A page's shots.ts (or the kit gallery's), plus the hash path the shots open. */
export function loadShots(page: string | null): {
  path: string;
  shots: ShotSpec[];
} {
  if (page === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(HUB, 'src', 'kit', 'gallery', 'shots.ts')) as { default: ShotSpec[] };
    return { path: '/_kit', shots: mod.default };
  }
  const dir = path.join(HUB, 'src', 'pages', page);
  const manifest = fs.readFileSync(path.join(dir, 'page.ts'), 'utf8');
  const pagePath = /path:\s*'([^']+)'/.exec(manifest)?.[1] ?? `/${page}`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(dir, 'shots.ts')) as { default: ShotSpec[] };
  return { path: pagePath, shots: mod.default };
}

function readProblems(out: string, file: string): string[] {
  const p = path.join(out, PROBLEMS_DIR, `${file}.txt`);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Write index.json and the index.html contact sheet with each PNG's time. */
export function writeShotIndex(opts: { out: string; page: string; title: string; shots: Shot[]; runExit: number; only: string | null }): ShotIndex {
  const entries: ShotIndexEntry[] = [];
  for (const shot of opts.shots) {
    for (const v of variantsOf(shot)) {
      const file = pngName(shot, v);
      const full = path.join(opts.out, file);
      const takenAt = fs.existsSync(full) ? fs.statSync(full).mtime.toISOString() : null;
      entries.push({
        shot: shot.name,
        variant: v.id,
        file,
        takenAt,
        problems: readProblems(opts.out, file),
      });
    }
  }
  // A named state that renders pixel-for-pixel like another state did not render its own case
  // (a schedule's save-pending, a computer's detail-run-failed).
  const seen = new Map<string, string>();
  for (const e of entries) {
    if (e.takenAt === null) continue;
    const hash = createHash('sha1')
      .update(fs.readFileSync(path.join(opts.out, e.file)))
      .digest('hex');
    const key = `${e.variant}:${hash}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, e.shot);
    else if (first !== e.shot) e.problems.push(`renders exactly like shot "${first}": this state does not show its own case`);
  }
  const index: ShotIndex = {
    page: opts.page,
    writtenAt: new Date().toISOString(),
    runExit: opts.runExit,
    only: opts.only,
    entries,
  };
  fs.writeFileSync(path.join(opts.out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

  const hhmm = (iso: string | null) => (iso ? `${iso.slice(11, 19)}Z` : 'missing');
  const cells = opts.shots
    .map((s) => {
      const figs = entries
        .filter((e) => e.shot === s.name)
        .map(
          (e) =>
            `<figure${e.problems.length ? ' class="bad"' : ''}><a href="${esc(e.file)}"><img src="${esc(e.file)}" loading="lazy"></a>` +
            `<figcaption>${esc(e.variant)} · ${hhmm(e.takenAt)}${e.problems.length ? ` · ${e.problems.length} problem(s)` : ''}</figcaption>` +
            (e.problems.length ? `<ul>${e.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '') +
            `</figure>`,
        )
        .join('');
      return `<section><h2>${esc(s.name)}</h2><div class="row">${figs}</div></section>`;
    })
    .join('\n');
  const oldest =
    entries
      .map((e) => e.takenAt)
      .filter((t): t is string => t !== null)
      .sort()[0] ?? null;
  fs.writeFileSync(
    path.join(opts.out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>${esc(opts.title)} shots</title>` +
      `<style>body{font:14px system-ui;margin:24px;background:#eee}section{margin:0 0 32px}.row{display:flex;gap:12px;align-items:flex-start;overflow-x:auto}` +
      `figure{margin:0}img{max-height:340px;border:1px solid #bbb;background:#fff}figcaption{font:12px monospace;color:#555}` +
      `.bad img{border:2px solid #c00}.bad ul{font:12px monospace;color:#c00;max-width:420px;padding-left:16px}</style>` +
      `<h1>${esc(opts.title)}</h1><p>Index written ${esc(index.writtenAt)} · oldest PNG ${esc(oldest ?? 'none')} · run exit ${opts.runExit}</p>${cells}`,
  );
  return index;
}

/** Every dotted key (`a.b`, plural bases included) of every strings*.json under hub/src. */
export function allStringKeys(): string[] {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/strings(\.[\w-]+)?\.en\.json$|^strings\.en\.json$/.test(e.name)) {
        try {
          for (const k of Object.keys(JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>)) {
            if (!k.includes('.')) continue;
            keys.add(k);
            keys.add(k.replace(/_(zero|one|two|few|many|other)$/, ''));
          }
        } catch {
          /* a half-written strings file is the page's own problem */
        }
      }
    }
  };
  walk(path.join(HUB, 'src'));
  return [...keys];
}
