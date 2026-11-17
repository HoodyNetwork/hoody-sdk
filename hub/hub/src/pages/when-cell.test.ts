import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// One "when". A moment a page shows with its exact date and time on hover is the kit's When (`<When at text? />`:
// a <time dateTime> with the relative words, or the page's own words, and formatDateTime as its title). A page that builds
// that markup itself (a `title={formatDateTime(…)}` on a span or a time) is a second form of the same thing.
// KNOWN lists the files still to convert and how many such sites each holds; rows only shrink.
const PAGES = __dirname;
const OWN_WHEN = /\btitle=\{\s*formatDateTime\(/g;

const KNOWN: Record<string, number> = {};

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx$/.test(e.name) && !/\.(test|spec)\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/** file -> how many hand-built hover dates it holds (clean files left out). */
function ownWhens(files: readonly string[], read: (f: string) => string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const f of files) {
    const n = read(f).match(OWN_WHEN)?.length ?? 0;
    if (n > 0) found[relative(PAGES, f)] = n;
  }
  return found;
}

describe('pages show a moment with the kit When', () => {
  it('the scan sees a hand-built hover date and passes When and a date in running text', () => {
    const read = (f: string) => ({
      'a.tsx': '<span title={formatDateTime(v)}>{formatRelative(v)}</span><time dateTime={iso} title={ formatDateTime(ms)}>x</time>',
      'b.tsx': "<When at={v} text={words} /><p>{t('snoozed', { when: formatDateTime(at) })}</p>",
    })[f] ?? '';
    expect(ownWhens(['a.tsx', 'b.tsx'], read)).toEqual({ [relative(PAGES, 'a.tsx')]: 2 });
  });

  it('no page builds its own hover date, beyond the files still to convert', () => {
    const found = ownWhens(sources(PAGES), (f) => readFileSync(f, 'utf8'));
    expect(found, 'show the moment with kit <When at={…} text?={…} />; lower or delete a KNOWN row for a file that is clean now').toEqual(KNOWN);
  });
});
