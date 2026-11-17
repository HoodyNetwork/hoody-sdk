// Vitest: the Referrals page on fixtures, one test per page state. Each reads what a
// person sees: the link as the API sent it, band words, the level from rate_percent, credit, months and the bands.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { MEMBER } from './fixtures';
import { CODE_RULES_URL, RULES_URL } from './logic';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const open = (state?: string) => renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
/** A code's row: the code itself, then its kind as a chip ("Main code" or "Custom"). */
const codeRow = (code: string) => screen.getByText(code, { selector: 'code' }).closest('li') as HTMLElement;
const kindOf = (code: string, kind: 'main' | 'custom') => {
  const row = codeRow(code);
  expect(within(row).getByText(strings[`code.${kind}`])).toBeInTheDocument();
  expect(within(row).queryByText(strings[kind === 'main' ? 'code.custom' : 'code.main'])).toBeNull();
  expect(row.textContent).not.toContain(' · ');
  return row;
};
const levels = () => document.getElementById('referral-levels');
/** The next-step words: nowhere for an account that cannot earn, and gone once Creator. */
const LADDER_WORDS = /Next level|customers who count for Creator|of \d+ needed/;
/** People you invited: the kit stat strip in its own section. */
const counts = () => document.getElementById('referral-people')?.querySelector('dl') as HTMLElement;
const copyButtons = () => screen.queryAllByRole('button', { name: /copy/i });
/** The page's "Questions" section: shown where the program's rules are explained. */
const faqHeading = () => screen.queryByRole('heading', { name: kitStrings['faq.title'] });
const question = (id: string) => screen.getByRole('button', { name: strings[`faq.${id}.q` as keyof typeof strings] });
const answer = (id: string) => strings[`faq.${id}.a` as keyof typeof strings];
const QUESTIONS = ['rate', 'notCounted', 'window', 'bareMetal', 'hold', 'spend', 'withdraw', 'creator', 'privacy', 'eligible'];
/** Nowhere on the page: an invitation, an earning promise or the Creator encouragement (accounts that cannot earn). */
const noPromise = () => {
  expect(document.body.textContent).not.toMatch(/Invite people|\byou earn\b|How you earn|Creator level from/i);
  expect(document.body.textContent).not.toMatch(LADDER_WORDS);
  expect(levels()).toBeNull();
  expect(faqHeading()).toBeNull();
  expect(screen.getByText(strings['subtitle.plain'])).toBeInTheDocument();
};

