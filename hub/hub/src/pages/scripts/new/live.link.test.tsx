// Vitest: "It's live" shows the links themselves. The public link is drawn with its whole address, as the create answer
// gave it, as a link that opens outside (exact href) with Copy ("Who can open a public link?" under it needs the page's
// questions, so the flow draws it: see Flow). The script's own address keeps its ids' middles hidden on screen and gets Open
// beside Copy: a button that opens the whole address in a new tab, with the address never in the page. An answer that gave
// no address says where to find it.
import { act, fireEvent, render, screen } from '@app/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import strings from '../strings.en.json';
import { StepLive, madeLinkUrl, type Link, type UseLive } from './StepLive';

const PROJECT = 'be0000000000000000000b01', COMPUTER = 'ce0000000000000000000c01';
const ORIGIN = `https://${PROJECT}-${COMPUTER}-exec-1.live-node-1.computers.example`;
const LINK = 'https://quiet-river-k3x9.live-node-1.links.example';

const api = (link: Link, path = 'default/1/take-email.ts', origin = ORIGIN) => ({ live: { k: 'done', path, keys: null, origin, own: true }, link, send: async () => undefined, checkAgain: async () => undefined, discard: async () => false, discardNote: false, canSend: false, op: null, again: () => undefined }) as unknown as UseLive;
const view = (link: Link, over: { path?: string; route?: string; origin?: string; wanted?: boolean } = {}) =>
  render(<StepLive api={api(link, over.path, over.origin)} route={over.route ?? '/take-email'} computer="live-box-1" schedule={null} link={over.wanted ?? true} onAction={() => undefined} onTry={() => undefined} onOpen={() => undefined} onAnother={() => undefined} onDiscarded={() => undefined} />);

afterEach(() => vi.restoreAllMocks());

describe("It's live: the public link", () => {
  it('a made link is shown whole, as a link that opens outside with exactly its address, and Copy', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
    view({ k: 'made', url: LINK });
    expect(screen.getByText(strings['flow.live.linkMade'])).toBeTruthy();
    const a = screen.getByRole('link', { name: new RegExp(LINK.replace(/[.]/g, '\\.')) });
    expect(a.getAttribute('href')).toBe(LINK);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.textContent).toContain(LINK);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['share.copy'] })); await Promise.resolve(); });
    expect(written).toEqual([LINK]);
  });

  it('a made link whose answer gave no address says where it is listed, and draws no link', () => {
    view({ k: 'made', url: null });
    expect(screen.getByText(strings['flow.live.linkMadeNoUrl'])).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('while it is being made, refused or not known, no address is drawn', () => {
    for (const [link, key] of [[{ k: 'sending' }, 'flow.live.linkSending'], [{ k: 'refused', code: 'X' }, 'flow.live.linkRefused'], [{ k: 'unknown' }, 'flow.live.linkUnknown']] as Array<[Link, keyof typeof strings]>) {
      const v = view(link);
      expect(screen.getByText(strings[key])).toBeTruthy();
      expect(screen.queryByRole('link')).toBeNull();
      v.unmount();
    }
  });

  it('the link\'s address is the answer\'s own: the record bare or under data, an absolute web address only', () => {
    expect(madeLinkUrl({ statusCode: 201, data: { alias: 'quiet-river-k3x9', url: LINK } })).toBe(LINK);
    expect(madeLinkUrl({ alias: 'quiet-river-k3x9', url: LINK })).toBe(LINK);
    for (const raw of [undefined, null, 'x', {}, { data: {} }, { data: { url: null } }, { data: { url: 'quiet-river-k3x9' } }, { data: { url: 'javascript:alert(1)' } }, { data: { alias: 'quiet-river-k3x9' } }]) expect(madeLinkUrl(raw)).toBeNull();
  });
});

describe("It's live: the script's own address", () => {
  it('has Open beside Copy: a button that opens the whole address in a new tab, the address never in the page', () => {
    const opened: unknown[][] = [];
    vi.spyOn(window, 'open').mockImplementation((...a: unknown[]) => (opened.push(a), null));
    const { container } = view({ k: 'none' }, { wanted: false });
    const open = screen.getByRole('button', { name: new RegExp(`^${strings['address.open']} \\(`) });
    expect(open.textContent).toContain(strings['address.open']);
    expect(open.getAttribute('href')).toBeNull();
    fireEvent.click(open);
    expect(opened.map((x) => x[0])).toEqual([`${ORIGIN}/take-email`]);
    expect(opened[0]?.[1]).toBe('_blank');
    // On screen, and anywhere in the page, the ids stay middle-hidden.
    expect(container.innerHTML).not.toContain(PROJECT);
    expect(container.innerHTML).not.toContain(COMPUTER);
  });

  it('an address with a variable part, or with no origin known, has no Open (nothing a browser could open as it is)', () => {
    const dyn = view({ k: 'none' }, { path: 'default/1/orders/[id].ts', route: '/orders/[id]', wanted: false });
    expect(screen.queryByRole('button', { name: new RegExp(`^${strings['address.open']} \\(`) })).toBeNull();
    expect(dyn.container.textContent).toContain('/orders/[id]');
    dyn.unmount();
    view({ k: 'none' }, { origin: '', wanted: false });
    expect(screen.queryByRole('button', { name: new RegExp(`^${strings['address.open']} \\(`) })).toBeNull();
  });
});
