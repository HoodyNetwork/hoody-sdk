// Every query key a billing link sends is one the billing page reads: a key nobody reads is a promise
// the page doesn't keep (the person lands without what the link said).
import { describe, expect, it } from 'vitest';
import { links } from './links';

const files = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.*', '!./**/*.spec.*', '!./links.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// A read is a property of what useSearch() answered, in the file that called it (view.tsx, CheckoutDrawer.tsx bind it
// as `q`): `<binding>.<key>`, or a key destructured from it. Another object of the same name is not the query: reads
// count from the useSearch() binding up to the file's next binding of that name (CheckoutDrawer.tsx binds a quote as q
// further down).
const keysRead = new Set<string>();
for (const src of Object.values(files)) {
  for (const m of src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*useSearch\(\)/g)) {
    const name = m[1]!;
    const from = m.index! + m[0].length;
    const rebind = new RegExp(`\\b(?:const|let|var)\\s+${name}\\b|\\b${name}\\s*=(?!=)|[(,]\\s*${name}\\s*[,)]`, 'g');
    rebind.lastIndex = from;
    const end = rebind.exec(src)?.index ?? src.length;
    for (const [, key] of src.slice(from, end).matchAll(new RegExp(`\\b${name}\\.(\\w+)\\b`, 'g'))) keysRead.add(key!);
  }
  for (const [, list] of src.matchAll(/\b(?:const|let)\s*\{([^}]*)\}\s*=\s*useSearch\(\)/g)) {
    for (const part of list!.split(',')) { const key = part.split(':')[0]!.trim(); if (key) keysRead.add(key); }
  }
}
const reads = (key: string) => keysRead.has(key);

function samples(): string[] {
  const out: string[] = [];
  for (const v of Object.values(links)) {
    if (typeof v === 'string') out.push(v);
    else
      for (const args of [
        ['x'], ['x', 'y'], ['buy', { plan: 'p', sub: 's', item: 'i', days: 3, from: 'f', check: true }], ['x', 3, 'f'],
        // checkoutFor's ticket shapes: a plan buy and both item kinds (rent, reserve), with check.
        ...['buy', 'rent', 'reserve'].map((kind) => [{ kind, item: 'i', sub: 's', days: 3 }, { check: true }]),
        [{ kind: 'pay', item: null, sub: 's', days: null }, { check: true, held: '0123456789abcdef' }],
      ] as unknown[][]) {
        try {
          const r = (v as (...a: unknown[]) => unknown)(...args);
          if (typeof r === 'string') out.push(r);
        } catch {
          /* shape not taken */
        }
      }
  }
  return out;
}

describe('billing links', () => {
  it('finds the page\'s query reads (the check would pass on nothing otherwise)', () => {
    expect(keysRead.size).toBeGreaterThan(0);
    expect(reads('checkout')).toBe(true);
    // A quote object's field is not a query read (logic.ts reads q.cap off a quote, not the query).
    expect(reads('cap')).toBe(false);
    // Nor a field of the quote CheckoutDrawer.tsx binds as q further down, in the same file as its query q.
    for (const field of ['blocked', 'lines', 'warnings', 'notes', 'balanceCents']) expect(reads(field)).toBe(false);
    for (const key of ['checkout', 'plan', 'sub', 'sheet', 'from', 'item', 'days', 'check']) expect(reads(key)).toBe(true);
  });

  it('send only query keys the billing page reads', () => {
    const unread = new Set<string>();
    for (const to of samples()) for (const k of new URL(to, 'https://h').searchParams.keys()) if (!reads(k)) unread.add(k);
    expect([...unread]).toEqual([]);
  });

  it('plansFor marks one plan, and an empty plan is the plain plans section', () => {
    expect(links.plansFor('fam-pro')).toBe('/billing?view=plans&plan=fam-pro');
    expect(links.plansFor('')).toBe(links.plans);
  });
});
