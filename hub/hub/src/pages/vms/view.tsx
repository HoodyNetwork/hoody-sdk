// The VMs page: the virtual machines that run inside the computer picked in the top bar.
//
// Two screens (screens.ts): the list (what this computer can run, then its VMs) and one VM. The page asks the VM
// program inside the computer only when VMs can be there at all: never with no computer picked, nor for a computer
// that is stopped, expired or on a shared server (logic.ts wantsVmReads).
//
// While the VMs cannot be shown (parts/gate.ts) the notice says why and the list's place says what to do next
// (parts/Blocked.tsx): the page never ends under "This computer".
// A new part of the page adds one section or one view here.
import { useAgentScopeFacts } from '@core';
import { AgentHint, Band, Button, ComputerRequired, DetailPage, LinkButton, matchScreen, useDrawerParam, useGo, useSearchParam, useStrings, useSubPath } from '@kit';
import { Blocked } from './parts/Blocked';
import { useGate } from './parts/gate';
import { useHost, useVmList } from './data';
import { links } from './links';
import { pageFaq } from './faq';
import { CreateDrawer } from './parts/CreateDrawer';
import { Images } from './parts/Images';
import { KvmSection } from './parts/KvmSection';
import { KvmTab } from './parts/KvmTab';
import { VmScreen } from './parts/VmScreen';
import { VmTable } from './parts/VmTable';
import { SCREENS } from './screens';
import strings from './strings.en.json';

export default function VmsView() {
  const screen = matchScreen(useSubPath('/vms'), SCREENS);
  if (screen?.id === 'item') return <VmScreen name={screen.params.name ?? ''} />;
  if (screen?.id === 'list') return <ListScreen />;
  return <NoScreen />;
}

/** An address under /vms that names no screen. */
function NoScreen() {
  const t = useStrings(strings);
  return (
    <DetailPage
      header={{ title: t('title') }}
      state={{ kind: 'notHere', title: t('st.noScreen.title'), body: t('st.noScreen.body'), action: { id: 'all-vms', label: t('st.allVms'), href: links.list } }}
    />
  );
}

/** The list screen's views (the layout's view bar, URL key `view`; `vms` leaves the URL clean). */
type ListView = 'vms' | 'images' | 'kvm';

function ListScreen() {
  const t = useStrings(strings);
  const host = useHost();
  // The list is read only once the VM program answered what it can do: an unreachable program is not asked for VMs.
  const list = useVmList(host.state.kind === 'ready');
  const gate = useGate(host);
  const agentFacts = useAgentScopeFacts();
  const [viewParam, setView] = useSearchParam('view');
  // Images are not offered on a shared server: its ?view=images shows the VMs view.
  const view: ListView = viewParam === 'kvm' ? 'kvm' : viewParam === 'images' && gate?.kind !== 'shared' ? 'images' : 'vms';
  const views = {
    label: t('views.label'),
    items: [
      { id: 'vms' as const, label: t('view.vms') },
      ...(gate?.kind === 'shared' ? [] : [{ id: 'images' as const, label: t('view.images') }]),
      { id: 'kvm' as const, label: t('view.kvm') },
    ],
    value: view,
    onChange: (v: ListView) => setView(v === 'vms' ? undefined : v),
  };
  // New VM: the drawer is the URL's `new=1`; it is offered where the VM program answers (KVM off included: a VM
  // can be made there, it only cannot start).
  const [newParam, openNew, closeNew] = useDrawerParam('new');
  const go = useGo();
  const canCreate = !gate && host.state.kind === 'ready';
  // What the computer's own row says: the blocked list names turning KVM on as the first step only when it is off.
  const kvmOff = host.facts.kind === 'ok' && host.facts.facts.kvm === false;
  // The page's questions (faq.ts), its guide in long form, under every view.
  const { items } = pageFaq(t);
  if (host.state.kind === 'none') return <ComputerRequired state="none" header={{ title: t('title'), subtitle: t('subtitle.none'), actions: <AgentHint page="vms" facts={agentFacts} /> }} />;
  return (
    <>
    <DetailPage
      header={{ title: t('title'), subtitle: host.name ? t('subtitle', { name: host.name }) : t('subtitle.none'), actions: <AgentHint page="vms" facts={agentFacts} />, primary: canCreate && view === 'vms' ? { label: t('create.open'), icon: 'plus', onPress: () => openNew('1') } : undefined }}
      views={views}
      faq={{ items }}
      notice={
        gate ? (
          <Band
            tone={gate.tone}
            error={gate.error}
            actions={
              <>
                {gate.recheck ? <Button size="sm" busy={gate.recheck.busy} onPress={gate.recheck.run}>{t('st.check')}</Button> : null}
                {gate.href ? <LinkButton size="sm" href={gate.href}>{gate.kind === 'shared' ? t('st.shared.action') : t('st.openComputers')}</LinkButton> : null}
              </>
            }
          >
            {gate.text}
          </Band>
        ) : undefined
      }
    >
      {view === 'vms' && <KvmSection host={host} />}
      {view === 'vms' && !gate && <VmTable host={host} list={list} onNew={canCreate ? () => openNew('1') : undefined} />}
      {view === 'images' && !gate && <Images host={host} />}
      {view !== 'kvm' && gate && <Blocked gate={gate} what={view} name={host.name} kvmOff={kvmOff} />}
      {view === 'kvm' && <KvmTab />}
    </DetailPage>
    <CreateDrawer isOpen={newParam !== undefined && canCreate} host={host} list={list} onClose={closeNew} onMade={(name) => go(links.item(name), { replace: true })} />
    </>
  );
}
