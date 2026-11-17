// usePendingToast in a page kept loaded (useKeepPage): hiding the page runs the same cleanup as
// leaving it, so the unknown outcome moves to the sticky toast while the person is elsewhere; when the same place shows
// again with its outcome inline, or settled, the toast it opened closes. A place drawn without its outcome line
// (`inline` false) keeps the toast: the unknown is never left nowhere. settled() retires the outcome before its place
// goes. Nothing is checked or sent by the move.
// useHiddenNow tells a hide from an unload in a cleanup.
import { act, render, renderHook } from '@testing-library/react';
import { Activity } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { PageNavHoldContext, useHiddenNow, type PageNavHold } from '../nav';
import type { OutcomeLike } from '../outcome';
import { usePendingToast } from './Outcome';

const log = vi.hoisted(() => ({ shown: [] as string[], closed: [] as string[] }));
vi.mock('../states/Toast', () => ({
  showToast: () => {
    const id = `t${log.shown.length + 1}`;
    log.shown.push(id);
    return id;
  },
  closeToast: (id: string) => {
    log.closed.push(id);
  },
}));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  log.shown.length = 0;
  log.closed.length = 0;
});

const PENDING: OutcomeLike = { kind: 'pending' };
/** A place that draws its outcome line only when `inline` (a caller with a branch that has no line for it). */
function Watch({ check, outcome = PENDING, inline = true }: { check: () => unknown; outcome?: OutcomeLike | null; inline?: boolean }) {
  usePendingToast(outcome, check, true, null, inline);
  return inline && outcome ? <p>{outcome.kind}</p> : null;
}
const open = () => log.shown.filter((id) => !log.closed.includes(id));
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

describe('usePendingToast in a page kept loaded', () => {
  it('hidden: the toast shows; shown again: that toast closes; hidden again: a new one shows', async () => {
    const check = vi.fn();
    const v = render(<Activity mode="visible"><Watch check={check} /></Activity>);
    await tick();
    expect(log.shown).toEqual([]);
    v.rerender(<Activity mode="hidden"><Watch check={check} /></Activity>);
    await tick();
    expect(log.shown).toEqual(['t1']);
    v.rerender(<Activity mode="visible"><Watch check={check} /></Activity>);
    await tick();
    expect(log.closed).toEqual(['t1']);
    v.rerender(<Activity mode="hidden"><Watch check={check} /></Activity>);
    await tick();
    expect(log.shown).toEqual(['t1', 't2']);
    expect(check).not.toHaveBeenCalled();
  });

  it('shown again without its outcome line: the toast stays (the only place the unknown is); drawn with it: it closes', async () => {
    const check = vi.fn();
    const v = render(<Activity mode="visible"><Watch check={check} /></Activity>);
    await tick();
    v.rerender(<Activity mode="hidden"><Watch check={check} /></Activity>);
    await tick();
    v.rerender(<Activity mode="visible"><Watch check={check} inline={false} /></Activity>);
    await tick();
    expect(open()).toEqual(['t1']);
    v.rerender(<Activity mode="visible"><Watch check={check} /></Activity>);
    await tick();
    expect(open()).toEqual([]);
    expect(check).not.toHaveBeenCalled();
  });

  it('settled while hidden (a result that lands on return): the toast closes, line or no line', async () => {
    const v = render(<Activity mode="visible"><Watch check={() => undefined} /></Activity>);
    await tick();
    v.rerender(<Activity mode="hidden"><Watch check={() => undefined} /></Activity>);
    await tick();
    v.rerender(<Activity mode="visible"><Watch check={() => undefined} outcome={{ kind: 'failed' }} inline={false} /></Activity>);
    await tick();
    expect(log.shown).toEqual(['t1']);
    expect(open()).toEqual([]);
  });

  it('hidden again while its toast is still open: that toast gives way, one toast at a time', async () => {
    const v = render(<Activity mode="visible"><Watch check={() => undefined} inline={false} /></Activity>);
    await tick();
    for (let i = 0; i < 3; i++) {
      v.rerender(<Activity mode="hidden"><Watch check={() => undefined} inline={false} /></Activity>);
      await tick();
      v.rerender(<Activity mode="visible"><Watch check={() => undefined} inline={false} /></Activity>);
      await tick();
    }
    expect(log.shown).toEqual(['t1', 't2', 't3']);
    expect(open()).toEqual(['t3']);
  });

  it('settled() before the place goes (a pick that closes it): no toast, through a hide and return too; a new unknown opens one again', async () => {
    let settle: () => void = () => undefined;
    function Place({ outcome }: { outcome: OutcomeLike }) {
      settle = usePendingToast(outcome, () => undefined);
      return <p>{outcome.kind}</p>;
    }
    const first: OutcomeLike = { kind: 'pending' };
    const v = render(<Activity mode="visible"><Place outcome={first} /></Activity>);
    await tick();
    v.rerender(<Activity mode="hidden"><Place outcome={first} /></Activity>);
    await tick();
    expect(open()).toEqual(['t1']);
    act(() => settle());
    expect(open()).toEqual([]);
    v.rerender(<Activity mode="visible"><Place outcome={first} /></Activity>);
    await tick();
    v.rerender(<Activity mode="hidden"><Place outcome={first} /></Activity>);
    await tick();
    expect(log.shown).toEqual(['t1']);
    v.rerender(<Activity mode="visible"><Place outcome={{ kind: 'pending' }} /></Activity>);
    await tick();
    v.unmount();
    await tick();
    expect(log.shown).toEqual(['t1', 't2']);
  });

  it('settled() between the hide and its toast (the tick it waits): no toast opens', async () => {
    let settle: () => void = () => undefined;
    function Place({ outcome }: { outcome: OutcomeLike }) {
      settle = usePendingToast(outcome, () => undefined);
      return <p>{outcome.kind}</p>;
    }
    const v = render(<Activity mode="visible"><Place outcome={PENDING} /></Activity>);
    await tick();
    v.rerender(<Activity mode="hidden"><Place outcome={PENDING} /></Activity>);
    act(() => settle());
    await tick();
    expect(log.shown).toEqual([]);
  });

  it('unmounted (not kept): the toast stays', async () => {
    const v = render(<Watch check={() => undefined} />);
    v.unmount();
    await tick();
    expect(log.shown).toEqual(['t1']);
    expect(log.closed).toEqual([]);
  });
});

describe('useHiddenNow', () => {
  it('reads the shell\'s hold at the time it is read; outside the shell, false', () => {
    let hidden = false;
    const hold: PageNavHold = { location: null, owns: () => true, hidden: () => hidden };
    const h = renderHook(() => useHiddenNow(), { wrapper: ({ children }) => <PageNavHoldContext value={hold}>{children}</PageNavHoldContext> });
    expect(h.result.current()).toBe(false);
    hidden = true;
    expect(h.result.current()).toBe(true);
    expect(renderHook(() => useHiddenNow()).result.current()).toBe(false);
  });
});
