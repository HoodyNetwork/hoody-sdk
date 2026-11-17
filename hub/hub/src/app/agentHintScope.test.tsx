// "Use with your agent" names its scope from the page's live context (every page says the realm, account-wide keys
// included): each page's main prompt carries the realm
// and computer the page shows in its target block, in the fixture world (realm Personal, computer atlas), and All
// realms and no computer are said in words. The prompt's wording itself: kit/widgets/agentHints.test.ts.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, type RenderedPage } from '@app/testing';
import { fixtureWorld } from '@core';
import bots from '../pages/bots/page';
import computers from '../pages/computers/page';
import keys from '../pages/keys/page';
import logs from '../pages/logs/page';
import notes from '../pages/notes/page';
import programs from '../pages/programs/page';
import scripts from '../pages/scripts/page';
import vault from '../pages/vault/page';

const PERSONAL = fixtureWorld.realm('Personal').id;
const ATLAS = fixtureWorld.computer('atlas');
const REALM = `- Realm: "Personal" (id ${PERSONAL})`;
const ON_ATLAS = `- Computer: "atlas" (id ${ATLAS.id})\n${REALM}\nIf you cannot find this computer in this realm, stop and ask me.`;
const ALL = '- Realm: all realms';
const PICK = '- Computer: not chosen yet (ask me which one first)';

type Page = Parameters<typeof renderPage>[0];

/** Opens the page's hint; `has` waits until its main prompt holds the text (the drawer follows the page as its reads answer). */
async function promptOf(page: Page, opts: Parameters<typeof renderPage>[1] = {}): Promise<{ has: (want: string) => Promise<void>; now: () => string; r: RenderedPage }> {
  const r = await renderPage(page, opts);
  await userEvent.click(await screen.findByRole('button', { name: 'Use with your agent' }, { timeout: 30_000 }));
  const sheet = await screen.findByRole('dialog', { name: 'Use with your agent' });
  const text = () => sheet.querySelector('[data-prompt="main"]')?.textContent ?? '';
  return { has: (want) => waitFor(() => expect(text()).toContain(want), { timeout: 15_000 }), now: text, r };
}

describe('agent hint scope, per page, from the live context', () => {
  it('computer pages name the computer the page shows and its realm, with the stop-and-ask line', async () => {
    for (const [page, path] of [[programs, '/programs'], [scripts, '/scripts'], [logs, '/logs']] as const) {
      const { has, now, r } = await promptOf(page, { path });
      await has(ON_ATLAS);
      expect(now()).toMatch(/\n1\. Ask me .* Do nothing else until I answer\.\n/);
      r.unmount();
    }
  }, 120_000);

  it('computer pages under All realms: no computer shown, the agent asks which one, and all realms is said', async () => {
    const { has } = await promptOf(programs, { computer: false, realm: 'all' });
    await has(`${PICK}\n${ALL}\n`);
  }, 120_000);

  it('no computer shown: the agent asks which one, in the shown realm', async () => {
    const { has } = await promptOf(programs, { computer: false });
    await has(`${PICK}\n${REALM}\n`);
  }, 120_000);

  it('Notes and Bots without a computer filter: Notes asks which computer, Bots names the realm\'s computers', async () => {
    const n = await promptOf(notes, { path: '/notes' });
    await n.has(`${PICK}\n${REALM}\n`);
    n.r.unmount();
    const b = await promptOf(bots, { path: '/bots' });
    await b.has(`${REALM}\n- Computers: every computer in this realm\n`);
    b.r.unmount();
    const ba = await promptOf(bots, { path: '/bots', realm: 'all' });
    await ba.has(`${ALL}\n- Computers: every computer, in all realms\n`);
  }, 120_000);

  it('Bots filtered to a computer names that computer', async () => {
    // The Bots page reads its own fixture computers (pages/bots/fixtures.ts, ids like c-atlas), which the shell's computer
    // list (fixtureWorld) does not hold: the filter is honoured, and with no row to name it the computer is named by its id.
    const { has } = await promptOf(bots, { path: '/bots?computer=c-atlas' });
    await has("- Computer: id c-atlas (no name)\n- Realm: not one realm (the computer's id names it exactly)\nIf you cannot find this computer, stop and ask me.");
  }, 120_000);

  // A filter the Bots page holds but cannot resolve is never widened to the realm's computers.
  it('Bots: a full computer id the page\'s list lacks (another realm, past page one) is still named', async () => {
    const { has, now } = await promptOf(bots, { path: `/bots?computer=${ATLAS.id}` });
    await has(ON_ATLAS);
    expect(now()).not.toContain('every computer');
  }, 120_000);

  it('Bots: while the computers read is out, and after it failed, the filtered id is named', async () => {
    const p = await promptOf(bots, { state: 'pending', path: `/bots?computer=${ATLAS.id}` });
    await p.has(ON_ATLAS);
    expect(p.now()).not.toContain('every computer');
    p.r.unmount();
    const f = await promptOf(bots, { state: 'error', path: `/bots?computer=${ATLAS.id}` });
    await f.has(ON_ATLAS);
    expect(f.now()).not.toContain('every computer');
  }, 120_000);

  it('Bots: a filter that names no computer (an unresolved handle, junk) asks which one', async () => {
    for (const state of [undefined, 'pending', 'error']) {
      const p = await promptOf(bots, { ...(state && { state }), path: '/bots?computer=ghost.0000' });
      await p.has(`${PICK}\n${REALM}\n`);
      expect(p.now(), state).not.toContain('every computer');
      p.r.unmount();
    }
  }, 120_000);

  it('Notes filtered to a computer names it, also while its computer list never answers or has failed', async () => {
    const n = await promptOf(notes, { path: `/notes?computer=${ATLAS.id}` });
    await n.has(ON_ATLAS);
    n.r.unmount();
    // The filter is held, not resolved, in these states; the prompt still names it, never "not chosen".
    for (const state of ['computersPending', 'computersFailed']) {
      const p = await promptOf(notes, { state, path: `/notes?computer=${ATLAS.id}` });
      await p.has(ON_ATLAS);
      expect(p.now(), state).not.toContain('not chosen');
      p.r.unmount();
    }
  }, 120_000);

  it('Computers and the vault name the shown realm; under All realms, every realm and the Global vault', async () => {
    const c = await promptOf(computers, { path: '/computers' });
    await c.has(`${REALM}\n- Computers: every computer in this realm\nIf you cannot find this realm, stop and ask me.`);
    c.r.unmount();
    const ca = await promptOf(computers, { path: '/computers', realm: 'all' });
    await ca.has(`${ALL}\n- Computers: every computer, in all realms\n`);
    ca.r.unmount();
    const v = await promptOf(vault, { path: '/vault' });
    await v.has(`${REALM}\n- Vault: this realm's vault\n`);
    v.r.unmount();
    const va = await promptOf(vault, { path: '/vault', realm: 'all' });
    await va.has(`${ALL}\n- Vault: the Global vault (it belongs to no realm)\n`);
  }, 120_000);

  it('keys in a realm: the keys that can act there, never the whole account; under All realms, every key', async () => {
    const k = await promptOf(keys, { path: '/keys' });
    await k.has(`${REALM}\n- Keys: only my API keys that can act in this realm\nAPI keys belong to my account: a key can act in this realm when its realm_ids include ${PERSONAL} or are empty`);
    expect(k.now()).not.toContain('whole account');
    k.r.unmount();
    const ka = await promptOf(keys, { path: '/keys', realm: 'all' });
    await ka.has(`${ALL}\n- Keys: all my API keys, in every realm\n`);
  }, 120_000);
});
