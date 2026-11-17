// DropPend: pending journal removals per account, per journal identity, as live call numbers.
import { describe, expect, it } from 'vitest';
import { DropPend, jdropKey } from './dropPend';

describe('DropPend', () => {
  it('two drops of one record: the first releasing never lifts the second\'s hiding', () => {
    const d = new DropPend();
    const k = jdropKey('h', 'r', null, 'k1');
    const a = d.registerDrop('A', k);
    const b = d.registerDrop('A', k);
    expect(d.dropPending('A', k)).toBe(true);
    d.releaseDrop('A', k, a);
    expect(d.dropPending('A', k)).toBe(true);
    d.releaseDrop('A', k, b);
    expect(d.dropPending('A', k)).toBe(false);
    expect(d.empty('A')).toBe(true);
  });
  it('accounts are partitioned', () => {
    const d = new DropPend();
    const k = jdropKey('h', 'r', null, 'k1');
    const a = d.registerDrop('A', k);
    expect(d.dropPending('B', k)).toBe(false);
    d.releaseDrop('A', k, a);
  });
  it('the key is the journal identity: handle, realm, session and create key all matter', () => {
    const d = new DropPend();
    d.registerDrop('A', jdropKey('h', 'r', null, 'k1'));
    expect(d.dropPending('A', jdropKey('h2', 'r', null, 'k1'))).toBe(false);
    expect(d.dropPending('A', jdropKey('h', 'r2', null, 'k1'))).toBe(false);
    expect(d.dropPending('A', jdropKey('h', 'r', 's', 'k1'))).toBe(false);
    expect(d.dropPending('A', jdropKey('h', 'r', null, 'k2'))).toBe(false);
    expect(d.dropPending('A', jdropKey('h', 'r', null, 'k1'))).toBe(true);
  });
  it('releasing a number that is not registered changes nothing', () => {
    const d = new DropPend();
    const k = jdropKey('h', 'r', null, 'k1');
    d.registerDrop('A', k);
    d.releaseDrop('A', k, 999);
    d.releaseDrop('B', k, 1);
    expect(d.dropPending('A', k)).toBe(true);
  });
});
