// Vitest: "It's live" shows the script's address the way Where it answers does (ScriptAddress): the route
// and exec-1 readable, the middle of each id hidden, never the whole address as "https://••••"; Copy gives the whole URL. The
// address is the one the deploy made: a reservation sent again keeps its own route, whatever the draft says now.
import { act, fireEvent, render, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import strings from '../strings.en.json';
import { StepLive, liveOrigin, type UseLive } from './StepLive';

const PROJECT = 'be0000000000000000000b01', COMPUTER = 'ce0000000000000000000c01';
const B = { target: { project: { id: PROJECT, server: { name: 'live-node-1' } }, container: { id: COMPUTER, server_name: 'live-node-1' } }, realm: 'global', owner: 'fp1', exec: 1 };
const ORIGIN = `https://${PROJECT}-${COMPUTER}-exec-1.live-node-1.computers.example`;

const done = (path: string, origin = ORIGIN) => ({ live: { k: 'done', path, keys: null, origin, own: true }, link: { k: 'none' }, send: async () => undefined, checkAgain: async () => undefined, discard: async () => false, discardNote: false, canSend: false, op: null, again: () => undefined }) as unknown as UseLive;
const view = (path: string, route: string, origin = ORIGIN) =>
  render(<StepLive api={done(path, origin)} route={route} computer="live-box-1" schedule={null} link={false} onAction={() => undefined} onTry={() => undefined} onOpen={() => undefined} onAnother={() => undefined} onDiscarded={() => undefined} />);

describe("It's live: the address", () => {
  it('shows the route and exec-1 readably, never the bullets alone, and Copy gives the whole URL', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
    const { container } = view('default/1/hour-check-how.ts', '/hour-check-how');
    const text = (container.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('exec-1');
    expect(text).toContain('/hour-check-how');
    expect(text).not.toMatch(/https:\/\/•+(?!\S)/);
    // The ids stay middle-masked on screen.
    expect(text).not.toContain(PROJECT);
    expect(text).not.toContain(COMPUTER);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['address.copyWhat'].replace('{{what}}', strings['flow.live.url']) })); await Promise.resolve(); });
    expect(written).toEqual([`${ORIGIN}/hour-check-how`]);
  });

  it('says Answering (or Turned off) only for this tab\'s own send: an observed record claims neither', () => {
    const api = (own: boolean) => ({ ...done('default/1/notes.ts'), live: { k: 'done', path: 'default/1/notes.ts', keys: null, origin: ORIGIN, own } }) as unknown as UseLive;
    const draw = (own: boolean, off: boolean) => render(<StepLive api={api(own)} route="/notes" computer="live-box-1" schedule={null} off={off} link={false} onAction={() => undefined} onTry={() => undefined} onOpen={() => undefined} onAnother={() => undefined} onDiscarded={() => undefined} />);
    const mine = draw(true, false);
    expect(mine.getByText(strings['flow.live.answering'])).toBeTruthy();
    mine.unmount();
    const mineOff = draw(true, true);
    expect(mineOff.getByText(strings['flow.live.off'])).toBeTruthy();
    mineOff.unmount();
    for (const off of [false, true]) {
      const seen = draw(false, off);
      expect(seen.queryByText(strings['flow.live.answering'])).toBeNull();
      expect(seen.queryByText(strings['flow.live.off'])).toBeNull();
      expect(seen.container.textContent).toContain('/notes');
      seen.unmount();
    }
  });

  it('is the address the deploy made: a reservation sent again shows its own route, not the draft\'s current one', () => {
    const { container } = view('default/1/notes.ts', '/elsewhere');
    expect(container.textContent).toContain('/notes');
    expect(container.textContent).not.toContain('/elsewhere');
  });

  it('liveOrigin is the computer\'s Exec origin, without a path; none without a binding', () => {
    expect(liveOrigin(B as never, 1)).toMatch(/^https:\/\/[^/]+$/);
    expect(liveOrigin(B as never, 1)).toContain('-exec-1.');
    expect(liveOrigin(null, 1)).toBe('');
  });
});
