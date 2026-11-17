// Join: a plain confirm with the share, that credit is not cash and the one thing
// the Hub can't undo, plus a link to the share's answer (a peek inside the dialog). The variables are empty and set at
// the press. While a join may have gone through the action is gone: core's held banner (Check again)
// stands in for it, and a press meanwhile would send nothing anyway (READ_BACK_FIRST).
import { Button, ConfirmDialog, type FaqItem } from '@kit';
import { useState } from 'react';
import type { Say, Write } from '../data';
import type { T } from './types';

const NONE: Record<string, never> = {};

export function JoinAction({ t, rate, rateAnswer, join, onNote }: { t: T; rate: string; rateAnswer: FaqItem; join: Write<Record<string, never>>; onNote: Say }) {
  const [open, setOpen] = useState(false);
  if (join.held.length > 0) return null;
  const go = async () => {
    setOpen(false);
    onNote(null);
    onNote('join', await join.run(NONE));
  };
  return (
    <>
      <Button variant="primary" busy={join.running} onPress={() => setOpen(true)}>
        {t('join.action')}
      </Button>
      <ConfirmDialog
        overlayId="join"
        isOpen={open}
        onOpenChange={setOpen}
        title={t('join.title')}
        body={rate ? t('join.body', { rate }) : t('join.body.unknown')}
        consequences={[t('join.creditOnly'), t('join.leave')]}
        faq={{ item: rateAnswer, label: t('join.how') }}
        confirmLabel={t('join.confirm')}
        onConfirm={() => void go()}
      />
    </>
  );
}
