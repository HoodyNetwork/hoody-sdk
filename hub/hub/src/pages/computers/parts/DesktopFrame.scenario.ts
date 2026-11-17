// DesktopFrame: the web draws the desktop in a browser frame; a terminal cannot, so its twin is a hand-off (kit Handoff)
// that says why and gives the web Hub's address. The frame's own attributes therefore have nothing to land on here.
import { createElement as h } from 'react';
import { atRoute, loose } from '../../../kit/layouts/scenarioRoute';
import { scenarios } from '../../../kit/scenario-types';
import { DesktopFrame } from './DesktopFrame';

const TERM = { platform: 'term' as const, why: 'the web draws a live browser frame; the hand-off exists only in a terminal' };

export default scenarios('DesktopFrame', loose(DesktopFrame), {
  ignored: {
    allow: 'the browser frame\'s permissions: a terminal draws no frame (its twin is a hand-off)',
    title: 'the browser frame\'s accessible name: a terminal draws no frame (its twin is a hand-off)',
  },
  unsupported: {},
  cases: [
    {
      name: 'a hand-off says why the desktop is not drawn here',
      only: TERM,
      props: { url: 'https://example.com/desktop', allow: 'clipboard-read; clipboard-write', title: 'Desktop of atlas' },
      mount: ((C: unknown, p: Record<string, unknown>) => atRoute(() => h(C as never, p), '/computers')) as never,
      steps: [],
      expect: { nodes: [{ target: { text: 'A desktop is a live picture in a browser frame, which a terminal cannot draw.' } }] },
    },
  ],
});
