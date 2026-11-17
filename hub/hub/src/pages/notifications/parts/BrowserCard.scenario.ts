// BrowserCard: the web card asks the browser for alerts and shows its state; a terminal has no browser alerts, so its
// twin is a hand-off (kit Handoff) that says why and gives the web Hub's address of this page. The account the choice
// is stored under and the fixtures' browser stand-in have nothing to land on here.
import { createElement as h } from 'react';
import { atRoute, loose } from '../../../kit/layouts/scenarioRoute';
import { scenarios } from '../../../kit/scenario-types';
import { BrowserCard } from './BrowserCard';

const TERM = { platform: 'term' as const, why: 'the web card asks a browser; the hand-off exists only in a terminal' };

export default scenarios('BrowserCard', loose(BrowserCard), {
  ignored: {
    uid: 'the account the browser alert choice is stored under: a terminal has no browser alerts to store',
    override: "the fixtures' stand-in for a browser's permission and state: a terminal has no browser to stand in for",
  },
  unsupported: {},
  cases: [
    {
      name: 'a hand-off says why alerts are not set up here',
      only: TERM,
      props: { uid: 'u1', override: null },
      mount: ((C: unknown, p: Record<string, unknown>) => atRoute(() => h(C as never, p), '/notifications/learn')) as never,
      steps: [],
      expect: { nodes: [{ target: { text: 'Alerts are a browser feature: they show only while the Hub is open in a browser tab, so a terminal cannot show them.' } }] },
    },
  ],
});
