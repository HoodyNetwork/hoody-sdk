// C9: the warned Dismiss question keeps the Dismiss the band had when it was opened, and the
// runner's Dismiss frees the hold of the render it was made in, never a later one of the same change.
import { CoreQueryProvider, fixtureWorld, heldChanges } from '@core';
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, renderPage, screen, userEvent } from '@app/testing';
import { subjectOf, useRename } from './data';
import { Held } from './parts/Held';
import { useRunner } from './parts/runner';
import strings from './strings.en.json';
import page from './page';

describe('the Dismiss question and the runner bind the shown hold', () => {
  it('Held: confirming calls the Dismiss the band had when the question opened, not the one it has now', async () => {
    const first = vi.fn();
    const later = vi.fn();
    const ui = (f: () => unknown) => <Held kind="run" name="atlas" onCheck={() => undefined} onDismiss={f} />;
    const r = render(ui(first));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }));
    const go = await screen.findByRole('button', { name: strings['held.dismissGo'] });
    r.rerender(ui(later));
    await userEvent.click(go);
    expect(first).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
  });

  it('runner: a Dismiss made in the render that showed H1 frees nothing once H2 has taken its place', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar')!;
    const vars = { id: cedar.id, name: 'cedar-2' };
    const hook = renderHook(
      () => {
        const m = useRename();
        return { m, r: useRunner(m, { lock: 'computer.rename', pick: (i) => i.computer === cedar.id, vars: (i) => ({ id: String(i.computer ?? ''), name: String(i.name ?? '') }) }) };
      },
      { wrapper: CoreQueryProvider },
    );
    await act(async () => { await hook.result.current.m.mutateAsync(vars); });
    await act(async () => { await Promise.resolve(); });
    const h1 = heldChanges('computer.rename')[0]?.hold;
    expect(h1).toBeDefined();
    const stale = hook.result.current.r.dismiss;
    await act(async () => { await hook.result.current.m.complete(vars, h1!); await hook.result.current.m.mutateAsync(vars); });
    const h2 = heldChanges('computer.rename')[0]?.hold;
    expect(h2).toBeDefined();
    expect(h2).not.toBe(h1);
    await act(async () => { await stale(); });
    expect(heldChanges('computer.rename').map((h) => h.hold)).toEqual([h2]);
    void subjectOf;
  });
});
