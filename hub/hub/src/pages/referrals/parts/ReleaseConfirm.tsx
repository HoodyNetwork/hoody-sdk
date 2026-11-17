// Retire one listed code of your own (the page says "retire"; the API route and this file keep the name "release"): a
// worded secondary Retire… in the row's action column, shown whole at every width (nothing collapses into a bare ⋯), its
// InfoTip after it, and a plain danger confirm (typing is only for a Bot, a computer or the account). The variables are
// the code exactly as `me` listed it, never anything typed. The confirm lists what retiring does, one line each, with
// Retire code and Keep it.
import { Button, ConfirmDialog, InfoTip } from '@kit';
import { useState } from 'react';
import type { Say, Write } from '../data';
import type { T } from './types';

export function ReleaseButton({ t, code, release, onNote }: { t: T; code: string; release: Write<{ code: string }>; onNote: Say }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setOpen(false);
    setBusy(true);
    onNote(null);
    try {
      onNote('release', await release.run({ code }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" size="sm" aria-label={t('release.label', { code })} aria-haspopup="dialog" busy={busy} onPress={() => setOpen(true)}>
        {t('release.action')}
      </Button>
      <InfoTip text={t('tip.release')} subject={t('tip.release.subject')} />
      <ConfirmDialog
        overlayId="referrals-release"
        isOpen={open}
        onOpenChange={setOpen}
        tone="danger"
        title={t('release.title', { code })}
        consequences={[t('release.gone'), t('release.kept'), t('release.never'), t('release.counts')]}
        confirmLabel={t('release.confirm')}
        cancelLabel={t('release.keep')}
        onConfirm={() => void go()}
      />
    </>
  );
}
