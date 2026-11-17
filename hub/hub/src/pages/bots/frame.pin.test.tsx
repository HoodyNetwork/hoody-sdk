// Vitest: the surfaces the Hub draws for a Bot never put the Bot's chat page in a frame.
// A Bot page that is not iframable may be framed only by the Hub's own origins (the oracle's frame-ancestors), and the
// Hub that ships as a file (the SDK's .html) is not one of them, so a framed Bot page would show refused. Pinned here:
// the Link and keys tab's Open opens the Bot's address at the top of a new tab, no opener, no referrer; a Board's Bot
// tile, through the Board's own Tile host, draws the Bot from the agent API. Not covered here: an
// address typed into a Board's web address tile may frame a Bot page; that page then refuses the frame (fails closed).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type * as Kit from '@kit';
import { renderPage, screen, userEvent, within } from '@app/testing';
// The Board's own Tile host, through the Board's test entry (hub/page-boundaries).
import { Tile, boardStrings, catalog, computerOf, infoFor, type BoardBotTile, type Catalog, type FrameHandle, type InfoCtx, type TileProps } from '../board/fixtures.links';
import page from './page';
import strings from './strings.en.json';
import BotTile from './tile';

const REALM = 'a1b2c3d4e5f60718293a4b5c';
const CHIEF = `c-atlas~${REALM}~chief`;
// fixtures.ts linkOf: the chief Bot's address.
const CHIEF_URL = 'https://chief-shop-bot.hoody.bot';

// The Board host takes the Bot view from the page contributions; here it is the Bots page's real tile view.
const host = vi.hoisted(() => ({ on: false }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    useContributions: (...a: Parameters<typeof kit.useContributions>) =>
      host.on ? { widgets: [], guideTopics: [], tileViews: [{ pageId: 'bots', id: 'bot', title: 'Bot', Component: BotTile, href: '/bots' }] } : kit.useContributions(...a),
  };
});

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => {
  host.on = false;
  vi.restoreAllMocks();
});

const noFrame = () => {
  expect(document.querySelector('iframe, frame, object, embed')).toBeNull();
};

const BS = boardStrings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (BS[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
function boardTileProps(): TileProps {
  const comp = computerOf({ id: 'c-atlas', name: 'atlas', status: 'running', project_id: 'p1', server_name: 'n12' })!;
  const ctx: InfoCtx = { computers: [comp], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
  const tile: BoardBotTile = { project: 'p1', computer: 'c-atlas', realm: REALM, bot: 'chief' };
  return {
    info: infoFor('s1', tile, ctx, { selected: REALM, rows: [] }), domId: 'tile-s1', active: true, maximised: false, hidden: false, narrow: false, inside: false,
    reloadKey: 0, frameState: 'loading', frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined,
    onActivate: () => undefined, onReload: () => undefined, onFrameState: () => undefined, onRegister: () => undefined, onBack: () => undefined,
    onRetry: () => undefined, cardActions: <button type="button">Remove</button>, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null,
  };
}

describe('the Hub never frames a Bot page', () => {
  it("the Link and keys tab: Open opens the Bot's own address at the top of a new tab, no opener, no referrer; nothing framed", async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    // Open is the chat page row's menu item in the Addresses table.
    const head = await screen.findByRole('heading', { name: strings['addr.title'] });
    const row = within(head.closest('section') as HTMLElement).getByRole('row', { name: new RegExp(strings['addr.kind.chat']) });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['link.any.open.chat'] }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    expect(String(url).replace(/\/$/, '')).toBe(CHIEF_URL);
    expect(target).toBe('_blank');
    expect(String(features).split(',').sort()).toEqual(['noopener', 'noreferrer']);
    noFrame();
  });

  it("a Board's Bot tile, through the Board's Tile host, draws the Bot from the agent API: no iframe, frame, object or embed", async () => {
    host.on = true;
    await renderPage({ ...page, load: async () => ({ default: () => <Tile {...boardTileProps()} /> }) }, { path: '/bots?host=board' });
    // The Board head names the Bot by its id ("chief"); the Bots page's tile view, drawn inside the host, by its name.
    await screen.findByText('Chief', undefined, { timeout: 10000 });
    noFrame();
  });
});
