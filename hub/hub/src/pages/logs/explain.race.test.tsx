// Vitest: Ask is judged on the evidence the
// drawer shows at the moment of the press, never on an older copy. The race: newer evidence has committed (the chooser
// shows it) but the drawer's passive effect that hands it to the flow has not run yet, and Ask is pressed in that window.
// The test commits the newer catalogue from a prop (useModelCatalogue overridden through the kit seam) and presses Ask in
// the parent's layout effect, which runs after the drawer's commit and before its passive effects.
import { act, render, screen } from '@app/testing';
import { useLayoutEffect, useMemo } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providers } from '@core';
import { setTarget, type Target } from '@core/ctx';
import { boot } from '@core/test/env';
import type { CatalogueReader } from '@core/providers/read';
import type { Settled } from '@core/providers/types';
import { useModelCatalogue, type CatalogueReads, type ModelCatalogue } from '@kit';
import { createExplainFlow } from './explain-flow';
import type { Call } from './explain';
import { ExplainDrawer } from './parts/ExplainDrawer';
import strings from './strings.en.json';

const seam = vi.hoisted(() => ({ cat: null as unknown }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  const real = kit.useModelCatalogue as (...a: unknown[]) => unknown;
  // The real hook always runs (hook order); a catalogue set by the test replaces what it returns.
  return { ...kit, useModelCatalogue: (...a: unknown[]) => { const r = real(...a); return seam.cat ?? r; } };
});

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const FREE = providers.FREE;
const GPT = 'openai/gpt-5';

/** The computer's agent: OpenAI ready; with `noCap`, OpenAI no longer takes an output cap, so Explain refuses its models. */
function reads(noCap: boolean): () => CatalogueReads {
  const st = { state: 'ready', via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: !noCap, shares_with: [] };
  const providersBody = { providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { ...st, output_cap: true } },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st },
  ] };
  const modelsBody = { models: [{ spec: FREE, display_name: 'Hoody Free' }, { spec: GPT, display_name: 'GPT-5' }] };
  const readyBody = { models: [{ spec: FREE }, { spec: GPT }] };
  return () => ({
    catalogue: {
      providers: () => Promise.resolve(ok(providersBody)),
      models: (q: { ready?: boolean } = {}) => Promise.resolve(ok(q.ready ? readyBody : modelsBody)),
      auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
    } as unknown as CatalogueReader,
  });
}

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
}

/** A settled catalogue for one agent, from the real hook. */
async function catalogueOf(noCap: boolean): Promise<ModelCatalogue> {
  let got: ModelCatalogue | null = null;
  function Probe() {
    const r = useMemo(() => reads(noCap), []);
    got = useModelCatalogue(A, { wanted: [GPT], reads: r });
    return null;
  }
  const { unmount } = render(<Probe />);
  await flush();
  unmount();
  expect(got!.evidence?.catalogue.state).toBe('ok');
  return got!;
}

function page() {
  const sent: string[] = [];
  const call: Call = async (_m, path) => {
    sent.push(path);
    if (path === '/models') return { items: [
      { spec: FREE, display_name: 'Hoody Free', source: 'provider', cost_in: 0, cost_out: 0 },
      { spec: GPT, display_name: 'GPT-5', source: 'provider', cost_in: 1.25, cost_out: 10 },
    ] };
    if (path === '/agents') return { items: [{ name: 'general', is_configured_default: true }] };
    return { status: 'ok', model: GPT, text: 'It restarted.', stop_reason: 'end_turn' };
  };
  let saved: string | null = GPT;
  return { call, asks: () => sent.filter((p) => p === '/completions'), saved: { get: () => saved, set: (s: string) => { saved = s; return true; } } };
}

function Host({ p, cat, pressAsk }: { p: ReturnType<typeof page>; cat: ModelCatalogue; pressAsk: boolean }) {
  seam.cat = cat;
  const flow = useMemo(() => {
    const f = createExplainFlow({ subject: 'Files GET 500', entries: [{ message: 'boom' }], call: p.call, target: { container: { realm_ids: [] } }, realm: null, saved: p.saved, name: 'atlas' });
    f.start();
    return f;
  }, [p]);
  // Runs after the drawer's commit and before its passive effects: the press lands in the window.
  useLayoutEffect(() => {
    if (pressAsk) (screen.getByRole('button', { name: strings['explain.ask'] }) as HTMLButtonElement).click();
  }, [pressAsk]);
  return <ExplainDrawer t={t} flow={flow} onClose={() => undefined} target={A} computer={{ id: 'c1', name: 'atlas', row: { id: 'c1', project_id: 'p1', server_name: 'sv1' } }} />;
}

beforeEach(() => {
  boot();
  setTarget(A);
  seam.cat = null;
});

describe('Ask judges the snapshot the drawer shows at the press', () => {
  it('evidence that took GPT-5 out of Explain has committed but not reached the flow: Ask sends nothing', async () => {
    const before = await catalogueOf(false);
    const after = await catalogueOf(true);
    expect(providers.judge(null, GPT, after.evidence, after.scope, providers.rulesFor('explain')).ok).toBe(false);
    const p = page();
    const { rerender } = render(<Host p={p} cat={before} pressAsk={false} />);
    await flush();
    expect(screen.getByRole('button', { name: strings['explain.ask'] })).toBeEnabled();
    rerender(<Host p={p} cat={after} pressAsk={true} />);
    await flush();
    expect(p.asks()).toHaveLength(0);
    expect(screen.getByText(strings['explain.choose'])).toBeInTheDocument();
  });

  it('the same press on unchanged evidence sends exactly one request (the window itself is not a refusal)', async () => {
    const before = await catalogueOf(false);
    const p = page();
    const { rerender } = render(<Host p={p} cat={before} pressAsk={false} />);
    await flush();
    rerender(<Host p={p} cat={before} pressAsk={true} />);
    await flush();
    expect(p.asks()).toHaveLength(1);
  });
});
