// Vitest: a Bot in another page's tile (the bots page's tile view). The tile shows one Bot by its row
// key: name and status, the pinned card while a gate waits (decided once, here), and the Activity log. Hiding task
// updates is the tile's own state and never touches the host page's address. A key that names no Bot says it is gone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';
import BotTile from './tile';
import K from '@kit/agent/Conversation.strings.en.json';

// Scout carries Chief's very gate (same id and generation) and Chief's log when `twin` is on: the case where only the
// Bot key tells the two apart.
const twin = vi.hoisted(() => ({ on: false, refreshFails: false }));
vi.mock('./data', async (orig) => {
  const d = await orig<typeof Data>();
  const twinned = <Q extends { bot?: Data.BotView }>(q: Q, key: string | undefined): Q => {
    const chief = d.useBotView('c-atlas~a1b2c3d4e5f60718293a4b5c~chief');
    // A refresh that failed while the earlier answer is kept (as the query cache keeps it).
    if (twin.refreshFails && q.bot) return { ...q, isError: true, error: { kind: 'server' } };
    if (!twin.on || key !== 'c-cinder~a1b2c3d4e5f60718293a4b5c~scout' || !q.bot || !chief.bot) return q;
    return { ...q, bot: { ...q.bot, gate: chief.bot.gate } };
  };
  return {
    ...d,
    useBotView: (key: string | undefined) => twinned(d.useBotView(key), key),
    useTileBotView: (key: string) => twinned(d.useTileBotView(key), key),
    useLog: (key: string | undefined) => {
      const q = d.useLog(key);
      const chief = d.useLog('c-atlas~a1b2c3d4e5f60718293a4b5c~chief');
      return twin.on && key === 'c-cinder~a1b2c3d4e5f60718293a4b5c~scout' ? chief : q;
    },
  };
});

afterEach(() => {
  twin.on = false;
  twin.refreshFails = false;
});

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const SCOUT = 'c-cinder~a1b2c3d4e5f60718293a4b5c~scout';
// The tile inside a host page at /bots?host=board (the host's own address must stay as it is).
const inTile = (target: string, state?: string) =>
  renderPage({ ...page, load: async () => ({ default: () => <BotTile target={target} /> }) }, { state, path: '/bots?host=board' });
// The same tile, retargeted by its host (a Board tile whose Bot is changed in place).
function Retarget() {
  const [target, setTarget] = useState(CHIEF);
  return (
    <>
      <button type="button" onClick={() => setTarget(SCOUT)}>
        to Scout
      </button>
      <BotTile target={target} />
    </>
  );
}
const retargeted = (state: string) => renderPage({ ...page, load: async () => ({ default: Retarget }) }, { state, path: '/bots?host=board' });

// The tile's CSS, read as written (the geometry needs a browser; the rule that makes the log's box its scroller is pinned).
const tileCss = readFileSync(path.join(__dirname, 'tile.module.css'), 'utf8');
const tileRule = (sel: string) => tileCss.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';

