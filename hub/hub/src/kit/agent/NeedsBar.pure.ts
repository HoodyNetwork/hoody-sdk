// NeedsBar.pure: the words of the "Waiting for you" row, shared by the web bar and the terminal transcript.
import { clean, scrubSecrets } from './code';
import type { useStrings } from '../strings';
import type { GateEntry } from './source';
import type strings from './NeedsBar.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** One line naming what waits: the command or path of an approval, the question of a question. Keys hidden first, as the card hides them
 *  (needsbar-scrub: the bar must never show a key the card shows as [hidden]), then cleaned, bounded. */
export function needsWhat(g: GateEntry, t: T): string {
  const gate = g.gate;
  if (gate.kind === 'question') {
    const q = gate.questions && gate.questions.length ? gate.questions[0]?.question : gate.question;
    return q ? clean(scrubSecrets(q), 140).text : t('needs.askQuestion');
  }
  const p = gate.params;
  const raw = p && typeof p.command === 'string' ? p.command : p && typeof p.path === 'string' ? p.path : p && typeof p.file_path === 'string' ? p.file_path : '';
  return raw ? t('needs.approve', { what: clean(scrubSecrets(raw), 140).text }) : t('needs.approveTool');
}
