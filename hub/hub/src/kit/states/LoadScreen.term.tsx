// The setup screen in the terminal: a hand-off. Its stages, cards and their timing are drawn and paced for a browser,
// and the only page that shows it is itself handed to the web in the terminal; were it ever drawn here, it says why
// and gives the address (kit/states Handoff), never a half-drawn animation.
import type * as Web from './LoadScreen';
import { Handoff } from './Handoff';
import { useStrings } from '../strings';
import strings from './LoadScreen.term.strings.en.json';
export type { LoadAsk, LoadCard, LoadScreenProps, LoadStage, LoadStageState } from './LoadScreen';

/** How long the web shows each card (the web module's value; a sibling exports every runtime name of its module). */
export const LOAD_CARD_MS = 7200;

export const LoadScreen: typeof Web.LoadScreen = () => {
  const t = useStrings(strings);
  return <Handoff size="block" what={t('load.term.what')} reason={t('load.term.reason')} />;
};
