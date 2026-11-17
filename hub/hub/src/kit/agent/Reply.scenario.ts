// Behaviour contract of a reply's parts (web and terminal): prose keeps what the model wrote readable and
// never shows a hidden key or a script link; long code folds behind a button that opens it; the footer copies the reply.
import { scenarios } from '../scenario-types';
import { FoldedCode, Prose, ReplyBox, ReplyFooter } from './Reply';
import strings from './Conversation.strings.en.json';

const TEXT = '## Ports\n\nThe **web** one listens on `3000`. See [the list](https://example.com/services).\n\n- first\n- second';
const LONG = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');

const prose = scenarios('Prose', Prose, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'headings, emphasis, lists and a link read as text',
      props: { text: TEXT },
      steps: [],
      expect: { nodes: [{ target: { text: 'Ports' } }, { target: { text: /listens on/ } }, { target: { text: /the list/ } }, { target: { text: /second/ } }] },
    },
    {
      name: 'web: the link is a link',
      only: { platform: 'web', why: 'a terminal link is an OSC 8 span inside the line (the terminal opens it), not a node of its own' },
      props: { text: TEXT },
      steps: [],
      expect: { nodes: [{ target: { role: 'link', name: /the list/ } }] },
    },
    {
      name: 'terminal: the link names its site after the words',
      only: { platform: 'term', why: 'where a terminal hides OSC 8 the site still shows; the web shows it on hover' },
      props: { text: TEXT },
      steps: [],
      expect: { nodes: [{ target: { text: /the list \(example\.com\)/ } }] },
    },
    {
      name: 'a key in the text is hidden and a script link is not a link',
      props: { text: 'Use sk-ant-api03-' + 'SECRET'.repeat(4) + ' and [click](javascript:alert(1)).' },
      steps: [],
      expect: { neverShown: ['SECRETSECRETSECRETSECRET', 'javascript:'] },
    },
  ],
});

const folded = scenarios('FoldedCode', FoldedCode, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a long block folds; the button opens it all',
      props: { text: LONG, lang: 'txt' },
      steps: [{ expect: { neverShown: ['line 30'] } }, { press: { role: 'button', name: /more lines/ } }],
      expect: { nodes: [{ target: { text: /line 30/ } }, { target: { role: 'button', name: new RegExp(strings['agent.showLess']) } }] },
    },
    {
      name: 'whole: never folded',
      props: { text: LONG, lang: 'txt', whole: true },
      steps: [],
      expect: { nodes: [{ target: { text: /line 30/ } }, { target: { role: 'button', name: /more lines/ }, absent: true }] },
    },
  ],
});

const box = scenarios('ReplyBox', ReplyBox, {
  ignored: {}, unsupported: {},
  cases: [{ name: 'holds the reply', props: { children: 'Done.' }, steps: [], expect: { nodes: [{ target: { text: 'Done.' } }] } }],
});

const footer = scenarios('ReplyFooter', ReplyFooter, {
  ignored: {},
  unsupported: {},
  cases: [{
    name: 'offers Copy',
    props: { text: 'Done.', cost: 0.01, at: Date.UTC(2026, 10, 11, 9, 30) },
    steps: [],
    expect: { nodes: [{ target: { role: 'button', name: new RegExp(strings['agent.copy']) } }] },
  }],
});

export default [prose, folded, box, footer];
