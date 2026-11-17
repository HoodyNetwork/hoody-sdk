// Behaviour contract of the "Waiting for you" row (web and terminal). The rule both builds keep: the row
// names what waits with keys hidden as the card hides them, and it decides nothing. Show only calls the host.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { NeedsBar, type NeedsBarProps } from './NeedsBar';
import type { GateEntry } from './source';
import strings from './NeedsBar.strings.en.json';

const KEY = 'sk-live0123456789abcdefghij';
const entry = (gate: Record<string, unknown>, key = 'g1'): GateEntry => ({ key, ref: { id: key, generation: 1 }, gate, helper: false, addressing: false, held: null, decision: null }) as unknown as GateEntry;
const bash = (command: string, key?: string): GateEntry => entry({ kind: 'confirm', risk: '', tool: 'bash', params: { command } }, key);
const SHOW = { role: 'button', name: strings['needs.show'] };

export default scenarios<NeedsBarProps>('NeedsBar', NeedsBar, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the row is a region that names the command that waits',
      props: (s) => ({ gates: [bash('npm run build')], onShow: s.fn('onShow') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'region', name: strings['needs.aria'] } }, { target: { text: 'Allow npm run build?' } }, { target: SHOW }], calls: { onShow: 0 } },
    },
    {
      name: 'Show calls the host once and nothing else',
      props: (s) => ({ gates: [bash('npm run build')], onShow: s.fn('onShow') }),
      steps: [{ press: SHOW }],
      expect: { calls: { onShow: 1 } },
    },
    {
      name: 'a click on Show calls the host once',
      props: (s) => ({ gates: [bash('npm run build')], onShow: s.fn('onShow') }),
      steps: [{ click: SHOW }],
      expect: { calls: { onShow: 1 } },
    },
    {
      name: "the host's control after Show is drawn and works on its own (the running turn's Stop)",
      props: (s) => ({ gates: [bash('npm run build')], onShow: s.fn('onShow'), end: h(Button, { size: 'sm', onPress: s.fn('stop') }, 'Stop') }),
      steps: [{ press: { role: 'button', name: 'Stop' } }],
      expect: { calls: { stop: 1, onShow: 0 }, nodes: [{ target: SHOW }] },
    },
    {
      name: 'more than one gate: the first is named, the rest are counted',
      props: (s) => ({ gates: [bash('npm run build'), bash('rm -rf dist', 'g2'), bash('git push', 'g3')], onShow: s.fn('onShow') }),
      steps: [],
      expect: { nodes: [{ target: { text: 'Allow npm run build?' } }, { target: { text: '2 more' } }], neverShown: ['rm -rf dist', 'git push'] },
    },
    {
      name: 'a question is named by its words',
      props: (s) => ({ gates: [entry({ kind: 'question', question: 'Which branch should I deploy?' })], onShow: s.fn('onShow') }),
      steps: [],
      expect: { nodes: [{ target: { text: 'Which branch should I deploy?' } }] },
    },
    {
      name: 'a key in the command is never shown',
      props: (s) => ({ gates: [bash(`curl -H "Authorization: Bearer ${KEY}" https://e.example`)], onShow: s.fn('onShow') }),
      steps: [],
      expect: { nodes: [{ target: { text: /\[hidden\]/ } }], neverShown: [KEY] },
    },
    {
      name: 'no gate, no row',
      props: (s) => ({ gates: [], onShow: s.fn('onShow') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'region', name: strings['needs.aria'] }, absent: true }, { target: SHOW, absent: true }] },
    },
  ],
});
