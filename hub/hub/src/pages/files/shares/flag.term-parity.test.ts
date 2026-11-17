// @vitest-environment node
// flag.term.ts is the terminal's copy of the Shared folders switch, with the same rule as flag.ts for any query string
// and hash a caller passes; only its defaults differ (the terminal has no page address). The two switches differ for
// now: the web switch is on and the terminal's stays off, because the terminal's Shared folders section is not laid
// out for 80 columns yet. The rule is compared with flag.ts compiled with its switch off, as a fixture build (the way
// flag.test.ts compiles it; Vitest compiles flag.term.ts as a fixture build too).
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as web from './flag';
import * as term from './flag.term';

const CASES: [string, string][] = [
  ['', ''], ['?fxshares=1', ''], ['?fxrealm=all&fxshares=1', ''], ['?fxshares=0', ''],
  ['', '#/files?fxshares=1'], ['', '#/files?a=1&fxshares=1'], ['', '#/files'], ['?x=1', '#/files?fxshares=2'],
];
const SWITCH = /^export const SHARES_UI = (?:true|false) as boolean;$/m;

/** flag.ts with its switch off, compiled as a fixture build. */
function webSwitchedOff(): typeof web {
  const source = readFileSync(new URL('./flag.ts', import.meta.url), 'utf8');
  expect(source).toMatch(SWITCH);
  const defined = source.replace(SWITCH, 'export const SHARES_UI = false as boolean;').replace(/\b__HUB_FIXTURES__\b/g, 'true');
  const { outputText } = ts.transpileModule(defined, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, () => {
    throw new Error('flag.ts gained a runtime import: compile it with that module too');
  });
  return mod.exports as unknown as typeof web;
}

describe('flag.term.ts', () => {
  it('the web switch is on and the terminal switch is off', () => {
    expect(web.SHARES_UI).toBe(true);
    expect(term.SHARES_UI).toBe(false);
  });
  it('answers as flag.ts does with its switch off, for the same address parts', () => {
    const off = webSwitchedOff();
    for (const [search, hash] of CASES) expect(term.sharesUiOn(search, hash)).toBe(off.sharesUiOn(search, hash));
    // The compared rule is a real one: off, a fixture build still answers the address.
    expect(term.sharesUiOn('?fxshares=1')).toBe(true);
  });
  it('is off with no address (the terminal default)', () => {
    expect(term.sharesUiOn()).toBe(false);
  });
});
