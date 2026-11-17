// The Bot's archive: the rows Start over and Forget moved out of the conversation, read only, a page of 100 at a time
// (newest page first; Older steps back, Newer forward). It reads only while open, and draws rows as the Activity log does.
import { Drawer, EmptyState, ErrorState, Skeleton, TextButton, useStrings } from '@kit';
import { useState } from 'react';
import { useArchive } from '../data';
import strings from '../strings.en.json';
import { LogItem } from './ActivityTab';
import s from './pane.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  botKey: string | undefined;
  name: string;
}

export function ArchiveDrawer({ open, onClose, botKey, name }: Props) {
  const t = useStrings(strings);
  // The pages stepped back through, held with the Bot they belong to: each entry is the seq the page ends before (the
  // newest page has none). Another Bot, or a closed drawer, drops the stack (reset during render, so a return to the
  // first Bot or a reopen starts at its newest page too), and the very first render after either already reads the
  // newest page: no read ever asks one Bot's archive at another Bot's or an earlier visit's cursor.
  const [nav, setNav] = useState<{ bot: string | undefined; stack: number[] }>({ bot: botKey, stack: [] });
  if (nav.bot !== botKey || (!open && nav.stack.length > 0)) setNav({ bot: botKey, stack: [] });
  const stack = open && nav.bot === botKey ? nav.stack : [];
  const setStack = (f: (st: number[]) => number[]) => setNav({ bot: botKey, stack: f(stack) });
  const before = stack[stack.length - 1];
  const q = useArchive(botKey, before, open);
  const page = q.page;
  const oldest = page?.rows[0]?.seq;
  return (
    <Drawer overlayId="bots-archive-drawer" resizeKey="bots-archive"
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t('archive.title', { name })}
      subtitle={t('archive.desc')}
      cancel={t('archive.close')}
    >
      <div className={s.drawerForm}>
        {(page?.hasOlder || stack.length > 0) && (
          <div className={s.older}>
            {page?.hasOlder && oldest !== undefined && (
              <TextButton icon="arrow-up" onPress={() => setStack((st) => [...st, oldest])}>
                {t('archive.older')}
              </TextButton>
            )}
            {stack.length > 0 && (
              <TextButton icon="arrow-down" onPress={() => setStack((st) => st.slice(0, -1))}>
                {t('archive.newer')}
              </TextButton>
            )}
          </div>
        )}
        {q.isPending && !page && <Skeleton rows={6} />}
        {q.isError && !page && <ErrorState size="sm" title={t('archive.error')} error={q.error} onRetry={() => void q.refetch()} />}
        {page && page.rows.length === 0 && <EmptyState size="sm" icon="logs" title={t('archive.empty')} body={t('archive.emptyBody')} />}
        {page && page.rows.length > 0 && (
          <ol className={s.log} aria-label={t('archive.title', { name })}>
            {page.rows.map((r) => (
              <LogItem key={r.seq} row={r} />
            ))}
          </ol>
        )}
      </div>
    </Drawer>
  );
}
