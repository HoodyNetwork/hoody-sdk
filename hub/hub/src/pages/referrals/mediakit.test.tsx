// Vitest: Share material in Your links. The media kit link shows with its exact address, opening in a new tab without
// an opener, wherever the account has a link to share; an account that isn't earning, or has no code yet, has none.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { MEDIA_KIT_URL } from './links';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const open = (state?: string) => renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
const media = () => document.getElementById('referral-media');

describe('Referrals: the media kit link', () => {
  it('the address is the one constant', () => {
    expect(MEDIA_KIT_URL).toBe('https://hoody.com/media-kit?source=hub');
  });

  it.each([[undefined], ['blocked'], ['noCustomCodes'], ['creator']])('state %s: Share material closes Your links with the link, its help and a new tab', async (state) => {
    await open(state);
    expect(await screen.findByText(strings['link.title'], undefined, { timeout: T })).toBeInTheDocument();
    const sub = media() as HTMLElement;
    expect(sub).not.toBeNull();
    expect(sub.getAttribute('data-hub-section')).toBe('sub');
    expect(document.getElementById('referral-link')!.contains(sub)).toBe(true);
    expect(within(sub).getByRole('heading', { level: 3, name: strings['media.title'] })).toBeInTheDocument();
    expect(within(sub).getByText(strings['media.help'])).toBeInTheDocument();
    const links = within(sub).getAllByRole('link');
    expect(links).toHaveLength(1);
    const a = links[0]!;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://hoody.com/media-kit?source=hub');
    expect(a.textContent).toContain(strings['media.link']);
    expect(a.textContent).not.toContain('source=hub');
    expect(a.getAttribute('target')).toBe('_blank');
    expect((a.getAttribute('rel') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    // After the codes: the main link and the person's own codes come first.
    const main = document.getElementById('referral-main')!;
    expect(main.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const custom = document.getElementById('referral-custom');
    if (custom) expect(custom.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The page has this address once.
    expect(document.querySelectorAll('a[href*="media-kit"]')).toHaveLength(1);
  });

  it.each([['earningPaused'], ['removed']])('state %s: the codes are listed alone, with no share material', async (state) => {
    await open(state);
    expect(await screen.findByText(strings['link.codes'], undefined, { timeout: T })).toBeInTheDocument();
    expect(media()).toBeNull();
    expect(document.querySelector('a[href*="media-kit"]')).toBeNull();
    expect(screen.queryByText(strings['media.link'])).toBeNull();
  });

  it.each([['notEligible'], ['canJoin'], ['paused']])('state %s: no links card, so no media kit', async (state) => {
    await open(state);
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: T })).toBeInTheDocument();
    expect(document.getElementById('referral-link')).toBeNull();
    expect(document.querySelector('a[href*="media-kit"]')).toBeNull();
  });
});
