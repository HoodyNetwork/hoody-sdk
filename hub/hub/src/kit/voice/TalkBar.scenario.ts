// TalkBar. The web bar's own behaviour (hold to talk, devices, hands-free) is pinned by TalkBar.test.tsx and the
// voice specs; this file holds what both platforms share: the bar is a group named Talk with an End that reports.
// The terminal draws only a hand-off and End (no audio there), so every other prop is listed as not read.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { TalkBar } from './TalkBar';

const NO_AUDIO = 'a terminal has no microphone or speaker the Hub can reach: Talk hands off to the web (MicButton.term), so this is never drawn';
const noop = () => {};

export default scenarios('TalkBar', loose(TalkBar), {
  ignored: {
    phase: NO_AUDIO, mode: NO_AUDIO, mic: NO_AUDIO, activity: NO_AUDIO, handsFree: NO_AUDIO, level: NO_AUDIO,
    canStopAnswer: NO_AUDIO, canStopSpeaking: NO_AUDIO, stopping: NO_AUDIO, notReadyStage: NO_AUDIO, ended: NO_AUDIO, overflow: NO_AUDIO,
    inputs: NO_AUDIO, input: NO_AUDIO, outputs: NO_AUDIO, output: NO_AUDIO, canChooseOutput: NO_AUDIO,
    onPttDown: NO_AUDIO, onPttUp: NO_AUDIO, onMode: NO_AUDIO, onMute: NO_AUDIO, onUnmute: NO_AUDIO, onStopAnswer: NO_AUDIO,
    onStopSpeaking: NO_AUDIO, onInput: NO_AUDIO, onOutput: NO_AUDIO, onRetry: NO_AUDIO, onTryAnyway: NO_AUDIO, onTakeOver: NO_AUDIO,
    onOpenSettings: NO_AUDIO, onEnableSound: NO_AUDIO,
  },
  unsupported: {},
  cases: [
    {
      name: 'live: End reports',
      props: (s) => ({
        phase: 'live', mode: 'ptt', mic: 'ptt-idle', handsFree: false, level: 0, canStopAnswer: false, canStopSpeaking: false, stopping: false,
        inputs: [], outputs: [], canChooseOutput: false, onEnd: s.fn('onEnd'),
        onPttDown: noop, onPttUp: noop, onMode: noop, onMute: noop, onUnmute: noop, onStopAnswer: noop, onStopSpeaking: noop, onInput: noop, onOutput: noop,
        onRetry: noop, onTryAnyway: noop, onTakeOver: noop, onOpenSettings: noop, onEnableSound: noop,
      }),
      covers: ['onEnd'],
      steps: [{ press: { role: 'button', name: 'End' } }],
      expect: { calls: { onEnd: 1 } },
    },
  ],
});
