// @vitest-environment node
// The Shared folders switch: on, in every build and whatever the address says. The rule behind it (what a build
// answers with the switch off) is kept: off, only a fixture build can turn it on from the address, a production
// build never. Vitest compiles every file with __HUB_FIXTURES__ = true, so those cases compile flag.ts the way a
// build does (vite's define: __HUB_FIXTURES__ -> false or true) with the switch set as asked, and run that module
// (pattern: core/hosts.production.test.ts).
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type * as FlagModule from './flag';
import { SHARES_UI, sharesUiOn } from './flag';

const SWITCH = /^export const SHARES_UI = (?:true|false) as boolean;$/m;

function compile(fixtures: boolean, on?: boolean): typeof FlagModule {
  const source = readFileSync(new URL('./flag.ts', import.meta.url), 'utf8');
  expect(source).toContain('__HUB_FIXTURES__');
  expect(source).toMatch(SWITCH);
  const switched = on === undefined ? source : source.replace(SWITCH, `export const SHARES_UI = ${JSON.stringify(on)} as boolean;`);
  const defined = switched.replace(/\b__HUB_FIXTURES__\b/g, JSON.stringify(fixtures));
  const { outputText } = ts.transpileModule(defined, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, () => {
    throw new Error('flag.ts gained a runtime import: compile it with that module too');
  });
  return mod.exports as unknown as typeof FlagModule;
}

describe('sharesUiOn', () => {
  it('is on, whatever the address says', () => {
    expect(SHARES_UI).toBe(true);
    expect(sharesUiOn('')).toBe(true);
    expect(sharesUiOn('', '')).toBe(true);
    expect(sharesUiOn('?fxshares=0')).toBe(true);
    expect(sharesUiOn('', '#/files?a=cedar.00c3&fxshares=0')).toBe(true);
  });
  it('a production build as shipped reads true with no address and with any', () => {
    const prod = compile(false);
    expect(prod.SHARES_UI).toBe(true);
    expect(prod.sharesUiOn('')).toBe(true);
    expect(prod.sharesUiOn('?fxshares=0')).toBe(true);
    expect(prod.sharesUiOn('', '#/files?fxshares=0')).toBe(true);
  });
  it('switched off, a fixture build turns it on for ?fxshares=1 only', () => {
    const off = compile(true, false);
    expect(off.SHARES_UI).toBe(false);
    expect(off.sharesUiOn('')).toBe(false);
    expect(off.sharesUiOn('?fxshares=1')).toBe(true);
    expect(off.sharesUiOn('?fxrealm=all&fxshares=1')).toBe(true);
    expect(off.sharesUiOn('?fxshares=0')).toBe(false);
    expect(off.sharesUiOn('?fxshares=true')).toBe(false);
  });
  it('switched off, a fixture build reads the hash route query too, and only fxshares=1 there', () => {
    const off = compile(true, false);
    expect(off.sharesUiOn('', '#/files?a=cedar.00c3&tab=storage&fxshares=1')).toBe(true);
    expect(off.sharesUiOn('', '#/files?a=cedar.00c3&fxshares=0')).toBe(false);
    expect(off.sharesUiOn('', '#/files/fxshares=1')).toBe(false);
    expect(off.sharesUiOn('', '')).toBe(false);
  });
  it('switched off, a production build reads false whatever the address says', () => {
    const prod = compile(false, false);
    expect(prod.sharesUiOn('?fxshares=1')).toBe(false);
    expect(prod.sharesUiOn('')).toBe(false);
    expect(prod.sharesUiOn('', '#/files?fxshares=1')).toBe(false);
  });
});
