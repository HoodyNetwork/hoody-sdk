// Vitest: the rules of "New VM" (create-logic.ts). The body holds the four required fields and only what differs from
// what the VM program picks by itself; a system the computer cannot run is gated; the two lists the form offers refuse
// a malformed row; and a create whose answer was lost is proved only by a VM id that was not there before the send.
import { describe, expect, it } from 'vitest';
import { check, copySources, createVerdict, ownKeyHold, DEFAULT_FORM, gates, nameTaken, parseImages, parseTemplates, resolve, sentOf, type CheckContext, type CreateForm, type CreateSent } from './create-logic';
import { CAPS } from './fixtures';
import { parseCaps, type Caps, type VmRow } from './logic';
import { CREATE_BODY } from './routes';

const caps = (wire: unknown): Caps => {
  const c = parseCaps(wire);
  if (!c) throw new Error('fixture caps unreadable');
  return c;
};
const READY = caps(CAPS.ready);
const BARE = caps(CAPS.bare);
const SHA = 'a'.repeat(64);
const row = (name: string, vmId: string | null, over: Partial<VmRow> = {}): VmRow => ({ name, vmId, phase: 'committed', state: 'Stopped', share: null, ...over });
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({ caps: READY, rows: [], images: [{ sha256: SHA, ready: true, bytes: 1, label: 'Debian 13', bootable: true }, { sha256: 'c'.repeat(64), ready: false, bytes: 1, label: null, bootable: null }, { sha256: 'd'.repeat(64), ready: true, bytes: 1, label: 'Debian 13 (ARM)', bootable: false }], templates: [{ id: 'debian-13', diskBytes: 1 }], ...over });
const form = (over: Partial<CreateForm> = {}): CreateForm => ({ ...DEFAULT_FORM, name: 'db-1', image: SHA, ...over });
const body = (f: CreateForm, c: CheckContext = ctx()) => {
  const r = check(f, c);
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.errors)}`);
  return r.body;
};
const errors = (f: CreateForm, c: CheckContext = ctx()) => {
  const r = check(f, c);
  return r.ok ? {} : r.errors;
};

describe('the create body', () => {
  it('an untouched Linux install sends the required four, the system and the screen, nothing else', () => {
    expect(body(form())).toEqual({ name: 'db-1', source: { type: 'iso', sha256: SHA, gib: 20 }, memory_mib: 2048, vcpus: 2, os: 'linux', display: 'auto' });
  });

  it('holds only keys the route sends, whatever is changed', () => {
    const all = body(form({ system: 'other', firmware: 'bios', bus: 'sata', hostCpu: true, agent: false, console: false, share: true, autostart: true, screen: false, tpm: false, memoryGib: 8, vcpus: 4, diskGib: 64 }));
    for (const k of Object.keys(all)) expect(CREATE_BODY).toContain(k);
    expect(all).toMatchObject({ firmware: 'bios', bus: 'sata', cpu: 'host', agent: false, console: false, share: true, autostart: true, tpm: false, memory_mib: 8192, vcpus: 4 });
    expect(all).not.toHaveProperty('display');
    expect(all).not.toHaveProperty('os');
  });

  it('a switch left as the program picks it is not sent', () => {
    const b = body(form({ hostCpu: false, agent: true, console: true, share: false, autostart: false }));
    for (const k of ['cpu', 'agent', 'console', 'share', 'autostart', 'firmware', 'secure_boot', 'tpm', 'bus']) expect(b).not.toHaveProperty(k);
  });

  it('each source sends its own shape', () => {
    expect(body(form({ source: 'blank', diskGib: 40 })).source).toEqual({ type: 'blank', gib: 40 });
    expect(body(form({ source: 'image', imageFrom: 'path', imagePath: '/srv/debian.iso' })).source).toEqual({ type: 'iso', path: '/srv/debian.iso', gib: 20 });
    expect(body(form({ source: 'template', template: 'debian-13' })).source).toEqual({ type: 'template', id: 'debian-13' });
    expect(body(form({ source: 'file', filePath: '/srv/disk.qcow2' })).source).toEqual({ type: 'offline-file', path: '/srv/disk.qcow2' });
    expect(body(form({ source: 'copy', copyOf: 'old' }), ctx({ rows: [row('old', 'id-1')] })).source).toEqual({ type: 'vm-disk', name: 'old' });
  });

  it('Windows 11 sends its system and leaves Secure Boot and TPM to the program', () => {
    const b = body(form({ system: 'windows-11' }));
    expect(b.os).toBe('windows-11');
    expect(b).not.toHaveProperty('secure_boot');
    expect(b).not.toHaveProperty('tpm');
    expect(resolve(form({ system: 'windows-11' }), READY)).toMatchObject({ firmware: 'uefi-secure-boot', tpm: true });
  });

  it('Secure Boot turned off for Windows Server is sent; TPM turned off is sent', () => {
    const b = body(form({ system: 'windows-server', tpm: false }));
    expect(b.tpm).toBe(false);
  });
});

describe('what a computer can run', () => {
  it('a computer with everything gates nothing', () => {
    expect(gates(READY).system).toEqual({});
  });

  it('without UEFI, Secure Boot and TPM: Windows 11 is gated, Linux falls back to BIOS', () => {
    const g = gates(BARE);
    expect(g.system['windows-11']).toBeDefined();
    expect(g.system.linux).toBeUndefined();
    expect(errors(form({ system: 'windows-11' }), ctx({ caps: BARE })).system).toBe('systemGated');
    expect(resolve(form(), BARE)).toMatchObject({ firmware: 'bios', biosFallback: true });
    // The program would pick UEFI, which this computer lacks: BIOS is asked for.
    expect(body(form(), ctx({ caps: BARE })).firmware).toBe('bios');
  });

  it('asking for what the computer lacks is refused on that field', () => {
    const e = errors(form({ tpm: true, secureBoot: true }), ctx({ caps: BARE }));
    expect(e.tpm).toBe('notOnThisComputer');
    expect(e.secureBoot).toBeDefined();
  });

  it('Secure Boot with BIOS is refused', () => {
    expect(errors(form({ firmware: 'bios', secureBoot: true })).secureBoot).toBe('secureBootNeedsUefi');
  });
});

describe('the fields', () => {
  it('the name: empty, malformed, taken; a failed create leaves its name free', () => {
    expect(errors(form({ name: '' })).name).toBe('nameEmpty');
    expect(errors(form({ name: 'Not_A_Name' })).name).toBe('nameInvalid');
    expect(errors(form({ name: 'a'.repeat(64) })).name).toBe('nameInvalid');
    expect(errors(form(), ctx({ rows: [row('db-1', 'id-1')] })).name).toBe('nameTaken');
    const failed = [row('db-1', 'id-1', { phase: 'creating', state: 'Failed' })];
    expect(nameTaken('db-1', failed)).toBe(false);
    expect(nameTaken('db-1', undefined)).toBe(false);
  });

  it('without a read VM list nothing is created: no name can be called free', () => {
    expect(errors(form(), ctx({ rows: undefined })).name).toBe('listUnread');
    expect(check(form(), ctx({ rows: undefined })).ok).toBe(false);
  });

  it('an image must be picked and ready; a path must be absolute', () => {
    expect(errors(form({ image: '' })).image).toBe('imageNone');
    expect(errors(form({ image: 'c'.repeat(64) })).image).toBe('imageNotReady');
    // A ready image made for another kind of machine: no VM here starts from it.
    expect(errors(form({ image: 'd'.repeat(64) })).image).toBe('imageNotBootable');
    expect(errors(form({ imageFrom: 'path', imagePath: 'debian.iso' })).imagePath).toBe('pathInvalid');
    expect(errors(form({ source: 'file', filePath: '' })).filePath).toBe('pathInvalid');
  });

  it('only a stopped VM can be copied', () => {
    const rows = [row('old', 'id-1'), row('live', 'id-2', { state: 'Running' }), row('half', 'id-3', { phase: 'creating', state: 'Creating' })];
    expect(copySources(rows)).toEqual(['old']);
    expect(errors(form({ source: 'copy', copyOf: 'live' }), ctx({ rows })).copyOf).toBe('copyRunning');
    expect(errors(form({ source: 'copy', copyOf: '' }), ctx({ rows })).copyOf).toBe('copyNone');
  });

  it('sizes outside their bounds are refused', () => {
    expect(errors(form({ memoryGib: 0.25 })).memory).toBe('memoryRange');
    expect(errors(form({ vcpus: 1.5 })).vcpus).toBe('vcpusRange');
    expect(errors(form({ vcpus: 0 })).vcpus).toBe('vcpusRange');
    expect(errors(form({ diskGib: 0 })).disk).toBe('diskRange');
    // A source with its own disk has no size to check.
    expect(errors(form({ source: 'template', template: 'debian-13', diskGib: 0 })).disk).toBeUndefined();
  });
});

describe('the lists the form offers', () => {
  const good = { sha256: SHA, phase: 'ready', bytes: 10, part_size: 8, modified_unix: 1 };
  const os = (over: Record<string, unknown> = {}) => ({ id: 'x', name: 'Debian 13', live: false, installer: true, ...over });
  it('reads images: ready or not, what the image says it is, and whether a VM here can start from it', () => {
    expect(parseImages([
      { ...good, media: { volume_id: 'VOL', os: [os({ arch: 'x86_64' })] } },
      { ...good, sha256: 'b'.repeat(64), media: { volume_id: 'VOL', os: [] } },
      { ...good, sha256: 'c'.repeat(64), phase: 'uploading', next_part: 3 },
      { ...good, sha256: 'd'.repeat(64), media: { os: [os({ name: 'Debian 13 (ARM)', arch: 'aarch64' })] } },
    ])).toEqual([
      { sha256: SHA, ready: true, bytes: 10, label: 'Debian 13', bootable: true },
      { sha256: 'b'.repeat(64), ready: true, bytes: 10, label: 'VOL', bootable: null },
      { sha256: 'c'.repeat(64), ready: false, bytes: 10, label: null, bootable: null },
      { sha256: 'd'.repeat(64), ready: true, bytes: 10, label: 'Debian 13 (ARM)', bootable: false },
    ]);
  });
  it.each([
    ['not a list', { images: [] }],
    ['a bad id', [{ ...good, sha256: 'xyz' }]],
    ['an unknown phase', [{ ...good, phase: 'done' }]],
    ['a bad size', [{ ...good, bytes: -1 }]],
    ['a row that is no object', ['x']],
    ['the same image twice', [good, good]],
  ])('refuses the whole image list for %s', (_n, wire) => {
    expect(parseImages(wire)).toBeNull();
  });
  it('reads templates and refuses a malformed one', () => {
    expect(parseTemplates([])).toEqual([]);
    expect(parseTemplates('x')).toBeNull();
    expect(parseTemplates([{ id: '' }])).toBeNull();
  });
});

describe('a create whose answer was lost', () => {
  const sent: CreateSent = { computer: 'c1', name: 'db-1', before: ['old-id'], at: 1_000_000 };

  it('a new id under the name proves it was created', () => {
    expect(createVerdict(sent, [[row('db-1', 'new-id', { phase: 'creating', state: 'Creating' })]])).toBe('applied');
    expect(createVerdict(sent, [[row('db-1', 'new-id', { state: 'Running' })]])).toBe('applied');
    expect(createVerdict(sent, [[row('web-1', 'w')], [row('db-1', 'new-id')]])).toBe('applied');
  });

  it('a new id whose create failed proves it was not', () => {
    expect(createVerdict(sent, [[row('db-1', 'new-id', { phase: 'creating', state: 'Failed' })]])).toBe('not_applied');
  });

  it('the id listed before the send, or a row with no id, proves nothing', () => {
    expect(createVerdict(sent, [[row('db-1', 'old-id', { phase: 'creating', state: 'Failed' })]])).toBeUndefined();
    expect(createVerdict(sent, [[row('db-1', null)]])).toBeUndefined();
  });

  it('a list without the name proves nothing, however many are read: the computer may still be working on it', () => {
    const others = [row('web-1', 'w')];
    expect(createVerdict(sent, [])).toBeUndefined();
    expect(createVerdict(sent, [others])).toBeUndefined();
    expect(createVerdict(sent, Array.from({ length: 50 }, () => others))).toBeUndefined();
    expect(createVerdict(sent, [[]])).toBeUndefined();
  });

  it('reads back what it remembered, and nothing from a malformed record', () => {
    expect(sentOf({ computer: 'c1', name: 'db-1', before: ['a'], at: 5 })).toEqual({ computer: 'c1', name: 'db-1', before: ['a'], at: 5 });
    expect(sentOf({ computer: 'c1', name: 'db-1', before: [1], at: 5 })).toBeNull();
    expect(sentOf({ name: 'db-1', before: [], at: 5 })).toBeNull();
    expect(sentOf(null)).toBeNull();
  });
});

describe('a held key press', () => {
  const hold = { computer: 'c1', vmId: 'vm-1', name: 'web-1', what: 'keys', chord: 'enter' };
  it('is this VM\'s only inside the computer it was sent to', () => {
    expect(ownKeyHold(hold, 'c1', 'vm-1')).toBe(true);
    // Another computer with a VM of the same id (a copied VM store) neither shows nor frees it.
    expect(ownKeyHold(hold, 'c2', 'vm-1')).toBe(false);
    expect(ownKeyHold(hold, 'c1', 'vm-2')).toBe(false);
    expect(ownKeyHold(hold, null, 'vm-1')).toBe(false);
    expect(ownKeyHold(hold, 'c1', null)).toBe(false);
  });
  it('is not a console line held under the same lock', () => {
    expect(ownKeyHold({ ...hold, what: 'line' }, 'c1', 'vm-1')).toBe(false);
  });
});
