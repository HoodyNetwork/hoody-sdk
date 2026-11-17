// The kit test harness (termHarness.tsx) routes a #hash navigation the way the terminal Hub does: the router's own hash
// scroll stays off, so nothing reads document (a strict-global trap that fails the test, caught or not). A FaqLink
// landing and a Why link push such a hash; the terminal's own jump to the anchor is not the router's.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { routed } from './termHarness';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('a #hash navigation in the harness reads no document; the location takes the hash', async () => {
  const { element, router } = routed(() => null);
  t = await drawTest(element, { width: 40, height: 5 });
  await t.settle();
  // A regression would throw TERM_TRAP_UNDECLARED: document (router-core scroll-restoration, onRendered: document.getElementById(hash)).
  await router.navigate({ to: '/page', hash: 'faq-ports' } as never);
  await t.settle();
  expect(router.state.location.hash).toContain('faq-ports');
});
