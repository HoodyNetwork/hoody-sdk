// Behaviour contract of CountBadge, run on the web and in the terminal (src/term/scenario). The box
// differs on purpose (a pill on the web, "(3)" in the terminal), so the cases hold what both share: the count as
// countText gives it, and that a count is text, never something to press.
import { scenarios } from '../scenario-types';
import { CountBadge } from './CountBadge';

const badge = scenarios('CountBadge', CountBadge, {
  ignored: { tone: 'read: look only: an accent count is drawn stronger; the count reads the same' },
  unsupported: {},
  cases: [
    { name: 'a count is text, not a control', props: { count: 3 }, steps: [], expect: { nodes: [{ target: { text: /3/ } }, { target: { role: 'button' }, absent: true }] } },
    { name: 'a count over max shows the cap and a plus', props: { count: 250, max: 99 }, steps: [], expect: { nodes: [{ target: { text: /99\+/ } }], neverShown: ['250'] } },
    { name: 'atLeast: a lower bound shows a plus', props: { count: 5, atLeast: true }, steps: [], expect: { nodes: [{ target: { text: /5\+/ } }] } },
    { name: 'label: a count named in words is still not a control', props: { count: 3, label: '3 unread' }, steps: [], expect: { nodes: [{ target: { role: 'button' }, absent: true }] } },
    {
      name: 'web: label is read in place of the bare number',
      only: { platform: 'web', why: 'the terminal gives the words as the name of the drawn count, which a text target does not read' },
      props: { count: 3, label: '3 unread' },
      steps: [],
      expect: { nodes: [{ target: { text: /3 unread/ } }] },
    },
    { name: 'hidden: the count is still drawn for the eye', props: { count: 7, hidden: true }, steps: [], expect: { nodes: [{ target: { role: 'button' }, absent: true }] } },
  ],
});

export default [badge];
