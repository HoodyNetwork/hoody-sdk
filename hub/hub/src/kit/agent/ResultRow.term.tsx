// ResultRow in the terminal: what a finished turn made, under its last reply, by the web's rules (ResultRow.tsx). `Site atlas
// · port 3000  Open  ⋯` when the reply links a running web port of yours (siteMark: nothing guessed), and `3 files changed
// Review` when the turn's edit tools changed files (Review where the chat has Details). Open hands the address outside the
// Hub (openOutside: the device's browser, else copied and shown with its ids masked); ⋯ holds Copy address and, where the
// host allows, Put on Board. The address holds the computer's ids, so it is never drawn: only the mark's words are.
import type * as Web from './ResultRow';
import { Box, Text } from '@term/prim';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { ActionMenu, type MenuAction } from '../overlays/Menu';
import { openOutside } from '../states/openOutside';
import { useStrings } from '../strings';
import { useLinkHost } from './linkHost';
import { markLabel } from './markLabel';
import { siteMark } from './Reply.pure';
import markStrings from './LinkMark.strings.en.json';
import strings from './Conversation.strings.en.json';

export type { ResultRowProps } from './ResultRow';

export const ResultRow: typeof Web.ResultRow = ({ text, files, onReview }) => {
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
    <Box dir="row" gapX={2} wrap shrink={0}>
      {href ? (
        <Box dir="row" gapX={1} shrink={0} sem={{ role: 'group', name: t('result.site', { label }) }}>
          <Text colour="muted">{t('result.site', { label })}</Text>
          <Button size="sm" variant="secondary" aria-label={mt('mark.open', { label })} onPress={() => { openOutside(href); }}>{t('result.open')}</Button>
          <ActionMenu items={items} label={mt('mark.more', { label })} size="sm" />
        </Box>
      ) : null}
      {n > 0 ? (
        <Box dir="row" gapX={1} shrink={0}>
          <Text colour="muted">{t(n === 1 ? 'result.file' : 'result.files', { n })}</Text>
          {onReview ? <TextButton onPress={onReview} aria-label={t('result.reviewName', { n })}>{t('result.review')}</TextButton> : null}
        </Box>
      ) : null}
    </Box>
  );
};
