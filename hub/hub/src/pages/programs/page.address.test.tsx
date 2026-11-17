// The inspector gives every port its web address: masked on screen, Copy, Open in a new tab and a
// QR code taking the whole address, for a running port, a stopped one and each part of a range.
// The addresses are the Ports table's: each row opens its port, and its expanded part
// ("Show details") holds the whole address field (Copy, Open, QR code).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { QrCode, qrMatrix } from '@kit';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.id === fixtureWorld.current.id);
// The address as the containers proxy names it, written out here (not through core) so a wrong builder fails.
const address = (port: number) => `https://${atlas?.project_id}-${atlas?.id}-http-${port}.${atlas?.server_name}.fixture.invalid`;
const fill = (x: string, v: Record<string, string>) => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const masked = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;
const openIdle = (port: number) => `Open port ${port} in a new tab (it won't answer until it is started)`;

let written: string[] = [];
beforeEach(() => {
  opsStore.reset();
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => vi.restoreAllMocks());

const pageText = () => document.body.textContent ?? '';
/** The Ports table's row of a port (its first cell is the port number). */
const rowOf = (port: number): HTMLElement => {
  const row = screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.trim() === String(port));
  if (!row) throw new Error(`no row for port ${port}`);
  return row;
};
/** Open a port row's expanded part, where its whole address field is. */
const expand = async (port: number) => {
  await screen.findByRole('table', { name: /^Ports of / });
  await userEvent.click(within(rowOf(port)).getByRole('button', { name: 'Show details' }));
};
/** The ports the table shows now, in order. */
const portsShown = (): number[] =>
  screen
    .getAllByRole('row')
    .map((r) => r.querySelector('td')?.textContent?.trim() ?? '')
    .filter((x) => /^\d+$/.test(x))
    .map(Number);

describe('programs: every port has its address', () => {
  it('a running single-port program: masked address, Copy and Open take the whole address', async () => {
    if (!atlas) throw new Error('no atlas');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    await expand(3000);
    const copy = await screen.findByRole('button', { name: 'Copy port 3000' });
    expect(screen.getByRole('heading', { name: strings['detail.ports'] })).toBeInTheDocument();
    // A program address is secret by shape: neither id shows, whole or masked; the button shows its scheme and bullets.
    expect(pageText()).not.toContain(atlas.id);
    expect(pageText()).not.toContain(atlas.project_id);
    expect(pageText()).not.toContain(masked(atlas.id));
    expect(screen.getAllByRole('button', { name: /^https:\/\/••••/ }).length).toBeGreaterThan(0);
    await userEvent.click(copy);
    await waitFor(() => expect(written).toEqual([address(3000)]));
    await userEvent.click(screen.getByRole('button', { name: 'Open port 3000 in a new tab' }));
    expect(open).toHaveBeenCalledWith(address(3000), '_blank', 'noopener');
  });

  it('the QR code encodes the whole address', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    await expand(3000);
    await screen.findByRole('button', { name: 'Copy port 3000' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    });
    const dialog = await screen.findByRole('dialog', { name: 'QR code: port 3000' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    });
    expect(dialog.textContent).toContain(address(3000));
    const shown = screen.getByRole('img', { name: 'QR code for this address' }).querySelector('path')?.getAttribute('d');
    const m = qrMatrix(address(3000));
    if (!m) throw new Error('no matrix');
    const { container } = render(<QrCode matrix={m} label="want" />);
    expect(shown).toBeTruthy();
    expect(shown).toBe(container.querySelector('path')?.getAttribute('d'));
  });

  it('a stopped program still shows its address; Open says it will not answer until started', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { state: 'web-stopped', path: '/programs?sel=prog%3A1' });
    // The row's own link says so too.
    await screen.findByRole('table', { name: /^Ports of / });
    expect(within(rowOf(3000)).getByText(fill(strings['address.openIdle'], { port: '3000' }))).toBeInTheDocument();
    await expand(3000);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy port 3000' }));
    await waitFor(() => expect(written).toEqual([address(3000)]));
    await userEvent.click(screen.getByRole('button', { name: openIdle(3000) }));
    expect(open).toHaveBeenCalledWith(address(3000), '_blank', 'noopener');
    expect(screen.queryByRole('button', { name: 'Open port 3000 in a new tab' })).toBeNull();
  });

  it('a port range: every port of 8000-8003 has its address, the stopped part and the port with no instance included', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/programs?sel=prog%3A2' });
    for (const port of [8000, 8001, 8002, 8003]) {
      await expand(port);
      await userEvent.click(await screen.findByRole('button', { name: `Copy port ${port}` }));
    }
    await waitFor(() => expect(written).toEqual([address(8000), address(8001), address(8002), address(8003)]));
    await userEvent.click(screen.getByRole('button', { name: 'Open port 8000 in a new tab' }));
    await userEvent.click(screen.getByRole('button', { name: openIdle(8002) }));
    await userEvent.click(screen.getByRole('button', { name: openIdle(8003) }));
    expect(open.mock.calls).toEqual([
      [address(8000), '_blank', 'noopener'],
      [address(8002), '_blank', 'noopener'],
      [address(8003), '_blank', 'noopener'],
    ]);
    expect(screen.getAllByRole('button', { name: 'QR code' })).toHaveLength(4);
    // The port with no instance reads as not started.
    expect(screen.getByText(strings['address.notStarted'])).toBeInTheDocument();
  });

  it('a range with no instances (18 ports, more than the model offers as parts): every address is reachable', async () => {
    await renderPage(page, { state: 'big-range', path: '/programs?sel=prog%3A40' });
    await screen.findByRole('table', { name: /^Ports of / });
    const seen: number[] = [];
    for (let guard = 0; guard < 5; guard++) {
      seen.push(...portsShown());
      const next = screen.queryByRole('button', { name: strings['address.next'] });
      if (!next || next.hasAttribute('disabled') || next.getAttribute('aria-disabled') === 'true' || next.hasAttribute('data-disabled')) break;
      await userEvent.click(next);
    }
    expect(seen).toEqual(Array.from({ length: 18 }, (_, i) => 9000 + i));
    await expand(9017);
    await userEvent.click(screen.getByRole('button', { name: 'Copy port 9017' }));
    await waitFor(() => expect(written).toEqual([address(9017)]));
  });

  it('a 40-port range goes a page at a time: Next reaches every port once, Previous goes back one page', async () => {
    await renderPage(page, { state: 'big-range', path: '/programs?sel=prog%3A41' });
    await screen.findByRole('table', { name: /^Ports of / });
    const seen: number[] = [];
    for (let guard = 0; guard < 6; guard++) {
      seen.push(...portsShown());
      const next = screen.getByRole('button', { name: strings['address.next'] });
      if (next.hasAttribute('disabled')) break;
      await userEvent.click(next);
    }
    expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => 9100 + i));
    expect(screen.getByRole('button', { name: strings['address.prev'] })).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['address.prev'] }));
    expect(portsShown()).toEqual(Array.from({ length: 16 }, (_, i) => 9116 + i));
  });

  it('a program with no port shows no address', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A3' });
    await screen.findByText(strings['fact.kind']);
    expect(screen.queryByRole('heading', { name: strings['detail.ports'] })).toBeNull();
    expect(screen.queryByText('Address')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Copy port/ })).toBeNull();
  });

  it("the page's strings name no host", () => {
    expect(Object.values(strings).join('\n')).not.toMatch(/https?:|[a-z0-9-]+\.(?!(?:js|ts|json|md)\b)[a-z]{2,}\b/i);
  });
});
