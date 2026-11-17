// The states in which the VMs of a computer cannot be shown at all: it is stopped, expired, on a shared server, its
// VM program does not answer, or it answers in a shape this Hub does not read (never called unreachable). One hook, so the list and a VM's own screen say the same thing and offer the same way
// out; each draws it as the page's notice (a kit Band), with the "This computer" section still on screen.
// Null: the VM program answers, or is still being asked, and the screen shows its own state.
import { usePageLink, useStrings } from '@kit';
import { links as billingLinks } from '../../billing/links';
import { links as computersLinks } from '../../computers/links';
import type { Host } from '../data';
import strings from '../strings.en.json';

export interface Gate {
  readonly kind: 'stopped' | 'expired' | 'shared' | 'unreachable' | 'unreadable';
  readonly tone: 'neutral' | 'warn';
  /** The sentence. */
  readonly text: string;
  /** Where the person can go from here (shared: the bare-metal servers on offer; stopped and expired: the computer's own
   *  page); none when this load does not serve that page. */
  readonly href?: string;
  /** unreachable, unreadable: reads again. */
  readonly recheck?: { readonly run: () => void; readonly busy: boolean };
  /** unreachable, unreadable: the rejection, for Details. */
  readonly error?: unknown;
}

export function useGate(host: Host): Gate | null {
  const t = useStrings(strings);
  const computers = usePageLink('computers');
  const billing = usePageLink('billing');
  const name = host.name;
  const computer = computers ? (host.handle ? computersLinks.item(host.handle) : computersLinks.list) : undefined;
  switch (host.state.kind) {
    case 'stopped':
      return { kind: 'stopped', tone: 'neutral', text: t('st.stopped', { name }), href: computer };
    case 'expired':
      return { kind: 'expired', tone: 'warn', text: t('st.expired', { name }), href: computer };
    case 'shared':
      return { kind: 'shared', tone: 'neutral', text: t('st.shared', { name }), href: billing ? billingLinks.servers() : undefined };
    case 'unreachable':
      return { kind: 'unreachable', tone: 'warn', text: t('st.unreachable', { name }), recheck: { run: host.recheck, busy: host.checking }, error: host.capsError };
    case 'unreadable':
      return { kind: 'unreadable', tone: 'warn', text: t('st.unreadable', { name }), recheck: { run: host.recheck, busy: host.checking }, error: host.capsError };
    default:
      return null;
  }
}
