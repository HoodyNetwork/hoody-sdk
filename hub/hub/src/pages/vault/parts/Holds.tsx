// The vault's held changes: one banner per change that may have gone through, in every partition. A held
// PUT has Check again (a fresh read of its own partition, by its write id); a held DELETE or Clear has only
// the warned Dismiss (a read cannot prove them). A hold this page did not send is shown read-only.
import { ConfirmDialog, OutcomeBanner, useStrings } from '@kit';
import { useState } from 'react';
import { checkHold, dismissHold, type CheckResult, type VaultHold } from '../data';
import strings from '../strings.en.json';

export function Holds({ holds, nameOf }: { holds: readonly VaultHold[]; nameOf: (partition: string) => string }) {
  if (holds.length === 0) return null;
  // No wrapper of its own: the banners are spaced by the notice slot or the stack they sit in.
  return (
    <>
      {holds.map((h) => (
        <HoldBanner key={h.change.hold ?? `${h.change.seq}`} hold={h} nameOf={nameOf} />
      ))}
    </>
  );
}

function HoldBanner({ hold, nameOf }: { hold: VaultHold; nameOf: (partition: string) => string }) {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<CheckResult | null>(null);
  const [asking, setAsking] = useState(false);
  const { id } = hold;
  const partition = nameOf(id.partition);
  const title = id.op === 'clear' ? t('hold.title.clear', { partition }) : t(`hold.title.${id.op}`, { key: id.key, partition });
  const base = id.op === 'put' ? t('hold.bodyPut') : id.op === 'delete' ? t('hold.bodyDelete') : t('hold.bodyClear');
  const extra = note === 'unproven' && id.op === 'put' ? t('hold.unproven') : note === 'unread' ? t('hold.unread') : null;

  if (!hold.own) {
    return (
      <OutcomeBanner
        kind="pending"
        title={title}
        body={t('hold.elsewhere')}
      />
    );
  }

  const check = async () => {
    setChecking(true);
    try {
      setNote(await checkHold(hold));
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      <OutcomeBanner
        kind="pending"
        title={title}
        body={extra ? `${base} ${extra}` : base}
        {...(id.op === 'put' ? { onCheck: () => void check(), checking } : {})}
        onDismiss={() => setAsking(true)}
        dismissWarned
      />
      <ConfirmDialog
        overlayId="vault-hold-stop"
        isOpen={asking}
        onOpenChange={setAsking}
        title={t('hold.dismissTitle')}
        body={t('hold.dismissBody')}
        confirmLabel={t('hold.dismissConfirm')}
        onConfirm={() => {
          setAsking(false);
          void dismissHold(hold);
        }}
      />
    </>
  );
}
