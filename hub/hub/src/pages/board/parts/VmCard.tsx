// "Virtual machine" in Add a program: what a computer's server allows for full VMs, told plainly.
// VMs are created and managed on the VMs page, so nothing launches from here: the card says where to go.
//
// Contract, in plain words:
//   - 'shared' (a free or paid slice of a shared host) and 'none' (a bare-metal server without KVM): the VM selling
//     point, the systems, and that full VMs need a rented bare-metal server, with a way to the Market when this load
//     serves it.
//   - 'ready' (a bare-metal server whose KVM check says yes): this server can run VMs, with the systems, and they are
//     created and managed on the VMs page. Its one button opens that page for this computer: the VMs page shows the
//     computer picked in the top bar, so the card's computer becomes that one first (as the tile menu's Open in
//     Programs does). A load that does not serve the VMs page says so, with no button.
//   - 'unchecked' (bare metal, KVM not checked in the last hour) and 'unknown' (the row names no server): no promise.
//   - At most one primary button: the Market's on 'shared' and 'none', the VMs page's on 'ready'.
//   - Every list of systems shown (the kit Tags here, under the card's actions, the Picker row's line) comes from VM_SYSTEMS (product names, not
//     translated): adding one is a one-line change.
//   - The card moves no focus itself: the Picker owns it (the step's title, when a press or a removed control asks).
import { chooseComputer } from '@core';
import { Button, followPageLink, Tag, useGo, usePageLink } from '@kit';
import { VM_SYSTEMS } from './VmCard.pure';
export { VM_SYSTEMS, vmSystemsLine, vmRowDesc } from './VmCard.pure';
import type { BoardComputer, VmSupport } from '../computers';
import type { T } from './text';
import s from './board.module.css';
import { TileCard } from './TileCard';

export function VmCard({ vm, computer: row, t, onBack }: { vm: VmSupport; computer: BoardComputer; t: T; onBack: () => void }) {
  const market = usePageLink('market');
  const vms = usePageLink('vms');
  const go = useGo();
  const computer = row.name;
  const sell = vm === 'shared' || vm === 'none';
  const title = vm === 'ready' ? t('vm.readyTitle') : sell ? t('vm.sellTitle') : t('vm.title');
  const body =
    vm === 'shared' ? t('vm.shared', { computer }) : vm === 'none' ? t('vm.none', { computer }) : vm === 'ready' ? (vms ? t('vm.ready', { computer }) : t('vm.readyNoPage', { computer })) : vm === 'unchecked' ? t('vm.unchecked', { computer }) : t('vm.unknown', { computer });
  // The card's one way forward, only to a page this load serves: the Market where bare metal is the answer, the VMs
  // page (for this computer) where the server can run them. Never both: a server is one kind.
  const toMarket = sell && market ? () => followPageLink(market, go) : null;
  const toVms = vm === 'ready' && vms ? () => { chooseComputer(row); followPageLink(vms, go); } : null;
  return (
    <TileCard
      icon="server"
      title={title}
      body={body}
      actions={
        <>
          <Button variant="ghost" onPress={onBack}>{t('picker.backStep')}</Button>
          {toMarket && <Button variant="primary" onPress={toMarket}>{t('vm.market')}</Button>}
          {toVms && <Button variant="primary" onPress={toVms}>{t('vm.open')}</Button>}
        </>
      }
      note={(sell || vm === 'ready') && (
        <ul className={s.vmSystems} aria-label={t('vm.systems')}>
          {VM_SYSTEMS.map((name) => <li key={name}><Tag>{name}</Tag></li>)}
        </ul>
      )}
    />
  );
}
