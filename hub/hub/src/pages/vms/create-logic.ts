// Pure rules of "New VM": no React, no I/O.
//
// Contract, in plain words:
//   - The form holds what the person chose. A hardware field left alone (null) follows the system picked; one set by
//     hand wins over it. A size left alone follows the system too.
//   - gates(caps) says which systems and switches this computer can give, from the VM program's capability read.
//   - resolve(form, caps) is what the VM will be made with: the system's choices, then the person's.
//   - check(form, ctx) answers the request body or the fields that are wrong. The body always carries the four fields
//     the VM program requires (name, source, memory, CPUs); every other field only when it differs from what the VM
//     program would pick on its own for that system.
//   - A name is taken while a VM that exists or is being created holds it; the name of a create that failed is free.
//   - createVerdict reads a fresh VM list for a create whose answer was lost: a row under the name with an id that was
//     not there before the send proves the request arrived (made, or being made; a failed row: not made). The same id
//     as before proves nothing, and neither does a list without the name, however many and however late.
//   - parseImages and parseTemplates read the two lists the form offers; an answer that is not the list is null.
import { parseImages as parseStoreImages } from './images-logic';
import { memoryUse, rowKind, VM_NAME, type Caps, type VmRow } from './logic';

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

// ── the two lists the form offers ────────────────────────────────────────────────────


/** One installer image in the computer's image store. */
export interface Image {
  readonly sha256: string;
  /** Only a ready image can be installed from; one still being uploaded is listed and cannot be picked. */
  readonly ready: boolean;
  readonly bytes: number;
  /** What the image says it is (the first system it was matched to, else its volume name); null: it says nothing. */
  readonly label: string | null;
  /** False: the image is for another kind of machine, so no VM here starts from it. Null: not known. */
  readonly bootable: boolean | null;
}

/** The image list as the form offers it (the Images view's own reading of the store, images-logic.ts), or null when the
 *  answer is not one. */
export function parseImages(wire: unknown): Image[] | null {
  const all = parseStoreImages(wire);
  if (!all) return null;
  const seen = new Set<string>();
  const out: Image[] = [];
  for (const i of all) {
    if (seen.has(i.sha256)) return null;
    seen.add(i.sha256);
    out.push({ sha256: i.sha256, ready: i.phase === 'ready', bytes: i.bytes, label: i.system ?? i.volumeId, bootable: i.bootable });
  }
  return out;
}

/** A ready-made disk the computer offers. */
export interface Template { readonly id: string; readonly diskBytes: number }

export function parseTemplates(wire: unknown): Template[] | null {
  if (!Array.isArray(wire)) return null;
  const out: Template[] = [];
  for (const it of wire) {
    const r = rec(it);
    const diskBytes = count(r?.disk_bytes);
    if (!r || typeof r.id !== 'string' || !VM_NAME.test(r.id) || diskBytes === null || out.some((x) => x.id === r.id)) return null;
    out.push({ id: r.id, diskBytes });
  }
  return out;
}

// ── the form ─────────────────────────────────────────────────────────────────────────

export const SYSTEMS = ['linux', 'windows-11', 'windows-server', 'other'] as const;
export type System = (typeof SYSTEMS)[number];
export const SOURCES = ['image', 'template', 'blank', 'copy', 'file'] as const;
export type Source = (typeof SOURCES)[number];

export interface CreateForm {
  readonly name: string;
  readonly system: System;
  readonly source: Source;
  /** An image: one of the computer's store ('store', by `image`) or an image file on the computer ('path'). */
  readonly imageFrom: 'store' | 'path';
  readonly image: string;
  readonly imagePath: string;
  readonly template: string;
  readonly copyOf: string;
  readonly filePath: string;
  /** Sizes; null: the system's own (sizeOf). */
  readonly memoryGib: number | null;
  readonly vcpus: number | null;
  readonly diskGib: number | null;
  readonly screen: boolean;
  readonly autostart: boolean;
  /** Fixed for the VM's life. null: the system's own. */
  readonly firmware: 'uefi' | 'bios' | null;
  readonly secureBoot: boolean | null;
  readonly tpm: boolean | null;
  readonly bus: 'virtio' | 'sata' | null;
  readonly hostCpu: boolean;
  readonly agent: boolean;
  readonly console: boolean;
  readonly share: boolean;
}

