// The Permissions tab of a computer: listed third, kept in the URL, and it holds what the access drawer held (who can
// open the programs), the project's people, the realms, the firewall reminder and how access works. The drawer is gone.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import { links } from './links';
import { handleOf } from './logic';
import strings from './parts/AccessDrawer.strings.en.json';
import pageStrings from './strings.en.json';
import { permissionsTesting, SLOW } from './permissions.testing';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [ATLAS, , THIRD] = computers;
if (!ATLAS || !THIRD) throw new Error('fixture computers');

describe('computers: the Permissions tab', () => {
  it('links.permissions names the computer by its handle and the tab', () => {
    expect(links.permissions('atlas.2c4b')).toBe('/computers?sel=atlas.2c4b&tab=permissions');
    expect(links.firewall('atlas.2c4b')).toBe('/computers?sel=atlas.2c4b&tab=network&at=firewall');
  });

  it('is the third tab, after Connect, and a deep link selects it', async () => {
    const panel = await openPermissions(THIRD);
    const views = screen.getByRole('tablist', { name: pageStrings['views.label'] });
    const tabs = screen.getAllByRole('tab').filter((x) => !views.contains(x)).map((x) => x.textContent);
    expect(tabs.slice(0, 4)).toEqual([pageStrings['tab.overview'], pageStrings['tab.connect'], pageStrings['tab.permissions'], pageStrings['tab.ports']]);
    expect(screen.getByRole('tab', { name: pageStrings['tab.permissions'] })).toHaveAttribute('aria-selected', 'true');
    await within(panel).findByText(strings['acc.now.anyone'], undefined, SLOW);
  });

  it('says who can open the programs and why, then the choice, the project, the realms, the firewall and how access works', async () => {
    const panel = await openPermissions(THIRD);
    await within(panel).findByText(strings['acc.now.anyone'], undefined, SLOW);
    expect(panel).toHaveTextContent(strings['perm.why.none'].replace('{{name}}', THIRD.name));
    for (const k of ['perm.who.title', 'perm.fw.title', 'perm.project.title'] as const) expect(within(panel).getByRole('heading', { name: strings[k] })).toBeInTheDocument();
    expect(within(panel).getByRole('radio', { name: new RegExp(strings['acc.anyone']) })).toBeChecked();
    // The realms are a fact of the Project block, with their own way in.
    expect(within(panel).getByText(strings['perm.realms.title'], { selector: 'dt' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: strings['perm.how.title'] })).toBeInTheDocument();
    // The order: who can open, then the firewall, then the project.
    const order = within(panel).getAllByRole('heading').map((h) => h.textContent);
    expect(order.indexOf(strings['perm.who.title'])).toBeLessThan(order.indexOf(strings['perm.fw.title']));
    expect(order.indexOf(strings['perm.fw.title'])).toBeLessThan(order.indexOf(strings['perm.project.title']));
  });

  it('the drawer is gone: no access dialog opens with the tab, and no "Change access" drawer control is in it', async () => {
    const panel = await openPermissions(ATLAS);
    await within(panel).findByText(strings['acc.now.myIp'].replace('{{ip}}', '203.0.113.7'), undefined, SLOW);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-overlay-id="computers-access"]')).toBeNull();
  });

  it('opening the tab from another tab reads the rules and shows them in the page, not over it', async () => {
    const r = await openPermissions(THIRD);
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.overview'] }));
    await waitFor(() => expect(screen.getByRole('tab', { name: pageStrings['tab.overview'] })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.permissions'] }));
    const panel = await screen.findByRole('tabpanel', undefined, SLOW);
    await within(panel).findByText(strings['acc.now.anyone'], undefined, SLOW);
    expect(r).toBeDefined();
    expect(handleOf(THIRD)).toContain(THIRD.name);
  });
});
