// A queued Bot's status words, one rule for the list's status column and the Bot pane's header pill: a queue of 3+ digits
// shows the short form ("150 waiting") so a narrow pill never cuts it. The short form is the whole text, on screen and for a
// screen reader alike: no hidden copy and no native title, so the web and the terminal read the same words.
import type { Translate } from '@kit';
import type strings from '../strings.en.json';

export function queuedLabel(t: Translate<typeof strings>, count: number): string {
  return count < 100 ? t('status.queuedN', { count }) : t('status.queuedShort', { count });
}
