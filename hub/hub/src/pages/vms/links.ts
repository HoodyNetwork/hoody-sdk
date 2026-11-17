// Public hrefs of the VMs page: the only file other pages may import from this folder.
// A VM is addressed by its name inside the computer shown (the top bar's); the address names no computer.
export const links = {
  list: '/vms',
  /** The list with the New VM form open. */
  newVm: '/vms?new=1',
  /** One VM of the shown computer. */
  item: (name: string) => `/vms/${encodeURIComponent(name)}`,
} as const;

// ── The KVM switch of a computer, for the computer page's Features section ───────────────────────────────────────────
// One flow, one lock and one proof (kvm.ts), and the same words (kvm.* and host.* of this page's strings): the computer
// page draws the row and sends nothing of its own.
export { kvmFactsOfRow, useKvmFlow, type KvmFlow, type KvmTarget } from './kvm';
export { kvmAction, type KvmAction, type KvmFacts } from './kvm-logic';
export { KvmDialog, KvmOutcome, heldKey as kvmHeldKey } from './parts/KvmSection';
export { default as kvmStrings } from './strings.en.json';
