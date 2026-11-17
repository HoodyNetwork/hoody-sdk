// Vitest: which Exec script folders (execIds) the Hub may address, and the kit routes that take any of them.
import { describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { EXEC_DEFAULT, EXEC_MAX, execIndex, execOfParam, execRoot } from './exec';
import { defineRoute } from './routes';
import { boot, calls, PROXY, R1 } from './test/env';

const outcome = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: HubError) => e);

describe('exec folders', () => {
  it('the index guard takes integers 1 to 9999 only', () => {
    expect(EXEC_DEFAULT).toBe(1);
    expect(EXEC_MAX).toBe(9999);
    for (const n of [1, 2, 42, 9999]) expect(execIndex(n)).toBe(true);
    for (const n of [0, -1, 10000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(execIndex(n)).toBe(false);
  });
  it("a folder's tree is default/<n>/, and a bad folder never becomes a path", () => {
    expect(execRoot(1)).toBe('default/1/');
    expect(execRoot(9999)).toBe('default/9999/');
    for (const n of [0, 10000, 2.5, -3]) expect(() => execRoot(n)).toThrow(RangeError);
  });
  it('a URL value names a folder only as plain digits, 1 to 9999', () => {
    expect(execOfParam('1')).toBe(1);
    expect(execOfParam('37')).toBe(37);
    expect(execOfParam('9999')).toBe(9999);
    for (const v of ['0', '01', '10000', '-1', '1.5', ' 2', '2 ', 'abc', '1e3', '0x10', '', '٣']) expect(execOfParam(v)).toBeNull();
    for (const v of [undefined, null, 3, ['3']]) expect(execOfParam(v)).toBeNull();
  });
});

describe('a kit route that may reach any folder', () => {
  const list = defineRoute({ method: 'GET', path: '/api/v1/exec/scripts/list', scope: 'kit', kit: 'exec', index: execIndex });
  const host = (n: number) => `https://p1-c1-exec-${n}.sv1.${PROXY}`;
  it('goes to the folder the call names', async () => {
    boot({ realm: R1 });
    await api(list, { index: 3 });
    await api(list, { index: 9999 });
    expect(calls.map((c) => c.url)).toEqual([`${host(3)}/api/v1/exec/scripts/list`, `${host(9999)}/api/v1/exec/scripts/list`]);
  });
  it('is refused unsent without a folder or with one out of range: it never falls back to folder 1', async () => {
    boot({ realm: R1 });
    for (const index of [undefined, 0, 10000, 1.5, -1]) {
      expect(await outcome(api(list, index === undefined ? {} : { index }))).toMatchObject({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    }
    expect(calls.length).toBe(0);
  });
});
