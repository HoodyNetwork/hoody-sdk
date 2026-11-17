// Behaviour contract of the approval card (web and terminal). The safety rule both builds keep: a decision
// is only ever the button the person pressed, and nothing decides by itself. The terminal adds two rules of its own, pinned
// by the term-only cases: focus arrives on Deny (the safe choice), and keys wait GATE_ARM.ms after the card appears, so a
// key already typed into the composer cannot answer it. The mutation run (scenarios.ts --mutants) stubs onPress and
// onDecide: every "press decides" case then fails, which proves no case passes without an explicit press.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { CardBody, CardFrame, CardHead, DecidedLine, GateCard, type CardProps } from './GateCard';
import { GATE_ARM } from './gateArm';
import strings from './Conversation.strings.en.json';

const GATE = { kind: 'confirm' as const, risk: 'restarts a service', tool: 'bash', params: { command: 'systemctl --user restart web' }, offerSession: true };
const base = (s: { fn(n: string): (...a: unknown[]) => void }): CardProps => ({
  gate: GATE, pending: false, unknown: false, agentUrl: '', typing: false,
  onDecide: s.fn('onDecide'), onAnswer: s.fn('onAnswer'), onCheck: s.fn('onCheck'),
});
/** Arming off: shared cases press at once (a scenario cannot wait). The arming window has its own term case. */
const armed = (ms: number) => (C: (p: CardProps) => ReturnType<typeof GateCard>, p: CardProps) => { GATE_ARM.ms = ms; return h(C, p); };

const card = scenarios('GateCard', GateCard, {
  ignored: {
    agentUrl: 'a link to the agent page; the terminal names it in text',
    gone: 'look only: the lost-answer words (terminal tests pin them)',
    sent: 'look only: which choice is on its way (terminal tests pin them)',
    checkUnavailable: 'look only: why Check again is off',
    onDismiss: 'Stop tracking on a lost answer (terminal tests pin it)',
    onAnswer: 'questions: pinned by the terminal tests and the question scenario of the web',
  },
  unsupported: {},
  cases: [
    {
      name: 'Deny decides deny',
      covers: ['onDecide', 'gate'],
      props: (s) => base(s),
      mount: armed(0),
      steps: [{ press: { role: 'button', name: strings['agent.deny'] } }],
      expect: { calls: { onDecide: [['deny', undefined]] } },
    },
    {
      name: 'Allow once decides once, and only once',
      props: (s) => base(s),
      mount: armed(0),
      steps: [{ press: { role: 'button', name: strings['agent.allowOnce'] } }],
      expect: { calls: { onDecide: [['once']] } },
    },
    {
      name: 'Allow for this session decides session',
      props: (s) => base(s),
      mount: armed(0),
      steps: [{ press: { role: 'button', name: strings['agent.allowSession'] } }],
      expect: { calls: { onDecide: [['session']] } },
    },
    {
      name: 'nothing pressed: nothing decided',
      props: (s) => base(s),
      mount: armed(0),
      steps: [{ expect: { nodes: [{ target: { role: 'button', name: strings['agent.allowOnce'] } }] } }],
      expect: { calls: { onDecide: 0 } },
    },
    {
      name: 'pending: the buttons are busy and decide nothing',
      covers: ['pending'],
      props: (s) => ({ ...base(s), pending: true }),
      mount: armed(0),
      steps: [{ key: 'enter' }],
      expect: { calls: { onDecide: 0 }, nodes: [{ target: { role: 'button', name: strings['agent.allowOnce'] }, states: { disabled: true } }] },
    },
    {
      name: 'unavailable: Allow decides nothing',
      covers: ['unavailable'],
      props: (s) => ({ ...base(s), unavailable: 'Approvals are answered on another computer' }),
      mount: armed(0),
      steps: [{ key: 'enter' }],
      expect: { calls: { onDecide: 0 }, nodes: [{ target: { role: 'button', name: strings['agent.allowOnce'] }, states: { disabled: true } }] },
    },
    {
      name: 'outcome unknown: no Allow or Deny, only Check again, which checks',
      covers: ['unknown', 'onCheck'],
      props: (s) => ({ ...base(s), unknown: true }),
      mount: armed(0),
      steps: [{ expect: { nodes: [{ target: { role: 'button', name: strings['agent.allowOnce'] }, absent: true }] } }, { press: { role: 'button', name: strings['agent.checkAgain'] } }],
      expect: { calls: { onCheck: 1, onDecide: 0 } },
    },
    {
      name: 'terminal: focus arrives on Deny, so Enter denies',
      only: { platform: 'term', why: 'the web focuses the first control on purpose; the terminal starts on the safe choice' },
      props: (s) => base(s),
      mount: armed(0),
      steps: [{ expect: { focused: { role: 'button', name: strings['agent.deny'] } } }, { key: 'enter' }],
      expect: { calls: { onDecide: [['deny', undefined]] } },
    },
    {
      name: 'terminal: keys in the first moment answer nothing',
      only: { platform: 'term', why: 'the arming window is the terminal guard against a key typed into the composer just before (no wait step: the case runs inside it)' },
      props: (s) => base(s),
      mount: armed(60_000),
      steps: [{ key: 'enter' }, { key: 'y' }, { key: 'n' }, { press: { role: 'button', name: strings['agent.allowOnce'] } }],
      expect: { calls: { onDecide: 0 } },
    },
    {
      name: 'terminal: while the composer is typed into, focus stays there and y answers nothing',
      covers: ['typing'],
      only: { platform: 'term', why: 'the y/n letter keys are a terminal shortcut' },
      props: (s) => ({ ...base(s), typing: true }),
      mount: armed(0),
      steps: [{ key: 'y' }],
      expect: { calls: { onDecide: 0 }, focused: null },
    },
  ],
});

