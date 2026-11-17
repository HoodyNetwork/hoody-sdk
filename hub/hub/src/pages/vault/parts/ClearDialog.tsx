// Clear vault: every entry of ONE partition goes. The button arms only once the partition's name is typed
// exactly (kit DangerConfirm); the dialog says how many entries go and how many of them Hoody's tools use.
// The result shows on the page: done (the list empties in place), a hold banner (pending), or a plain line.
import { DangerConfirm, useStrings } from '@kit';
import { useState } from 'react';
import { clearPartition, type Change } from '../data';
import { ALIAS_KEY, GLOBAL, isHoodyKey, type Partition, type VaultRow } from '../logic';
import strings from '../strings.en.json';

export interface ClearDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  partition: Partition;
  partitionName: string;
  rows: readonly VaultRow[];
  /** A Retry-After is still running: nothing is sent. */
  waiting: boolean;
  onResult: (c: Change) => void;
}

export function ClearDialog({ isOpen, onOpenChange, partition, partitionName, rows, waiting, onResult }: ClearDialogProps) {
  const t = useStrings(strings);
  const [busy, setBusy] = useState(false);
  const hoody = rows.filter((r) => isHoodyKey(r.key)).length;
  const consequences = [
    t('clear.count', { count: rows.length }),
    ...(hoody ? [t('clear.hoody', { count: hoody })] : []),
    ...(rows.some((r) => r.key === ALIAS_KEY) ? [t('clear.alias')] : []),
  ];
  const run = async () => {
    if (busy || waiting) return;
    setBusy(true);
    try {
      const c = await clearPartition(partition);
      onOpenChange(false);
      onResult(c);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DangerConfirm
      overlayId="vault-clear"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('clear.title', { partition: partitionName })}
      body={partition === GLOBAL ? t('clear.bodyGlobal') : t('clear.bodyRealm', { partition: partitionName })}
      consequences={consequences}
      confirmText={partitionName}
      confirmLabel={t('clear.confirm')}
      busy={busy}
      onConfirm={() => void run()}
    />
  );
}
