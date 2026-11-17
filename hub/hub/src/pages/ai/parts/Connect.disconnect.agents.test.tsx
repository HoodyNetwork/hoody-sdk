// The disconnect dialog lists, as "Agents with their own model on this account", only agents whose own model is on the
// account being disconnected: an agent pinned to another provider's model keeps working and is not named.
import { cleanup, render, screen } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import type { Account } from '../logic';
import strings from '../strings.en.json';
import { DisconnectDialog } from './Connect';
import { AiProvider, type AiCtx } from './ctx';

const KEYACC: Account = { id: 'anthropic', prefix: 'anthropic', label: 'Anthropic', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready' };
const defaults = (others: Array<{ agent: string; model: string }>) => ({
  helper: { agent: 'helper', model: 'openai/gpt-x', effective: 'openai/gpt-x' },
  bots: { model: 'openai/gpt-x', effective: 'openai/gpt-x' },
  others,
});

function draw(others: Array<{ agent: string; model: string }>) {
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } },
    realm: null, defaults: defaults(others), models: [], bots: [], accounts: [KEYACC], bundle: { at: 1 },
  };
  const api = {} as Api;
  const c = { m, api, env: {}, reload: vi.fn(), connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(<AiProvider value={c}><DisconnectDialog account={KEYACC} onClose={vi.fn()} /></AiProvider>);
}
const line = (names: string) => strings['dis.agents'].replace('{{names}}', names);

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } });
});
afterEach(() => {
  cleanup();
  setTarget(null);
  resetAttempts();
});

describe('disconnect: agents on this account', () => {
  it('names only agents whose own model is on this account', async () => {
    draw([{ agent: 'coder', model: 'anthropic/claude-x' }, { agent: 'writer', model: 'openai/gpt-y' }]);
    const d = await screen.findByRole('alertdialog');
    expect(d).toHaveTextContent(line('coder'));
    expect(d.textContent).not.toContain('writer');
  });

  it('no line when every such agent is on another account', async () => {
    draw([{ agent: 'writer', model: 'openai/gpt-y' }]);
    const d = await screen.findByRole('alertdialog');
    expect(d.textContent).not.toContain('writer');
    expect(d.textContent).not.toContain(strings['dis.agents'].split('{{')[0]);
  });
});
