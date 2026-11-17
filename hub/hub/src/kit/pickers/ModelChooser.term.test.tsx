// The model chooser in the terminal, through the presses a person makes: open a provider, open its setup step, close
// it; type a key and save. Each of these moved the focus by asking `document` (the step's heading, the control the
// step opened from, requestAnimationFrame) and ended the whole Hub with TERM_GLOBAL; now they go through
// pickerFocus.web.ts. After every step the focus is where the web puts it
// (the view's heading, the chip or button that opened it), on something drawn, never nowhere.
import { providers } from '@core';
import { startFixtureMode } from '@core/transport';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { useMemo, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { beginTermSession } from '../../term/env/session';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, focusedNode, getAllByRole, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { ModelChooser } from './ModelChooser';
import { evidence7k } from './fixtures/evidence7k';
import type { AttemptView, ModelCatalogue } from './useModelCatalogue';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const none = () => Promise.resolve<Settled>({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } });
let keys = 0;
const api = (): providers.ProvidersApi => ({
  version: none, providers: none, provider: none, auth: none, catalogue: none as never, oauthPoll: none, pkcePoll: none, pkceStart: none, pkceCode: none,
  pkceCancel: none, keyPut: () => { keys += 1; return Promise.resolve(ok({ check: 'valid' })); }, keyDelete: none, authTest: none, authDefault: none,
  oauthStart: none, oauthCancel: none, signOut: none,
});

/** A catalogue that holds the fixture evidence and settles a setup attempt as "still needs setup" (no read is made). */
function Host() {
  const evidence = useMemo(() => evidence7k('freeOnly'), []);
  const [setup, setSetup] = useState<AttemptView | null>(null);
  const cat: ModelCatalogue = {
    evidence, scope: evidence.scope, reading: false, failedAt: null, retrying: false, retry: () => undefined, pressRetry: () => undefined, setup,
    attempt: (a) => {
      setSetup({ id: 1, provider: a.provider, spec: a.spec ?? null, intent: a.intent, minSeq: 1, result: { kind: 'still_needs' } });
      return { id: 1, minSeq: 1, alive: () => true, end: () => setSetup(null) };
    },
  };
  const [value, setValue] = useState('');
  return (
    <ModelChooser label="Model" catalogue={cat} computer={{ id: 'c1', name: 'atlas', row: { id: 'c1', project_id: 'p1', server_name: 'sv1' } }}
      rules={providers.rulesFor('bot')} purpose="bot" api={api} go={() => undefined} value={value}
      onChoose={(c) => { if (c.kind === 'model') setValue(c.spec); }} />
  );
}

let t: TestTerm | null = null;
// The fixture session (no network): the chooser binds its setup step to the signed-in context.
beforeEach(() => { keys = 0; startFixtureMode(); });
afterEach(() => { t?.renderer.destroy(); t = null; });

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const wait = async (until: (f: string) => boolean) => {
  let f = await t!.settle();
  for (let i = 0; i < 100 && !until(f); i++) { await new Promise((r) => setTimeout(r, 20)); f = await t!.settle(); }
  return f;
};
/** A press, then long enough for a deferred focus move (pickerFocus tries at 0, 40 and 120 ms). */
const press = async (name: string | RegExp) => {
  act(getAllByRole(tree(), 'button', { name })[0]!, 'press');
  await t!.settle();
  await new Promise((r) => setTimeout(r, 200));
  return t!.settle();
};
/** The focused control, which must be one that is drawn. */
const focused = () => {
  const n = focusedNode(tree());
  expect(n).not.toBeNull();
  expect(n!.box[2]).toBeGreaterThan(0);
  expect(n!.box[3]).toBeGreaterThan(0);
  return `${n!.role} ${n!.name}`;
};
const draw = async () => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Host /></PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 80 });
  const f = await wait((x) => x.includes('Set up a provider'));
  expect(f).toContain('Ready to use');
};

test('open a provider, then Back: the ready models again, with the focus on a control', async () => {
  await draw();
  let f = await press('Anthropic');
  expect(f).toContain('Back to ready models');
  expect(focused()).toBe('heading Anthropic');
  f = await press(/Back to ready models/);
  expect(f).toContain('Ready to use');
  expect(f).not.toContain('Back to ready models');
  // As on the web: back on the chip that opened the provider.
  expect(focused()).toBe('button Anthropic');
});

test('the setup step opens and closes with the focus on a control', async () => {
  await draw();
  await press('Anthropic');
  let f = await press('Set up Anthropic');
  expect(f).toContain('Anthropic API key');
  expect(focused()).toBe('heading Set up Anthropic');
  f = await press(/Back to models/);
  expect(f).not.toContain('Anthropic API key');
  expect(f).toContain('Set up Anthropic');
  // The step closed: back on the button that opened it.
  expect(focused()).toBe('button Set up Anthropic');
});

test('a key is typed and saved: the step answers and the focus stays on a control', async () => {
  // A mount's own stores and locks, as the terminal Hub gives every mount: the save is held there before the key leaves
  // (with nowhere to hold it, no key is sent).
  const mount = beginTermSession();
  try {
    startFixtureMode();
    await draw();
    await press('Anthropic');
    await press('Set up Anthropic');
    const field = queryAllByRole(tree(), 'textbox').find((n) => /Anthropic API key/.test(n.name))!;
    expect(field).toBeDefined();
    act(field, 'type', 'fixture-key-1');
    await t!.settle();
    act(getByRole(tree(), 'button', { name: 'Check and save' }), 'press');
    const f = await wait((x) => /Key saved|still needs setup/.test(x));
    expect(keys).toBe(1);
    expect(f).toMatch(/Key saved|still needs setup/);
    await new Promise((r) => setTimeout(r, 200));
    await t!.settle();
    // The step's answer is read from its heading.
    expect(focused()).toBe('heading Set up Anthropic');
  } finally {
    t?.renderer.destroy();
    t = null;
    mount.end();
  }
});
