// Vitest: sizes on the Computers page go through the kit's formatStorage (1024 GB and up read in TB, one switch in
// the kit), and an unknown size is left out rather than read as 0.
import { describe, expect, it } from 'vitest';
import { interpolate } from '@kit';
import { serverOptions } from './create-logic';
import { sizeText, usageOfText } from './logic';
import strings from './strings.en.json';

const t = (k: string, v?: Record<string, unknown>) => {
  const key = k === 'size.cores' ? (v?.count === 1 ? 'size.cores_one' : 'size.cores_other') : k;
  return interpolate((strings as Record<string, string>)[key] ?? k, v as never);
};

describe('computer sizes', () => {
  it('memory reads in GB below 1024 and in TB from 1024', () => {
    expect(sizeText({ cores: 8, ramGb: 16 }, t as never)).toBe('8 cores · 16 GB RAM');
    expect(sizeText({ cores: 64, ramGb: 1024 }, t as never)).toBe('64 cores · 1 TB RAM');
    expect(sizeText({ cores: 1, ramGb: 1536 }, t as never)).toBe('1 core · 1.5 TB RAM');
  });
  it('an unknown part is left out, never shown as 0', () => {
    expect(sizeText({ cores: 4, ramGb: null }, t as never)).toBe('4 cores');
    expect(sizeText({ cores: null, ramGb: 2 }, t as never)).toBe('2 GB RAM');
    expect(sizeText({ cores: null, ramGb: null }, t as never)).toBe('');
  });
  it('usage reads each side in its own unit', () => {
    expect(usageOfText({ used: 1.1734, total: 6 }, t as never)).toBe('1.2 GB of 6 GB');
    expect(usageOfText({ used: 900, total: 2000 }, t as never)).toBe('900 GB of 1.95 TB');
  });
  it('the new-computer server picker says its size the same way, leaving out an unknown memory', () => {
    const srv = (ram: number | null) => ({ id: 's', name: 'node', place: '', cpu: 8, ram, disk: null, free: false, days: null, status: 'active', cap: null });
    const desc = (ram: number | null) => serverOptions([srv(ram)], { t: t as never, computers: undefined, inRealm: true, market: false })[0]?.description;
    expect(desc(32)).toBe('8 cores, 32 GB RAM');
    expect(desc(2048)).toBe('8 cores, 2 TB RAM');
    expect(desc(null)).toBe('8 cores');
  });
});
