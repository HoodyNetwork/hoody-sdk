// Talk in the terminal: a terminal session has no microphone or speaker the Hub can reach, so Talk hands off to the same
// conversation on the web (kit/states Handoff: the whole address, a copy key, a QR code). Beside Send it is one compact
// entry, as the web's Talk button is one: `[⇗ Talk]`, its reason as the description; pressing it opens the hand-off
// under it and pressing again closes it (the dock stays a few rows high; the address only on demand). The press handler
// is never run here: it would start audio capture in a process that has no audio. A reason the page gave (voice not set
// up, agent too old) is shown instead, as the web shows it, because the web could not start Talk either: soft-disabled
// as the web's ReasonButton (focusable, never acts), the reason in its words.
// The page key `t` (TalkBar.term useTalkShortcuts) focuses this entry by its id, TALK_ENTRY, in both forms.
import type * as Web from './MicButton';
import { useState } from 'react';
import { Handoff } from '../states/Handoff';
import { SoftPress } from '../controls/termPress';
import { Box, Pressable, Text } from '../../term/prim';
import { useStrings } from '../strings';
import strings from './Voice.strings.en.json';
import termStrings from './MicButton.term.strings.en.json';
import { focusInk } from '@term/kit';
export type { MicReason, MicButtonProps } from './MicButton';

/** The Talk entry's id. TalkBar.term.tsx holds the same literal (pinned by talkKey.term.test.tsx). */
const TALK_ENTRY = 'hub-talk-entry';

export const MicButton: typeof Web.MicButton = ({ reason }) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const [open, setOpen] = useState(false);
  if (reason && reason !== 'ownTab') {
    const why = t(`mic.why.${reason}`);
    return (
      <SoftPress off={false} soft domId={TALK_ENTRY} sem={{ name: t('mic.label'), description: why }}>
        {({ focused }) => <Text colour="muted" {...focusInk(focused)}>{t('mic.label') + ': ' + why}</Text>}
      </SoftPress>
    );
  }
  return (
    <Box dir="column" shrink={0}>
      <Pressable dir="row" shrink={0} domId={TALK_ENTRY} onPress={() => setOpen((v) => !v)} sem={{ role: 'button', name: t('mic.label'), description: tt('mic.term.reason'), expanded: open }}>
        {({ focused }) => <Text colour="blueText" {...focusInk(focused)}>{`[⇗ ${t('mic.label')}]`}</Text>}
      </Pressable>
      {open ? <Handoff size="line" what={tt('mic.term.what')} reason={tt('mic.term.reason')} /> : null}
    </Box>
  );
};

/** The action form: Talk shown but not startable here, with the reason (the composer's action row draws it soft-disabled). */
export const useMicAction: typeof Web.useMicAction = ({ reason, busy, onPress }) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  return { id: 'talk', label: t('mic.label'), onPress, busy, disabledReason: reason && reason !== 'ownTab' ? t(`mic.why.${reason}`) : tt('mic.term.reason') };
};