export const DEFAULT_FORM: CreateForm = {
  name: '', system: 'linux', source: 'image', imageFrom: 'store', image: '', imagePath: '', template: '', copyOf: '', filePath: '',
  memoryGib: null, vcpus: null, diskGib: null, screen: true, autostart: false,
  firmware: null, secureBoot: null, tpm: null, bus: null, hostCpu: false, agent: true, console: true, share: false,
};

const windows = (s: System): boolean => s === 'windows-11' || s === 'windows-server';

/** The sizes a system starts with. */
export function sizeOf(system: System): { memoryGib: number; vcpus: number; diskGib: number } {
  return windows(system) ? { memoryGib: 4, vcpus: 2, diskGib: 64 } : { memoryGib: 2, vcpus: 2, diskGib: 20 };
}

export const BOUNDS = { memoryGib: { min: 0.5, max: 1024 }, vcpus: { min: 1, max: 4096 }, diskGib: { min: 1, max: 16384 } } as const;

/** What this computer can give a new VM. */
export interface Gates {
  /** Why a system cannot be picked here; absent: it can. */
  readonly system: { readonly [K in System]?: 'needsUefi' | 'needsSecureBootTpm' };
  readonly uefi: boolean;
  readonly secureBoot: boolean;
  readonly tpm: boolean;
  readonly share: boolean;
  readonly templates: boolean;
  /** The Windows driver disc is on this computer (it rides as a second disc of an install from an image). */
  readonly driverDisc: boolean;
}

export function gates(caps: Caps): Gates {
  const p = caps.provisioning;
  const system: { -readonly [K in System]?: 'needsUefi' | 'needsSecureBootTpm' } = {};
  if (!p.uefi) { system['windows-11'] = 'needsUefi'; system['windows-server'] = 'needsUefi'; }
  else if (!p.secureBoot || !p.tpm) system['windows-11'] = 'needsSecureBootTpm';
  return { system, uefi: p.uefi, secureBoot: p.secureBoot, tpm: p.tpm, share: p.fileSharing, templates: p.templates, driverDisc: p.virtioWinIso };
}

/** What the VM program picks by itself for a system on this computer (nothing but the system sent). */
function own(system: System, g: Gates): { firmware: 'uefi' | 'bios'; secureBoot: boolean; tpm: boolean; bus: 'virtio' | 'sata' } {
  return {
    firmware: 'uefi',
    secureBoot: system === 'windows-11',
    tpm: system === 'linux' ? false : system === 'other' ? g.tpm : true,
    bus: windows(system) && !g.driverDisc ? 'sata' : 'virtio',
  };
}

export interface Resolved {
  readonly system: System;
  readonly memoryMib: number;
  readonly vcpus: number;
  /** Null: the disk comes whole from the source (a template, a copy, a disk file). */
  readonly diskGib: number | null;
  readonly screen: boolean;
  readonly firmware: 'uefi' | 'uefi-secure-boot' | 'bios';
  readonly tpm: boolean;
  readonly bus: 'virtio' | 'sata';
  /** The driver disc rides along (a Windows install from an image on a computer that has the disc). */
  readonly driverDisc: boolean;
  /** UEFI is not on this computer, so the VM starts with BIOS although nobody asked for it. */
  readonly biosFallback: boolean;
}

const sized = (s: Source): boolean => s === 'image' || s === 'blank';

/** What the VM will be made with: the system's choices on this computer, then the person's own. */
export function resolve(form: CreateForm, caps: Caps): Resolved {
  const g = gates(caps);
  const o = own(form.system, g);
  const size = sizeOf(form.system);
  const firmware = form.firmware ?? (g.uefi ? o.firmware : 'bios');
  const secure = firmware === 'uefi' && (form.secureBoot ?? o.secureBoot);
  return {
    system: form.system,
    memoryMib: Math.round((form.memoryGib ?? size.memoryGib) * 1024),
    vcpus: form.vcpus ?? size.vcpus,
    diskGib: sized(form.source) ? (form.diskGib ?? size.diskGib) : null,
    screen: form.screen,
    firmware: secure ? 'uefi-secure-boot' : firmware,
    tpm: form.tpm ?? (o.tpm && g.tpm),
    bus: form.bus ?? o.bus,
    driverDisc: windows(form.system) && form.source === 'image' && g.driverDisc,
    biosFallback: form.firmware === null && !g.uefi,
  };
}

/** Memory this computer still has for a VM that starts now, in MiB (its own memory, after what each running VM holds
 *  on top); null when no memory limit is set. A hint: a VM can be made bigger than this, it only cannot start. */
