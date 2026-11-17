// Vitest: the pure rules behind the Bots list's cards: each Bot's mark colour (stable per Bot, from the palette only),
// what needs the person, and the summary counts above the list.
import { describe, expect, it } from 'vitest';
import type { BotRow } from './data';
import { botTint, listSummary, needsYou } from './logic';

const row = (over: Partial<BotRow>): BotRow => ({
  key: 'c~r~a',
  id: 'a',
  uid: '',
  name: 'A',
  role: '',
  realm: 'r',
  realmName: 'R',
  computerId: 'c',
  status: 'idle',
  queued: 0,
  model: '',
  modelLabel: '',
  lastActivityAt: null,
  link: 'none',
  chatApps: [],
  chatsWaiting: 0,
  privacyOn: false,
  locked: false,
  ...over,
});

describe('botTint', () => {
  it('is one palette colour, the same for the same Bot every time', () => {
    const palette = ['blue', 'green', 'orange', 'pink', 'purple', 'red', 'teal', 'yellow'];
    for (const seed of ['c~r~chief', 'c~r~scout', 'x', '']) {
      expect(palette).toContain(botTint(seed));
      expect(botTint(seed)).toBe(botTint(seed));
    }
  });

  it('spreads different Bots over the palette', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => botTint(`c-atlas~realm~helper-${i}`)));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe('needsYou', () => {
  it('a question waiting, a pause at its limit, or groups asking to be let in', () => {
    expect(needsYou(row({ status: 'waiting' }))).toBe(true);
    expect(needsYou(row({ status: 'paused' }))).toBe(true);
    expect(needsYou(row({ chatsWaiting: 2 }))).toBe(true);
    expect(needsYou(row({ status: 'working' }))).toBe(false);
    expect(needsYou(row({ status: 'queued', queued: 3 }))).toBe(false);
    expect(needsYou(row({ status: 'idle' }))).toBe(false);
  });

  it('never a Bot another program serves (it has no actions here)', () => {
    expect(needsYou(row({ status: 'waiting', locked: true }))).toBe(false);
  });
});

describe('listSummary', () => {
  it('counts Bots, the working ones, the ones needing the person (paused computers included) and the ones in a chat app', () => {
    const rows = [
      row({ key: '1', status: 'working' }),
      row({ key: '2', status: 'queued', queued: 2 }),
      row({ key: '3', status: 'waiting', chatApps: ['telegram'] }),
      row({ key: '4', status: 'idle', chatApps: ['slack', 'discord'], chatsWaiting: 1 }),
      row({ key: '5', status: 'idle', computerId: 'd' }),
    ];
    // The 3 paused after a sign-in change are Bots too, so "Need you" (2 + 3) never exceeds "Bots".
    expect(listSummary(rows, 3)).toEqual({ bots: 8, computers: 2, working: 1, needs: 2, suspended: 3, inChat: 2 });
  });
});
