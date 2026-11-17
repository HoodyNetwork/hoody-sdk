// Behaviour contract of the billing page's own Section and Band (web and terminal). Both are framing: a section draws its
// title, description and content; a band draws its words. The terminal's pending mark on a band is pinned by
// Bits.band.term.test.tsx (the web band carries the kind as a data attribute, not a mark, so no shared case can see it).
import { scenarios } from '../../../kit/scenario-types';
import { Band, Section } from './Bits';

const section = scenarios('Section', Section, {
  ignored: {
    titleRef:
      'the terminal moves to a section by its anchor and its heading takes no focus, so no element is handed back; the page reads a null ref as "nothing to focus"',
  },
  unsupported: {},
  cases: [
    {
      name: 'draws its title, its description and its content',
      props: { id: 'plans', title: 'Plans', description: 'Pick the plan that fits.', children: 'Plan list' },
      steps: [],
      expect: { nodes: [{ target: { text: 'Plans' } }, { target: { text: 'Pick the plan that fits.' } }, { target: { text: 'Plan list' } }] },
    },
  ],
});

const band = scenarios('Band', Band, {
  ignored: {
    dataAttr: 'a DOM marker the web shot scan and page tests read; cells carry no data attributes and nothing in the terminal reads it',
  },
  unsupported: {},
  cases: [
    {
      name: 'draws its words',
      props: { tone: 'warn', outcome: 'pending', children: 'The top-up may have gone through.' },
      steps: [],
      expect: { nodes: [{ target: { text: 'The top-up may have gone through.' } }] },
    },
  ],
});

export default [section, band];
