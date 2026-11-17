// Vitest: what the VMs page draws for the two capability answers that are not ordinary sizes. A computer with no memory
// limit (its VM program sends the largest 64-bit number or null, as on a bare-metal computer) is a computer whose VMs show,
// never one that "cannot be reached". An answer this Hub does not read is said as that, never as "cannot reach".
import { answers, reply } from '@core';
import { renderPage, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { requestLog } from './fixtures';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key] ?? `<missing ${key}>`);

/** The answer byte for byte as the VM program writes it, read the way the browser reads it. */
const NO_LIMIT = JSON.parse(
  '{"kvm_present":true,"fuse_present":true,"memory":{"ceiling_bytes":18446744073709551615,"admitted":[]},' +
  '"misc":{"kvm_vm":{"used":0,"ceiling":16},"kvm_vcpu":{"used":0,"ceiling":64},"kvm_memslot":null},"unprivileged_port_start":1024,' +
  '"provisioning":{"uefi":true,"virtio_win_iso":true,"templates":true,"tpm":true,"secure_boot":true,"file_sharing":true,"audio":false,' +
  '"machine_type":"pc-q35-9.2"},"storage":{"free_bytes":440234147840}}',
) as unknown;
/** The same answer with "no limit" sent as null. */
const NO_LIMIT_NULL = { ...(NO_LIMIT as Record<string, unknown>), memory: { ceiling_bytes: null, admitted: [] } };
/** An answer with no provisioning or storage block: not a shape this Hub reads. */
const UNREADABLE = { kvm_present: true, fuse_present: true, memory: { ceiling_bytes: 1024 ** 3, admitted: [] }, misc: {} };

const capsAnswer = (body: unknown) => [reply(routes.caps, answers.ok(body))];

beforeEach(() => { requestLog.length = 0; });

describe('no memory limit set', () => {
  it.each([['the largest number', NO_LIMIT], ['null', NO_LIMIT_NULL]])('shows the VMs and the room, never "cannot reach" (%s)', async (_, body) => {
    await renderPage(page, { rules: capsAnswer(body) });
    const table = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    expect(await within(table).findByText('web-1', undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(say('st.unreachable', { name: 'atlas' }))).toBeNull();
    expect(document.querySelector('#vms-blocked')).toBeNull();
    // The memory row says what VMs hold, and that no limit is set: no size made of the "no limit" number, no meter.
    const room = document.querySelector('#vms-computer') as HTMLElement;
    expect(within(room).getByText(say('host.memory.valueNoLimit', { used: '0 B' }))).toBeInTheDocument();
    expect(within(room).getByText(strings['host.fits.noLimit'])).toBeInTheDocument();
    // No bar on the memory cell (the two budgets below carry theirs).
    const memory = within(room).getByText(say('host.memory.valueNoLimit', { used: '0 B' })).closest('dd')!.parentElement!;
    expect(within(memory).queryByRole('meter')).toBeNull();
    expect(room.textContent).not.toMatch(/16,777,216|18446744/);
    expect(within(room).getByText(say('host.budget', { used: 0, max: 16 }))).toBeInTheDocument();
  });

  it('offers New VM', async () => {
    await renderPage(page, { rules: capsAnswer(NO_LIMIT) });
    expect(await screen.findByRole('button', { name: strings['create.open'] }, WAIT)).toBeInTheDocument();
  });
});

describe('a run the VM program cannot size holds all of the memory', () => {
  it.each([['the largest number', 2 ** 64], ['null', null]])('says so, with nothing left for a new VM, and never "cannot reach" (%s)', async (_, bytes) => {
    const held = JSON.parse(JSON.stringify(NO_LIMIT)) as { memory: { ceiling_bytes: unknown; admitted: unknown[] } };
    held.memory.ceiling_bytes = bytes;
    held.memory.admitted = [{ unidentified_run: '0195c0de00000042', admitted_bytes: bytes, estimated: true }];
    await renderPage(page, { rules: capsAnswer(held) });
    await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    const room = document.querySelector('#vms-computer') as HTMLElement;
    expect(within(room).getByText(strings['host.memory.allHeld'])).toBeInTheDocument();
    expect(within(room).getByText(strings['host.fits.none'])).toBeInTheDocument();
    // The memory row says it all; the note about a part of the memory does not repeat it.
    expect(within(room).queryByText(strings['host.note.unmatched'])).toBeNull();
    expect(screen.queryByText(say('st.unreachable', { name: 'atlas' }))).toBeNull();
  });
});

describe('an answer this Hub does not read', () => {
  it('says so, with Check again, and never says the VM program cannot be reached', async () => {
    await renderPage(page, { rules: capsAnswer(UNREADABLE) });
    expect(await screen.findByText(say('st.unreadable', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(say('st.unreachable', { name: 'atlas' }))).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['st.check'] }).length).toBeGreaterThan(0);
    const blocked = document.querySelector('#vms-blocked') as HTMLElement;
    expect(blocked).not.toBeNull();
    expect(within(blocked).getByText(say('blocked.unreadable.title', { name: 'atlas' }))).toBeInTheDocument();
    expect(within(blocked).getByText(strings['blocked.unreadable.body'])).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('Images view: the same, where the images would be', async () => {
    await renderPage(page, { rules: capsAnswer(UNREADABLE), path: '/vms?view=images' });
    expect(await screen.findByText(say('blocked.images.unreadable.title', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(say('blocked.images.unreachable.title', { name: 'atlas' }))).toBeNull();
  });
});

describe('the largest VM that can start', () => {
  const roomOf = async (state?: string): Promise<HTMLElement> => {
    await renderPage(page, state ? { state } : {});
    const room = document.querySelector('#vms-computer') as HTMLElement;
    // The room block is drawn once the VM program answered.
    expect(await within(room).findByText(strings['host.memory'], undefined, WAIT)).toBeInTheDocument();
    return room;
  };

  it('is shown while a VM can start', async () => {
    const room = await roomOf();
    expect(within(room).getByText(strings['host.fits'])).toBeInTheDocument();
  });

  it.each(['kvm-off', 'kvm-not-inside'])('is not shown when no VM can start (%s)', async (state) => {
    const room = await roomOf(state);
    expect(within(room).queryByText(strings['host.fits'])).toBeNull();
    expect(within(room).queryByText(strings['host.fits.none'])).toBeNull();
  });
});
