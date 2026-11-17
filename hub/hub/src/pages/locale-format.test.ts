import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// One locale on a screen. The kit formatters (kit/format.ts: formatNumber, formatDate, formatDateTime) print in the Hub's
// UI locale. A `.toLocaleString()`, `.toLocaleDateString()` or `.toLocaleTimeString()` with no argument prints in the
// BROWSER's locale instead, so a count reads "1.234" on one page and "1,234" on the next. Page code never calls them
// bare: a number goes through formatNumber, a date through formatDate or formatDateTime. A call that names its locale
// or options on purpose (a clock in the reader's own 12/24-hour habit) is not read here.
// KNOWN is empty and stays empty: a file listed there would be one still to convert.
const PAGES = __dirname;
const BARE = /\.toLocale(?:Date|Time)?String\(\s*\)/g;

const KNOWN: Record<string, number> = {
};

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** file -> how many bare locale calls it holds (clean files left out). */
function bareLocaleCalls(files: readonly string[], read: (f: string) => string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const f of files) {
    const n = read(f).match(BARE)?.length ?? 0;
    if (n > 0) found[relative(PAGES, f)] = n;
  }
  return found;
}

describe('pages print numbers and dates in the UI locale', () => {
  it('the scan sees a bare call and passes one that names its locale', () => {
    const read = (f: string) => ({
      'a.tsx': 'const x = n.toLocaleString(); const d = new Date(v).toLocaleDateString( );',
      'b.ts': "const x = n.toLocaleString('en'); const d = at.toLocaleTimeString([], { hour: '2-digit' }); formatNumber(n);",
    })[f] ?? '';
    expect(bareLocaleCalls(['a.tsx', 'b.ts'], read)).toEqual({ [relative(PAGES, 'a.tsx')]: 2 });
  });

  it('no page file calls toLocaleString() bare, beyond the files still to convert', () => {
    const found = bareLocaleCalls(sources(PAGES), (f) => readFileSync(f, 'utf8'));
    expect(found, 'use formatNumber / formatDate / formatDateTime from @kit (@kit/pure in logic and data files); lower or delete a KNOWN row for a file that is clean now').toEqual(KNOWN);
  });
});
