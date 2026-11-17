// The Talk bar in the terminal. A terminal session has no microphone or speaker the Hub can reach, so Talk never starts
// here (MicButton.term hands off and never runs the press). If a page draws the bar anyway (a Talk that was started on the
// web for the same conversation, or a stale phase), it is one band: Talk runs on the web (kit Handoff: the address and a
// copy key) and End, so the person can always leave it. No hold-to-talk, level, devices or hands-free: nothing here
// could capture or play audio.
import type * as Web from './TalkBar';
import { Box, useFocusControl } from '../../term/prim';
import { Button } from '../controls/Button';
import { usePageShortcuts } from '../../shell/pageShortcuts';
import { Handoff } from '../states/Handoff';
import { useStrings } from '../strings';
import strings from './Voice.strings.en.json';
import termStrings from './MicButton.term.strings.en.json';

export type { TalkActivity, TalkDevice, TalkBarHandlers, TalkBarProps, TalkShortcuts } from './TalkBar';

export const TalkBar: typeof Web.TalkBar = ({ onEnd }) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  return (
    <Box dir="row" gap={2} shrink={0} sem={{ role: 'group', name: t('bar.label') }}>
      <Box grow={1} shrink={1}><Handoff size="line" what={tt('mic.term.what')} reason={tt('mic.term.reason')} /></Box>
      <Button size="sm" onPress={onEnd}>{t('end')}</Button>
    </Box>
  );
};

/** MicButton.term's Talk entry id (the same literal: pinned by talkKey.term.test.tsx). */
const TALK_ENTRY = 'hub-talk-entry';

/** `t` focuses Talk: the Talk entry beside Send (MicButton.term), found by its id. The host's `focus` is not used: it
 *  reaches the web's Mic button through a DOM query (`querySelector('button')`), which finds no terminal entry, so `t`
 *  did nothing. Mute and Stop have nothing to act on in a terminal, so they bind no key. */
export const useTalkShortcuts: typeof Web.useTalkShortcuts = ({ enabled }) => {
  const t = useStrings(strings);
  const fc = useFocusControl();
  usePageShortcuts([{ key: 't', label: t('shortcut.focus'), run: () => { fc.focusDomId(TALK_ENTRY); }, enabled }]);
};
