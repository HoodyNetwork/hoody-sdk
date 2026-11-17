// Behaviour contract of the transcript (web and terminal), on the scripted source: what was said and
// answered is shown; a waiting approval decides only through the button pressed; nothing is decided by itself.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { SessionView, type SessionViewProps } from './SessionView';
import { DEMO_SCRIPT, scriptedSource } from './scriptedSource.fixture';
import { GATE_ARM } from './gateArm';
import strings from './Conversation.strings.en.json';
import sv from './SessionView.strings.en.json';

type S = { fn(n: string): (...a: unknown[]) => void };
/** The demo chat played to its end, with the source's decide reported to the spy `decide` (the choice only). */
function demo(s: S): SessionViewProps {
  const src = scriptedSource(DEMO_SCRIPT);
  src.drain();
  const decide = src.decide.bind(src);
  src.decide = (ref, d) => { s.fn('decide')(d.choice); return decide(ref, d); };
  return { source: src, size: 'l', typing: true };
}
const mount = (C: (p: SessionViewProps) => ReturnType<typeof SessionView>, p: SessionViewProps) => { GATE_ARM.ms = 0; return h(C, p); };

export default scenarios('SessionView', SessionView, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the message, the steps, the answer and the waiting approval are shown',
      props: (s) => demo(s),
      mount,
      steps: [],
      expect: { nodes: [{ target: { text: /restart the web one/ } }, { target: { text: /What runs on atlas/ } }, { target: { role: 'button', name: strings['agent.deny'] } }] },
    },
    {
      name: 'Deny on the card decides deny',
      covers: ['source'],
      props: (s) => demo(s),
      mount,
      steps: [{ press: { role: 'button', name: strings['agent.deny'] } }],
      expect: { calls: { decide: [['deny']] } },
    },
    {
      name: 'Allow once on the card decides once',
      props: (s) => demo(s),
      mount,
      steps: [{ press: { role: 'button', name: strings['agent.allowOnce'] } }],
      expect: { calls: { decide: [['once']] } },
    },
    {
      name: 'nothing pressed: nothing decided',
      props: (s) => demo(s),
      mount,
      steps: [],
      expect: { calls: { decide: 0 } },
    },
    {
      name: 'Edit under a message the agent did not take gives its text back to the host',
      covers: ['onTakeBack'],
      props: (s) => {
        const src = scriptedSource([{ k: 'unsent', text: 'Restart the web service' }]);
        src.drain();
        return { source: src, size: 'l', typing: true, onTakeBack: s.fn('onTakeBack') };
      },
      mount,
      steps: [{ press: { role: 'button', name: sv['sv.edit'] } }],
      expect: { calls: { onTakeBack: [['Restart the web service']] } },
    },
    {
      name: 'Review on an answer that changed files asks the host',
      covers: ['onReview'],
      props: (s) => {
        const src = scriptedSource([{ k: 'user', text: 'Fix the page' }, { k: 'reply', text: 'Done.', files: 2 }]);
        src.drain();
        return { source: src, size: 'l', typing: true, onReview: s.fn('onReview') };
      },
      mount,
      steps: [{ press: { role: 'button', name: /Review/ } }],
      expect: { calls: { onReview: 1 } },
    },
  ],
});
