// Behaviour contract of BrandMark (web and terminal): the brand's words are text a reader meets, "Hoody" and then
// "Hub"; `hub` off leaves the first word, `words` off leaves no text (the web keeps its decorative mark).
import { scenarios } from '../scenario-types';
import { BrandMark } from './BrandMark';

export default [
  scenarios('BrandMark', BrandMark, {
    ignored: {
      className: 'no CSS classes in a terminal',
      size: 'pixel sizes (a 20 or 32 px mark, two type sizes); a terminal draws the words at one size and no mark',
    },
    unsupported: {},
    cases: [
      {
        name: 'the two words are text',
        props: {},
        steps: [],
        expect: { nodes: [{ target: { text: /\bHoody\b/ } }, { target: { text: /\bHub\b/ } }] },
      },
      {
        name: 'hub off: the first word alone',
        props: { hub: false },
        steps: [],
        expect: { nodes: [{ target: { text: /\bHoody\b/ } }, { target: { text: /\bHub\b/ }, absent: true }] },
      },
      {
        name: 'words off: no text',
        props: { words: false },
        steps: [],
        expect: { nodes: [{ target: { text: /\bHoody\b/ }, absent: true }] },
      },
    ],
  }),
];
