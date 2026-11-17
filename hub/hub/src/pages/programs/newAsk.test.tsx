// The ?new=1 ask is taken out of the URL at once and opens New program
// only on the part (account, realm, computer) and the Running tab it landed on; held while the list is not shown yet,
// dropped for good by any change of part or tab; StrictMode's double effects neither lose nor duplicate it.
import { renderHook, act } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useNewProgramAsk, type NewAskInput } from './newAsk';

const A = 'acc|realm1|p/atlas';
const B = 'acc|realm1|p/bravo';

function setup(first: Partial<NewAskInput>, strict = false) {
  const clearParam = vi.fn();
  const init: NewAskInput = { param: '1', clearParam, part: A, hasTarget: true, tab: undefined, ...first };
  const wrapper = strict ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> : undefined;
  const h = renderHook((p: NewAskInput) => useNewProgramAsk(p), { initialProps: init, ...(wrapper ? { wrapper } : {}) });
  const set = (p: Partial<NewAskInput>) => h.rerender({ ...init, ...p });
  return { h, set, clearParam, init };
}

describe('programs: the New program ask (?new=1)', () => {
  it('drops the key from the URL and asks on the landing part', () => {
    const { h, clearParam } = setup({});
    expect(clearParam).toHaveBeenCalled();
    expect(h.result.current.asked).toBe(true);
  });

  it('is held while the form is not shown yet (deferred), then opens once and never again', () => {
    const { h, set } = setup({});
    // The key left the URL; the list is still loading or failed: nothing takes the ask, it stays for this part.
    set({ param: undefined });
    expect(h.result.current.asked).toBe(true);
    act(() => h.result.current.take());
    expect(h.result.current.asked).toBe(false);
    set({ param: undefined });
    expect(h.result.current.asked).toBe(false);
  });

  it('a deferred ask is dropped when another computer becomes current: it never opens there, nor on coming back', () => {
    const { h, set } = setup({});
    set({ param: undefined, part: B });
    expect(h.result.current.asked).toBe(false);
    set({ param: undefined, part: A });
    expect(h.result.current.asked).toBe(false);
  });

  it('a deferred ask is dropped by the Apps tab: the Running tab afterwards opens nothing', () => {
    const { h, set } = setup({});
    set({ param: undefined, tab: 'apps' });
    expect(h.result.current.asked).toBe(false);
    set({ param: undefined, tab: undefined });
    expect(h.result.current.asked).toBe(false);
  });

  it('landing with no computer shown, or on the Apps tab, asks for nothing, even once a computer shows', () => {
    const none = setup({ hasTarget: false, part: 'acc|realm1|-' });
    expect(none.h.result.current.asked).toBe(false);
    none.set({ param: undefined, hasTarget: true, part: A });
    expect(none.h.result.current.asked).toBe(false);
    const apps = setup({ tab: 'apps' });
    expect(apps.h.result.current.asked).toBe(false);
    apps.set({ param: undefined, tab: undefined });
    expect(apps.h.result.current.asked).toBe(false);
  });

  it('any other value of the key asks for nothing', () => {
    const { h, clearParam } = setup({ param: 'yes' });
    expect(clearParam).toHaveBeenCalled();
    expect(h.result.current.asked).toBe(false);
  });

  it('StrictMode: asks once on the landing part, and a take holds', () => {
    const { h, set } = setup({}, true);
    expect(h.result.current.asked).toBe(true);
    act(() => h.result.current.take());
    set({ param: undefined });
    expect(h.result.current.asked).toBe(false);
  });
});
