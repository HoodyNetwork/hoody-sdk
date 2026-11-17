import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// One warning look. A warning notice in the Hub is the kit's: a neutral fill (--hx-notice-warn), a 1 px frame and the
// hazard stripe at the start edge (--hx-warn-stripe), drawn by Band, OutcomeBanner, Verdict and the Ledger strip. A page
// that paints its own notice with the orange tint (--hx-warn-t) or a solid orange frame or bar (a border in
// --hx-warn-fill) shows a second warning look beside the kit's. A page uses the kit part (Band tone="warn"), or, where a
// kit part cannot hold its content, the same recipe from the kit tokens. Marks, dots and text in the warn colour are
// not notices and are not read here.
// KNOWN lists the files still to convert and how many such declarations each holds; rows only shrink.
const PAGES = __dirname;
const OWN_NOTICE = /\bbackground(?:-color)?\s*:\s*var\(--hx-warn-t\)|\bborder(?:-inline-start|-block-start|-left)?\s*:[^;{}]*\bsolid\s+var\(--hx-warn-fill\)/g;

const KNOWN: Record<string, number> = {
  'ai/parts/parts.module.css': 2,
  'billing/parts/parts.module.css': 4,
  'home/parts/home.module.css': 1, // the Needs-you title beside its lines keeps its own bar
  'keys/parts/keys.module.css': 1,
};

function sheets(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sheets(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** file -> how many own-notice declarations it holds (clean files left out). Comments are not read. */
function ownNotices(files: readonly string[], read: (f: string) => string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const f of files) {
    const n = read(f).replace(/\/\*[\s\S]*?\*\//g, '').match(OWN_NOTICE)?.length ?? 0;
    if (n > 0) found[relative(PAGES, f)] = n;
  }
  return found;
}

describe('pages draw warnings with the kit recipe', () => {
  it('the scan sees an own tint, frame and bar, and passes the stripe recipe, marks and comments', () => {
    const read = (f: string) => ({
      'a.css': '.x { border-inline-start: 3px solid var(--hx-warn-fill); background: var(--hx-warn-t); }\n.y { border: var(--bw) solid var(--hx-warn-fill); }',
      'b.css': [
        '/* background: var(--hx-warn-t) */',
        '.n { border: var(--bw) solid var(--hx-notice-warn-line); border-inline-start: var(--bw-notice) solid transparent;',
        '  background: var(--hx-warn-stripe) 0 0 / var(--bw-notice) 100% no-repeat border-box, var(--hx-notice-warn); }',
        '.dot { background: var(--hx-warn-fill); } .mark { border-color: var(--hx-warn-fill); color: var(--hx-warn); }',
      ].join('\n'),
    })[f] ?? '';
    expect(ownNotices(['a.css', 'b.css'], read)).toEqual({ [relative(PAGES, 'a.css')]: 3 });
  });

  it('no page stylesheet paints its own warning notice, beyond the files still to convert', () => {
    const found = ownNotices(sheets(PAGES), (f) => readFileSync(f, 'utf8'));
    expect(found, 'draw a warning with kit Band tone="warn" (or the kit recipe: --hx-notice-warn fill, --hx-notice-warn-line frame, --hx-warn-stripe start edge); lower or delete a KNOWN row for a file that is clean now').toEqual(KNOWN);
  });
});
