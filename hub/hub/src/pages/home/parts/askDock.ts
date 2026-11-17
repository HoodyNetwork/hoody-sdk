// Opens the shell's Ask dock, and remembers that the person has asked (the first-steps "Ask your agent" tick).
// With a question and onStart, the question is sent as the first message of a NEW conversation (the one open before
// stays in Recent, untouched) and onStart hears how that went; without, the dock opens on the current conversation.
import { useAskDock, type AskStartOutcome } from '@kit';
import { useWidgetPrefs } from './useWidgetPrefs';

export function useAskPrefill(): (question: string, onStart?: (o: AskStartOutcome) => void) => void {
  const dock = useAskDock();
  const { setFlag } = useWidgetPrefs();
  return (question, onStart) => {
    dock.open(question ? { text: question, source: 'home', start: !!onStart, onStart } : undefined);
    if (question) setFlag('asked');
  };
}