describe('a long thread never scrolls the tile past its header and card', () => {
  it('the log follows its end in its own scroll box, after the header and the waiting card, which stay outside it', async () => {
    await inTile(CHIEF, 'waitingApprove');
    const card = await screen.findByRole('region', { name: K['agent.needsApproval'] });
    const log = await screen.findByRole('list', { name: strings['activity.title'] }, { timeout: 8000 });
    const box = log.closest('[data-tile-log]') as HTMLElement;
    expect(box).not.toBeNull();
    const tile = box.closest('[data-bot-tile]') as HTMLElement;
    expect(box.parentElement).toBe(tile);
    expect(box.contains(card)).toBe(false);
    expect(box.contains(screen.getByRole('button', { name: strings['tile.open'] }))).toBe(false);
    expect(card.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the box is the log's scroller: it takes the height left, scrolls, and keeps a few rows in a short tile", () => {
    const r = tileRule('.tileLog');
    expect(r).toMatch(/overflow: auto;/);
    expect(r).toMatch(/flex: 1 1 0;/);
    expect(r).toMatch(/min-block-size: 8rem;/);
  });

  it('the tile fills the height its host gives it: its root is a full-height column and the tile takes it', async () => {
    await inTile(CHIEF, 'waitingApprove');
    const tile = (await screen.findByRole('list', { name: strings['activity.title'] }, { timeout: 8000 })).closest('[data-bot-tile]') as HTMLElement;
    expect(tile.parentElement?.hasAttribute('data-bot-tile-root')).toBe(true);
    expect(tile.parentElement).toHaveClass('root');
    const root = tileRule('.root');
    expect(root).toMatch(/display: flex;/);
    expect(root).toMatch(/flex-direction: column;/);
    expect(root).toMatch(/block-size: 100%;/);
    const t = tileRule('.tile');
    expect(t).toMatch(/flex: 1 1 auto;/);
    expect(t).toMatch(/min-block-size: 0;/);
  });
});

describe('the bots tile view', () => {
  it('the manifest offers the tile view "bot" with a translated title', () => {
    expect(page.tileViews?.map((v) => [v.id, v.title])).toEqual([['bot', 'tile.title']]);
    expect(strings['tile.title']).toBe('Bot');
  });

  it('a Bot waiting for an approval shows its card; approving sends once and says the decision was used', async () => {
    await inTile(CHIEF, 'waitingApprove');
    const tile = await screen.findByRole('region', { name: K['agent.needsApproval'] });
    await userEvent.click(within(tile).getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    expect(await screen.findByText(K['agent.d.once'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) })).toBeNull();
  });

  it('an idle Bot shows its name, status and Activity, no card, and Open in Bots', async () => {
    await inTile(CHIEF, 'idle');
    expect(await screen.findByRole('heading', { name: strings['activity.title'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: K['agent.needsApproval'] })).toBeNull();
    expect(screen.getByText(strings['status.idle'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['tile.open'] })).toBeInTheDocument();
  });

  it('Open in Bots goes to the Bot on its own page', async () => {
    const { router } = await inTile(CHIEF, 'idle');
    await userEvent.click(await screen.findByRole('button', { name: strings['tile.open'] }));
    expect(router.state.location.search).toMatchObject({ sel: CHIEF });
  });

  it('hiding task updates keeps the host page address as it was', async () => {
    const { router } = await inTile(CHIEF, 'idle');
    const box = await screen.findByRole('checkbox', { name: strings['activity.hideTasks'] }, { timeout: 8000 });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(router.state.location.search).toEqual({ host: 'board' });
  });

  it('a key that names no Bot here says it is gone, with Open Bots', async () => {
    await inTile('c-atlas~a1b2c3d4e5f60718293a4b5c~nobody', 'idle');
    expect(await screen.findByText(strings['bot.gone'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['tile.openList'] })).toBeInTheDocument();
  });

  it('a malformed key reads nothing and says it is gone', async () => {
    const { queryClient } = await inTile('not-a-key', 'idle');
    expect(await screen.findByText(strings['bot.gone'])).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([]);
  });

  it('an answer typed for one Bot is not carried to another Bot whose gate has the same id', async () => {
    twin.on = true;
    await retargeted('waitingAnswer');
    const box = await screen.findByRole('textbox', { name: K['agent.somethingElseField'] }, { timeout: 8000 });
    await userEvent.type(box, 'main');
    await userEvent.click(screen.getByRole('button', { name: 'to Scout' }));
    expect(await screen.findByText('Scout')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: K['agent.somethingElseField'] })).toHaveValue('');
  });

  it("a decision in flight for one Bot does not hold another Bot's card", async () => {
    twin.on = true;
    await retargeted('gateRecovery');
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }, { timeout: 8000 }));
    expect(await screen.findByText(K['agent.decisionUnknown'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'to Scout' }));
    expect(await screen.findByText('Scout')).toBeInTheDocument();
    expect(screen.queryByText(K['agent.decisionUnknown'])).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) })).toBeInTheDocument();
  });

  it('a Bot read that fails after an answer keeps the Bot and says the load failed, with Retry', async () => {
    twin.refreshFails = true;
    await inTile(CHIEF, 'idle');
    expect(await screen.findByText(strings['bot.loadError'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['tile.open'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
  });

  it('hiding task updates is kept for one Bot only', async () => {
    twin.on = true;
    await retargeted('idle');
    await userEvent.click(await screen.findByRole('checkbox', { name: strings['activity.hideTasks'] }, { timeout: 8000 }));
    await userEvent.click(screen.getByRole('button', { name: 'to Scout' }));
    expect(await screen.findByText('Scout')).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: strings['activity.hideTasks'] }, { timeout: 8000 })).not.toBeChecked();
  });
});
