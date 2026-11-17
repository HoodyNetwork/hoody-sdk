// SectionGroup in the terminal (Programs' Launch an app): the group's member-order watch is a DOM
// MutationObserver. A terminal section has no DOM element, so the group must never touch the global (a strict-global
// trap ended the mount: TERM_GLOBAL). The group still draws its sections, and collapses to its first-use card when
// every section is empty, as on the web.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FocusRoot } from '../../../term/prim';
import { AnatomySection } from './Section';
import { SectionGroup } from './SectionGroup';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('sections in a group draw with no DOM global read', async () => {
  t = await drawTest(
    <FocusRoot>
      <SectionGroup firstUse={{ title: 'Nothing here yet', body: 'Start with an app.', action: 'none' }}>
        <AnatomySection id="one" title="Recent">first body</AnatomySection>
        <AnatomySection id="two" title="From Hoody">second body</AnatomySection>
      </SectionGroup>
    </FocusRoot>,
    { width: 60, height: 12 },
  );
  const f = await t.settle();
  expect(f).toContain('Recent');
  expect(f).toContain('From Hoody');
  expect(f).toContain('second body');
});
