// Vitest: where the computers questions show up. Every table view of the page (computers, projects, servers) lists all
// eight under "Questions"; beside a selected computer the rail leaves them out.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const IDS = ['whatYouGet', 'realmsAndProjects', 'whoCanOpen', 'firewall', 'proxyAndExit', 'ownDomain', 'sshAndTerminal', 'snapshotsAndBackups'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];

describe('computers questions', () => {
  it('a computer opened beside the list leaves the rail to the list: no Questions section until a link targets one', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByRole('tab', { name: strings['tab.overview'] }, { timeout: 20_000 });
    expect(screen.queryByRole('heading', { name: kitStrings['faq.title'] })).toBeNull();
  }, 60_000);

  it.each([
    ['the computers list', '/computers'],
    ['the projects view', '/computers/projects'],
    ['the servers view', '/computers/servers'],
  ])('%s lists the eight questions, each closed, under the kit "Questions" heading', async (_name, path) => {
    await renderPage(page, { path });
    await screen.findByRole('heading', { name: kitStrings['faq.title'] }, { timeout: 20_000 });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  }, 60_000);
});
