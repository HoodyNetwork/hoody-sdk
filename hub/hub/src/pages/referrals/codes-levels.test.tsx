// Vitest: Your links says what a code is, calls custom codes "Your
// own codes" with the 3 and 10 limits, and Retire replaces Release (the page never says "release"); the credit card says
// when held credit is next due; Levels say when Creator applies and that Creators ask Hoody support about withdrawing, Where you stand
// shows one or two as "Fewer than 3" with how the count is read, and How you earn answers what earns, for how long, the
// hold and Creator, in the member view and before joining. The numbers are the program docs' (pinned below).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const open = (state?: string) => renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
const section = (id: string) => document.getElementById(id) as HTMLElement;
const card = (name: string) => screen.getByRole('group', { name });
const ready = async (state?: string) => {
  await open(state);
  await screen.findByRole('heading', { name: strings['link.title'] }, { timeout: T });
};
const EARN = ['earn.what', 'earn.long', 'earn.hold', 'earn.creator'] as const;

describe('referral codes', () => {
  it('Your links says what a code is: one signup link each, the same earnings, a link or a typed code makes a referral', async () => {
    await ready();
    const links = section('referral-link');
    expect(within(links).getByText(strings['link.share'], { exact: false })).toBeInTheDocument();
    expect(within(links).getByText(strings['link.intro'], { exact: false })).toBeInTheDocument();
    expect(strings['link.share']).toMatch(/own signup link.*earns you the same/);
    expect(strings['link.intro']).toMatch(/created through one of your links, or with one of your codes typed at signup/);
  });

  it('the main code says it cannot be retired; your own codes count 1 of 3 active and list the limits as lines', async () => {
    await ready();
    expect(within(section('referral-main')).getByText(strings['link.mainNote'])).toBeInTheDocument();
    const own = section('referral-custom');
    expect(within(own).getByRole('heading', { level: 3, name: 'Your own codes' })).toBeInTheDocument();
    expect(within(own).getByText('1 of 3 active · 2 more can be made now')).toBeInTheDocument();
    for (const k of ['codes.rule.limits', 'codes.rule.retired', 'codes.rule.refused'] as const) {
      expect(within(own).getByText(strings[k], { exact: false })).toBeInTheDocument();
    }
    expect(within(own).getByText('Your own')).toBeInTheDocument();
  });

  it('Retire… opens a confirm that says what retiring does, one line each, with Retire code and Keep it', async () => {
    await ready();
    const retire = await screen.findByRole('button', { name: 'Retire maya-builds' }, { timeout: T });
    expect(retire).toHaveTextContent('Retire…');
    await userEvent.click(retire);
    const d = within(await screen.findByRole('alertdialog'));
    expect(d.getByText('Retire maya-builds?')).toBeInTheDocument();
    for (const k of ['release.gone', 'release.kept', 'release.never', 'release.counts'] as const) expect(d.getByText(strings[k])).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Retire code' })).toBeInTheDocument();
    await userEvent.click(d.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('no word on the page says "release": not the strings, not the member view', async () => {
    expect(Object.entries(strings).filter(([, v]) => /releas/i.test(v))).toEqual([]);
    await ready();
    expect(document.body.textContent).not.toMatch(/releas/i);
  });

  it('held credit says the next day credit is due', async () => {
    await ready();
    expect(screen.getByText('Next credit due 3 Dec')).toBeInTheDocument();
  });
});

describe('levels', () => {
  it('the Creator card says when Creator applies, that it is new spend only, and to ask Hoody support about withdrawing', async () => {
    await ready();
    const creator = card(strings['levels.creator']);
    expect(within(creator).getByText("from the month after 11 or more customers you referred have earned you credit that wasn't all reversed")).toBeInTheDocument();
    expect(within(creator).getByText(strings['levels.newSpend'])).toBeInTheDocument();
    expect(within(creator).getByText('Ask Hoody support about withdrawing your credit')).toBeInTheDocument();
  });

  it('Where you stand shows one or two as "Fewer than 3", never "1 or 2", and says how the count is read', async () => {
    await ready();
    const stand = card(strings['stand.title']);
    expect(within(stand).getByText('Fewer than 3')).toBeInTheDocument();
    expect(within(stand).getByText(strings['stand.note'])).toBeInTheDocument();
  });

  it('How you earn answers what earns, for how long, the hold and Creator, as a member and as a Creator', async () => {
    for (const state of [undefined, 'creator']) {
      const { unmount } = await (async () => {
        const r = await open(state);
        await screen.findByRole('heading', { name: strings['link.title'] }, { timeout: T });
        return r;
      })();
      const earn = section('referral-earn');
      expect(within(earn).getByRole('heading', { name: strings['earn.title'] })).toBeInTheDocument();
      for (const k of EARN) expect(within(earn).getByRole('group', { name: strings[k] })).toBeInTheDocument();
      for (const k of ['earn.what.lead', 'earn.what.not', 'earn.long.lead', 'earn.long.bare', 'earn.hold.lead', 'earn.hold.note', 'earn.creator.kept'] as const) {
        expect(within(earn).getByText(strings[k])).toBeInTheDocument();
      }
      expect(within(earn).getByText(strings['earn.creator.lead'].replace('{{n}}', '11'))).toBeInTheDocument();
      unmount();
    }
  });

  it('before joining, How you earn replaces How it works', async () => {
    await open('canJoin');
    const earn = await screen.findByRole('group', { name: strings['earn.what'] }, { timeout: T });
    expect(section('referral-earn').contains(earn)).toBe(true);
    expect(screen.queryByRole('group', { name: 'How it works' })).toBeNull();
    const all = section('referral-earn');
    for (const k of ['earn.what.lead', 'earn.what.not', 'earn.long.lead', 'earn.long.bare', 'earn.hold.lead', 'earn.hold.note', 'earn.creator.kept'] as const) {
      expect(within(all).getByText(strings[k])).toBeInTheDocument();
    }
    expect(within(all).getByText(strings['earn.creator.lead'].replace('{{n}}', '11'))).toBeInTheDocument();
    expect(within(section('referral-levels')).getByText(strings['levels.newSpend'])).toBeInTheDocument();
  });

  it('the numbers are the program docs\' (the page the Program rules link opens)', () => {
    // The program docs: "Up to 3 active vanity codes at a time, and 10 over the life of your account; released codes still count toward the 10"
    expect(strings['codes.rule.limits']).toBe('Up to 3 of your own codes active at a time, and 10 over the life of your account.');
    expect(strings['codes.rule.retired']).toBe('A retired code still counts toward the 10.');
    expect(strings['codes.active_other']).toBe('{{count}} of 3 active');
    // The program docs: "gone for good. It stops working for new signups, and it is never given to anyone else. People who already signed up with it stay your referrals"
    expect(strings['release.never']).toBe("It's gone for good and is never given to anyone else.");
    expect(strings['release.kept']).toBe('People who already signed up with it stay your referrals and can still earn you credit.');
    // The program docs: "The code is remembered in that browser for 7 days"; public/auth/shared.js captureReferralFromUrl keeps a
    // ?ref= link only with nobody signed in and never replaces an unexpired one; the signup page sends a typed code over it.
    expect(strings['link.intro']).toContain('A link opened while signed out is remembered in the browser for up to 7 days, or until someone signs in.');
    expect(strings['link.intro']).toContain('An earlier remembered code stays; one typed at signup replaces it.');
    // The API's attribution rule: no referral unless the owner's account is active, eligible, not banned
    expect(strings['link.intro']).toContain("none of your codes does while your account isn't earning");
    // The program docs: "12 months from activation of their first qualifying server purchase"; bare metal "first 3 calendar months"
    expect(strings['earn.long.lead']).toContain('12 months per customer, from when their first qualifying server purchase is activated');
    // The program docs: "only service within that window earns credit"
    expect(strings['earn.long.lead']).toContain('Renewals earn too, but only for service inside those 12 months.');
    expect(strings['earn.long.bare']).toContain('first 3 calendar months of bare-metal service');
    // The program docs: "a 60-day hold starting when the server purchase is activated"
    expect(strings['earn.hold.lead']).toContain('held for 60 days from activation');
    // The program docs: "You are a Creator for a month when at least 11 different customers you referred earned you credit before that month
    // began"; 11 itself is the API's creator_threshold_active_customers, never a string. "Credit you already earned is never reduced"
    // ... "A customer counts as long as not all of their credit was reversed"
    expect(strings['earn.creator.lead']).toContain("You're a Creator for a month when, before it began, {{n}} or more customers you referred earned you credit that wasn't all reversed.");
    expect(strings['earn.creator.kept']).toBe('Credit already earned never changes with your level.');
    // The program docs: "Each purchase earns at the level of the calendar month ... in which it is activated"; reversals can bring 5% back,
    // so the Creator share is tied to the month, never "from then on"
    // A renewal is its own funding, rated by its own activation month
    expect(strings['earn.creator.lead']).toContain("The Creator share applies to purchases and renewals activated in a month you're a Creator; a prepaid term keeps the share of the month it was activated.");
    expect(strings['levels.newSpend']).toBe("On purchases and renewals activated in a month you're a Creator; credit you already earned stays as it is");
    // The program docs: "Credit becomes due ... processing or a review can make it arrive later"; "A release first covers any referral_credit_owed".
    // The API releases credit at 00:00 UTC at or after the 60-day hold,
    // and a release pays any debt first
    expect(strings['earn.hold.lead']).toContain('then becomes due at the first 00:00 UTC at or after the hold ends.');
    expect(strings['earn.hold.lead']).toContain('Due credit first pays off anything you owe; the rest goes to your credit for servers.');
    expect(strings['earn.hold.note']).toBe('Processing or a review can make it arrive later; refunds can reduce or reverse credit.');
    expect(strings['faq.hold.a']).toContain('becomes due at the first 00:00 UTC at or after the hold ends');
    expect(strings['faq.hold.a']).toContain('Processing or a review can make it arrive later.');
    // The guide card says when credit is due too, and the count can still change until the month's level is set
    expect(strings['guide.how.body']).toContain('once it is due (the first 00:00 UTC at or after its hold of 60 days from activation ends) and has paid off anything you owe; processing, or credit under review, can make it later.');
    expect(strings['stand.note']).toContain('new credit or reversals can still change it until that level is set.');
    // A different typed code can still refer the signup (signup.js effectiveReferral)
    expect(strings['release.gone']).toContain('gets no referrer from it.');
    // A customer counts while their credit is not all reversed, for commissions activated before the month (the ladder card too)
    expect(strings['levels.creatorLead']).toContain("that wasn't all reversed");
    expect(strings['levels.creatorLeadUnknown']).toContain("that wasn't all reversed");
    // evaluateFundingInTx: ordered_after_deadline, outside_window (eligibleMs) - the guide card says both too
    expect(strings['guide.how.body']).toContain('only service inside that time earns; that purchase must be ordered within 90 days of their signup.');
    // The program docs: the main code stays with the account and can't be released; a released or blocked code signs up without a referrer
    expect(strings['link.mainNote']).toContain('It stays with your account');
    expect(Object.values(strings).filter((v) => /always works|from then on/.test(v))).toEqual([]);
    expect(strings['link.intro']).toContain('A retired or blocked code refers no one');
    // Attribution is not promised; the next due day, owed paid first; the 90-day
    // first order; one band word on both sections; the docs' three credit kinds; support, not an admin
    expect(strings['link.intro']).toContain('can become your referral');
    // the exceptions live under the reference's Signup capture, not Code rules
    expect(strings['link.intro']).toContain('the Program rules list the other exceptions.');
    expect(strings['credit.release']).toBe('Next credit due {{date}}');
    expect(strings['faq.hold.a']).toContain('after paying off anything you owe');
    expect(strings['earn.long.lead']).toContain('Their first qualifying server purchase must be ordered within 90 days of signup.');
    expect(strings['band.few']).toBe('Fewer than 3');
    expect(strings['earn.what.not']).toContain('promotional, bonus or Referral credit');
    expect(Object.values(strings).filter((v) => /\ban admin\b|1 or 2|becomes available/i.test(v))).toEqual([]);
    // :56 withdrawal is a support process; the API has no withdrawal switch
    expect(strings['levels.withdraw']).toBe('Ask Hoody support about withdrawing your credit');
  });
});
