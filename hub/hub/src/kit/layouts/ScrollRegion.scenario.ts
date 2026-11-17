// ScrollRegion: one named Tab stop over content that scrolls. The web is a focusable region the browser scrolls; the
// terminal answers the keys itself. Where it scrolls to is a drawing fact (the semantics tree keeps rows scrolled out of
// view), pinned in Layouts.term.test.tsx; jsdom has no layout to scroll.
import { createElement as h, type ReactElement } from 'react';
import { scenarios } from '../scenario-types';
import { loose } from './scenarioRoute';
import { ScrollRegion } from './ScrollRegion';

type Html = (t: string, a: Record<string, unknown> | null, ...c: unknown[]) => ReactElement;
const lines = (html: Html) => html('div', null, ...Array.from({ length: 60 }, (_, i) => html('p', null, `row ${i}`)));

export default scenarios('ScrollRegion', loose(ScrollRegion), {
  ignored: { framed: 'read for the look only: a frame or an edge line, each platform its own' },
  unsupported: { axis: 'sideways scroll needs a measured wide child; the block axis is the case below' },
  cases: [
    {
      name: 'one named Tab stop',
      props: { label: 'Plans' },
      mount: (C, p, _s, html) => h(C, { ...(p as Record<string, unknown>), children: lines(html as Html) } as never),
      covers: ['label', 'children'],
      steps: [{ key: 'tab' }],
      expect: { focused: { role: 'region', name: 'Plans' } },
    },
  ],
});
