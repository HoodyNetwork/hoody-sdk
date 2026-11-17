// Talk's entry beside Send. Web: a press starts Talk; with a reason it stays focusable and says why. Terminal: there is no
// microphone to reach, so Talk is one compact entry that opens a hand-off to the web (the whole address, a copy key)
// and never runs the press.
import { scenarios } from '../scenario-types';
import { MicButton } from './MicButton';
import strings from './Voice.strings.en.json';
import term from './MicButton.term.strings.en.json';

export default scenarios('MicButton', MicButton, {
  ignored: {
    onPress: 'terminal: Talk cannot start in a terminal (no audio device); the entry is a hand-off to the web, so the press is never run',
    busy: 'terminal: no press, so nothing is ever starting',
  },
  unsupported: {},
  cases: [
    {
      name: 'web: a press starts Talk',
      only: { platform: 'web', why: 'the terminal has no microphone; it hands off instead (term case below)' },
      props: (s) => ({ onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: /Talk/ } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'terminal: one compact Talk entry; the hand-off only when pressed, and a press starts nothing',
      only: { platform: 'term', why: 'a terminal session cannot reach a microphone' },
      props: (s) => ({ onPress: s.fn('onPress') }),
      steps: [],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'Talk' } }, { target: { role: 'button', name: 'Copy link' }, absent: true }] },
    },
    {
      name: 'terminal: pressing Talk hands off to the web, and a key press starts nothing',
      only: { platform: 'term', why: 'a terminal session cannot reach a microphone' },
      props: (s) => ({ onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Talk' } }, { key: 'c' }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { text: new RegExp(term['mic.term.reason'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) } }, { target: { role: 'button', name: 'Copy link' } }] },
    },
    {
      name: 'terminal: a reason from the page is said as the web says it',
      covers: ['reason'],
      only: { platform: 'term', why: 'the web shows the reason on its soft-disabled button (MicButton.test.tsx)' },
      props: (s) => ({ reason: 'notSetUp' as const, onPress: s.fn('onPress') }),
      steps: [],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { text: new RegExp(strings['mic.why.notSetUp']) } }] },
    },
  ],
});
