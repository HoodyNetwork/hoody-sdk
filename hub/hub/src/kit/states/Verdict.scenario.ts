// Behaviour contract of the kit Verdict and its VerdictMark (web and terminal; src/term/docs/scenarios.md): the plate
// is a group named by its label; its count, sentence, marked phrase and next line are read; the meter adds no node.
import { createElement as h } from 'react';
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { Verdict, VerdictMark } from './Verdict';

const V = loose(Verdict);
const M = loose(VerdictMark);

const verdict = scenarios('Verdict', V, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a plate is a group named by its label, with its sentence, count and next line',
      props: { label: 'Get it working', count: '3 of 5 · 2 optional left', segments: ['done', 'done', 'limited', 'optional', 'todo'], next: 'Next: turn privacy off.', children: 'It answers in private chats.' },
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'group', name: 'Get it working' } },
          { target: { text: 'It answers in private chats.' } },
          { target: { text: /3 of 5 · 2 optional left/i } },
          { target: { text: 'Next: turn privacy off.' } },
        ],
      },
    },
    {
      name: 'a state plate is the same group; with no next and no count neither is said',
      props: { tone: 'state', label: 'Is it online', children: 'It is online.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Is it online' } }, { target: { text: 'It is online.' } }, { target: { text: /^Next/ }, absent: true }] },
    },
    {
      name: 'a calm plate shows the thing itself and its facts',
      props: { label: 'What you get', children: 'A link to port 8080.', slot: 'atlas-8080.example.test', facts: 'Anyone with the link' },
      steps: [],
      expect: { nodes: [{ target: { text: 'atlas-8080.example.test' } }, { target: { text: 'Anyone with the link' } }] },
    },
  ],
});

const verdictMark = scenarios('VerdictMark', M, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the marked phrase is read as part of the sentence',
      props: { tone: 'warn', children: 'only commands' },
      mount: (C, props) => h(V, { label: 'Get it working' }, 'In groups it sees ', h(C, props), '.'),
      steps: [],
      expect: { nodes: [{ target: { text: /only commands/ } }] },
    },
  ],
});

export default [verdict, verdictMark];
