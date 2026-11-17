// lookupParts / useStringParts: a line that holds a link keeps `t`'s plural choice and text for every value that is
// not an element. Checked against `lookup` on the real tables, so the two cannot drift.
import { render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { lookup, lookupParts, useStringParts } from './strings';
import programs from '../pages/programs/strings.en.json';
import scripts from '../pages/scripts/strings.en.json';
import bots from '../pages/bots/strings.en.json';
import board from '../pages/board/strings.en.json';

const TABLES: Array<[string, Record<string, string>]> = [['programs', programs], ['scripts', scripts], ['bots', bots], ['board', board]];

describe('lookupParts agrees with lookup', () => {
  for (const [name, table] of TABLES) {
    it(`${name}: every key, every plural form, with text values`, () => {
      const bad: string[] = [];
      for (const key of Object.keys(table)) {
        const base = key.replace(/_(one|other|zero|two|few|many)$/, '');
        for (const count of [undefined, 0, 1, 2, 5]) {
          const vars: Record<string, string | number> = count === undefined ? {} : { count };
          for (const m of (table[key] as string).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!(m[1] as string in vars)) vars[m[1] as string] = `«${m[1]}»`;
          const want = lookup(table, base, vars);
          const got = lookupParts(table, base, vars).join('');
          if (want !== got) bad.push(`${key}@${count}: ${JSON.stringify(want)} vs ${JSON.stringify(got)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});

describe('lookupParts with elements', () => {
  const T = { line_one: '{{count}} program on {{name}} · {{running}} running', line_other: '{{count}} programs on {{name}} · {{running}} running', plain: 'No slots', twice: '{{name}} and {{name}}' };
  const link = <a href="/x">box</a>;

  it('puts the element where its slot is, the rest as text, the plural form by count', () => {
    expect(lookupParts(T, 'line', { count: 1, name: link, running: 1 })).toEqual(['1 program on ', link, ' · 1 running']);
    expect(lookupParts(T, 'line', { count: 3, name: link, running: 2 })).toEqual(['3 programs on ', link, ' · 2 running']);
  });
  it('an element used twice appears twice; a slot at either end leaves no empty piece', () => {
    expect(lookupParts(T, 'twice', { name: link })).toEqual([link, ' and ', link]);
  });
  it('an unknown slot stays visible, as in lookup; an unknown key is the key', () => {
    expect(lookupParts({ a: 'x {{y}} z' }, 'a', { name: link })).toEqual(['x {{y}} z']);
    expect(lookupParts(T, 'nope', { name: link })).toEqual(['nope']);
  });
  it('a key without slots, with or without values, is its text', () => {
    expect(lookupParts(T, 'plain')).toEqual(['No slots']);
    expect(lookupParts(T, 'plain', { name: link })).toEqual(['No slots']);
  });
});

describe('useStringParts', () => {
  const T = { line: 'Open {{name}} now', plain: 'Hello' };
  it('without an element it returns the same string t returns', () => {
    const { result } = renderHook(() => useStringParts(T));
    expect(result.current('line', { name: 'box' })).toBe('Open box now');
    expect(result.current('plain')).toBe('Hello');
  });
  it('with an element it renders the line with the element in place', () => {
    const { result } = renderHook(() => useStringParts(T));
    const { container } = render(<p>{result.current('line', { name: <a href="/c">box</a> })}</p>);
    expect(container.querySelector('p')?.textContent).toBe('Open box now');
    expect(container.querySelector('a')?.textContent).toBe('box');
  });
});
