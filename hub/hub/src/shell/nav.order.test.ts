// API sits right after Keys; the Help foot holds Guide and Support. The page
// manifests are read as text: the shell never imports a page module.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_PLACE } from './nav';

const placed = (group: string) =>
  Object.entries(NAV_PLACE)
    .filter(([, p]) => p.group === group)
    .sort(([a, x], [b, y]) => x.order - y.order || a.localeCompare(b))
    .map(([id]) => id);

describe('nav order', () => {
  it('API is right after Keys', () => {
    const account = placed('account');
    expect(account.indexOf('api')).toBe(account.indexOf('keys') + 1);
  });

  it('the Help foot is Guide and Support only', () => {
    expect(placed('help')).toEqual(['guide', 'support']);
  });

  it("the API page's own manifest says the same place", () => {
    const text = readFileSync(path.resolve(__dirname, '../pages/api/page.ts'), 'utf8');
    expect(text).toMatch(/nav: \{ group: 'account', order: 35,/);
    expect(NAV_PLACE.api).toEqual({ group: 'account', order: 35 });
  });
});
