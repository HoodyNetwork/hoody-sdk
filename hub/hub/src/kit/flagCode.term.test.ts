// countryFlag read back (flagCode) lives in kit/flag.ts (no sibling: both builds import it), the one home the web std rule allows
// (conformance.std 'flags'): no other kit source does regional-indicator arithmetic (Display.term.tsx
// and ComputerPicker.pure.ts each had a copy).
import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { flagCode } from './flag';
import { countryFlag } from './format';

describe('flagCode (terminal)', () => {
  it('reads countryFlag back (the terminal code or the web emoji); refuses the rest', () => {
    expect(flagCode('SG')).toBe('SG');
    expect(flagCode('🇸🇬')).toBe('SG');
    expect(flagCode(countryFlag('de'))).toBe('DE');
    expect(flagCode('sg')).toBe(null);
    expect(flagCode('SGP')).toBe(null);
    expect(flagCode(undefined)).toBe(null);
  });

  it('kit/flag.ts is the only source with regional-indicator arithmetic (the std rule\'s pattern)', () => {
    const root = path.join(import.meta.dir);
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && /0x1f1e6|127397|127462/i.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits.sort()).toEqual(['flag.ts']);
    // No sibling: the terminal needs the decode too (fixtures and data carry the emoji).
    expect(fs.existsSync(path.join(root, 'flag.term.ts'))).toBe(false);
  });
});
