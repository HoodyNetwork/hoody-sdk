// The AI models page opened on a section (`/ai/models?section=claude`, the palette's section commands and deep links)
// under the strict globals: the section lookup reads no `document` / `CSS` in a terminal (parts/sectionEl.ts); the
// terminal SettingsPage follows `?section=` itself, so the page draws with the section shown.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { activeStrictGlobals } from '../../term/env/strict-globals';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

test('models page with ?section=claude mounts with no trap and no failure', async () => {
  activeStrictGlobals()?.clear();
  const s = await renderPage({ page: 'ai', path: '/ai/models?section=claude', fx: 'claude', cols: 120, rows: 40 });
  close = () => s.close();
  const traps = (activeStrictGlobals()?.ledger() ?? []).filter((r) => /pages\/ai\//.test(r.stack)).map((r) => r.name);
  expect(traps).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.errors.filter((e) => /document|CSS|ReferenceError/.test(e))).toEqual([]);
}, 120_000);
