// Use your own domain: connecting a domain is one DNS record the person adds (a CNAME from their
// domain to the alias's host); the edge follows it and sets up HTTPS. The Aliases list offers it per alias, the
// drawer gives the record to copy and the facts that matter, and the Make an alias form says it can be done later.
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { interpolate } from '@kit';
import { aliasHost } from './logic';
import page from './page';
import strings from './strings.en.json';

// The first case of a run also loads the detail view; on a busy host that alone can pass the default wait, so every
// case waits long enough for a cold start.
describe('computers: use your own domain for an alias', () => {
  it('the alias row opens the CNAME record to add, with the host to copy', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    await userEvent.click(await screen.findByRole('button', { name: strings['alias.domain'] }, { timeout: 30000 }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['domaind.title'], { name: 'shop' }) });
    expect(within(d).getByText('CNAME')).toBeInTheDocument();
    expect(within(d).getByText('shop.example.test')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /copy/i })).toBeInTheDocument();
    for (const k of ['domaind.https', 'domaind.access', 'domaind.wait', 'domaind.subdomain', 'domaind.dnsOnly', 'domaind.undo'] as const) expect(d).toHaveTextContent(strings[k]);
  }, 60000);

  it('the drawer is three numbered steps in the order they are done: add the record, turn off the proxy, wait and open', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    await userEvent.click(await screen.findByRole('button', { name: strings['alias.domain'] }, { timeout: 30000 }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['domaind.title'], { name: 'shop' }) });
    const group = within(d).getByRole('group', { name: strings['domaind.steps'] });
    const steps = within(group).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]!.parentElement!.tagName).toBe('OL');
    // The record to add (with its host to copy and the name rule) is step one; then the proxy, then the wait and the visit.
    expect(steps[0]).toHaveTextContent(strings['domaind.step']);
    expect(within(steps[0]!).getByText('shop.example.test')).toBeInTheDocument();
    expect(within(steps[0]!).getByRole('button', { name: strings['domaind.copyTarget'] })).toBeInTheDocument();
    expect(steps[0]).toHaveTextContent(strings['domaind.subdomain']);
    expect(steps[1]).toHaveTextContent(strings['domaind.proxyOff']);
    expect(steps[1]).toHaveTextContent(strings['domaind.dnsOnly']);
    expect(steps[2]).toHaveTextContent(strings['domaind.open']);
    for (const k of ['domaind.wait', 'domaind.https'] as const) expect(steps[2]).toHaveTextContent(strings[k]);
    // What holds afterwards is not a step: the access rules sit with the route, how to stop is the one warning.
    for (const k of ['domaind.access', 'domaind.undo'] as const) {
      expect(group).not.toHaveTextContent(strings[k]);
      expect(d).toHaveTextContent(strings[k]);
    }
    expect(within(d).getByRole('group', { name: strings['domaind.routeLabel'] })).toHaveTextContent(strings['domaind.access']);
    // The Hub never reads DNS: the route plate says so; the foot is Close alone.
    expect(within(d).getByRole('group', { name: strings['domaind.routeLabel'] })).toHaveTextContent(strings['domaind.blind']);
    // The foot's Close (the drawer's own x carries the same name).
    expect(within(d).getAllByRole('button', { name: strings['domaind.close'] }).length).toBeGreaterThan(0);
  }, 60000);

  it('the host comes only from an https address', () => {
    expect(aliasHost('https://shop.example.test')).toBe('shop.example.test');
    expect(aliasHost('https://shop.example.test:8443/x?y')).toBe('shop.example.test');
    expect(aliasHost('http://shop.example.test')).toBeNull();
    expect(aliasHost('not a url')).toBeNull();
    expect(aliasHost(undefined)).toBeNull();
    expect(aliasHost('https://localhost')).toBeNull();
  }, 60000);

  it('the Make an alias form links to how a domain is connected afterwards, and the link opens that answer over the form', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    const table = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 30000 });
    // The 3000 row's own button: the section's "Create alias" (no port chosen) comes first on the page.
    const row = (await within(table).findByText('3000', { selector: 'td, td *' })).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: strings['alias.make'] }));
    const d = await screen.findByRole('dialog');
    // The link ends the answer of the form's one question.
    await userEvent.click(within(d).getByRole('button', { name: strings['aliasd.guessWhy'] }));
    expect(d).toHaveTextContent(strings['aliasd.guess']);
    await userEvent.click(within(d).getByRole('link', { name: strings['aliasd.domainMore'] }));
    const dlgs = await screen.findAllByRole('dialog');
    expect(within(dlgs[dlgs.length - 1]!).getByText(strings['faq.ownDomain.a'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(within(await screen.findByRole('dialog')).getByRole('link', { name: strings['aliasd.domainMore'] })).toBeInTheDocument();
  }, 60000);
});
