// The "Use with your agent" hint under the strict globals (the test preload installs them; a read throws): the pages that show it mount with no browser global read
// (storage and the page address come from hostEnv()), and hiding a hint goes through hostEnv().local.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { hostEnv } from '../../core/host-env';
import { hideHint, readHiddenHints } from './agentHints';
import { activeStrictGlobals } from '../../term/env/strict-globals';

/** Trap hits (caught or not) whose stack runs through the hint's code. */
const hintTraps = (): string[] => (activeStrictGlobals()?.ledger() ?? []).filter((r) => /agentHints|AgentHint/.test(r.stack)).map((r) => r.name);

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

test('logs (a page with PageHint) mounts under the strict globals: no trap, no failure, the hint drawn', async () => {
  activeStrictGlobals()?.clear();
  const s = await renderPage({ page: 'logs', cols: 120, rows: 40, settleMs: 20_000 });
  close = () => s.close();
  // A caught read still counts: the hint swallows storage errors, so a trap would only show as a silently shown hint.
  expect(hintTraps()).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.errors.filter((e) => /TermGlobal|localStorage|location/.test(e))).toEqual([]);
  expect(s.frame).toContain('Use with your agent');
}, 60_000);

test('hiding a hint writes the session storage (hostEnv().local), and it reads back hidden', async () => {
  const s = await renderPage({ page: 'logs', cols: 120, rows: 40, settleMs: 20_000 });
  close = () => s.close();
  const store = hostEnv().local;
  expect(store).not.toBeNull();
  expect(readHiddenHints().has('logs')).toBe(false);
  expect(hideHint('logs')).toBe(true);
  expect(store!.getItem('hub.v3.agentHint.hidden')).toBe('["logs"]');
  expect([...readHiddenHints()]).toEqual(['logs']);
  expect(hintTraps()).toEqual([]);
  store!.removeItem('hub.v3.agentHint.hidden');
}, 60_000);
