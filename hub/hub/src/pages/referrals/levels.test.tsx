// Vitest: the Referrals layout. Row A holds Your links beside Referral credit with no facts
// rail; the links share one set of columns with Copy link as the one primary button; Levels are three cards with the
// API's shares and the creator_customers band (never a ratio or a "how many to go"); People you invited is a stat strip.
import { describe, expect, it } from 'vitest';
import { render, renderPage, screen, userEvent, within } from '@app/testing';
import { useStrings } from '@kit';
import { MEMBER } from './fixtures';
import { ROW_A, SECTIONS } from './layout';
import { selectMe } from './logic';
import page from './page';
import { LinkCard } from './parts/LinkCard';
import strings from './strings.en.json';

const T = 8000;
const open = (state?: string) => renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
const section = (id: string) => document.getElementById(id) as HTMLElement;
const card = (name: string) => screen.getByRole('group', { name });
const ready = async (state?: string) => {
  await open(state);
  await screen.findByRole('heading', { name: strings['link.title'] }, { timeout: T });
};

describe('referrals layout', () => {
  it('no facts rail: Referral credit sits beside the links in the page, links first, in the layout.ts order', async () => {
    await ready();
    expect(ROW_A).toEqual(['links', 'credit']);
    expect(SECTIONS).toEqual(['levels', 'people', 'monthly']);
    expect(screen.queryByRole('complementary')).toBeNull();
    const links = section('referral-link');
    const credit = screen.getByRole('heading', { name: strings['credit.title'] });
    expect(links.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One grid: both cards are cells of the same Row A container, not a page beside an aside.
    const cellOf = (el: Element) => el.closest('#referral-link, section, [role="region"]')?.parentElement as HTMLElement;
    expect(cellOf(links)!.parentElement).toBe(cellOf(credit)!.parentElement);
    expect(cellOf(links)).not.toBe(cellOf(credit));
    const order = ['referral-link', 'referral-levels', 'referral-people', 'referral-monthly'].map(section);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the main link first, under "Main link", with Copy link as the one primary button that copies it', async () => {
    await ready();
    const main = section('referral-main');
    expect(within(main).getByText('https://api.hoody.com/auth/signup?ref=k7m2q9xa')).toBeInTheDocument();
    expect(within(main).getByText(strings['link.mainNote'])).toBeInTheDocument();
    const copy = within(main).getByRole('button', { name: strings['link.copyMain'] });
    expect(copy).toHaveTextContent(strings['link.copyMain']);
    expect(within(main).getAllByRole('button', { name: /^Copy/ })).toHaveLength(1);
    let written = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (x: string) => ((written = x), Promise.resolve()) } });
    await userEvent.click(copy);
    expect(written).toBe('https://api.hoody.com/auth/signup?ref=k7m2q9xa');
  });

  it('custom codes: the counter in plain words from the list and what is left, and the lifetime rule as a visible line', async () => {
    await ready();
    const custom = section('referral-custom');
    expect(within(custom).getByText('1 of 3 active · 2 more can be made now')).toBeInTheDocument();
    expect(within(custom).getByText(strings['codes.rule.limits'], { exact: false })).toBeInTheDocument();
    expect(within(custom).getByRole('link', { name: new RegExp(strings['codes.limits']) })).toBeInTheDocument();
    expect(within(custom).getByRole('textbox', { name: strings['create.label'] })).toBeInTheDocument();
    expect(within(custom).getByRole('button', { name: 'Copy the maya-builds link' })).toBeInTheDocument();
  });

  it('no codes yet: the empty line, and the create form still shows while codes are left (or the unavailable line when none are)', () => {
    function Card({ left, noCustom }: { left: number; noCustom: boolean }) {
      const t = useStrings(strings);
      const me = selectMe({ data: { ...MEMBER, codes: [], vanity_codes_left: left } });
      return <LinkCard t={t} me={me} copy noCustom={noCustom} form={left > 0 ? <input aria-label="the form" /> : undefined} />;
    }
    const { unmount } = render(<Card left={2} noCustom={false} />);
    expect(screen.getByText(strings['code.none'])).toBeInTheDocument();
    expect(within(section('referral-custom')).getByRole('textbox', { name: 'the form' })).toBeInTheDocument();
    expect(within(section('referral-custom')).getByText('0 of 3 active · 2 more can be made now')).toBeInTheDocument();
    unmount();
    render(<Card left={0} noCustom />);
    expect(screen.getByText(strings['code.none'])).toBeInTheDocument();
    expect(within(section('referral-custom')).getByText(strings['codes.unavailable'])).toBeInTheDocument();
  });

  // At the active cap the line keeps "3 of 3 active" before the unavailable words, and never promises
  // that retiring one makes room (the listing can't show the lifetime count)
  it('all 3 custom codes active and none left: "3 of 3 active" stays, then the unavailable words', () => {
    function Card({ n }: { n: number }) {
      const t = useStrings(strings);
      const codes = Array.from({ length: n }, (_, i) => ({ code: `mine-${i}`, kind: 'vanity', state: 'active', link: `https://hoody.com/signup?ref=mine-${i}` }));
      const me = selectMe({ data: { ...MEMBER, codes, vanity_codes_left: 0 } });
      return <LinkCard t={t} me={me} copy noCustom />;
    }
    const { unmount } = render(<Card n={3} />);
    const line = '3 of 3 active · No more codes of your own can be made now.';
    // No lifetime sentence after the active cap (it would read as the reason); the rule line carries both limits
    expect(strings['codes.unavailableFull']).not.toMatch(/10|never resets/);
    expect(within(section('referral-custom')).getByText(line)).toBeInTheDocument();
    expect(strings['codes.unavailableFull']).not.toMatch(/retire/i);
    unmount();
    render(<Card n={2} />);
    expect(within(section('referral-custom')).getByText(strings['codes.unavailable'])).toBeInTheDocument();
  });

  // An unknown count (a value that is not a whole number from 0) shows only "N of 3 active", never
  // "null" or a made-up count, and neither the unavailable words nor the form
  it('unknown count of codes left: the line is "1 of 3 active" alone', () => {
    function Card({ left }: { left: unknown }) {
      const t = useStrings(strings);
      const codes = [{ code: 'mine-0', kind: 'vanity', state: 'active', link: 'https://hoody.com/signup?ref=mine-0' }];
      const me = selectMe({ data: { ...MEMBER, codes, vanity_codes_left: left } });
      return <LinkCard t={t} me={me} copy noCustom={false} />;
    }
    for (const left of [null, undefined, -1, 1.5]) {
      const { unmount } = render(<Card left={left} />);
      const custom = section('referral-custom');
      expect(within(custom).getByText('1 of 3 active')).toBeInTheDocument();
      expect(custom.textContent).not.toMatch(/null|undefined|NaN|more can be made/);
      expect(within(custom).queryByText(strings['codes.unavailable'])).toBeNull();
      unmount();
    }
  });

  it('earning paused and removed: the codes are listed alone, without the lifetime-limit line', async () => {
    for (const state of ['earningPaused', 'removed']) {
      const { unmount } = await open(state);
      await screen.findByText(strings['link.codes'], { selector: 'h2' }, { timeout: T });
      expect(within(section('referral-custom')).getByText('maya-builds')).toBeInTheDocument();
      expect(within(section('referral-custom')).queryByText(strings['codes.rule.limits'], { exact: false })).toBeNull();
      unmount();
    }
  });

  it('a blocked main code gets no Copy link even when the API still sends its link (selectMe drops it; LinkCard checks the state too)', () => {
    function Card() {
      const t = useStrings(strings);
      const me = selectMe({ data: { ...MEMBER, codes: [{ code: 'k7m2q9xa', kind: 'random', state: 'blocked', link: 'https://api.hoody.com/auth/signup?ref=k7m2q9xa' }] } });
      return <LinkCard t={t} me={me} copy noCustom={false} />;
    }
    render(<Card />);
    expect(within(section('referral-main')).getByText(strings['code.blocked'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['link.copyMain'] })).toBeNull();
  });

  it('a member: Referrer is this month\'s card with the API share, Creator the next with its share and number, and where you stand as band words', async () => {
    await ready();
    const levels = section('referral-levels');
    expect(within(levels).getByText(strings['levels.caption'])).toBeInTheDocument();
    const referrer = card(strings['levels.referrer']);
    expect(within(referrer).getByText(strings['levels.yours'])).toBeInTheDocument();
    expect(within(referrer).getByText('5%')).toBeInTheDocument();
    const creator = card(strings['levels.creator']);
    expect(within(creator).getByText(strings['levels.next'])).toBeInTheDocument();
    expect(within(creator).getByText('10%')).toBeInTheDocument();
    expect(within(creator).getByText("from the month after 11 or more customers you referred have earned you credit that wasn't all reversed")).toBeInTheDocument();
    expect(within(creator).getByText(strings['levels.withdraw'])).toBeInTheDocument();
    const stand = card(strings['stand.title']);
    expect(within(stand).getByText(strings['band.few'])).toBeInTheDocument();
    // The number slot holds a figure ("< 3", one line at every width), the words are its
    // spoken name; the figure itself is hidden from a screen reader so the band is read once.
    const figure = within(stand).getByText(strings['band.fewShort']);
    expect(figure).toHaveAttribute('aria-hidden', 'true');
    expect(within(stand).getByText('of 11 needed')).toBeInTheDocument();
    expect(within(stand).getByRole('link', { name: strings['stand.how'] })).toBeInTheDocument();
    // A band is never a ratio, a bar or a "how many to go".
    expect(levels.textContent).not.toMatch(/\d+\s*\/\s*11|more to go|need \d+ more|\d+%\s*of the way/i);
    expect(levels.querySelector('[role="progressbar"], progress, meter')).toBeNull();
  });

  it('a Creator: the base share with no number, Creator as this month\'s card with the API share, and the exact count', async () => {
    await ready('creator');
    const referrer = card(strings['levels.referrer']);
    expect(within(referrer).getByText(strings['levels.base'])).toBeInTheDocument();
    expect(referrer.textContent).not.toMatch(/\d+(\.\d+)?%/);
    expect(within(referrer).queryByText(strings['levels.yours'])).toBeNull();
    const creator = card(strings['levels.creator']);
    expect(within(creator).getByText(strings['levels.yours'])).toBeInTheDocument();
    expect(within(creator).getByText('7.5%')).toBeInTheDocument();
    const stand = card(strings['stand.title']);
    expect(within(stand).getByText('12')).toBeInTheDocument();
    expect(within(stand).getByText('Creator needs 11')).toBeInTheDocument();
  });

  it('an older API without the Creator fields: no Creator share is invented and where you stand shows a dash', async () => {
    await ready('noCreatorFields');
    expect(card(strings['levels.creator']).textContent).not.toMatch(/\d+(\.\d+)?%/);
    // "A share" stands in for the missing number, so the lead reads as a sentence
    expect(within(card(strings['levels.creator'])).getByText(strings['levels.share'])).toBeInTheDocument();
    expect(within(card(strings['stand.title'])).getByText(strings['band.unknown'])).toBeInTheDocument();
  });

  it('no Creator number: no figure in the Creator card or where you stand', async () => {
    await ready('noThreshold');
    expect(within(card(strings['levels.creator'])).getByText(strings['levels.creatorLeadUnknown'])).toBeInTheDocument();
    expect(within(card(strings['stand.title'])).getByText(strings['stand.ofUnknown'])).toBeInTheDocument();
    expect(section('referral-levels').textContent).not.toMatch(/\b11\b/);
  });

  it('people you invited: a stat strip of band words, each with what it counts', async () => {
    await ready();
    const strip = section('referral-people').querySelector('dl') as HTMLElement;
    expect(strip).toHaveAttribute('aria-label', strings['counts.label']);
    expect(strip).toHaveAttribute('data-narrow', 'rows');
    expect(within(strip).getByText('7')).toBeInTheDocument();
    expect(within(strip).getAllByText(strings['band.few'])).toHaveLength(2);
    for (const k of ['counts.signedUpHint', 'counts.payingHint', 'counts.activeHint'] as const) expect(within(strip).getByText(strings[k])).toBeInTheDocument();
  });

  it('earning paused and removed: no level cards, only the plain level tile', async () => {
    for (const state of ['earningPaused', 'removed']) {
      const { unmount } = await open(state);
      await screen.findByText(strings['link.codes'], { selector: 'h2' }, { timeout: T });
      expect(document.getElementById('referral-levels')).toBeNull();
      expect(screen.getByText('Referrer · 5%')).toBeInTheDocument();
      unmount();
    }
  });

  it('a level the API did not name is said to be unknown: neither card is yours, Creator is not next', async () => {
    await ready('unknownLevel');
    const levels = section('referral-levels');
    expect(within(levels).getByText(strings['levels.captionUnknown'])).toBeInTheDocument();
    expect(within(levels).queryByText(strings['levels.yours'])).toBeNull();
    expect(within(levels).queryByText(strings['levels.next'])).toBeNull();
    expect(within(card(strings['levels.referrer'])).getByText(strings['levels.share'])).toBeInTheDocument();
    expect(within(levels).queryByText('7.5%')).toBeNull();
    expect(within(card(strings['levels.creator'])).getByText('10%')).toBeInTheDocument();
  });

  it('a known level keeps its tags and the plain caption', async () => {
    await ready();
    const levels = section('referral-levels');
    expect(within(levels).getByText(strings['levels.caption'])).toBeInTheDocument();
    expect(within(card(strings['levels.referrer'])).getByText(strings['levels.yours'])).toBeInTheDocument();
    expect(within(card(strings['levels.creator'])).getByText(strings['levels.next'])).toBeInTheDocument();
  });

  it('earning paused with a level the API did not name: the level tile says it is not known, never Referrer', async () => {
    await open('unknownLevelPaused');
    await screen.findByText(strings['link.codes'], { selector: 'h2' }, { timeout: T });
    expect(screen.getByText(strings['level.notKnown'])).toBeInTheDocument();
    expect(screen.queryByText(/^Referrer · /)).toBeNull();
  });
});
