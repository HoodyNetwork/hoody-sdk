// The VM card's words (split out of VmCard.tsx so the terminal build shares them; VmCard.tsx re-exports every name).
import type { VmSupport } from '../computers';
import type { T } from './text';

/** The systems a VM can run, by product name. macOS is not offered. */
export const VM_SYSTEMS: readonly string[] = ['Linux', 'Windows', 'Android'];
/** The systems as one line ("Linux, Windows, Android"), for the strings that name them all. */
export const vmSystemsLine = (): string => VM_SYSTEMS.join(', ');

/** The Picker row's line for a computer's server: it sells VMs only where bare metal is the answer, says the server
 *  can run them only on bare metal whose check says so, and promises nothing where support is not known. */
export function vmRowDesc(vm: VmSupport | undefined, t: T): string {
  if (vm === 'shared' || vm === 'none') return t('picker.vmSell', { systems: vmSystemsLine() });
  if (vm === 'ready') return t('picker.vmReady');
  return t('picker.vmAsk');
}
