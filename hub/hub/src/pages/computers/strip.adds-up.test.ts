// The summary strip above the computers list: its parts add up to its total. A computer that is starting (or in any
// state that is neither running, stopped nor failed) is counted in a part of its own, never left out of the split.
import { describe, expect, it } from 'vitest';
import { computers } from './fixtures';
import { stripParts, stripSplit } from './logic';
import strings from './strings.en.json';
import type { Computer } from './types';

const t = (k: 'strip.split' | 'strip.starting' | 'strip.other', v: Record<string, string | number>) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
const numbers = (s: string) => (s.match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
const of = (...status: string[]): Computer[] => status.map((s, i) => ({ ...computers[0]!, id: String(i).padStart(24, '0'), status: s }));

describe('the computers summary strip adds up', () => {
  it('the page fixture: the numbers in the split sum to the number of computers', () => {
    expect(computers.some((c) => /^(creating|starting|restarting|pending)$/.test(String(c.status)))).toBe(true);
    expect(numbers(stripSplit(computers, t))).toBe(computers.length);
  });

  it('every state lands in exactly one part', () => {
    const list = of('running', 'running', 'stopped', 'paused', 'failed', 'starting', 'creating', 'deleting', 'host_reinstalled', 'odd');
    expect(stripParts(list)).toEqual({ running: 2, stopped: 2, failed: 1, starting: 2, other: 3 });
    expect(stripSplit(list, t)).toBe('2 running · 2 stopped · 1 failed · 2 starting · 3 other');
  });

  it('starting and other are named only when there are some', () => {
    expect(stripSplit(of('running', 'stopped', 'failed'), t)).toBe('1 running · 1 stopped · 1 failed');
    expect(stripSplit(of('running', 'starting'), t)).toBe('1 running · 0 stopped · 0 failed · 1 starting');
  });
});
