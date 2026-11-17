// A page file the terminal can load reads no browser global outside a `hostEnv().browserPage` guard on the same line.
// Strict globals catch such a read when a page mounts; this pins the ones a mount never reaches: a press handler, an
// effect after an open, a timer (Home's chips and welcome, Files' Open with, Scripts' Try
// it, Schedules' See output and a billing confirm each threw TERM_GLOBAL only after a key, some taking the page down).
//
// Counted per file: lines (comments aside) that name one of the READS below and do not say `browserPage`.
// Not scanned: tests, `.term` files, a web file that has a `.term` sibling, `.web.` files and fixtures (the terminal
// loads none of them).
// KNOWN holds today's counts: reads behind an earlier `browserPage` return, in code no terminal key reaches (see
// the rows below), pages/board's web parts (the terminal draws BoardView.term), or not swept (pages/ai). It only shrinks:
//   - a count above KNOWN: guard the new read (`hostEnv().browserPage === true && …`), use a hostEnv() seam
//     (onLifecycle, visible, openExternal, files), a ref instead of a document search, or kit openOutside;
//   - a count below KNOWN: lower the number here in the same change.
import { expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = import.meta.dir;

const READS = new RegExp([
  String.raw`\b(?:requestAnimationFrame|cancelAnimationFrame|requestIdleCallback|getComputedStyle|matchMedia)\s*\(`,
  // Not a property of that name (`v.window.around`).
  String.raw`(?<![.\w])(?:document|navigator|window)\s*[.\[]`,
  String.raw`\bnew\s+(?:ResizeObserver|IntersectionObserver|MutationObserver)\b`,
  String.raw`\binstanceof\s+(?:HTML\w*Element|Element)\b`,
  String.raw`\btypeof\s+(?:window|document|navigator|ResizeObserver|IntersectionObserver|MutationObserver|matchMedia)\b`,
  String.raw`\bCSS\s*\.`,
].join('|'));

const KNOWN: Readonly<Record<string, number>> = {
  'account/parts/LockSheet.tsx': 2,
  'account/view.tsx': 1,
  'ai/auto/workflows/NewAsk.tsx': 2,
  'ai/parts/Default.tsx': 1,
  'ai/parts/Pane.tsx': 3,
  'apps/launch/FindPane.tsx': 7,
  'billing/parts/Funds.tsx': 1,
  'billing/widget.tsx': 1,
  'board/broadcast/Broadcast.tsx': 17,
  'board/broadcast/useBroadcast.ts': 1,
  'board/options/Panel.tsx': 2,
  'board/options/Rows.tsx': 1,
  'board/parts/Chips.tsx': 1,
  'board/parts/ConvTile.tsx': 1,
  'board/parts/Frame.tsx': 1,
  'board/parts/NotesNew.tsx': 2,
  'board/parts/Picker.tsx': 7,
  'board/parts/Strip.tsx': 17,
  'board/parts/formFocus.ts': 3,
  'bots/parts/BotPane.tsx': 4,
  'bots/tileState.ts': 3,
  'bots/voice/session.ts': 1,
  'computers/parts/ConnectProxy.tsx': 1,
  'files/rowdrag.ts': 5,
  'home/parts/NeedsYou.tsx': 2,
  'home/parts/focus.ts': 2,
  'keys/parts/KeyFields.tsx': 1,
  'keys/parts/MintPanels.tsx': 1,
  'keys/parts/words.ts': 1,
  'scripts/parts/TestTab.tsx': 2,
  'tunnels/view.tsx': 2,
  'vault/exportVault.ts': 2,
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'term-golden') walk(p, out); continue; }
    if (!/\.tsx?$/.test(name) || /\.(test|spec|term|web|scenario)\.|\.d\.ts$|^fixtures?\b|^shots\b/.test(name)) continue;
    // A web file with a terminal sibling is never loaded in a terminal.
    if (existsSync(p.replace(/\.(tsx?)$/, '.term.tsx')) || existsSync(p.replace(/\.(tsx?)$/, '.term.ts'))) continue;
    out.push(p);
  }
  return out;
}

export function unguardedReads(text: string): number {
  let n = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    // A trailing comment is not code.
    const code = line.replace(/\s\/\/ .*$/, '');
    if (READS.test(code) && !code.includes('browserPage')) n++;
  }
  return n;
}

test('the counter sees the reads and honours the guard', () => {
  expect(unguardedReads('requestAnimationFrame(() => el.focus());')).toBe(1);
  expect(unguardedReads('if (hostEnv().browserPage === true) requestAnimationFrame(run);')).toBe(0);
  expect(unguardedReads('const el = e.target instanceof HTMLElement ? e.target : null;')).toBe(1);
  expect(unguardedReads('// document.querySelector is gone\nconst a = 1; // window.open was here')).toBe(0);
  expect(unguardedReads('at: v.window.around')).toBe(0);
  expect(unguardedReads("href: window.location.href,\nconst d = document.activeElement;\nnew ResizeObserver(cb);\ntypeof navigator === 'undefined'")).toBe(4);
});

test('no page file gains an unguarded browser-global read', () => {
  const now: Record<string, number> = {};
  for (const p of walk(ROOT, [])) {
    const n = unguardedReads(readFileSync(p, 'utf8'));
    if (n > 0) now[relative(ROOT, p)] = n;
  }
  const grew = Object.entries(now).filter(([f, n]) => n > (KNOWN[f] ?? 0)).map(([f, n]) => `${f}: ${n} (known ${KNOWN[f] ?? 0})`).sort();
  const shrank = Object.entries(KNOWN).filter(([f, n]) => (now[f] ?? 0) < n).map(([f, n]) => `${f}: ${now[f] ?? 0} (known ${n}): lower KNOWN`).sort();
  expect(grew).toEqual([]);
  expect(shrank).toEqual([]);
});
