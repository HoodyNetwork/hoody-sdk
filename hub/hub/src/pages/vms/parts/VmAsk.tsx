// The questions asked before a VM's power is cut, before it is reset and before it is deleted. Each dialog shows the
// flow's own question (changes.ts), which is bound to the computer and the VM that opened it: the flow closes it when
// either is no longer what the screen shows. A refusal stays in the dialog; an answer that may have gone through
// closes it, and the screen's band takes over.
import { ConfirmDialog, DangerConfirm, useStrings } from '@kit';
import type { VmFlow } from '../changes';
import strings from '../strings.en.json';
import { useVmWords } from './words';

export function VmAsk({ flow, computer }: { flow: VmFlow; computer: string }) {
  const t = useStrings(strings);
  const words = useVmWords();
  const a = flow.ask;
  const r = flow.askResult;
  const vm = a?.vm.name ?? '';
  const say = { vm, name: computer };
  const shared = {
    onOpenChange: (open: boolean) => { if (!open) flow.cancel(); },
    onConfirm: flow.confirm,
    busy: flow.confirming,
    outcome: r ? { kind: r.outcome, message: words.result(r) } : undefined,
  };
  const remove = a?.op === 'delete' && a.vm.neverCreated === true;
  return (
    <>
      <ConfirmDialog
        {...shared}
        overlayId="vms-ask-power-off"
        isOpen={a?.op === 'forceStop'}
        tone="danger"
        title={t('power.ask.forceStop.title', say)}
        body={t('power.ask.forceStop.body', say)}
        confirmLabel={t('power.forceStop')}
      />
      <ConfirmDialog
        {...shared}
        overlayId="vms-ask-reset"
        isOpen={a?.op === 'reset'}
        title={t('power.ask.reset.title', say)}
        body={t('power.ask.reset.body', say)}
        confirmLabel={t('power.reset')}
      />
      <ConfirmDialog
        {...shared}
        overlayId="vms-ask-remove"
        isOpen={remove}
        tone="danger"
        title={t('delete.remove.title', say)}
        body={t('delete.remove.body', say)}
        confirmLabel={t('delete.remove.go')}
      />
      <DangerConfirm
        {...shared}
        overlayId="vms-ask-delete"
        isOpen={a?.op === 'delete' && !remove}
        title={t('delete.ask.title', say)}
        body={t('delete.ask.body', say)}
        consequences={[t('delete.ask.disk'), t('delete.ask.snapshots'), t('delete.ask.undo')]}
        confirmLabel={t('delete.ask.go')}
        confirmText={vm}
      />
    </>
  );
}
