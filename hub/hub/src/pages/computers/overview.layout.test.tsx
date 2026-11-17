// The Overview's structure: Open on first, then its summary as six sections in reading order (Status and usage, On
// <name>, Access, Where it runs, Features, Details), each a kit Section; Features holds one row per feature, the others a Facts list; the other pages are rows of "On
// <name>" (never a loose "Also:" line of links), and every value comes from the computer's row.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

const after = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const sectionOf = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement;
const valueOf = (scope: HTMLElement, label: string) => within(scope).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('computers: Overview layout', () => {
  it('Open on, then Status and usage, On <name>, Access, Where it runs, Features, Details, in that reading order', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const uses = await screen.findByRole('heading', { name: interpolate(strings['uses.title'], { name: 'atlas' }) }, { timeout: 8000 });
    const order = [strings['ov.status'], interpolate(strings['on.title'], { name: 'atlas' }), strings['fact.access'], strings['ov.where'], strings['feat.title'], strings['facts.title']].map((n) =>
      screen.getByRole('heading', { name: n }),
    );
    let prev: Element = uses;
    for (const h of order) {
      expect(after(prev, h)).toBe(true);
      prev = h;
    }
    // No "Also:" line any more: the other pages are rows of a section.
    expect(screen.queryByText(/^Also:/)).toBeNull();
  }, 40000);

  it('each section holds its facts: state and size in Status, access and SSH key in Access, server and realms in Where it runs', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByRole('heading', { name: strings['ov.status'] }, { timeout: 8000 });
    const status = sectionOf(strings['ov.status']);
    expect(within(status).getByText(strings['ov.state'], { selector: 'dt' })).toBeInTheDocument();
    expect(valueOf(status, strings['ov.cpu'])).toHaveTextContent('4 cores');
    // The disk limit is the server's specs.disk_gb (n12: 200 GB), shown as stored, never a guess.
    expect(valueOf(status, strings['ov.disk'])).toHaveTextContent('200 GB');
    expect(valueOf(status, strings['ov.sshAddress'])).toHaveTextContent('atlas.ssh.hoody.example');
    const access = sectionOf(strings['fact.access']);
    expect(within(access).getByText(strings['ov.who'], { selector: 'dt' })).toBeInTheDocument();
    expect(within(access).getByText(strings['ssh.fact.key'], { selector: 'dt' })).toBeInTheDocument();
    const where = sectionOf(strings['ov.where']);
    for (const label of [strings['fact.server'], strings['fact.project'], strings['fact.realms'], strings['ov.location']]) expect(within(where).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    // n12 is a whole machine with a rental: its kind and the date it is paid until.
    expect(valueOf(where, strings['ov.kind'])).toHaveTextContent(strings['ov.kind.metal']);
    // Paid until, or Was paid until once that day has passed (the fixture rental's day is fixed, the clock is not).
    expect(within(where).getByText((_, el) => el?.tagName === 'DT' && [strings['ov.paidUntil'], strings['ov.paidUntil.passed']].includes(el.textContent ?? ''))).toBeInTheDocument();
    const details = sectionOf(strings['facts.title']);
    for (const label of [strings['fact.computer'], strings['fact.image'], strings['fact.created']]) expect(within(details).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    // The features are rows of their own section, never a sentence in Details.
    expect(within(details).queryByText(/Turned on/)).toBeNull();
    const features = sectionOf(strings['feat.title']);
    for (const id of ['hoody_kit', 'dev_kit', 'ai', 'ramdisk', 'autostart', 'kvm'] as const) expect(within(features).getByText(strings[`feat.${id}`])).toBeInTheDocument();
  }, 40000);
});
