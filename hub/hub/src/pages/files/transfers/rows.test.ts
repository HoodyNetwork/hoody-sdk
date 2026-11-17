// Vitest: Transfers' row rules. An unknown outcome is counted and toned as unknown, never as failed;
// the row store draws again only when what a row shows changes, and a press runs the handler put last (never a
// disabled one).
import { describe, expect, it, vi } from 'vitest';
import { GLANCE_OF, RowStore, STATE_TONE, orderOf, type TransferRow } from './rows';

const row = (over: Partial<TransferRow> = {}): TransferRow => ({
  key: 'k', order: orderOf(0, 2, 0), computer: 'atlas', what: 'download', item: 'big.iso', to: 'tmp', progress: null, state: 'running', detail: '', actions: [], ...over,
});

describe('Transfers rows', () => {
  it('an unknown outcome counts as unknown, never as did not finish, and is not drawn as a failure', () => {
    expect(GLANCE_OF.unknown).toBe('unknown');
    expect(STATE_TONE.unknown).toBe('warn');
    expect(Object.entries(GLANCE_OF).filter(([, g]) => g === 'failed').map(([s]) => s).sort()).toEqual(['failed', 'missing', 'notSent']);
    expect(GLANCE_OF.running).toBe('moving');
    expect(GLANCE_OF.elsewhere).toBe('moving');
  });

  it('rows read in order: computer, then group, then place', () => {
    const s = new RowStore();
    s.put('b', row({ key: 'b', order: orderOf(1, 0, 0) }));
    s.put('a', row({ key: 'a', order: orderOf(0, 4, 0) }));
    s.put('c', row({ key: 'c', order: orderOf(0, 2, 10) }));
    expect(s.snapshot().map((r) => r.key)).toEqual(['c', 'a', 'b']);
  });

  it('a new handler alone draws nothing again; what a row shows does; a press runs the last handler', () => {
    const s = new RowStore();
    const drawn = vi.fn();
    s.subscribe(drawn);
    const first = vi.fn();
    const last = vi.fn();
    s.put('k', row({ actions: [{ id: 'cancel', label: 'Cancel big.iso', onAction: first }] }));
    expect(drawn).toHaveBeenCalledTimes(1);
    s.put('k', row({ actions: [{ id: 'cancel', label: 'Cancel big.iso', onAction: last }] }));
    expect(drawn).toHaveBeenCalledTimes(1);
    const shown = s.actionsOf(s.snapshot()[0]!);
    const a = shown[0];
    if (!a || a === '-') throw new Error('no action');
    a.onAction?.();
    expect(last).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    s.put('k', row({ state: 'cancelled', actions: [] }));
    expect(drawn).toHaveBeenCalledTimes(2);
    s.put('k', null);
    expect(s.snapshot()).toEqual([]);
  });

  it('a press never runs an action put disabled since it was drawn', () => {
    const s = new RowStore();
    const go = vi.fn();
    s.put('k', row({ actions: [{ id: 'cancel', label: 'Cancel big.iso', onAction: go }] }));
    const a = s.actionsOf(s.snapshot()[0]!)[0];
    s.put('k', row({ actions: [{ id: 'cancel', label: 'Cancel big.iso', onAction: go, isDisabled: true }] }));
    if (!a || a === '-') throw new Error('no action');
    a.onAction?.();
    expect(go).not.toHaveBeenCalled();
  });
});
