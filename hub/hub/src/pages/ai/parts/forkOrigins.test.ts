// forkOrigins: the chat a fork was started on, kept by the session id it opened, taken once, bounded.
import { beforeEach, describe, expect, it } from 'vitest';
import { forkOrigins } from './forkOrigins';

const at = (n: number) => ({ computer: `atlas.${n}`, realm: 'global', sid: `s-${n}` });

describe('forkOrigins', () => {
  beforeEach(() => forkOrigins.clear());

  it('takes a record once: the second take finds none', () => {
    forkOrigins.put('new-1', at(1));
    expect(forkOrigins.take('new-1')).toEqual(at(1));
    expect(forkOrigins.take('new-1')).toBeUndefined();
    expect(forkOrigins.size()).toBe(0);
  });

  it('the latest record for a session id wins', () => {
    forkOrigins.put('new-1', at(1));
    forkOrigins.put('new-1', at(2));
    expect(forkOrigins.size()).toBe(1);
    expect(forkOrigins.take('new-1')).toEqual(at(2));
  });

  it('keeps a bounded number of records, the oldest going first', () => {
    for (let i = 0; i < 100; i++) forkOrigins.put(`new-${i}`, at(i));
    expect(forkOrigins.size()).toBeLessThanOrEqual(32);
    expect(forkOrigins.take('new-0')).toBeUndefined();
    expect(forkOrigins.take('new-99')).toEqual(at(99));
  });
});