describe('referrals page', () => {
  it('a member sees the link as given with Copy, the level, the band words, credit and the months', async () => {
    await open();
    expect(await screen.findByText(strings['link.title'], undefined, { timeout: T })).toBeInTheDocument();
    for (const c of MEMBER.codes) expect(screen.getByText(c.link as string)).toBeInTheDocument();
    expect(copyButtons().length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('1 of 3 active · 2 more can be made now')).toBeInTheDocument();
    kindOf('k7m2q9xa', 'main');
    kindOf('maya-builds', 'custom');
    // The levels: Referrer this month with the API share, Creator next with its number (levels.test reads the cards). No
    // count (Paying, Active, Signed up) is a step toward Creator.
    expect(within(levels() as HTMLElement).getByText('5%')).toBeInTheDocument();
    expect(within(levels() as HTMLElement).getByText(strings['levels.next'])).toBeInTheDocument();
    expect(within(counts()).queryByText('Referrer · 5%')).toBeNull();
    expect(within(counts()).getByText('7')).toBeInTheDocument();
    expect(within(counts()).getAllByText(strings['band.few'])).toHaveLength(2);
    expect(screen.getByText('$12.40')).toBeInTheDocument();
    expect(screen.getByText('$8.00')).toBeInTheDocument();
    expect(screen.getByText('Next credit due 3 Dec')).toBeInTheDocument();
    expect(screen.queryByText(strings['credit.owed'])).toBeNull();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Jul 2026')).toBeInTheDocument();
    expect(screen.queryByText('Aug 2026')).toBeNull();
    expect(screen.getByText(strings['monthly.caption'])).toBeInTheDocument();
    expect(screen.getByText(strings.subtitle)).toBeInTheDocument();
    expect(faqHeading()).toBeInTheDocument();
    for (const id of QUESTIONS) expect(question(id)).toHaveAttribute('aria-expanded', 'false');
  });

  it('docs_link_exact: Program rules opens the public rules page in a new tab', async () => {
    await open();
    const a = await screen.findByRole('link', { name: new RegExp(strings.rules) }, { timeout: T });
    expect(a).toHaveAttribute('href', RULES_URL);
    expect(RULES_URL).toBe('https://docs.hoody.com/foundation/wallet/referral-program/');
    expect(a).toHaveAttribute('target', '_blank');
  });

  it('a blocked code shows Blocked and its note, with no link and no Copy for it', async () => {
    await open('blocked');
    expect(await screen.findByText(strings['code.blocked'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText(strings['code.blockedNote'])).toBeInTheDocument();
    const row = kindOf('maya-builds', 'custom');
    expect(within(row).getByText(strings['code.blocked'])).toBeInTheDocument();
    expect(within(row).getByText(strings['code.blockedNote'])).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.queryByText('https://api.hoody.com/auth/signup?ref=maya-builds')).toBeNull();
    expect(screen.getByText('https://api.hoody.com/auth/signup?ref=k7m2q9xa')).toBeInTheDocument();
  });

  it('earning paused: the neutral band, codes without links or Copy, credit and months still shown', async () => {
    await open('earningPaused');
    expect(await screen.findByText(strings['band.earningPaused'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText(strings['link.codes'], { selector: 'h2' })).toBeInTheDocument();
    expect(screen.queryByText(strings['link.title'])).toBeNull();
    expect(screen.queryByText(strings['link.share'], { exact: false })).toBeNull();
    kindOf('k7m2q9xa', 'main');
    kindOf('maya-builds', 'custom');
    expect(screen.queryByText(/signup\?ref=/)).toBeNull();
    expect(copyButtons()).toHaveLength(0);
    expect(screen.queryByText(strings['codes.unavailable'])).toBeNull();
    // No level cards: the level is the plain tile.
    expect(screen.getByText('Referrer · 5%')).toBeInTheDocument();
    noPromise();
    expect(screen.getByText('$12.40')).toBeInTheDocument();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
  });

  it('removed: the warning band, no link, no Copy, no Creator encouragement, credit and history as returned', async () => {
    await open('removed');
    expect(await screen.findByText(strings['band.removed'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('Referrer · 5%')).toBeInTheDocument();
    expect(screen.queryByText(/signup\?ref=/)).toBeNull();
    expect(copyButtons()).toHaveLength(0);
    noPromise();
    expect(screen.getByText('$12.40')).toBeInTheDocument();
  });

  it('no custom codes left: one neutral line, no count of what is left', async () => {
    await open('noCustomCodes');
    expect(await screen.findByText(strings['codes.unavailable'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText(/custom codes? left/)).toBeNull();
  });

  it('owed above 0: the Owed line and its note', async () => {
    await open('owed');
    expect(await screen.findByText(strings['credit.owed'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getAllByText('$3.00').length).toBe(2); // owed and reversed
    expect(screen.getByText(strings['credit.owedNote'])).toBeInTheDocument();
  });

  it('no earnings yet: the empty months line, and no release line', async () => {
    await open('noMonthly');
    expect(await screen.findByText(strings['monthly.empty'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText(/Next credit due/)).toBeNull();
    expect(within(counts()).getAllByText(strings['band.none']).length).toBe(3);
  });

  it('a Creator shows the API share (7.5) on this month\'s card, how the level is set, and no next step', async () => {
    await open('creator');
    expect(await screen.findByText('7.5%', undefined, { timeout: T })).toBeInTheDocument();
    expect(within(levels() as HTMLElement).getByText(strings['levels.caption'])).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(LADDER_WORDS);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('no Creator number in the answer: the levels name no figure', async () => {
    await open('noThreshold');
    expect(await screen.findByText(strings['levels.creatorLeadUnknown'], undefined, { timeout: T })).toBeInTheDocument();
    expect(levels()?.textContent).not.toMatch(/\b11\b/);
  });

  it('a member with a share the API did not send: the levels still show, with no share for Referrer', async () => {
    await open('noRate');
    const referrer = await screen.findByRole('group', { name: strings['levels.referrer'] }, { timeout: T });
    expect(referrer.textContent).not.toMatch(/\d%/);
    // The card still reads as a sentence, "A share" / "of what the people you invite pay for servers"
    expect(within(referrer).getByText(strings['levels.share'])).toBeInTheDocument();
    expect(within(referrer).getByText(strings['levels.referrerLead'])).toBeInTheDocument();
    expect(within(levels() as HTMLElement).getByText('10%')).toBeInTheDocument();
  });

  it('money in no known shape shows dashes, never a guessed amount', async () => {
    await open('oddMoney');
    expect(await screen.findByText(strings['credit.available'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText('$8.00')).toBeNull();
    expect(screen.queryByText('$12.00')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('not eligible: join after a paid server purchase, See plans, and "Which purchases count" opens the rule in the questions', async () => {
    await open('notEligible');
    expect(await screen.findByText(strings['first.notEligible.body'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['first.seePlans'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['credit.title'])).toBeNull();
    expect(faqHeading()).toBeInTheDocument();
    expect(question('eligible')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('link', { name: strings['first.eligibleLink'] }));
    await waitFor(() => expect(question('eligible')).toHaveAttribute('aria-expanded', 'true'), { timeout: T });
    expect(screen.getByText(answer('eligible'))).toBeInTheDocument();
  });

  it('joining paused: the paused line and no button', async () => {
    await open('paused');
    expect(await screen.findByText(strings['first.paused.body'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['first.seePlans'] })).toBeNull();
    expect(faqHeading()).toBeInTheDocument();
  });

  it('can join: the invitation and every program rule as a question, whose answers open', async () => {
    await open('canJoin');
    expect(await screen.findByText(strings['first.canJoin.body'], undefined, { timeout: T })).toBeInTheDocument();
    expect(faqHeading()).toBeInTheDocument();
    for (const id of ['notCounted', 'hold']) {
      await userEvent.click(question(id));
      await waitFor(() => expect(question(id)).toHaveAttribute('aria-expanded', 'true'));
      expect(screen.getByText(answer(id))).toBeInTheDocument();
    }
  });

  it('loading: the skeleton and no questions before the program read answers', async () => {
    await open('loading');
    expect(await screen.findByRole('heading', { name: strings.title, level: 1 }, { timeout: T })).toBeInTheDocument();
    expect(document.querySelector('[data-skeleton]')).not.toBeNull();
    expect(faqHeading()).toBeNull();
    expect(screen.queryByText(strings['first.canJoin.body'])).toBeNull();
  });

  it('a failed read: the page error with Try again', async () => {
    await open('error');
    expect(await screen.findByText(strings['error.title'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(faqHeading()).toBeNull();
  });

  it('a token session: no access and its words, and nothing of the program shown', async () => {
    await open('token');
    expect(await screen.findByText(strings['token.title'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText(strings['token.body'])).toBeInTheDocument();
    expect(screen.queryByText(/signup\?ref=/)).toBeNull();
    expect(screen.queryByText(strings['credit.title'])).toBeNull();
    expect(faqHeading()).toBeNull();
  });
});

// The page's parts are kit Sections, Release… is a row's group of actions, each link is the
// kit's clickable address, and the InfoTips open their own words. Create sits beside the field, not inside it.
describe('referrals sections', () => {
  const section = (id: string) => document.getElementById(id) as HTMLElement;
  const createField = () => screen.queryByRole('textbox', { name: strings['create.label'] });

  it('Your links and Monthly are kit Sections; the main link and the custom codes are sub-sections, the form under the codes', async () => {
    await open();
    expect(await screen.findByText(strings['link.title'], undefined, { timeout: T })).toBeInTheDocument();
    const link = section('referral-link');
    expect(link.tagName).toBe('SECTION');
    expect(link.getAttribute('data-hub-section')).toBe('');
    expect(within(link).getByRole('heading', { level: 2, name: strings['link.title'] })).toBeInTheDocument();
    const monthly = section('referral-monthly');
    expect(monthly.tagName).toBe('SECTION');
    expect(monthly.getAttribute('data-hub-section')).toBe('');
    expect(within(monthly).getByRole('heading', { level: 2, name: strings['monthly.title'] })).toBeInTheDocument();
    const main = section('referral-main');
    const custom = section('referral-custom');
    for (const sub of [main, custom]) {
      expect(sub.getAttribute('data-hub-section')).toBe('sub');
      expect(link.contains(sub)).toBe(true);
    }
    expect(within(main).getByRole('heading', { level: 3, name: strings['link.main'] })).toBeInTheDocument();
    expect(within(custom).getByRole('heading', { level: 3, name: strings['link.custom'] })).toBeInTheDocument();
    // The counter in plain words, from the code list and vanity_codes_left; the lifetime rule is a visible line.
    expect(within(custom).getByText('1 of 3 active · 2 more can be made now')).toBeInTheDocument();
    expect(within(custom).getByText(strings['codes.rule.limits'], { exact: false })).toBeInTheDocument();
    expect(within(custom).getByRole('link', { name: new RegExp(strings['codes.limits']) }).getAttribute('href')).toBe(CODE_RULES_URL);
    expect(CODE_RULES_URL).toBe('https://docs.hoody.com/foundation/wallet/referral-program/reference/#code-rules');
    // The form follows the custom rows, inside Custom codes.
    const field = within(custom).getByRole('textbox', { name: strings['create.label'] });
    const rows = within(custom).getByRole('list', { name: strings['link.custom'] });
    expect(rows.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(custom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('each listed link is a real link to the address exactly as the API sent it; the main one has the one Copy link button', async () => {
    await open();
    await screen.findByText(strings['link.title'], undefined, { timeout: T });
    for (const c of MEMBER.codes) {
      const row = codeRow(c.code);
      const a = within(row).getByRole('link', { name: (n) => n.includes(c.link as string) });
      expect(a.getAttribute('href')).toBe(c.link);
    }
    const main = within(codeRow('k7m2q9xa')).getAllByRole('button', { name: /^Copy/ });
    expect(main.map((b) => b.textContent)).toEqual([strings['link.copyMain']]);
    expect(main[0]).toHaveAccessibleName(strings['link.copyMain']);
    expect(within(codeRow('maya-builds')).getByRole('button', { name: 'Copy the maya-builds link' })).toBeInTheDocument();
  });

  it('every Copy in the code lists has its own name, so a screen reader can tell them apart', async () => {
    await open();
    await screen.findByText(strings['link.title'], undefined, { timeout: T });
    const names = [strings['link.main'], strings['link.custom']].flatMap((l) =>
      within(screen.getByRole('list', { name: l }))
        .getAllByRole('button', { name: /^Copy/ })
        .map((b) => b.getAttribute('aria-label') || b.textContent || ''),
    );
    expect(names.length).toBe(MEMBER.codes.filter((c) => c.link && c.state !== 'blocked').length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('Release… is a worded button of its own row, says what it opens, and is absent from the main code', async () => {
    await open();
    await screen.findByText(strings['link.title'], undefined, { timeout: T });
    const release = within(codeRow('maya-builds')).getByRole('button', { name: 'Retire maya-builds' });
    expect(release).toHaveAccessibleName('Retire maya-builds');
    expect(release).toHaveTextContent(strings['release.action']);
    expect(release.getAttribute('aria-haspopup')).toBe('dialog');
    expect(within(codeRow('k7m2q9xa')).queryByRole('button', { name: /^Retire/ })).toBeNull();
    await userEvent.click(release);
    expect(await screen.findByRole('alertdialog', { name: 'Retire maya-builds?' })).toBeInTheDocument();
  });

  it('every InfoTip of the page opens its own words: the kinds, Release…, the code rules and the counts', async () => {
    await open();
    await screen.findByText(strings['link.title'], undefined, { timeout: T });
    const people = section('referral-people');
    const tips: [HTMLElement, string, string][] = [
      [codeRow('k7m2q9xa'), strings['code.main'], strings['tip.code.main']],
      [codeRow('maya-builds'), strings['code.custom'], strings['tip.code.custom']],
      [codeRow('maya-builds'), 'About retiring a code', strings['tip.release']],
      [section('referral-custom'), 'About code rules', strings['tip.codeShape']],
      [people, strings['counts.signedUpHint'], strings['tip.signedUp']],
      [people, strings['counts.payingHint'], strings['tip.paying']],
      [people, strings['counts.activeHint'], strings['tip.active']],
    ];
    for (const [where, name, text] of tips) {
      expect(screen.queryByText(text)).toBeNull();
      await userEvent.click(within(where).getByRole('button', { name }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByText(text)).toBeNull());
    }
    // The counts' tips are the term form: each count's caption is its trigger.
    // The main code says it can't be released; only a custom code has the release tip.
    expect(within(codeRow('k7m2q9xa')).queryByRole('button', { name: 'About retiring a code' })).toBeNull();
  });

  it('no form: earning paused shows no new-code field', async () => {
    await open('earningPaused');
    await screen.findByText(strings['band.earningPaused'], undefined, { timeout: T });
    expect(createField()).toBeNull();
    expect(section('referral-link')).not.toBeNull();
  });

  it('no custom codes left: the unavailable line sits in Custom codes, with no new-code field', async () => {
    await open('noCustomCodes');
    const line = await screen.findByText(strings['codes.unavailable'], undefined, { timeout: T });
    expect(section('referral-custom').contains(line)).toBe(true);
    expect(createField()).toBeNull();
  });
});
