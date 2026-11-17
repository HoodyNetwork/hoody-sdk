// The sentences of a VM's changes, built in one place so the list and a VM's own screen say the same thing: what may
// have gone through, what the last read showed about it, what was refused and why, and a VM's last problem. A reason
// is this page's own sentence for the VM program's code; the program's own text is never shown.
import { useStrings } from '@kit';
import { useMemo } from 'react';
import type { VmHeld, VmResult } from '../changes';
import { vmCode, type Vm, type VmFault, type VmRow } from '../logic';
import { heldNote, wordedCode, type Block } from '../power-logic';
import strings from '../strings.en.json';

export function useVmWords() {
  const t = useStrings(strings);
  return useMemo(() => ({
    /** The change that may have gone through, with the reason the computer gave, if it gave one. */
    held(h: VmHeld): string {
      if (!h.id) return t('power.held.other');
      const s = t(`power.held.${h.id.op}`, { vm: h.id.name });
      const c = wordedCode(h.reported);
      return c ? `${s} ${t('power.reported', { reason: t(`power.code.${c}`) })}` : s;
    },
    /** What the reads on screen show about a change still held. */
    note(h: VmHeld, list: readonly VmRow[] | undefined, vm: Vm | undefined): string | undefined {
      if (!h.id) return undefined;
      const n = heldNote(h.id, list, vm);
      if (n === 'gone') return t('power.note.gone');
      return n === 'notYet' ? t(h.id.op === 'delete' ? 'delete.note.notYet' : 'power.note.notYet') : undefined;
    },
    /** A change that was refused, or not sent. */
    result(r: VmResult): string {
      const s = t(`power.failed.${r.op}`, { vm: r.name });
      const c = wordedCode(vmCode(r.error));
      return c ? `${s} ${t(`power.code.${c}`)}` : s;
    },
    /** A VM's last problem. */
    fault(f: VmFault): string {
      const c = wordedCode(f.code);
      return c ? t('vm.fault', { reason: t(`power.code.${c}`) }) : t('vm.fault.other');
    },
    /** Why an action cannot be sent now. */
    why: (b: Block | null): string | undefined => (b ? t(`power.why.${b}`) : undefined),
  }), [t]);
}
