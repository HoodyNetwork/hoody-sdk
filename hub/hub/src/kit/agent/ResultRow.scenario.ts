// Behaviour contract of ResultRow (web and terminal): under a finished reply, how many files the turn
// changed, with Review only where the chat has Details; nothing at all with no site and no files. The site part needs a
// LinkHost holding the realm's computers and the computers' address domain, which a scenario mount does not hold:
// ResultRow.test.tsx (web) and ResultRow.term.test.tsx (terminal) prove it.
import { scenarios } from '../scenario-types';
import { ResultRow, type ResultRowProps } from './ResultRow';
import strings from './Conversation.strings.en.json';

const THREE = strings['result.files'].replace('{{n}}', '3');
const REVIEW_THREE = strings['result.reviewName'].replace('{{n}}', '3');

export default scenarios<ResultRowProps>('ResultRow', ResultRow, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'three files: the count, and Review opens Details once',
      props: (s) => ({ text: 'Done.', files: 3, onReview: s.fn('onReview') }),
      steps: [{ press: { role: 'button', name: REVIEW_THREE } }],
      expect: { nodes: [{ target: { text: THREE } }], calls: { onReview: 1 } },
    },
    {
      name: 'one file reads in the singular; without Details there is no Review',
      props: { text: 'Done.', files: 1 },
      steps: [],
      expect: { nodes: [{ target: { text: strings['result.file'] } }, { target: { role: 'button', name: /Review/ }, absent: true }] },
    },
    {
      name: 'no site and no files: nothing is drawn and nothing can be pressed',
      props: (s) => ({ text: 'All done, nothing to open.', files: 0, onReview: s.fn('onReview') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: /Review|Open/ }, absent: true }], neverShown: ['files changed', strings['result.file'], 'Site '], calls: { onReview: 0 } },
    },
  ],
});
