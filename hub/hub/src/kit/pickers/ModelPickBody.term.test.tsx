// The one model picker's body in the terminal: one page of the list with its count and pager, a ready row chooses,
// a row that needs setup opens the setup step and never chooses, and a can't-tell row asks first and Use it anyway
// chooses with consent. Nothing here types: the search, Escape, the empty view, the consent bar's focus and the lock
// are in ModelPickBody.keys.term.test.tsx.
import { providers } from '@core';
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getAllByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { evidence7k } from './fixtures/evidence7k';
import type { SetupRequest } from './ModelBrowser';
import { ModelPickBody, windowText, type ModelPickBodyProps } from './ModelPickBody';
import { NO_MODEL_PREFS, type ModelPrefs } from './modelPickLogic';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const chosen: providers.Choice[] = [];
const setups: SetupRequest[] = [];

function Host(p: Partial<ModelPickBodyProps> & { prefs0?: ModelPrefs }) {
  const { prefs0, ...rest } = p;
  const [prefs, setPrefs] = useState<ModelPrefs>(prefs0 ?? NO_MODEL_PREFS);
  return (
    <ModelPickBody
      id="mp"
      evidence={evidence7k('threeReady')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={(c) => chosen.push(c)}
      onSetup={(r) => setups.push(r)}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      pick={{ prefs, onPrefs: (fn) => setPrefs(fn) }}
      {...rest}
    />
  );
}

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const draw = async (p: Parameters<typeof Host>[0] = {}) => {
  chosen.length = 0;
  setups.length = 0;
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Host {...p} /></PaneSize></OverlayHost></FocusRoot>, { width: 110, height: 70 });
  return t.settle();
};
const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 50));
  return t!.settle();
};
const options = () => queryAllByRole(tree(), 'option');

test('windowText reads as the web body says it', () => {
  expect([windowText(64_000), windowText(200_000), windowText(1_000_000), windowText(1_050_000), windowText(512)]).toEqual(['64K', '200K', '1M', '1.05M', '512']);
});

test('opens on the ready models with the count; a ready row chooses it as ready, without consent', async () => {
  const f = await draw();
  expect(f).toContain('Choose a model');
  expect(f).toMatch(/[\d,]+ of [\d,]+ models/);
  const rows = options();
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThanOrEqual(20);
  act(rows[0]!, 'press');
  await settle();
  expect(chosen).toHaveLength(1);
  expect(chosen[0]).toMatchObject({ kind: 'model', readiness: 'ready', consent: false });
  expect(setups).toHaveLength(0);
}, 30_000);

test('every model: one page of twenty with a pager; a row that needs setup opens the setup step and chooses nothing', async () => {
  await draw({ prefs0: { ...NO_MODEL_PREFS, readiness: 'setup' } });
  await settle();
  expect(options().length).toBe(20);
  expect(getAllByRole(tree(), 'button', { name: 'Next' })).toHaveLength(1);
  // The remembered Needs setup filter: every row is one that needs setup, the first included.
  expect(options()[0]!.description ?? '').toMatch(/Set up /);
  const needs = options().find((o) => /Set up /.test(o.description ?? ''));
  expect(needs).toBeDefined();
  act(needs!, 'press');
  await settle();
  expect(chosen).toHaveLength(0);
  expect(setups).toHaveLength(1);
  expect(setups[0]!.intent).toBe('choose');
  // Next shows other rows.
  const first = options()[0]!.name;
  act(getAllByRole(tree(), 'button', { name: 'Next' })[0]!, 'press');
  await settle();
  expect(options()[0]!.name).not.toBe(first);
}, 30_000);

test("a can't-tell row asks first; Use it anyway chooses it with consent", async () => {
  await draw({ evidence: evidence7k('catalogueFailed'), value: 'hoody-ai/hoody-free' });
  await settle();
  const row = options()[0];
  expect(row).toBeDefined();
  act(row!, 'press');
  const f = await settle();
  expect(f).toContain('Use it anyway');
  expect(chosen).toHaveLength(0);
  act(getAllByRole(tree(), 'button', { name: 'Use it anyway' })[0]!, 'press');
  await settle();
  expect(chosen).toHaveLength(1);
  expect(chosen[0]).toMatchObject({ kind: 'model', readiness: 'unknown', consent: true });
}, 30_000);

test('the held value is the selected row; a failed read offers Try again', async () => {
  let retried = 0;
  await draw({ value: 'hoody-ai/hoody-free' });
  expect(queryAllByRole(tree(), 'option', { selected: true })).toHaveLength(1);
  t!.renderer.destroy();
  const f = await draw({ evidence: evidence7k('catalogueFailed'), value: 'hoody-ai/hoody-free', onRetry: () => { retried += 1; } });
  expect(f).toContain("Models couldn't be read.");
  act(getAllByRole(tree(), 'button', { name: 'Try again' })[0]!, 'press');
  await settle();
  expect(retried).toBe(1);
}, 30_000);

test('no computer: says so and draws no list', async () => {
  const f = await draw({ evidence: null, noComputer: true });
  expect(f).toContain('Choose a computer first.');
  expect(options()).toHaveLength(0);
}, 30_000);