export function memoryRoomMib(caps: Caps): number | null {
  return memoryUse(caps).freeForNewVmMib;
}

// ── check and body ───────────────────────────────────────────────────────────────────

export type FieldError =
  | 'nameEmpty' | 'nameInvalid' | 'nameTaken' | 'systemGated' | 'imageNone' | 'imageNotReady' | 'imageNotBootable' | 'listUnread' | 'pathInvalid' | 'templateNone' | 'copyNone' | 'copyRunning'
  | 'memoryRange' | 'vcpusRange' | 'diskRange' | 'secureBootNeedsUefi' | 'notOnThisComputer';
export type Field = 'name' | 'system' | 'image' | 'imagePath' | 'template' | 'copyOf' | 'filePath' | 'memory' | 'vcpus' | 'disk' | 'firmware' | 'secureBoot' | 'tpm' | 'share';

export interface CheckContext {
  readonly caps: Caps;
  /** The computer's VMs as last listed; undefined: not read, and then nothing can be created (check refuses). */
  readonly rows: readonly VmRow[] | undefined;
  readonly images: readonly Image[] | undefined;
  readonly templates: readonly Template[] | undefined;
}

export type CreateBody = { name: string; source: Record<string, unknown>; memory_mib: number; vcpus: number } & Record<string, unknown>;
export type CheckResult = { readonly ok: true; readonly body: CreateBody } | { readonly ok: false; readonly errors: { readonly [K in Field]?: FieldError } };

/** Whether a VM that exists or is being created holds the name. A failed create's name is free. */
export function nameTaken(name: string, rows: readonly VmRow[] | undefined): boolean {
  return (rows ?? []).some((r) => r.name === name && rowKind(r) !== 'createFailed');
}

/** The VMs a new one can be a copy of: stopped ones (a running VM's disk cannot be copied). */
export function copySources(rows: readonly VmRow[] | undefined): string[] {
  return (rows ?? []).filter((r) => rowKind(r) === 'stopped').map((r) => r.name);
}

/** An absolute path on the computer, one line, nothing a path cannot hold. */
const absPath = (p: string): boolean => p.startsWith('/') && p.length <= 4096 && !/[\0\n\r]/.test(p) && p.trim() === p && p !== '/';
const within = (n: number, b: { min: number; max: number }): boolean => Number.isFinite(n) && n >= b.min && n <= b.max;

