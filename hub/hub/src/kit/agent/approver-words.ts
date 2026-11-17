// The approver lease's words and the page's holder id. No lease state lives here.
import { useStrings } from '../strings';
import strings from './Approver.strings.en.json';

/** One opaque id per page life: what the agent reports as the answerer. Printable ASCII, no spaces, 20 chars. */
export function tabHolder(): string {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return 'hub-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** The agent's lease refusal codes, as a kind. */
export type ApproverRefusal = 'required' | 'invalid' | 'expired' | 'held';
export function approverRefusalOf(code: string): ApproverRefusal | null {
  switch (code) {
    case 'approver_lease_required': return 'required';
    case 'approver_lease_invalid': return 'invalid';
    case 'approver_lease_expired': return 'expired';
    case 'approver_lease_held': return 'held';
    default: return null;
  }
}

/** The words for a lease refusal code (null when the code is not a lease one), and for the held-elsewhere band. */
export function useApproverWords(): { code(code: string): string | null; elsewhere(): string; takeOver(): string; stillHeld(): string } {
  const t = useStrings(strings);
  return {
    code(c) {
      const k = approverRefusalOf(c);
      return k === null ? null : k === 'held' ? t('approver.elsewhere') : t(`approver.${k}` as 'approver.required');
    },
    elsewhere: () => t('approver.elsewhere'),
    takeOver: () => t('approver.takeOver'),
    stillHeld: () => t('approver.stillHeld'),
  };
}
