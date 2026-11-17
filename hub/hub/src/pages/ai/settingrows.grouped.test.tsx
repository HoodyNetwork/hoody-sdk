// Every setting row on the AI page sits in a kit SettingGroup: no row draws the kit's bare (ungrouped) layout. Checked on the
// screens that hold rows: Models & keys (Default model, Claude Code, its copy rows, Advanced opened), an agent's overview
// (model, effort) and a Skill Hub preview (Install).
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFixtures } from '@app/fixtures';
import { cleanup, renderPage, screen, userEvent, within } from '@app/testing';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';
import skillStrings from './knowledge/skills/strings.en.json';

const SLOW = { timeout: 8000 };

beforeAll(async () => {
  await Promise.all([import('./view'), import('./agents/AgentsView'), import('./knowledge/skills/List'), loadFixtures('ai')]);
}, 120_000);

/** Rows drawn in the kit's bare layout (SettingRow.module.css: row > grid > ctl; `ctl` is that file's alone, class names are not
 *  scoped under vitest), by the start of their text. */
const bareRows = () => [...document.querySelectorAll('.row > .grid > .ctl')].map((c) => c.parentElement!.parentElement!.textContent?.slice(0, 40) ?? '');

describe('AI page: no bare setting row', () => {
  it('Models & keys, Advanced opened', async () => {
    cleanup();
    await renderPage(page, { path: links.list });
    await screen.findByText(strings['def.helper'], undefined, SLOW);
    await userEvent.click(screen.getByRole('button', { name: strings['adv.show'] }));
    await screen.findByText(strings['adv.accounts'], undefined, SLOW);
    expect(bareRows()).toEqual([]);
  });

  it("an agent's overview (model, effort)", async () => {
    cleanup();
    await renderPage(page, { path: links.agent('reviewer') });
    await screen.findByRole('article', { name: /reviewer/ }, SLOW);
    expect(bareRows()).toEqual([]);
  });

  it('a Skill Hub preview (Install)', async () => {
    cleanup();
    await renderPage(page, { path: links.skills });
    await userEvent.click(await screen.findByRole('button', { name: skillStrings['list.hub'] }, SLOW));
    const d = screen.getByRole('dialog', { name: skillStrings['hub.title'] });
    await userEvent.type(within(d).getByRole('searchbox', { name: skillStrings['hub.search'] }), 'change');
    await userEvent.click(within(d).getByRole('button', { name: skillStrings['hub.searchGo'] }));
    await within(d).findByText('changelog', undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: skillStrings['hub.read'].replace('{{name}}', 'changelog') }));
    await within(d).findByRole('button', { name: skillStrings['hub.install'] }, SLOW);
    expect(bareRows()).toEqual([]);
  });
});
