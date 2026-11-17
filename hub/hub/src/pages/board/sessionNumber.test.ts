// Vitest: the numbers "Open by number" accepts: exactly the number typed, 1 to 9999 (or the program's own
// smaller catalogue range), and never a terminal or display in the Hub's launch range 8001-9999.
import { describe, expect, it } from 'vitest';
import { CATALOG, type Catalog } from './embed/catalog';
import { numberProblem, sessionMax } from './sessionNumber';

describe('Open by number rules', () => {
  it('every instance program goes up to 9999 at most', () => {
    for (const p of ['agent', 'terminal', 'display', 'browser', 'code'] as const) expect(sessionMax(CATALOG, p)).toBe(9999);
  });

  it('a program whose catalogue range is smaller keeps its own maximum', () => {
    const svc = CATALOG.views[CATALOG.kits.browser!.defaultView!]!.service!;
    const small = { ...CATALOG, services: { ...CATALOG.services, [svc]: { ...CATALOG.services[svc]!, index: { min: 1, max: 50, default: 1 } } } } as Catalog;
    expect(sessionMax(small, 'browser')).toBe(50);
    expect(numberProblem(small, 'browser', 50)).toBeNull();
    expect(numberProblem(small, 'browser', 51)).toBe('range');
  });

  it('a number in range opens; zero, a fraction and past the maximum do not', () => {
    expect(numberProblem(CATALOG, 'display', 10)).toBeNull();
    expect(numberProblem(CATALOG, 'display', 7)).toBeNull();
    expect(numberProblem(CATALOG, 'browser', 9999)).toBeNull();
    expect(numberProblem(CATALOG, 'display', 0)).toBe('range');
    expect(numberProblem(CATALOG, 'display', 2.5)).toBe('range');
    expect(numberProblem(CATALOG, 'display', Number.NaN)).toBe('range');
    expect(numberProblem(CATALOG, 'agent', 10000)).toBe('range');
  });

  it('a terminal or display in 8001-9999 never opens by number: a saved tile or a recent is not proof it exists', () => {
    expect(numberProblem(CATALOG, 'terminal', 8001)).toBe('unlisted');
    expect(numberProblem(CATALOG, 'display', 9999)).toBe('reserved');
    expect(numberProblem(CATALOG, 'terminal', 8500)).toBe('unlisted');
    expect(numberProblem(CATALOG, 'display', 8000)).toBeNull();
    expect(numberProblem(CATALOG, 'terminal', 8000)).toBeNull();
  });

  it('a launch-band terminal the live list names opens; any other terminal there is unlisted, and a display there stays reserved even when its terminal is listed', () => {
    const listed = new Set([8502]);
    expect(numberProblem(CATALOG, 'terminal', 8502, listed)).toBeNull();
    expect(numberProblem(CATALOG, 'display', 8502, listed)).toBe('reserved');
    expect(numberProblem(CATALOG, 'terminal', 8503, listed)).toBe('unlisted');
    expect(numberProblem(CATALOG, 'display', 8501, listed)).toBe('reserved');
    expect(numberProblem(CATALOG, 'terminal', 8502, null)).toBe('unlisted');
    expect(numberProblem(CATALOG, 'terminal', 8502, new Set())).toBe('unlisted');
  });

  it('other programs are not limited by the launch range', () => {
    expect(numberProblem(CATALOG, 'browser', 8500)).toBeNull();
    expect(numberProblem(CATALOG, 'code', 9000)).toBeNull();
  });
});
