// Vitest: the addresses of a Bot link, one row each in the Link tab's Addresses table: every row
// copies, only the chat page and the skill file open, and each has a "How to use it" drawer with its own examples. Built only from a plain https origin; anything else gives none (never a guessed address).
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { botOrigin, linkAddresses } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

describe('the address of a link', () => {
  it('is a plain https origin: lower case, any path dropped, nothing else', () => {
    expect(botOrigin('https://Chief-Shop.hoody.bot')).toBe('https://chief-shop.hoody.bot/');
    expect(botOrigin('https://chief-shop.hoody.bot/v1/models')).toBe('https://chief-shop.hoody.bot/');
    for (const bad of ['', 'http://a.hoody.bot', 'https://user:pw@a.hoody.bot', 'https://a.hoody.bot:8443', 'https://a.hoody.bot/?x=1', 'https://a.hoody.bot/#k', 'https://localhost', 'javascript:alert(1)', 'https://a b.hoody.bot']) {
      expect(botOrigin(bad), bad).toBeNull();
    }
  });

  it('gives the five addresses, and only the chat page and the skill open', () => {
    expect(linkAddresses('https://chief-shop.hoody.bot')).toEqual([
      { id: 'chat', value: 'https://chief-shop.hoody.bot/', open: 'https://chief-shop.hoody.bot/' },
      { id: 'openai', value: 'https://chief-shop.hoody.bot/v1' },
      { id: 'anthropic', value: 'https://chief-shop.hoody.bot' },
      { id: 'mcp', value: 'https://chief-shop.hoody.bot/mcp' },
      { id: 'skill', value: 'https://chief-shop.hoody.bot/SKILL.md', open: 'https://chief-shop.hoody.bot/SKILL.md' },
    ]);
    expect(linkAddresses('http://nope')).toEqual([]);
  });
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('the link tab: the Addresses table', () => {
  const addresses = async (state?: string) => {
    await renderPage(page, { ...(state ? { state } : {}), path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    const head = await screen.findByRole('heading', { name: strings['addr.title'] });
    return within(head.closest('section') as HTMLElement);
  };
  /** The ⋯ menu of the row for one address. */
  const menuOf = (sec: ReturnType<typeof within>, kind: string) => within(sec.getByRole('row', { name: new RegExp(kind) })).getByRole('button', { name: 'Row actions' });

  it('has one row per address, with what it works with, and Copy on every row', async () => {
    const sec = await addresses();
    const table = sec.getByRole('table', { name: strings['addr.title'] });
    for (const id of ['chat', 'openai', 'anthropic', 'mcp', 'skill'] as const) {
      const row = within(table).getByRole('row', { name: new RegExp(strings[`addr.kind.${id}`]) });
      expect(within(row).getByText(strings[`addr.works.${id}`])).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: `Copy the ${strings[`addr.kind.${id}`]} address` })).toBeInTheDocument();
    }
    expect(within(table).getByText(/^https:\/\/[a-z-]+\.hoody\.bot\/v1$/)).toBeInTheDocument();
    // The addresses are plain text: a program's address is copied, never opened from its cell.
    expect(within(table).queryAllByRole('link')).toEqual([]);
  });

  it('an address wraps in its cell, never cut: the end of it is what tells one address from the next', async () => {
    const sec = await addresses();
    const table = sec.getByRole('table', { name: strings['addr.title'] });
    const cell = within(table).getByText(/^https:\/\/[a-z-]+\.hoody\.bot\/v1$/).closest('td, [role="cell"], [role="gridcell"]');
    expect(cell).toHaveAttribute('data-cell-wraps');
  });

  it('Copy copies that row\'s address and says Copied', async () => {
    const sec = await addresses();
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await userEvent.click(sec.getByRole('button', { name: `Copy the ${strings['addr.kind.mcp']} address` }));
    expect(write).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/[a-z-]+\.hoody\.bot\/mcp$/));
    expect(await sec.findByRole('button', { name: strings['addr.copied'] })).toBeInTheDocument();
  });

  it('only the chat page and the skill file can be opened, from the row menu', async () => {
    const sec = await addresses();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await userEvent.click(menuOf(sec, strings['addr.kind.chat']));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['link.any.open.chat'] }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/[a-z-]+\.hoody\.bot\/$/), '_blank', 'noopener,noreferrer');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(menuOf(sec, strings['addr.kind.openai']));
    expect(screen.queryByRole('menuitem', { name: /^Open/ })).toBeNull();
    open.mockRestore();
  });

  it('How to use it opens that address with its examples: curl and the OpenAI SDK for the OpenAI-compatible one', async () => {
    const sec = await addresses();
    await userEvent.click(menuOf(sec, strings['addr.kind.openai']));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.howName'].replace('{{kind}}', strings['addr.kind.openai'])}`) }));
    const d = await screen.findByRole('dialog', { name: `${strings['addr.kind.openai']} address` });
    expect(within(d).getByRole('heading', { name: strings['connect.kind.curl'] })).toBeInTheDocument();
    expect(within(d).getByRole('heading', { name: strings['connect.kind.openai'] })).toBeInTheDocument();
    expect(within(d).queryByRole('heading', { name: strings['connect.kind.mcp'] })).toBeNull();
    expect(d.textContent).toMatch(/https:\/\/[a-z-]+\.hoody\.bot\/v1\/chat\/completions/);
    expect(d.textContent).not.toMatch(/hk_live/);
    // the links question ends the drawer's one closed Why
    await userEvent.click(within(d).getByRole('button', { name: strings['door.why'] }));
    expect(within(d).getByRole('link', { name: strings['link.any.more'] })).toBeInTheDocument();
  });

  it('the chat page\'s drawer opens it and has its QR code, and no example', async () => {
    const sec = await addresses();
    await userEvent.click(menuOf(sec, strings['addr.kind.chat']));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.howName'].replace('{{kind}}', strings['addr.kind.chat'])}`) }));
    const d = await screen.findByRole('dialog', { name: `${strings['addr.kind.chat']} address` });
    expect(within(d).getByRole('link', { name: strings['link.any.open.chat'] })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/[a-z-]+\.hoody\.bot\/$/));
    expect(within(d).getByRole('button', { name: /QR/ })).toBeInTheDocument();
    expect(within(d).queryByRole('heading', { name: strings['connect.kind.curl'] })).toBeNull();
  });

  // Every row, not a sample: which rows open, which examples each drawer shows, and where the QR code is.
  const EXPECT = {
    chat: { open: 'link.any.open.chat', examples: [], qr: true },
    openai: { open: null, examples: ['curl', 'openai'], qr: false },
    anthropic: { open: null, examples: ['anthropic'], qr: false },
    mcp: { open: null, examples: ['mcp'], qr: false },
    skill: { open: 'link.any.open.skill', examples: [], qr: false },
  } as const;
  const KINDS = ['curl', 'openai', 'anthropic', 'mcp'] as const;
  it.each(Object.keys(EXPECT) as Array<keyof typeof EXPECT>)('the %s row: its Open, its drawer\'s examples and QR code', async (id) => {
    const want = EXPECT[id];
    const kind = strings[`addr.kind.${id}`];
    const sec = await addresses();
    await userEvent.click(menuOf(sec, kind));
    if (want.open) expect(await screen.findByRole('menuitem', { name: strings[want.open] })).toBeInTheDocument();
    else expect(screen.queryByRole('menuitem', { name: /^Open/ })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.howName'].replace('{{kind}}', kind)}`) }));
    const d = await screen.findByRole('dialog', { name: `${kind} address` });
    const shown = KINDS.filter((k) => within(d).queryByRole('heading', { name: strings[`connect.kind.${k}`] }) !== null);
    expect(shown).toEqual(want.examples);
    expect(within(d).queryByRole('button', { name: /QR/ }) !== null).toBe(want.qr);
    expect(d.textContent).not.toMatch(/hk_live/);
  });

  it('says there is no address when the link has none, and lists nothing to copy', async () => {
    const sec = await addresses('linkNoZone');
    expect(sec.getByText(strings['link.any.noAddress'])).toBeInTheDocument();
    expect(sec.queryByRole('table')).toBeNull();
    expect(sec.queryByText(strings['addr.kind.chat'])).toBeNull();
  });
});
