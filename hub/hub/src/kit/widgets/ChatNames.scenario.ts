// Behaviour contract of ChatNames (web and terminal): the sentence reads as the plain text would, each app by its name.
import { scenarios } from '../scenario-types';
import { CHAT_SLOTS, ChatNames } from './ChatNames';

export default [
  scenarios('ChatNames', ChatNames, {
    ignored: {
      marksInRail: 'the terminal icon map has no app marks, so a rail keeps the names (a mark-only cell would say nothing)',
    },
    unsupported: {},
    cases: [
      {
        name: 'each named app reads as its name inside the sentence',
        props: { text: `Talk to it on ${CHAT_SLOTS.telegram} or ${CHAT_SLOTS.discord}.` },
        steps: [],
        expect: { nodes: [{ target: { text: /Telegram/ } }, { target: { text: /Discord/ } }] },
      },
    ],
  }),
];
