// Behaviour contract of one conversation's frame (web and terminal), on the scripted source: the title,
// the transcript and the host's composer show together; Details asks the host to open; nothing is decided by itself.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { ConversationView, type ConversationViewProps } from './ConversationView';
import { DEMO_SCRIPT, scriptedSource } from './scriptedSource.fixture';
import { GATE_ARM } from './gateArm';
import head from './ConvHeader.strings.en.json';
import det from './DetailsPanel.strings.en.json';
import sv from './SessionView.strings.en.json';

type S = { fn(n: string): (...a: unknown[]) => void };
function demo(s: S, o: Partial<ConversationViewProps> = {}): ConversationViewProps {
  const src = scriptedSource(DEMO_SCRIPT);
  src.drain();
  const decide = src.decide.bind(src);
  src.decide = (ref, d) => { s.fn('decide')(d.choice); return decide(ref, d); };
  return { source: src, pane: 'Chats', detailsOpen: false, onDetails: s.fn('onDetails'), composer: 'COMPOSER', typing: true, ...o };
}
const mount = (C: (p: ConversationViewProps) => ReturnType<typeof ConversationView>, p: ConversationViewProps) => { GATE_ARM.ms = 0; return h(C, p); };

export default scenarios('ConversationView', ConversationView, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'title, transcript and composer together',
      covers: ['source', 'composer'],
      props: (s) => demo(s),
      mount,
      steps: [],
      expect: { nodes: [{ target: { text: /Build the dashboard/ } }, { target: { text: /What runs on atlas/ } }, { target: { text: 'COMPOSER' } }] },
    },
    {
      name: 'Details asks the host to open it',
      covers: ['onDetails', 'detailsOpen'],
      props: (s) => demo(s),
      mount,
      steps: [{ press: { role: 'button', name: new RegExp(head['head.details']) } }],
      expect: { calls: { onDetails: [[true]], decide: 0 } },
    },
    {
      name: "the header's model chip asks the host to change the model",
      covers: ['model', 'onModel'],
      props: (s) => demo(s, { model: { spec: 'openai/gpt-5', catalogue: null }, onModel: s.fn('onModel') }),
      mount,
      steps: [{ press: { role: 'button', name: /^Model: openai\/gpt-5\./ } }],
      expect: { calls: { onModel: 1, onDetails: 0, decide: 0 } },
    },
    {
      name: 'with Details open, picking a section tells the host',
      covers: ['onTab'],
      props: (s) => demo(s, { detailsOpen: true, onTab: s.fn('onTab') }),
      mount,
      steps: [{ click: { role: 'tab', name: det['det.tab.edits'] } }],
      expect: { calls: { onTab: [['edits']] } },
    },
    {
      name: 'Edit under an unsent message reaches the host',
      covers: ['onTakeBack'],
      props: (s) => {
        const src = scriptedSource([{ k: 'unsent', text: 'Restart the web service' }]);
        src.drain();
        return { source: src, pane: 'Chats', detailsOpen: false, onDetails: s.fn('onDetails'), onTakeBack: s.fn('onTakeBack') };
      },
      mount,
      steps: [{ press: { role: 'button', name: sv['sv.edit'] } }],
      expect: { calls: { onTakeBack: [['Restart the web service']] } },
    },
    {
      name: 'terminal: at a narrow width Back to chats asks the host',
      covers: ['onBack'],
      only: { platform: 'term', why: 'the web size class comes from the window (jsdom has none); the terminal measures its box, 80 columns is small' },
      props: (s) => demo(s, { onBack: s.fn('onBack') }),
      mount,
      steps: [{ press: { role: 'button', name: /Back/ } }],
      expect: { calls: { onBack: 1 } },
    },
  ],
});