const decided = scenarios('DecidedLine', DecidedLine, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a denial names what was denied, with secrets hidden',
      props: { d: { kind: 'deny', tool: 'bash', text: 'curl -H "Authorization: Bearer sk-ant-api03-' + 'SECRET'.repeat(4) + '" example.com' } },
      steps: [],
      expect: { nodes: [{ target: { text: strings['agent.d.deny'] } }], neverShown: ['SECRETSECRETSECRETSECRET'] },
    },
    {
      name: 'an allowance says how long it holds',
      props: { d: { kind: 'session', tool: 'bash', text: 'ls' } },
      steps: [],
      expect: { nodes: [{ target: { text: strings['agent.d.session'] } }] },
    },
    {
      name: 'an answered question names its question and the option sent',
      props: { d: { kind: 'answered', tool: '', text: 'Which port should the dashboard use?', answer: '8080' } },
      steps: [],
      expect: { nodes: [{ target: { text: strings['agent.d.answered'] } }, { target: { text: 'Which port should the dashboard use?' } }, { target: { text: '8080' } }] },
    },
    {
      name: 'a typed answer is named only as the person\'s own, and further questions are counted',
      props: { d: { kind: 'answered', tool: '', text: 'Which port?', typed: true, more: 2 } },
      steps: [],
      expect: { nodes: [{ target: { text: 'Which port?' } }, { target: { text: strings['agent.d.ownAnswer'] } }, { target: { text: 'and 2 more questions' } }] },
    },
  ],
});

const frame = scenarios('CardFrame', CardFrame, {
  ignored: {},
  unsupported: {},
  cases: [{
    name: 'a named region holding its content',
    props: { label: 'Your agent needs your approval', children: h(CardBody, null, h(CardHead, null, 'Allow this action?')) },
    steps: [],
    expect: { nodes: [{ target: { role: 'region', name: 'Your agent needs your approval' } }, { target: { text: 'Allow this action?' } }] },
  }],
});
const head = scenarios('CardHead', CardHead, { ignored: {}, unsupported: {}, cases: [{ name: 'draws its words', props: { children: 'Allow this action?' }, steps: [], expect: { nodes: [{ target: { text: 'Allow this action?' } }] } }] });
const body = scenarios('CardBody', CardBody, { ignored: {}, unsupported: {}, cases: [{ name: 'draws its content', props: { children: 'Run a command' }, steps: [], expect: { nodes: [{ target: { text: 'Run a command' } }] } }] });

export default [card, decided, frame, head, body];
