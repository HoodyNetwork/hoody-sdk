// Network tab: the proxy section and the exit address section live here, not in Connect.
// The order: at a glance, internet access, the exit, the firewall rules, then the proxy.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';
import exit from './parts/ExitIp.strings.en.json';
import net from './parts/Network.strings.en.json';
import proxy from './parts/ConnectProxy.strings.en.json';
import fw from './parts/Firewall.strings.en.json';

const running = () => computers.find((x) => x.status === 'running') ?? computers[0];

describe('computers: the Network tab', () => {
  it('holds the exit address section, then the proxy section, with the change offered to an account owner', async () => {
    const c = running();
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=network` });
    expect(await screen.findByRole('tab', { name: net['network.tab'], selected: true }, { timeout: 8000 })).toBeInTheDocument();
    const p = await screen.findByRole('heading', { name: proxy['proxy.title'].replace('{{name}}', c!.name) }, { timeout: 8000 });
    const e = screen.getByRole('heading', { name: exit['exit.title'] });
    expect(e.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The order: at a glance, internet access, where traffic leaves from, the firewall rules, the proxy.
    const order = [net['glance.title'], fw['ni.title'], exit['exit.title'], fw['fw.title']].map((name) => screen.getByRole('heading', { name }));
    for (const [i, h] of [...order, p].entries()) if (i > 0) expect([...order, p][i - 1]!.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const section = e.closest('section') as HTMLElement;
    expect(within(section).getByRole('button', { name: exit['exit.change'] })).toBeInTheDocument();
  }, 40000);

  it('the Connect tab no longer holds either section', async () => {
    const c = running();
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=connect` });
    expect(await screen.findByRole('tab', { name: strings['tab.connect'], selected: true }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: proxy['proxy.title'].replace('{{name}}', c!.name) })).toBeNull();
    expect(screen.queryByRole('heading', { name: exit['exit.title'] })).toBeNull();
  }, 40000);
});
