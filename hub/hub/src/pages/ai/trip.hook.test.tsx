// Vitest, model picker: the AI page's trip reception (parts/useTrip.ts),
// driven input by input: the page's first load, a computer switch that starts the other computer's first load in the
// same render, a switch back before it loaded, a realm change, and StrictMode's second run of the effect.
// The stored-record checks themselves (account, realm, computer, expiry) are core/handoff.test.ts's.
import type { Handoff } from '@core';
import * as core from '@core';
import { renderHook } from '@app/testing';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTrip, type TripInput } from './parts/useTrip';

vi.mock('@core', async (orig) => {
  const real = await orig<typeof core>();
  return { ...real, handoff: { ...real.handoff, receiveHandoff: vi.fn() } };
});

const ID = '0123456789abcdef';
const A = 'c-a', B = 'c-b';
const tripOn = (computer: string) => ({ id: ID, target: { computer, name: computer } }) as unknown as Handoff;
const receive = vi.mocked(core.handoff.receiveHandoff);

function mount(first: Partial<TripInput>, strict = false) {
  receive.mockReset();
  receive.mockImplementation((shown, id) => (id === ID && shown === A ? tripOn(A) : null));
  const drop = vi.fn<(names: string[]) => void>();
  const base: TripInput = { param: ID, firstLoad: false, ctx: `${A}|r1`, shown: A, drop, ...first };
  const wrapper = strict ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> : undefined;
  const h = renderHook((p: TripInput) => useTrip(p), { initialProps: base, wrapper });
  return { ...h, drop, base, set: (over: Partial<TripInput>) => h.rerender({ ...base, ...over }) };
}

describe('the AI page receives a model chooser trip', () => {
  it('takes no trip while the page first loads, then takes it once loaded', () => {
    const h = mount({ firstLoad: true });
    expect(h.result.current).toBeNull();
    expect(receive).not.toHaveBeenCalled();
    expect(h.drop).not.toHaveBeenCalled();
    h.set({ firstLoad: false });
    expect(h.result.current?.id).toBe(ID);
    expect(h.drop).not.toHaveBeenCalled();
  });

  it('a trip that is not valid here: none, and the param goes', () => {
    const h = mount({ shown: B, ctx: `${B}|r1` });
    expect(h.result.current).toBeNull();
    expect(h.drop).toHaveBeenCalledWith(['handoff']);
  });

  it('another computer chosen while it loads ends the trip at once, and switching back before it loaded stays plain', () => {
    const h = mount({});
    expect(h.result.current?.id).toBe(ID);
    // The switch and the other computer's first load come in the same render.
    h.set({ shown: B, firstLoad: true, ctx: `${A}|r1` });
    expect(h.result.current).toBeNull();
    expect(h.drop).toHaveBeenCalledWith(['handoff']);
    // Back on the first computer (the param still read here: the drop's navigation has not landed yet).
    receive.mockClear();
    h.set({ shown: A, firstLoad: false });
    expect(h.result.current).toBeNull();
    expect(receive, 'the ended trip is not taken again').not.toHaveBeenCalled();
    expect(h.drop).toHaveBeenLastCalledWith(['handoff']);
  });

  it('a realm change on the same computer ends the trip too', () => {
    const h = mount({});
    expect(h.result.current?.id).toBe(ID);
    h.set({ ctx: `${A}|r2` });
    expect(h.result.current).toBeNull();
    expect(h.drop).toHaveBeenCalledWith(['handoff']);
  });

  it('a trip taken here stays while the page reads again on the same computer', () => {
    const h = mount({});
    expect(h.result.current?.id).toBe(ID);
    receive.mockClear();
    h.set({ firstLoad: true });
    expect(h.result.current?.id).toBe(ID);
    h.set({ firstLoad: false });
    expect(h.result.current?.id).toBe(ID);
    expect(receive).not.toHaveBeenCalled();
    expect(h.drop).not.toHaveBeenCalled();
  });

  it("StrictMode's second run keeps the trip taken", () => {
    const h = mount({}, true);
    expect(h.result.current?.id).toBe(ID);
    expect(h.drop).not.toHaveBeenCalled();
  });
});
