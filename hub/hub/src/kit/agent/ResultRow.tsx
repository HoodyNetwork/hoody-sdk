// ResultRow: what a finished turn made, under its last reply. `Site atlas · port 3000
// [Open] [⋯]` when the reply links a running web port of yours (Open: a new tab until Live view exists; ⋯: Copy and, where the host
// allows, Put on Board), and `6 files changed [Review]` when the turn's edit tools changed files (Review opens Details on Edits).
// Nothing is guessed: no link, no site; no edit, no count. The count is all a block carries: the files are the snapshot's own,
// in memory only. A turn's question or approval stays first: the row is part of the reply, which follows it.
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { ActionMenu, type MenuAction } from '../overlays/Overlays';
import { useStrings } from '../strings';
import { useLinkHost } from './linkHost';
import { markLabel } from './markLabel';
import { siteMark } from './Reply';
import markStrings from './LinkMark.strings.en.json';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';

export interface ResultRowProps {
  /** The finished reply's text: its site is read from its own links. */
  text: string;
  /** How many files the turn's edit tools changed (or may have); absent or 0: none. */
  files?: number;
  /** Opens Details on Edits; absent where the chat has no Details (the dock, a Board tile): the count stays, without Review. */
  onReview?: () => void;
}

// A computer's address holds its ids: it is never put in the page (the Link rule), so Open is a button, as a mark's Open is.
const openTab = (href: string) => {
  window.open(href, '_blank', 'noopener,noreferrer');
};

export function ResultRow({ text, files, onReview }: ResultRowProps) {
  const t = useStrings(strings);
  const mt = useStrings(markStrings);
  const host = useLinkHost();
  const site = siteMark(text, host);
  const n = files && files > 0 ? files : 0;
  if (!site && !n) return null;
  const label = site ? markLabel(site, mt) : '';
  const href = site?.open?.k === 'tab' ? site.open.href : '';
  const items: MenuAction[] = [];
  if (site) {
    items.push({ id: 'copy', label: mt('mark.copy'), icon: 'external', copy: site.copy, onAction: () => undefined });
    const board = site.board && host?.boardAdd ? host.boardAdd({ ...site.board, label }) : '';
    if (board) items.push({ id: 'board', label: mt('mark.board'), icon: 'board', onAction: () => host?.openHub(board) });
  }
  return (
    <div className={s.result} data-result-row>
      {href && (
        <span className={s.resultPart} data-result-site>
          <span className={s.resultWords} translate="no">{t('result.site', { label })}</span>
          <Button size="sm" variant="secondary" aria-label={t('result.openName', { label })} onPress={() => openTab(href)}>{t('result.open')}</Button>
          <ActionMenu items={items} label={mt('mark.more', { label })} size="sm" />
        </span>
      )}
      {n > 0 && (
        <span className={s.resultPart} data-result-files>
          <span className={s.resultWords}>{t(n === 1 ? 'result.file' : 'result.files', { n })}</span>
          {onReview && <TextButton onPress={onReview} aria-label={t('result.reviewName', { n })}>{t('result.review')}</TextButton>}
        </span>
      )}
    </div>
  );
}
