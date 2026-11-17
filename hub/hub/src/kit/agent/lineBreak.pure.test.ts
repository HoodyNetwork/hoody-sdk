import { describe, expect, test } from 'vitest';
import { breakRuns, lineText, type Run } from './lineBreak.pure';

const w1 = (s: string) => Array.from(s).length;
const plainRuns = (s: string): Run<number>[] => [{ s, st: 0 }];
const lines = (s: string, width: number) => breakRuns(plainRuns(s), width, w1).map(lineText);

describe('breakRuns', () => {
  test('breaks at spaces and drops them', () => {
    expect(lines('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });
  test('closing punctuation never starts a line', () => {
    const out = lines('hoody-cron (60), hoody-watch (61)', 16);
    for (const l of out) expect(l[0]).not.toMatch(/[,.;:!?)\]}]/);
    expect(out.join(' ')).toBe('hoody-cron (60), hoody-watch (61)');
  });
  test('a "(host)" unit is never split after its opening bracket', () => {
    const out = lines('see the service list (example.com) for details', 26);
    expect(out).toContain('(example.com) for details');
    for (const l of out) expect(l.endsWith('(')).toBe(false);
  });
  test('a word longer than the line breaks after - or /, else at the last cell, and nothing is lost', () => {
    expect(lines('/home/ada/projects/shop/src', 10)).toEqual(['/home/ada/', 'projects/', 'shop/src']);
    expect(lines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
  test('styles survive the break; newline ends a line', () => {
    const runs: Run<string>[] = [{ s: 'bold words', st: 'b' }, { s: ' plain\nnext', st: 'p' }];
    const out = breakRuns(runs, 8, w1);
    expect(out.map(lineText)).toEqual(['bold', 'words', 'plain', 'next']);
    expect(out[1]).toEqual([{ s: 'words', st: 'b' }]);
  });
  test('wide characters count two cells', () => {
    const wide = (s: string) => Array.from(s).reduce((n, c) => n + (c.codePointAt(0)! > 0x2e80 ? 2 : 1), 0);
    expect(breakRuns(plainRuns('漢字漢字'), 5, wide).map(lineText)).toEqual(['漢字', '漢字']);
  });
});

import { linkHostShown, namesOtherHost } from './linkShown';
describe('linkHostShown', () => {
  test('words naming another host always show the real one', () => {
    expect(namesOtherHost('log in at paypal.com', 'evil.example')).toBe(true);
    expect(linkHostShown('paypal.com', 'evil.example', false, true)).toBe(true);
  });
  test('words that are or say the host: not repeated', () => {
    expect(linkHostShown('docs on example.com', 'example.com', false, null)).toBe(false);
    expect(linkHostShown('anything', 'example.com', true, null)).toBe(false);
    expect(namesOtherHost('www.example.com', 'docs.example.com')).toBe(false);
  });
  test('plain words: the host only when hyperlinks are not known to work', () => {
    expect(linkHostShown('the service list', 'example.com', false, null)).toBe(true);
    expect(linkHostShown('the service list', 'example.com', false, true)).toBe(false);
  });
});
