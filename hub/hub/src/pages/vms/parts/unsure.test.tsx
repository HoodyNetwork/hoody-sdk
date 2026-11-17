// Vitest: the "which VM holds this name" fact a VM's screen states for its tabs (parts/unsure.ts).
import { act, render } from '@testing-library/react';
import { StrictMode, Suspense, startTransition, useLayoutEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { isVmUnsure, useMarkVmUnsure, useVmUnsure } from './unsure';

/** A tab: what it would read at the earliest moment any of its code runs after a render (its own layout effect, which
 *  runs before its parent's effects), and what it renders. */
function Tab({ name, seen }: { name: string; seen: boolean[] }) {
  const off = useVmUnsure(name);
  useLayoutEffect(() => { seen.push(isVmUnsure(name)); });
  return <button disabled={off}>save</button>;
}
function Screen({ computer, name, unsure, seen }: { computer: string; name: string; unsure: boolean; seen: boolean[] }) {
  useMarkVmUnsure(computer, name, unsure);
  return <Tab name={name} seen={seen} />;
}

describe('the unsure fact', () => {
  it('is in place before any effect of the render that made the screen unsure: a send in that tick is refused', () => {
    const seen: boolean[] = [];
    const r = render(<Screen computer="c1" name="web-1" unsure={false} seen={seen} />);
    expect(seen).toEqual([false]);
    r.rerender(<Screen computer="c1" name="web-1" unsure seen={seen} />);
    // The child's layout effect of that very commit ran before the screen's own effects: the fact was already there
    // (the child renders once more when it hears of it, and reads it again).
    expect(seen[1]).toBe(true);
    expect(seen.slice(1).every(Boolean)).toBe(true);
    expect((r.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    r.rerender(<Screen computer="c1" name="web-1" unsure={false} seen={seen} />);
    expect(isVmUnsure('web-1')).toBe(false);
    expect((r.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    r.unmount();
  });

  it('is kept per computer and name: one computer\'s screen never clears another\'s, and another name is untouched', () => {
    const a = render(<Screen computer="c1" name="web-1" unsure seen={[]} />);
    const b = render(<Screen computer="c2" name="web-1" unsure={false} seen={[]} />);
    expect(isVmUnsure('web-1')).toBe(true);
    expect(isVmUnsure('db-1')).toBe(false);
    b.unmount();
    expect(isVmUnsure('web-1')).toBe(true);
    a.unmount();
    expect(isVmUnsure('web-1')).toBe(false);
  });

  it('goes with the screen', () => {
    const r = render(<Screen computer="c1" name="web-1" unsure seen={[]} />);
    r.unmount();
    expect(isVmUnsure('web-1')).toBe(false);
  });

  it('stays stated under StrictMode, whose second run of the effects must not clear it', () => {
    const r = render(<StrictMode><Screen computer="c1" name="web-1" unsure seen={[]} /></StrictMode>);
    expect(isVmUnsure('web-1')).toBe(true);
    r.unmount();
    expect(isVmUnsure('web-1')).toBe(false);
  });

  it('is never left behind by a render that was not put on screen', async () => {
    const never = new Promise<never>(() => undefined);
    function Waits(): never { throw never; }
    const r = render(<Suspense fallback={null}><Screen computer="c1" name="web-1" unsure seen={[]} /><Waits /></Suspense>);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
    expect(isVmUnsure('web-1')).toBe(false);
    r.unmount();
    expect(isVmUnsure('web-1')).toBe(false);
  });

  it('is not cleared by a "sure" render that suspended and was never shown', async () => {
    const never = new Promise<never>(() => undefined);
    function Maybe({ wait }: { wait: boolean }) { if (wait) throw never; return null; }
    const tree = (unsure: boolean, wait: boolean) => (
      <Suspense fallback={null}><Screen computer="c1" name="web-1" unsure={unsure} seen={[]} /><Maybe wait={wait} /></Suspense>
    );
    const r = render(tree(true, false));
    expect(isVmUnsure('web-1')).toBe(true);
    // The update waits in a transition: the unsure screen stays on screen, so the fact stays.
    await act(async () => { startTransition(() => { r.rerender(tree(false, true)); }); await new Promise((ok) => setTimeout(ok, 20)); });
    expect(isVmUnsure('web-1')).toBe(true);
    r.unmount();
    expect(isVmUnsure('web-1')).toBe(false);
  });

  it('belongs to the screen that stated it: another screen of the same computer and name going or turning sure leaves it', () => {
    const a = render(<Screen computer="c1" name="web-1" unsure seen={[]} />);
    const b = render(<Screen computer="c1" name="web-1" unsure seen={[]} />);
    b.rerender(<Screen computer="c1" name="web-1" unsure={false} seen={[]} />);
    expect(isVmUnsure('web-1')).toBe(true);
    b.unmount();
    expect(isVmUnsure('web-1')).toBe(true);
    a.unmount();
    expect(isVmUnsure('web-1')).toBe(false);
  });
});
