// A kept instructions edit that holds work arms the "leave this page?" prompt through the host's lifecycle seam
// (core host-env), never `window`: in the terminal there is no tab to close, and a `window` read is a TERM_GLOBAL trap
// (strict globals, scripts/term/test-preload.ts: any trap fails this test). The AI page is where it shows.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { bootFixtureCore, type Target } from '@core';
import { bump } from '@core/ctx';
import { beginTermSession, type TermSession } from '../../../../term/env/session';
import type { InstructionsApi, Settled } from './api';
import { createEditStore } from './edit';
import { editKey, gone, holdsWork, setLossWords, showing } from './held';

const T: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const R = 'f1f1f1f1f1f1f1f1f1f1f1f1';

let session: TermSession | null = null;
beforeEach(() => { session = beginTermSession(); bootFixtureCore({}); setLossWords((n) => `held ${n}`); });
afterEach(() => { bump('signout'); session?.end(); session = null; });

test('a draft kept away from its page holds work, and arming and disarming the prompt reads no browser global', async () => {
  const gets: ((s: Settled) => void)[] = [];
  const api: InstructionsApi = { get: () => new Promise((r) => gets.push(r)), put: () => new Promise(() => {}) };
  const st = createEditStore(api);
  const p = st.load();
  gets[0]!({ ok: true, body: { text: 'Be brief.', enabled: true, revision: 'r1' } });
  await p;
  const k = editKey(T, R);
  showing(k, st);
  st.setText('mine');
  expect(holdsWork(st.view())).toBe(true); // holds work: the prompt arms (old code: window.addEventListener -> TERM_GLOBAL)
  gone(k, st);
  showing(k, st);
  st.discard();         // nothing holds work: the prompt disarms
  expect(holdsWork(st.view())).toBe(false);
});
