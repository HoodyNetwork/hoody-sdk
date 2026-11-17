// Vitest, mounted on core's real change source: the Recently deleted drawer stays mounted when the shell switches computer (a
// switch is no remount), so its banner and the holds it shows belong to the computers it lists. A warned close on computer B
// frees nothing of A's restore hold; an answer that lands after the switch is not lost, and A's banner returns with A.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';
import { useRestore } from './data';
import { DeletedDrawer } from './parts/DeletedDrawer';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const A = TARGET;
const B = { ...TARGET, container: { id: 'c2', server_name: 'sv1' } };
const comp = (id: string, handle: string): CompScripts => ({
  id, name: handle, handle, state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: null, agent: {} as never,
  rows: [], summary: {}, instances: {}, aliases: [], deleted: [{ path: 'default/1/a.ts', version: 1, retainedUntil: '2026-12-01T00:00:00Z' }],
});
const CA = comp('c1', 'atlas.1111');
const CB = comp('c2', 'borealis.2222');
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const heldOn = (rows: ReadonlyArray<{ target: { container: { id: string } } | null }>) => rows.map((r) => r.target?.container.id ?? null).sort();

let probe: ReturnType<typeof useRestore> | undefined;
function Probe() { probe = useRestore(); return null; }
function Mount({ comps, open = true }: { comps: CompScripts[]; open?: boolean }) {
  return (<><Probe /><DeletedDrawer isOpen={open} comps={comps} onClose={() => undefined} onRestored={() => undefined} /></>);
}

function setup(reply: () => Promise<{ status: number; body?: unknown }> | { status: number; body?: unknown } = () => ({ status: 502, body: {} })) {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => reply());
  setTarget(A);
  return render(<Mount comps={[CA]} />, { wrapper: CoreQueryProvider });
}
const press = async (name: string) => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); }); };
const switchTo = async (view: ReturnType<typeof setup>, t: typeof A, c: CompScripts) => {
  setTarget(t);
  view.rerender(<Mount comps={[c]} />);
  await act(flush);
};
const warnedClose = async () => {
  await press(strings['force.label']);
  await press(strings['force.confirm']);
};

describe('the Recently deleted drawer across a computer switch', () => {
  it("a warned close after the switch to B frees nothing of A's restore hold, and B's drawer shows no banner of A's", async () => {
    const view = setup();
    await press(strings['versions.restore']);
    expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy();
    expect(heldOn(probe!.held())).toEqual(['c1']);
    await press(strings['outcome.check']); // the read-back cannot prove it (502): unknown, the warned close is offered
    expect(screen.queryByText(strings['force.label'])).toBeTruthy();
    await switchTo(view, B, CB);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
    expect(screen.queryByText(strings['force.label'])).toBeNull();
    expect(heldOn(probe!.held())).toEqual(['c1']);
    // Back on A the banner returns from held(), and its warned close frees A's hold.
    await switchTo(view, A, CA);
    expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy();
    await press(strings['outcome.check']);
    await warnedClose();
    expect(probe!.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
  });

  it("a restore on A whose answer lands after the switch to B is not lost: back on A the banner shows and its close frees A's hold", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const view = setup(async () => { await gate; return { status: 502, body: {} }; });
    await press(strings['versions.restore']);
    await switchTo(view, B, CB);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
    await act(async () => { release!(); await flush(); });
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
    expect(heldOn(probe!.held())).toEqual(['c1']);
    await switchTo(view, A, CA);
    expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy();
    await press(strings['outcome.check']);
    await warnedClose();
    expect(probe!.held()).toEqual([]);
  });

  it("control: the warned close of the computer that was never left frees its own shown hold", async () => {
    setup();
    await press(strings['versions.restore']);
    expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy();
    await press(strings['outcome.check']);
    await warnedClose();
    expect(probe!.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
  });
});
