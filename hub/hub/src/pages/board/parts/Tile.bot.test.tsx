// Vitest: a Bot tile while its computer runs draws the Bots page's tile view for that Bot's key
// (computer~realm~bot), never a frame and never a share link; a Hub that does not serve the Bots page says so in a card
// with the card actions (Remove). A stopped computer shows the computer's card, as any computer tile does.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type * as Kit from '@kit';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import type { BotTile } from '../model/boards';
import strings from '../strings.en.json';
import type { FrameHandle } from './Frame';
import type { Power } from './lifecycle';
import { Tile, type TileProps } from './Tile';
import { infoFor, type InfoCtx, type TileInfo } from './tileInfo';

const served = vi.hoisted(() => ({ bots: true }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  const View = ({ target }: { target: string }) => <p>bot view {target}</p>;
  return {
    ...kit,
    useContributions: () => ({ widgets: [], guideTopics: [], tileViews: served.bots ? [{ pageId: 'bots', id: 'bot', title: 'Bot', Component: View, href: '/bots' }] : [] }),
  };
});
afterEach(() => { served.bots = true; });

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const R = '0123456789abcdef01234567';
const comp = (status: string) => computerOf({ id: 'c1', name: 'atlas', status, project_id: 'p1', server_name: 'n12' })!;
const ctx = (status: string, over: Partial<InfoCtx> = {}): InfoCtx => ({ computers: [comp(status)], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t, ...over });
const bot: BotTile = { project: 'p1', computer: 'c1', realm: R, bot: 'chief' };
const info = (status = 'running', over: Partial<InfoCtx> = {}): TileInfo => infoFor('s1', bot, ctx(status, over), { selected: R, rows: [] });
const held: Power = {
  op: null, heldOp: 'stop', ownHold: false, holdId: null, heldFrom: null, busy: true, pending: true, outcome: null,
  run: () => undefined, check: async () => false, dismiss: async () => false,
};

function props(i: TileInfo): TileProps {
  return {
    info: i, domId: 'tile-s1', active: true, maximised: false, hidden: false, narrow: false, inside: false, reloadKey: 0, frameState: 'loading',
    frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined, onActivate: () => undefined,
    onReload: () => undefined, onFrameState: () => undefined, onRegister: () => undefined, onBack: () => undefined, onRetry: () => undefined,
    cardActions: <button type="button">Remove</button>, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null,
  };
}

describe('a Bot tile', () => {
  it("is named by the Bot's id and has no frame address or share link", () => {
    const i = info();
    expect(i).toMatchObject({ state: 'live', name: 'chief', url: null, shareUrl: null, refused: false });
  });

  it("draws the Bots page's tile view for the Bot's key while the computer runs, and no frame", async () => {
    const { container } = render(<Tile {...props(info())} />);
    expect(await screen.findByText(`bot view c1~${R}~chief`)).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('link', { name: S['tile.openNew'] })).toBeNull();
  });

  it('says the Bots page is not available, with the card actions, when this Hub does not serve it', () => {
    served.bots = false;
    render(<Tile {...props(info())} />);
    expect(screen.getByRole('heading', { name: t('tile.botUnavailableTitle', { name: 'chief' }) })).toBeInTheDocument();
    expect(screen.getByText(S['tile.botUnavailableBody']!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByText(/bot view/)).toBeNull();
  });

  it("a stopped computer shows the computer's stopped card, not the Bot view", () => {
    render(<Tile {...props(info('stopped'))} />);
    expect(screen.getByRole('heading', { name: t('tile.stoppedTitle', { computer: 'atlas' }) })).toBeInTheDocument();
    expect(screen.queryByText(/bot view/)).toBeNull();
  });

  it.each([
    ['paused', () => info('paused'), t('tile.pausedTitle', { computer: 'atlas' })],
    ['gone from the realm', () => info('running', { computers: [] }), t('tile.goneTitleNoName')],
    ['not checkable (the list failed without it)', () => info('running', { computers: [], failed: true }), t('tile.unknownTitle', { computer: S['tile.unknownComputer'] })],
  ])("a computer that is %s shows that computer card, not the Bot view", (_why, i, title) => {
    render(<Tile {...props(i())} />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByText(/bot view/)).toBeNull();
  });

  it('a lifecycle change that may have gone through is the band over the live Bot view, as over a frame', async () => {
    render(<Tile {...props(info())} power={held} />);
    expect(await screen.findByText(`bot view c1~${R}~chief`)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: S['tile.stopUnknown'] })).toBeInTheDocument();
  });
});
