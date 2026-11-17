// Vitest: on "This computer" the read-only Server value lined up with nothing: a
// SettingRow put it in the 240 px value track at the far end, while the room facts under it use the Facts label column.
// Server (and "Not allowed") are Facts now: a dt/dd pair like the room's. The KVM switch stays a row. A kind that could
// not be checked keeps its reason on screen, in the section's note.
import { renderPage, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { requestLog } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const WAIT = { timeout: 10000 };

beforeEach(() => { requestLog.length = 0; });

const section = () => document.querySelector<HTMLElement>('#vms-computer') as HTMLElement;

describe('This computer', () => {
  it('shows the server kind as a fact (dt/dd), never as a setting row', async () => {
    await renderPage(page);
    const value = await screen.findByText(strings['host.server.bare'], undefined, WAIT);
    expect(section().contains(value)).toBe(true);
    const dd = value.closest('dd');
    expect(dd, 'the server kind is a fact value').not.toBeNull();
    expect(dd?.previousElementSibling?.tagName).toBe('DT');
    expect(dd?.previousElementSibling?.textContent).toBe(strings['host.server']);
    expect(value.closest('[data-sg-row]'), 'not a SettingGroup row').toBeNull();
    // The KVM switch is still a row of its own.
    expect(within(section()).getByRole('switch', { name: strings['kvm.switch'] }).closest('[data-sg-row]')).not.toBeNull();
  });

  it('a kind that is not known: "Not known" as the fact, its reason in the section', async () => {
    await renderPage(page, { state: 'kind-not-known' });
    const note = await screen.findByText(strings['host.note.kindUnknown'], undefined, WAIT);
    expect(section().contains(note)).toBe(true);
    const value = screen.getByText(strings['host.server.unknown']);
    expect(value.closest('dd')?.previousElementSibling?.textContent).toBe(strings['host.server']);
  });

  it('names the KVM group once: the sub-section title, never also a group label', async () => {
    await renderPage(page);
    await screen.findByText(strings['host.server.bare'], undefined, WAIT);
    const name = strings['host.facts'];
    const labelled = [...section().querySelectorAll('[aria-label]')].filter((el) => el.getAttribute('aria-label') === name);
    expect([within(section()).getAllByText(name).length, labelled.length], 'shown once, no group named the same').toEqual([1, 0]);
  });
});
