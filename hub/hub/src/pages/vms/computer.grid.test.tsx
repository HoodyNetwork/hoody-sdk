// Vitest: the "This computer" panel is two headed groups over one facts grid. "KVM" holds the KVM
// row; "Room for VMs" holds every read-only fact of the card in one list (the kind of server first, the disk last), so no fact sits alone between the groups.
import { renderPage, screen, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const panel = () => document.querySelector('#vms-computer') as HTMLElement;

describe('This computer: two groups, one facts grid', () => {
  it.each([['the usual answer', undefined], ['no memory limit', 'no-memory-limit']] as const)('%s', async (_, state) => {
    await renderPage(page, state ? { state } : {});
    await screen.findByText(strings['host.disk'], undefined, { timeout: 10000 });
    const groups = within(panel()).getAllByRole('heading').map((h) => h.textContent);
    expect(groups).toEqual([strings['host.title'], strings['host.facts'], strings['host.room']]);
    // Every fact in one list, inside the Room group, in reading order.
    const lists = [...panel().querySelectorAll('dl')];
    expect(lists).toHaveLength(1);
    expect(lists[0]!.closest('section')?.getAttribute('aria-labelledby')).toBe(within(panel()).getByRole('heading', { name: strings['host.room'] }).id);
    const labels = [...lists[0]!.querySelectorAll('dt')].map((d) => d.textContent);
    expect(labels[0]).toBe(strings['host.server']);
    expect(labels.at(-1)).toBe(strings['host.disk']);
    expect(labels.indexOf(strings['host.memory'])).toBe(1);
    // Six facts: three cells to a row on a wide panel.
    if (labels.length === 6) expect(lists[0]!.getAttribute('data-across')).toBe('3');
    // The limits in use carry a bar, named for a screen reader.
    expect(within(lists[0]!).getAllByRole('meter').length).toBeGreaterThanOrEqual(2);
    // The KVM row is the first group's only block: no facts list in it.
    const kvm = within(panel()).getByRole('heading', { name: strings['host.facts'] }).closest('section') as HTMLElement;
    expect(kvm.querySelector('dl')).toBeNull();
    expect(within(kvm).getByRole('switch', { name: strings['kvm.switch'] })).toBeInTheDocument();
    // The group is named KVM once: its row says what the switch does without repeating the name.
    expect(strings['host.facts']).toBe('KVM');
    expect(strings['kvm.switch']).not.toMatch(/KVM/);
    expect(strings['host.kvm']).not.toMatch(/KVM/);
  });
});
