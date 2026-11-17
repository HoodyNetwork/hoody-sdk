// A dynamic or catch-all script is named on Schedules as the Scripts page lists it, never by its bracket
// file name; a static one keeps its file name. The expected words are the Scripts page's English strings, spelled out here (a page
// imports only another page's links.ts).
import { describe, expect, it } from 'vitest';
import { handoffName } from '../scripts/links';
import { execRow } from './logic';

const name = (scriptRel: string): string => {
  const l = execRow({ scriptRel, expression: '0 6 * * *', enabled: true }).label;
  return 'name' in l ? l.name : '';
};

describe('schedules: a script row\'s name', () => {
  it('a dynamic file reads in the Scripts page\'s words, never "[id]"', () => {
    expect(name('default/1/users/[id].ts')).toBe('Users by id');
  });

  it('catch-all files read in words too', () => {
    expect(name('default/1/docs/[...slug].ts')).toBe('Every address below /docs (one or more parts)');
    expect(name('default/1/[[...path]].ts')).toBe('Every other address');
  });

  it('a static file keeps its file name, as before', () => {
    expect(name('default/1/nightly-digest.ts')).toBe('nightly-digest');
    expect(name('default/1/reports/weekly.js')).toBe('weekly');
  });
});

describe('scripts links: a hand-off script path\'s name (Logs)', () => {
  it('names a dynamic hand-off path in words and keeps any other as given', () => {
    expect(handoffName('orders/[id].ts')).toBe('Orders by id');
    expect(handoffName('reports/weekly.ts')).toBe('reports/weekly.ts');
    expect(handoffName('not a/../path')).toBe('not a/../path');
  });
});