export function check(form: CreateForm, ctx: CheckContext): CheckResult {
  const g = gates(ctx.caps);
  const r = resolve(form, ctx.caps);
  const errors: { [K in Field]?: FieldError } = {};
  const name = form.name;
  // Without the VM list no name can be called free, and a later list could not tell this create from an earlier VM.
  if (ctx.rows === undefined) errors.name = 'listUnread';
  else if (name === '') errors.name = 'nameEmpty';
  else if (!VM_NAME.test(name)) errors.name = 'nameInvalid';
  else if (nameTaken(name, ctx.rows)) errors.name = 'nameTaken';
  if (g.system[form.system]) errors.system = 'systemGated';

  let source: Record<string, unknown> | null = null;
  switch (form.source) {
    case 'image':
      if (form.imageFrom === 'path') {
        if (!absPath(form.imagePath)) errors.imagePath = 'pathInvalid';
        else source = { type: 'iso', gib: r.diskGib, path: form.imagePath };
      } else {
        const img = (ctx.images ?? []).find((i) => i.sha256 === form.image);
        if (!img) errors.image = 'imageNone';
        else if (!img.ready) errors.image = 'imageNotReady';
        else if (img.bootable === false) errors.image = 'imageNotBootable';
        else source = { type: 'iso', gib: r.diskGib, sha256: img.sha256 };
      }
      break;
    case 'template':
      if (!g.templates || !(ctx.templates ?? []).some((t) => t.id === form.template)) errors.template = 'templateNone';
      else source = { type: 'template', id: form.template };
      break;
    case 'blank':
      source = { type: 'blank', gib: r.diskGib };
      break;
    case 'copy': {
      const row = (ctx.rows ?? []).find((x) => x.name === form.copyOf);
      if (!row) errors.copyOf = 'copyNone';
      else if (rowKind(row) !== 'stopped') errors.copyOf = 'copyRunning';
      else source = { type: 'vm-disk', name: row.name };
      break;
    }
    case 'file':
      if (!absPath(form.filePath)) errors.filePath = 'pathInvalid';
      else source = { type: 'offline-file', path: form.filePath };
      break;
  }

  if (!within(r.memoryMib / 1024, BOUNDS.memoryGib)) errors.memory = 'memoryRange';
  if (!Number.isInteger(r.vcpus) || !within(r.vcpus, BOUNDS.vcpus)) errors.vcpus = 'vcpusRange';
  if (r.diskGib !== null && (!Number.isInteger(r.diskGib) || !within(r.diskGib, BOUNDS.diskGib))) errors.disk = 'diskRange';

  // Only what the person set by hand is refused here; a system's own choices are gated as a whole (systemGated).
  if (form.firmware === 'uefi' && !g.uefi) errors.firmware = 'notOnThisComputer';
  if (form.secureBoot === true && (form.firmware ?? (g.uefi ? 'uefi' : 'bios')) === 'bios') errors.secureBoot = 'secureBootNeedsUefi';
  else if (form.secureBoot === true && !g.secureBoot) errors.secureBoot = 'notOnThisComputer';
  if (form.tpm === true && !g.tpm) errors.tpm = 'notOnThisComputer';
  if (form.share && !g.share) errors.share = 'notOnThisComputer';

  if (Object.keys(errors).length > 0 || source === null) return { ok: false, errors };

  const o = own(form.system, g);
  const body: CreateBody = { name, source, memory_mib: r.memoryMib, vcpus: r.vcpus };
  if (form.system !== 'other') body.os = form.system;
  // No screen is what the VM program does by itself; a screen is asked for.
  if (form.screen) body.display = 'auto';
  const firmware = r.firmware === 'bios' ? 'bios' : 'uefi';
  if (firmware !== o.firmware) body.firmware = firmware;
  const secure = r.firmware === 'uefi-secure-boot';
  if (secure !== o.secureBoot) body.secure_boot = secure;
  // Sent also when a Windows system's own TPM is not on this computer: the VM is then made without one, said so.
  if (r.tpm !== o.tpm) body.tpm = r.tpm;
  if (r.bus !== o.bus) body.bus = r.bus;
  if (form.hostCpu) body.cpu = 'host';
  if (!form.agent) body.agent = false;
  if (!form.console) body.console = false;
  if (form.share) body.share = true;
  if (form.autostart) body.autostart = true;
  return { ok: true, body };
}

/** Whether the person changed anything worth a "discard?" question. */
export function edited(form: CreateForm): boolean {
  return (Object.keys(DEFAULT_FORM) as (keyof CreateForm)[]).some((k) => form[k] !== DEFAULT_FORM[k]);
}

// ── a create whose answer was lost ───────────────────────────────────────────────────

/** What a held create remembers of its send (the change's identity; plain data, no secret). */
export interface CreateSent {
  /** The computer it was sent to. */
  readonly computer: string;
  readonly name: string;
  /** The ids listed under the name before the send (a failed create kept from an earlier try). */
  readonly before: readonly string[];
  /** When it was sent, ms. */
  readonly at: number;
}

export function sentOf(v: unknown): CreateSent | null {
  const r = rec(v);
  if (!r || typeof r.computer !== 'string' || typeof r.name !== 'string' || typeof r.at !== 'number' || !Array.isArray(r.before) || r.before.some((x) => typeof x !== 'string')) return null;
  return { computer: r.computer, name: r.name, before: r.before as string[], at: r.at };
}

/** What fresh VM lists prove about a create whose answer is not known. Only a row under the name whose id the list did
 *  not hold before the send proves anything: the VM (created), or its failed create (not created). A list without the
 *  name proves nothing, however many and however late: the computer may still be working on the request. */
export function createVerdict(sent: CreateSent, lists: readonly (readonly VmRow[])[]): 'applied' | 'not_applied' | undefined {
  for (const list of lists) {
    const row = list.find((r) => r.name === sent.name);
    // A row with no id, or with an id listed before the send, is the earlier VM or failed create under the name.
    if (!row || row.vmId === null || sent.before.includes(row.vmId)) continue;
    return rowKind(row) === 'createFailed' ? 'not_applied' : 'applied';
  }
  return undefined;
}

/** Whether a held change of the VM input lock is a key press of this VM inside this computer. The computer counts: two
 *  computers can hold VMs with the same id (a copied VM store), and one must never show or free the other's press. */
export function ownKeyHold(identity: Record<string, unknown>, computer: string | null, vmId: string | null): boolean {
  return computer !== null && vmId !== null && identity.computer === computer && identity.vmId === vmId && identity.what === 'keys';
}
