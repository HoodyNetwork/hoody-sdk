// A ?section= deep link followed while the page still loads (its sections are placeholders), and then the read fails
// and the page draws no sections (only its error and the questions): the page goes back to its top, as if the link had
// named nothing, whichever of the reveal and the failure comes first (the AI Models page, error state).
import { afterEach, expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { routed } from './termHarness';
import { __resetKeptScroll } from './termScroll';
import { SettingsPage } from './Layouts';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetKeptScroll(); });

const tall = (id: string, title: string) => ({ id, title, content: <>{Array.from({ length: 8 }, (_, i) => <Text key={i}>{`${title} line ${i}`}</Text>)}</> });
const FAQ = { items: Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, q: `Question ${i}?`, a: 'An answer.' })) };

let fail: (() => void) | null = null;
function Page() {
  const [failed, setFailed] = useState(false);
  useEffect(() => { fail = () => setFailed(true); return () => { fail = null; }; }, []);
  const sections = failed ? [] : [tall('a', 'Alpha'), tall('b', 'Beta'), tall('c', 'Gamma')];
  return <SettingsPage header={{ title: 'Models' }} notice={failed ? <Text>Could not load</Text> : undefined} sections={sections} faq={FAQ} />;
}

test('a deep-linked section that goes away (the read failed) leaves the page at its top', async () => {
  const r = routed(() => <Page />, '/page?section=c');
  t = await drawTest(r.element, { width: 80, height: 24 });
  await t.settle();
  await new Promise((res) => setTimeout(res, 20));
  let f = await t.settle();
  // The positive control: the link was followed, the page scrolled to Gamma.
  expect(f).toContain('Gamma line 0');
  expect(f).not.toContain('Alpha line 0');
  fail!();
  await t.settle();
  await new Promise((res) => setTimeout(res, 20));
  f = await t.settle();
  expect(f).toContain('Could not load');
  // At the top: the questions' heading and the first question are on screen.
  expect(f).toContain('Questions');
  expect(f).toContain('Question 0?');
});
