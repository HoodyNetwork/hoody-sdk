// MicButton: the Talk entry beside Send; one press starts Talk. When Talk cannot start here it stays
// focusable and says why (ReasonButton): voice is not set up for this Bot, the computer's agent cannot talk yet, or the
// Hub is framed (it must run in its own tab). Presentational: the page decides the reason and runs the press.
import { Button } from '../controls/Button';
import { ReasonButton } from '../layouts/anatomy/ReasonButton';
import type { ActionSpec } from '../layouts/anatomy/types';
import { useStrings } from '../strings';
import strings from './Voice.strings.en.json';

export type MicReason = 'notSetUp' | 'agentOld' | 'ownTab';

export interface MicButtonProps {
  /** Set: Talk cannot start here, for this reason. */
  reason?: MicReason;
  /** Starting: the press handler is running (a second press does nothing). */
  busy?: boolean;
  onPress: () => void;
}

export function MicButton({ reason, busy, onPress }: MicButtonProps) {
  const t = useStrings(strings);
  // The end glyph is a microphone, never the arrow, whether Talk can start or says why it cannot.
  if (reason) return <ReasonButton reason={t(`mic.why.${reason}`)} chipIcon="mic">{t('mic.label')}</ReasonButton>;
  return (
    <Button variant="secondary" chipIcon="mic" busy={busy} onPress={onPress}>
      {t('mic.label')}
    </Button>
  );
}

/** The same entry as an ActionSpec, for a surface that draws its own actions (the Composer's action row). */
export function useMicAction({ reason, busy, onPress }: MicButtonProps): ActionSpec {
  const t = useStrings(strings);
  return { id: 'talk', label: t('mic.label'), onPress, busy, disabledReason: reason ? t(`mic.why.${reason}`) : undefined };
}
