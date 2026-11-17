// Strict globals (strict-globals.ts): a DOM global read in the terminal throws and is recorded. No allowances: library
// probes are answered at load (strict-probes.ts), so the probes the old allowances let through now trap here.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A trapped global throws TERM_GLOBAL on read and on write, and the ledger names it | 'trapped globals' |
// | 2 | window/self members trap; window.origin is the opaque 'null' | 'window members' |
// | 3 | No allowances: postMessage, window.document, document and sessionStorage all trap, from any module | 'no allowances' |
// | 4 | restore() puts every global back | 'restore' |
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import * as strict from './strict-globals';
import { activeStrictGlobals, expectTraps, installStrictGlobals, type StrictGlobals } from './strict-globals';

const g = globalThis as Record<string, unknown>;
let sg: StrictGlobals | null = null;
// The term preload installs strict globals for the whole process: lift them for these tests (each installs its own),
// put them back after.
let preloaded = false;
beforeAll(() => { const pre = activeStrictGlobals(); if (pre) { preloaded = true; pre.restore(); } });
afterAll(() => { if (preloaded && !activeStrictGlobals()) installStrictGlobals(); });
// Every test here traps on purpose (the traps are the subject).
beforeEach(() => { expectTraps('*'); });
afterEach(() => { sg?.restore(); sg = null; });

test('trapped globals', () => {
  sg = installStrictGlobals();
  expect(() => g.localStorage).toThrow('TERM_GLOBAL');
  expect(() => { g.location = 'x'; }).toThrow('TERM_GLOBAL');
  expect(sg.ledger().map((r) => r.name)).toEqual(['localStorage', 'location']);
});

test('window members', () => {
  sg = installStrictGlobals();
  const w = g.window as Record<string, unknown>;
  expect(w.origin).toBe('null');
  expect(() => w.localStorage).toThrow('TERM_GLOBAL');
  expect(() => (g.self as Record<string, unknown>).addEventListener).toThrow('TERM_GLOBAL');
});

test('no allowances', () => {
  sg = installStrictGlobals();
  expect(() => typeof g.postMessage).toThrow('TERM_GLOBAL');
  expect(() => (g.window as Record<string, unknown>).document).toThrow('TERM_GLOBAL');
  expect(() => g.document).toThrow('TERM_GLOBAL');
  expect(() => g.sessionStorage).toThrow('TERM_GLOBAL');
  expect(sg.ledger().map((r) => r.name)).toEqual(['postMessage', 'window.document', 'document', 'sessionStorage']);
  expect('STRICT_ALLOWANCES' in strict).toBe(false);
});

test('restore', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  installStrictGlobals().restore();
  expect(Object.getOwnPropertyDescriptor(globalThis, 'localStorage')).toEqual(before);
  expect('window' in globalThis).toBe(Object.prototype.hasOwnProperty.call(globalThis, 'window'));
});
