// Every key family the broadcast builds at run time exists in its strings, and the clock reads m:ss / h:mm:ss.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';
import { clock } from './text';

const has = (k: string) => k in strings;

describe('broadcast strings', () => {
  it('every built key exists', () => {
    const fam: Record<string, readonly string[]> = {
      error: ['denied', 'no-source', 'no-webm', 'busy', 'not-this-tab', 'failed'],
      end: ['stopped', 'track-ended', 'no-answer', 'refused', 'taken', 'busy', 'server', 'network', 'slow', 'recorder', 'no-picture'],
      confined: ['element', 'region', 'tab'], // 'wide' and 'other' never show: refused as not-this-tab
      unsupported: ['framed', 'insecure', 'no-capture', 'no-recorder', 'no-stream-upload', 'no-webm', 'no-crypto'],
    };
    for (const [f, ks] of Object.entries(fam)) for (const k of ks) expect(has(`${f}.${k}`), `${f}.${k}`).toBe(true);
  });
  it('names no internal host, address class or bypass (public text rule)', () => {
    const all = Object.values(strings).join('\n');
    const banned = ['10\\.', '127\\.', '192\\.168', 'localhost', 'private address', 'dev' + ' host', 'hoody\\.[a-z]{2,}'];
    expect(all).not.toMatch(new RegExp(`\\b(?:${banned.join('|')})\\b`, 'i'));
  });
});

describe('clock', () => {
  it('m:ss under an hour, h:mm:ss after', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65_400)).toBe('1:05');
    expect(clock(3_725_000)).toBe('1:02:05');
    expect(clock(-5)).toBe('0:00');
  });
});
