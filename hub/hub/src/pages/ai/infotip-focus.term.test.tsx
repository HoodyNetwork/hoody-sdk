// Tab onto an InfoTip on the AI page must not draw "This page could not be drawn" (Maximum update depth exceeded,
// "In: Pressable < Box < InfoTip < Box < DomBox < Dom"). The glance is a tip layer; the app's focus scope went inactive
// under any layer, so the trigger lost the focus, the glance hid, the scope came back, the glance showed again.
// Fix: only key-taking layers deactivate the page's scope (App.tsx PageRoot, prim/Overlay.ts useLayerCount trapping).
// This drives the real page: AI > Agents, Tab through the whole list (the lock, Tools, Model and Where tips, under
// DomBox and table cells) and on; every InfoTip trigger shows its tip and keeps the focus, nothing loops.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin })); return n ? { role: n.role, name: n.name } : null; };
const loops = () => s!.errors.filter((e) => e.includes('Maximum update depth'));

test('AI agents: Tab through every InfoTip in the list; each shows its tip, keeps the focus, no update loop', async () => {
  s = await renderPage({ page: 'ai', cols: 120, rows: 40 });
  await s.settle();
  for (let i = 0; i < 160 && !(focused()?.role === 'link' && focused()?.name === 'Agents'); i++) await s.keys.press('tab');
  expect(focused()?.name).toBe('Agents');
  await s.keys.press('enter');
  await s.settle();
  const tips = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await s.keys.press('tab');
    expect(s.failures).toEqual([]);
    expect(loops()).toEqual([]);
    expect(s.frame).not.toContain('could not be drawn');
    const f = focused();
    // An InfoTip trigger in the list: "About <column>: <value>" or the lock ("Locked").
    if (f && (/^About /.test(f.name) || f.name === 'Locked')) {
      tips.add(f.name);
      await new Promise((r) => setTimeout(r, 100));
      await s.settle();
      expect(focused()?.name).toBe(f.name);
      expect(s.frame).toMatch(/┌[^\n]*\n[^\n]*│ /);
    }
  }
  // The lock and the cell tips of at least two columns were reached.
  expect(tips.size).toBeGreaterThanOrEqual(3);
  expect(s.trapsAt).toEqual([]);
}, 240_000);
