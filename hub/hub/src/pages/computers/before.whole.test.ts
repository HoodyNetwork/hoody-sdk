// A create, a copy and a computer made from a snapshot whose answer was lost are proved only by a computer the page's
// list did not show at the press (data.ts listMadeNew, `before`). That list is one page of at most 100 rows: a full page
// may leave a computer of the sent name beyond it, which a later read can show (a computer gone moves it up). The API
// refuses a name its project already holds, so that computer was there before and must never prove the change. So
// pressBefore gives `before` only from a list known to be whole (fewer rows than the page): none, nothing proves the
// change, and it stays held until the warned Dismiss. `before` is every id that list shows, so a computer it showed
// under another name and renamed into the sent name after the press never proves the change either.
import { describe, expect, it } from 'vitest';
import { listMadeNew, pressBefore } from './data';
import type { Computer } from './types';

const P = 'p'.repeat(24);
const Q = 'q'.repeat(24);
// The server the change was sent to; every row sits on it (listMadeNew `server`: made.server.test.ts).
const SV = 's1';
const row = (i: number, name = `c-${i}`, project = P): Computer => ({ id: i.toString(16).padStart(24, '0'), name, project_id: project, server_id: SV }) as Computer;
const rows = (n: number): Computer[] => Array.from({ length: n }, (_, i) => row(i));

describe('pressBefore: `before` only from a list known to be whole', () => {
  it('no list read yet: none', () => {
    expect(pressBefore(undefined)).toBeUndefined();
  });

  it('fewer rows than a page: every id the list shows, whatever its name or project ([] for an empty list)', () => {
    const list = [...rows(97), row(200, 'web'), row(201, 'web', Q)];
    expect(list).toHaveLength(99);
    expect(pressBefore(list)).toEqual(list.map((r) => r.id));
    expect(pressBefore(rows(99))).toEqual(rows(99).map((r) => r.id));
    expect(pressBefore([])).toEqual([]);
  });

  it('a row with no id adds nothing', () => {
    const list = [row(1), { name: 'no id', project_id: P } as unknown as Computer, { ...row(2), id: '' }];
    expect(pressBefore(list)).toEqual([row(1).id]);
  });

  it("a full page (100 rows, the read's limit) may not be the whole list: none, with or without the name on it", () => {
    expect(pressBefore(rows(100))).toBeUndefined();
    expect(pressBefore([...rows(99), row(200, 'web')])).toBeUndefined();
  });

  it('a computer of the name beyond a full page, shown by a later read, never proves the change', () => {
    // At the press the list is a full page without the name; the computer of that name sits beyond it.
    const before = pressBefore(rows(100));
    const identity = { project: P, name: 'web', realm: 'all', server: SV, ...(before ? { before } : {}) };
    // One computer gone moves it onto the page: the read-back shows it.
    const later = [...rows(99), row(300, 'web')];
    expect(listMadeNew(identity, [[later]])).toBeUndefined();
    // The control: with fewer rows at the press (the whole list), the same read shows a new computer and proves it.
    const whole = pressBefore(rows(99));
    expect(whole).toEqual(rows(99).map((r) => r.id));
    expect(listMadeNew({ project: P, name: 'web', realm: 'all', server: SV, before: whole }, [[later]])).toBe('applied');
  });
});

describe('a computer renamed into the sent name after the press never proves the change', () => {
  it('the list showed it under another name at the press; a read-back showing it under the sent name proves nothing', () => {
    // At the press the whole list shows `old` (same project, same server) and nothing named `web`. The create or copy
    // of `web` was never made (refused, or lost before the API), and another tab renames `old` to `web`.
    const old = row(7, 'old');
    const before = pressBefore([...rows(5), old]);
    const identity = { project: P, name: 'web', realm: 'all', server: SV, ...(before ? { before } : {}) };
    const renamed = { ...old, name: 'web' };
    expect(listMadeNew(identity, [[[...rows(5), renamed]]])).toBeUndefined();
    // The control: a new computer of that name, one the list did not show at the press, proves it.
    expect(listMadeNew(identity, [[[...rows(5), renamed, row(300, 'web')]]])).toBe('applied');
  });
});
