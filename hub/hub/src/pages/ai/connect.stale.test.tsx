// Model picker: Connect lists providers from the page's catalogue bundle.
// After a failed background refresh the bundle keeps its last answer; the directory stays drawn and says how old it is
// ("Checked {age} ago. Couldn't check again.") with Try again, which reads the page again.
import { render, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { providers } from '@core';
import { setTarget, type Target } from '@core/ctx';
import { readCatalogue, type CatalogueReader } from '@core/providers/read';
import { boot } from '@core/test/env';
import chooser from '@kit/pickers/ModelChooser.strings.en.json';
import type { Api } from './api';
import { ConnectDrawer } from './parts/Connect';
import { AiProvider, type AiCtx } from './parts/ctx';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const st = (state: string, via = 'stored_key') => ({ state, via, methods: via === 'included' ? [] : ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });

async function snapshot(): Promise<providers.Snapshot> {
  const reader = {
    providers: () => Promise.resolve(ok({ providers: [
      { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready', 'included') },
      { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready') },
      { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
    ] })),
    models: (q: { ready?: boolean } = {}) =>
      Promise.resolve(ok(q.ready ? { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }] } : { models: [
        { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
        { spec: 'openai/gpt-5', display_name: 'GPT-5' },
        { spec: 'anthropic/claude-sonnet', display_name: 'Claude Sonnet' },
      ] })),
    auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
  } as unknown as CatalogueReader;
  const p = await readCatalogue(reader);
  if (p.state !== 'ok') throw new Error('no snapshot');
  return p.value;
}

async function mount(bundle: { at: number; refreshFailed: boolean }) {
  const snap = await snapshot();
  const reload = vi.fn();
  const api = new Proxy({} as Api, { get: () => () => Promise.resolve({ ok: false, err: { kind: 'failed', code: '', status: 500, retryAfter: null, details: {} } }) });
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: A, realm: 'global', caps: {}, accounts: [], cat: snap.cat,
    bundle: { snap, at: bundle.at, err: null, refreshFailed: bundle.refreshFailed },
    loads: { catalogue: 'ok' },
  };
  const ctx = { m, api, env: {}, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(
    <AiProvider value={ctx}>
      <ConnectDrawer target={{}} onClose={() => undefined} />
    </AiProvider>,
  );
  return { reload, dialog: await screen.findByRole('dialog') };
}

beforeEach(() => {
  boot();
  setTarget(A);
});

const age = (n: string) => chooser['read.age'].replace('{{age}}', n);

describe('Connect after a failed refresh', () => {
  it('keeps the directory, says how old its answer is, and Try again reads the page again', async () => {
    const { reload, dialog } = await mount({ at: Date.now() - 5 * 60_000, refreshFailed: true });
    expect(within(dialog).getByText(age(chooser['age.min'].replace('{{count}}', '5')))).toBeInTheDocument();
    // The kept answer stays usable: the providers are still listed.
    expect(within(dialog).getByRole('region', { name: chooser['dir.connected'] })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: chooser['read.retry'] }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a fresh answer says nothing about its age', async () => {
    const { dialog } = await mount({ at: Date.now(), refreshFailed: false });
    expect(within(dialog).queryByText(/Couldn't check again/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: chooser['read.retry'] })).toBeNull();
  });

  it('Hoody AI is included: its card says so and offers View, never a setup', async () => {
    const { dialog } = await mount({ at: Date.now(), refreshFailed: false });
    const card = dialog.querySelector<HTMLElement>('[data-provider="hoody-ai"]')!;
    expect(card).toHaveTextContent(chooser['dir.included']);
    expect(card).not.toHaveTextContent(chooser['dir.how.ai']);
    expect(within(card).getByRole('button', { name: chooser['dir.viewFor'].replace('{{provider}}', 'Hoody AI') })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /^Set up/ })).toBeNull();
  });
});
