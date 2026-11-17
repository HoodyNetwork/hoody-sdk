// PageHeader in the terminal: a compact header (size sm) draws the title row alone, as the web hides the subtitle and
// the context line; the breadcrumbs fold to "‹ Parent" by the width of the pane the header is in, not the terminal's.
import { afterEach, expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize, Box } from '../../term/prim';
import { routed } from './termHarness';
import { PageHeader } from './PageHeader';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const crumbs = [{ label: 'Computers', href: '/computers' }, { label: 'web-1', href: '/computers/web-1' }, { label: 'Ports' }];

async function draw(node: () => ReactElement, width: number): Promise<string> {
  const { element } = routed(() => <FocusRoot>{node()}</FocusRoot>);
  t = await drawTest(element, { width, height: 12 });
  return t.settle();
}

test('size sm: the title shows, the subtitle and the context line do not', async () => {
  const f = await draw(() => <PageHeader size="sm" title="Schedules" subtitle="Jobs that run on a timer." context="On atlas" />, 100);
  expect(f).toContain('Schedules');
  expect(f).not.toContain('Jobs that run on a timer.');
  expect(f).not.toContain('On atlas');
});

test('size md: the subtitle and the context line show', async () => {
  const f = await draw(() => <PageHeader title="Schedules" subtitle="Jobs that run on a timer." context="On atlas" />, 100);
  expect(f).toContain('Jobs that run on a timer.');
  expect(f).toContain('On atlas');
});

test('breadcrumbs in a pane narrower than the fold fold to the way back, though the terminal is wide', async () => {
  const f = await draw(() => (
    <Box dir="row"><Box width={30} shrink={0} /><PaneSize><PageHeader title="Ports" breadcrumbs={crumbs} /></PaneSize></Box>
  ), 100);
  expect(f).toContain('‹ web-1');
  expect(f).not.toContain('Computers ›');
});

test('breadcrumbs in a wide pane keep the whole row', async () => {
  const f = await draw(() => <PaneSize><PageHeader title="Ports" breadcrumbs={crumbs} /></PaneSize>, 100);
  expect(f).toContain('Computers › web-1 › Ports');
});
