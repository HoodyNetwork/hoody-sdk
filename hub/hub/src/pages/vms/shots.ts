// Named screenshot states of the VMs page (`bun run hub:shots --page vms`). Each state is one row of the page's
// state table: what kind of server the computer is on, whether KVM is on, and what the VM program inside answers.
import type { Shots } from '@app/shots.types';

export default [
  // Bare metal, KVM on, one VM in each state.
  { name: 'many', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'few', state: 'few' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'empty', state: 'empty', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'loading', state: 'loading', waitForText: 'This computer' },
  // The VM list read fails while the VM program answers what the computer can run.
  { name: 'error', state: 'error' },
  // A shared server: VMs cannot run here.
  { name: 'shared', state: 'shared', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'kind-not-known', state: 'kind-not-known' },
  // Bare metal with KVM off: VMs list, none can start.
  { name: 'kvm-off', state: 'kvm-off', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'kvm-not-inside', state: 'kvm-not-inside' },
  { name: 'server-no', state: 'server-no' },
  // The VM program inside the computer does not answer.
  { name: 'unreachable', state: 'unreachable', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The VM program answers in a shape this Hub does not read.
  { name: 'unreadable', state: 'unreadable' },
  // Bare metal with no memory limit set (the VM program sends it as the largest 64-bit number).
  { name: 'no-memory-limit', state: 'no-memory-limit', extra: ['1350-light', '390-dark'] },
  { name: 'computer-stopped', state: 'computer-stopped' },
  { name: 'computer-expired', state: 'computer-expired' },
  { name: 'no-computer', computer: false },
  { name: 'unidentified-run', state: 'unidentified-run' },
  // One VM's own screen.
  { name: 'vm-running', path: '/web-1' },
  { name: 'vm-broken', path: '/batch' },
  { name: 'vm-creating', path: '/build' },
  { name: 'vm-not-created', path: '/import-1' },
  { name: 'vm-missing', path: '/nope' },
  { name: 'vm-bad-name', path: '/Not_A_Name' },
  // Logs tab: a console, no log yet, a log longer than the page reads, a failed read.
  { name: 'logs-console', state: 'logs-console', path: '/web-1?tab=logs', extra: ['390-dark'] },
  { name: 'logs-none', state: 'logs-none', path: '/web-1?tab=logs', extra: ['390-dark'] },
  { name: 'logs-long', state: 'logs-long', path: '/web-1?tab=logs', extra: ['390-dark'] },
  { name: 'logs-read-error', state: 'logs-read-error', path: '/web-1?tab=logs', extra: ['390-dark'] },
  // The KVM switch and the KVM on computers view.
  { name: 'kvm-tab', state: 'kvm-tab', path: '?view=kvm', realm: 'all', waitForText: 'KVM on each computer', extra: ['390-dark'] },
  { name: 'kvm-stopped', state: 'kvm-stopped', waitForText: 'Run VMs on this computer' },
  { name: 'kvm-turned-on', state: 'kvm-stopped', waitForText: 'Run VMs on this computer', act: [{ click: 'role=switch[name="Run VMs on this computer"] >> xpath=ancestor::label[1]' }, { waitFor: 'text=Start it when you want to use VMs' }] },
  { name: 'kvm-stop-first', state: 'kvm-running', waitForText: 'Run VMs on this computer', act: [{ click: 'role=switch[name="Run VMs on this computer"] >> xpath=ancestor::label[1]' }, { waitFor: 'text=Stop atlas to turn KVM on?' }] },
  { name: 'kvm-held', state: 'kvm-lost', waitForText: 'Run VMs on this computer', act: [{ click: 'role=switch[name="Run VMs on this computer"] >> xpath=ancestor::label[1]' }, { waitFor: 'text=may have gone through' }] },
  { name: 'kvm-refused', state: 'kvm-refused', waitForText: 'Run VMs on this computer', act: [{ click: 'role=switch[name="Run VMs on this computer"] >> xpath=ancestor::label[1]' }, { waitFor: 'text=This server cannot run VMs' }] },
  // Ports, Settings and Storage tabs.
  { name: 'ports-running', path: '/web-1?tab=ports', extra: ['390-dark'] },
  { name: 'ports-empty', path: '/win11?tab=ports' },
  { name: 'ports-edit', state: 'ports-saved', path: '/win11?tab=ports', act: [{ click: 'Open a port' }, { click: 'Add a port' }, { fill: 'role=textbox[name="Port 1 in the VM"]', text: '8000' }, { press: 'Tab' }, { waitFor: 'text=Ports on the computer start at' }], extra: ['390-dark'] },
  { name: 'ports-conflict', state: 'ports-conflict', path: '/win11?tab=ports', act: [{ click: 'Open a port' }, { click: 'Add a port' }, { fill: 'role=textbox[name="Port 1 in the VM"]', text: '80' }, { press: 'Tab' }, { fill: 'role=textbox[name="Port 1 on the computer"]', text: '8080' }, { press: 'Tab' }, { click: 'Save ports' }, { waitFor: 'text=is already used by the VM web-1' }] },
  { name: 'ports-held', state: 'ports-held', path: '/win11?tab=ports', act: [{ click: 'Open a port' }, { click: 'Add a port' }, { fill: 'role=textbox[name="Port 1 in the VM"]', text: '2222' }, { press: 'Tab' }, { click: 'Save ports' }, { waitFor: 'text=may have gone through' }] },
  { name: 'settings-stopped', path: '/win11?tab=settings', extra: ['390-dark'] },
  { name: 'settings-running', path: '/web-1?tab=settings' },
  { name: 'settings-saved', state: 'settings-saved', path: '/win11?tab=settings', act: [{ fill: 'role=textbox[name="CPUs"]', text: '4' }, { press: 'Tab' }, { click: 'Save settings' }, { waitFor: 'text=Saved' }] },
  { name: 'settings-refused', state: 'settings-refused', path: '/win11?tab=settings', act: [{ fill: 'role=textbox[name="CPUs"]', text: '4' }, { press: 'Tab' }, { click: 'Save settings' }, { waitFor: 'text=Another change of this VM is under way' }] },
  { name: 'settings-held', state: 'settings-held', path: '/win11?tab=settings', act: [{ fill: 'role=textbox[name="CPUs"]', text: '4' }, { press: 'Tab' }, { click: 'Save settings' }, { waitFor: 'text=may have gone through' }], extra: ['390-dark'] },
  { name: 'storage-stopped', path: '/win11?tab=storage', extra: ['390-dark'] },
  { name: 'storage-share', path: '/files-1?tab=storage' },
  { name: 'storage-live', state: 'storage-live', path: '/web-1?tab=storage' },
  { name: 'storage-grow', path: '/win11?tab=storage', act: [{ click: 'Make the disk bigger' }, { waitFor: 'text=A disk only grows' }] },
  { name: 'storage-full-held', state: 'storage-full-held', path: '/win11?tab=storage', act: [{ click: 'Make the disk bigger' }, { fill: 'role=textbox[name="New size (GiB)"]', text: '200' }, { press: 'Tab' }, { click: 'Make it bigger' }, { waitFor: 'text=not enough free disk' }] },
  { name: 'storage-live-held', state: 'storage-live-held', path: '/web-1?tab=storage', act: [{ click: 'role=button[name^="Change disc"]' }, { fill: 'role=textbox[name="Disc image on the computer"]', text: '/var/lib/hoody-vm/isos/debian-13-netinst.iso' }, { press: 'Tab' }, { click: 'Use this disc' }, { waitFor: 'text=may have reached' }] },
  { name: 'ports-busy', state: 'ports-busy', path: '/win11?tab=ports', act: [{ click: 'Open a port' }, { click: 'Add a port' }, { fill: 'role=textbox[name="Port 1 in the VM"]', text: '80' }, { press: 'Tab' }, { fill: 'role=textbox[name="Port 1 on the computer"]', text: '8080' }, { press: 'Tab' }, { click: 'Save ports' }, { waitFor: 'text=Another change of this VM is under way' }] },
  { name: 'storage-busy', state: 'storage-busy', path: '/win11?tab=storage', act: [{ click: 'Make the disk bigger' }, { fill: 'role=textbox[name="New size (GiB)"]', text: '100' }, { press: 'Tab' }, { click: 'role=button[name^="Make it bigger"]' }, { waitFor: 'text=Another change of this VM is under way' }] },
  { name: 'storage-nodrive', state: 'storage-live-nodrive', path: '/web-1?tab=storage', act: [{ click: 'role=button[name^="Insert a disc"]' }, { fill: 'role=textbox[name="Disc image on the computer"]', text: '/var/lib/hoody-vm/isos/debian-13-netinst.iso' }, { press: 'Tab' }, { click: 'Use this disc' }, { waitFor: 'text=This drive was empty when the VM started' }] },
  // The list's and a VM's power and delete.
  { name: 'vm-stopped', path: '/win11', waitForText: 'Starts with', extra: ['390-dark'] },
  { name: 'vm-stalled', path: '/stuck', waitForText: 'This VM stopped answering', extra: ['390-dark'] },
  { name: 'vm-needs-repair', path: '/ghost', waitForText: 'This VM needs repair', extra: ['390-dark'] },
  { name: 'power-refused', state: 'power-refused', path: '?q=win11', act: [{ click: 'Start win11' }, { waitFor: 'text=win11 did not start.' }], noOutcome: 'a refusal shows as the section notice (a kit Band with Details), not an Outcome line', extra: ['390-dark'] },
  { name: 'power-pending', state: 'power-lost', path: '?q=web-1', act: [{ click: 'Shut down web-1' }, { waitFor: 'text=The shut-down of web-1 may have gone through.' }], noOutcome: 'a held change shows as the kit HeldBand (Check again, Stop tracking), not an Outcome line', extra: ['390-dark'] },
  { name: 'vm-power-pending', state: 'power-lost', path: '/web-1', act: [{ click: 'Shut down' }, { waitFor: 'text=The shut-down of web-1 may have gone through.' }], noOutcome: 'a held change shows as the kit HeldBand (Check again, Stop tracking), not an Outcome line', extra: ['390-dark'] },
  { name: 'delete-ask', state: 'power-ok', path: '/win11', act: [{ click: 'More actions' }, { click: 'role=menuitem[name=/^Delete/]' }, { waitFor: 'text=Delete win11?' }], extra: ['390-dark'] },
  { name: 'delete-pending', state: 'power-lost', path: '?q=win11', act: [{ click: 'Row actions' }, { click: 'role=menuitem[name=/^Delete win11/]' }, { fill: 'Type win11 to confirm', text: 'win11' }, { press: 'Tab' }, { click: 'Delete VM' }, { waitFor: 'text=The delete of win11 may have gone through.' }], noOutcome: 'a held change shows as the kit HeldBand (Check again, Stop tracking), not an Outcome line', extra: ['390-dark'] },
  // Images view: the image store and its downloads; nothing kept; the first read; a failed image read.
  { name: 'images-many', state: 'images-many', path: '?view=images', waitForText: 'releases.ubuntu.com', extra: ['390-dark'] },
  { name: 'images-empty', state: 'images-empty', path: '?view=images', waitForText: 'No images yet', extra: ['390-dark'] },
  { name: 'images-loading', state: 'images-loading', path: '?view=images', waitForText: 'Downloads' },
  { name: 'images-error', state: 'images-error', path: '?view=images', waitForText: 'releases.ubuntu.com' },
  // Snapshots tab: a stopped VM's snapshots, a running VM (take and restore off), none yet, a failed read.
  { name: 'snap-many', state: 'snap-many', path: '/win11?tab=snapshots', waitForText: 'Move this VM', extra: ['390-dark'] },
  { name: 'snap-running', state: 'snap-many', path: '/web-1?tab=snapshots', waitForText: 'Move this VM', extra: ['390-dark'] },
  { name: 'snap-empty', state: 'snap-empty', path: '/win11?tab=snapshots', waitForText: 'No snapshots yet' },
  { name: 'snap-error', state: 'snap-error', path: '/win11?tab=snapshots', waitForText: "This didn't load" },
  // New VM: the form, a computer that lacks UEFI, a create that may have gone through, a refusal.
  { name: 'create-form', state: 'create-ok', path: '?new=1', waitForText: 'What you get', extra: ['390-dark'] },
  { name: 'create-bare', state: 'create-bare', path: '?new=1', waitForText: 'What you get' },
  { name: 'create-made', state: 'create-ok', path: '?new=1', waitForText: 'What you get', act: [{ fill: 'role=dialog >> role=textbox[name="Name"]', text: 'new-1' }, { press: 'Tab' }, { click: 'role=dialog >> text=An empty disk' }, { click: 'role=dialog >> role=button[name="Create VM"]' }, { waitFor: 'role=heading[name="new-1"]' }] },
  { name: 'create-pending', state: 'create-lost-nothing', path: '?new=1', waitForText: 'What you get', act: [{ fill: 'role=dialog >> role=textbox[name="Name"]', text: 'new-1' }, { press: 'Tab' }, { click: 'role=dialog >> text=An empty disk' }, { click: 'role=dialog >> role=button[name="Create VM"]' }, { waitFor: 'text=may have been created' }], extra: ['390-dark'] },
  { name: 'create-refused', state: 'create-refused', path: '?new=1', waitForText: 'What you get', act: [{ fill: 'role=dialog >> role=textbox[name="Name"]', text: 'new-1' }, { press: 'Tab' }, { click: 'role=dialog >> text=An empty disk' }, { click: 'role=dialog >> role=button[name="Create VM"]' }, { waitFor: 'text=A VM with this name exists already' }] },
  // Screen tab: a running VM's screen, one without a screen, a key press that may have been sent.
  { name: 'screen-running', state: 'screen-keys-ok', path: '/web-1?tab=screen', waitForText: 'Screen address', extra: ['390-dark'] },
  { name: 'screen-headless', state: 'screen-headless', path: '/web-1?tab=screen', waitForText: 'This VM has no screen' },
  { name: 'screen-stopped', state: 'screen-keys-ok', path: '/win11?tab=screen', waitForText: 'The screen shows while the VM runs' },
  { name: 'screen-keys-pending', state: 'screen-keys-lost', path: '/web-1?tab=screen', waitForText: 'Leave screen', act: [{ click: 'role=group[name="Screen"] >> role=button >> nth=0' }, { click: 'css=[role="menuitem"]:has-text("Ctrl+Alt+Del"), :text("may have been sent")' }, { waitFor: 'text=may have been sent' }], extra: ['390-dark'] },
] satisfies Shots;
