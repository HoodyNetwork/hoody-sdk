// The gallery's voice specimens: the Talk button and its refusals, the Talk bar live
// and in every other phase, and the caption strip. The handlers do nothing, so pressing here changes nothing.
import { useState } from 'react';
import { Button } from '../controls/Button';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Row, Stack } from '../layouts/Stack';
import { useStrings } from '../strings';
import { CaptionStrip } from '../voice/CaptionStrip';
import { MicButton, useMicAction } from '../voice/MicButton';
import { TalkBar, useTalkShortcuts, type TalkBarProps } from '../voice/TalkBar';
import type { Phase } from '../voice/machine';
import strings from './voice.strings.en.json';

const noop = () => undefined;
const OTHER: readonly Phase[] = ['connecting', 'reconnecting', 'notReady', 'checkUnknown', 'denied', 'noDevice', 'playbackBlocked', 'busyElsewhere', 'budget', 'connectFailed', 'ended'];

/**
 * The live hold control for the browser spec (kit/voice/TalkBar.hold.spec.ts), with everything it does recorded on
 * `data-hold-log`, in order: "d" down, "u" up, "s" the bar's Stop speaking (Escape on the bar), "S" the page's stop
 * (Escape through useTalkShortcuts), "m" the page's mute key, "x" a form submit (never expected: the control is a
 * type=button inside a form). Beside it, two kit primary Buttons (enabled, disabled) for the look comparison.
 */
function HoldRecorder({ base }: { base: TalkBarProps }) {
  const t = useStrings(strings);
  const [log, setLog] = useState<string[]>([]);
  const add = (c: string) => setLog((l) => [...l, c]);
  const held = log.filter((c) => c === 'd').length > log.filter((c) => c === 'u').length;
  useTalkShortcuts({
    enabled: true,
    focus: () => document.querySelector<HTMLElement>('[data-hold-recorder] button[data-variant="primary"]')?.focus(),
    toggleMute: () => add('m'),
    stop: () => add('S'),
  });
  return (
    <div data-hold-recorder="" data-hold-log={log.join('')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add('x');
        }}
      >
        <TalkBar
          {...base}
          mic={held ? 'ptt-held' : 'ptt-idle'}
          onPttDown={() => add('d')}
          onPttUp={() => add('u')}
          onStopSpeaking={() => add('s')}
        />
      </form>
      <Row gap={3}>
        <Button variant="primary" onPress={noop}>{t('sample.kitButton')}</Button>
        <Button variant="primary" isDisabled onPress={noop}>{t('sample.kitButton')}</Button>
      </Row>
    </div>
  );
}

export function VoiceTab() {
  const t = useStrings(strings);
  useMicAction({ reason: 'ownTab', onPress: noop });
  const base: TalkBarProps = {
    phase: 'live', mode: 'ptt', mic: 'ptt-idle', handsFree: true, level: 0.35, canStopAnswer: true, canStopSpeaking: true, stopping: false,
    activity: 'speaking', notReadyStage: t('sample.stage'), ended: 'lost',
    inputs: [{ id: 'in', label: t('sample.device') }], input: 'in', outputs: [{ id: 'out', label: t('sample.speaker') }], output: 'out', canChooseOutput: true,
    onPttDown: noop, onPttUp: noop, onMode: noop, onMute: noop, onUnmute: noop, onStopAnswer: noop, onStopSpeaking: noop, onEnd: noop,
    onInput: noop, onOutput: noop, onRetry: noop, onTryAnyway: noop, onTakeOver: noop, onOpenSettings: noop, onEnableSound: noop,
  };
  return (
    <Stack gap={5}>
      <AnatomySection id="voice-mic" title={t('sec.mic')} description={t('sec.micDesc')}>
        <Row gap={3} wrap>
          <MicButton onPress={noop} />
          <MicButton onPress={noop} busy />
          <MicButton onPress={noop} reason="notSetUp" />
          <MicButton onPress={noop} reason="agentOld" />
          <MicButton onPress={noop} reason="ownTab" />
        </Row>
      </AnatomySection>
      <AnatomySection id="voice-live" title={t('sec.live')} description={t('sec.liveDesc')}>
        <Stack gap={4}>
          <HoldRecorder base={base} />
          <TalkBar {...base} mic="ptt-held" activity="hearing" canStopSpeaking={false} />
          <TalkBar {...base} mode="vad" mic="vad" activity="listening" canStopAnswer={false} canStopSpeaking={false} />
          <TalkBar {...base} phase="muted" handsFree={false} canChooseOutput={false} canStopSpeaking={false} stopping />
        </Stack>
      </AnatomySection>
      <AnatomySection id="voice-phases" state={{ kind: 'ready' }} title={t('sec.phases')} description={t('sec.phasesDesc')}>
        <Stack gap={3}>
          {OTHER.map((phase) => <TalkBar key={phase} {...base} phase={phase} />)}
        </Stack>
      </AnatomySection>
      <AnatomySection id="voice-captions" title={t('sec.captions')} description={t('sec.captionsDesc')}>
        <Stack gap={3}>
          <CaptionStrip you={{ text: t('sample.you'), final: false }} />
          <CaptionStrip you={{ text: t('sample.you'), final: true }} bot={{ name: t('sample.bot'), text: t('sample.reply'), final: false }} />
        </Stack>
      </AnatomySection>
    </Stack>
  );
}
