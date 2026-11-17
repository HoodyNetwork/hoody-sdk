// Where the VM list (or the images) would be while they cannot be shown at all (parts/gate.ts): the section keeps its
// place and title, and its state is notHere: the kit's small empty state says what is missing, then the next steps,
// with the one action that helps. The page's notice above it carries the reason and its Details; this section never
// claims the list is empty.
import { AnatomySection, useStrings, type IconName } from '@kit';
import strings from '../strings.en.json';
import type { Gate } from './gate';

const ICON: Record<Gate['kind'], IconName> = { stopped: 'computer', expired: 'computer', shared: 'server', unreachable: 'server', unreadable: 'server' };

export function Blocked({ gate, what, name, kvmOff }: { gate: Gate; what: 'vms' | 'images'; name: string; kvmOff: boolean }) {
  const t = useStrings(strings);
  const kind = gate.kind;
  const title =
    what === 'images' && kind === 'unreachable' ? t('blocked.images.unreachable.title', { name })
    : what === 'images' && kind === 'unreadable' ? t('blocked.images.unreadable.title', { name })
    : what === 'images' && kind === 'stopped' ? t('blocked.images.stopped.title', { name })
    : t(`blocked.${kind}.title`, { name });
  const body = kind === 'unreachable' && kvmOff ? t('blocked.unreachable.bodyKvmOff', { name }) : t(`blocked.${kind}.body`, { name });
  return (
    <AnatomySection
      id={what === 'images' ? 'vms-images-blocked' : 'vms-blocked'}
      title={t(what === 'images' ? 'images.title' : 'list.title')}
      state={{
        kind: 'notHere',
        icon: ICON[kind],
        title,
        body,
        action: gate.recheck
          ? { id: 'blocked-check', label: t('st.check'), name: t('blocked.check.name'), busy: gate.recheck.busy, onPress: gate.recheck.run }
          : gate.href
            ? { id: 'blocked-go', label: kind === 'shared' ? t('st.shared.action') : t('st.openComputers'), href: gate.href }
            : undefined,
      }}
    />
  );
}
