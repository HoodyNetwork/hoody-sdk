// Vitest: before joining. Not eligible, Joining paused and Can join use the member page's grid: the Join
// card (8 columns) beside a 4-column card, then the level cards untagged with How it works. No People, no Monthly.
// Every program fact is the API's (rate_percent, creator_rate_percent, creator_threshold_active_customers); a missing
// one is left out, never guessed.
import { describe, expect, it } from 'vitest';
import { render, renderPage, screen, within } from '@app/testing';
import { useStrings } from '@kit';
import { MEMBER } from './fixtures';
import { selectMe } from './logic';
import page from './page';
import { programFacts } from './parts/FirstUse';
import strings from './strings.en.json';

const T = 8000;
const open = (state: string) => renderPage(page, { path: '/referrals', state });
const card = (name: string) => screen.getByRole('group', { name });
const ready = async (state: string, title: string) => {
  await open(state);
  await screen.findByRole('group', { name: title }, { timeout: T });
};

describe('referrals before joining', () => {
  it('can join: the Join card with the three API facts, Join…, the two FAQ peeks, and what joining gives beside it', async () => {
    await ready('canJoin', strings['first.canJoin.title']);
    const join = card(strings['first.canJoin.title']);
    expect(within(join).getByText(strings['first.canJoin.body'])).toBeInTheDocument();
    expect(within(join).getByText('You earn 5% of what they pay for servers')).toBeInTheDocument();
    expect(within(join).getByText('10% as a Creator, from 11 customers who count')).toBeInTheDocument();
    expect(within(join).getByText(strings['first.fact.credit'])).toBeInTheDocument();
    expect(within(join).getByRole('button', { name: strings['join.action'] })).toBeInTheDocument();
    expect(within(join).getByText(strings['first.peek.window'])).toBeInTheDocument();
    expect(within(join).getByText(strings['first.peek.hold'])).toBeInTheDocument();
    const get = card(strings['first.get.title']);
    for (const k of ['first.get.link', 'first.get.credit', 'first.get.totals'] as const) expect(within(get).getByText(strings[k])).toBeInTheDocument();
    // Row A is one grid: the two cards are cells of the same container.
    expect(join.parentElement!.parentElement).toBe(get.parentElement!.parentElement);
  });

  it('can join: the level cards carry no tags, How it works takes the third place, and there is no People or Monthly', async () => {
    await ready('canJoin', strings['first.canJoin.title']);
    const levels = document.getElementById('referral-levels') as HTMLElement;
    expect(within(card(strings['levels.referrer'])).getByText('5%')).toBeInTheDocument();
    expect(within(card(strings['levels.creator'])).getByText('10%')).toBeInTheDocument();
    expect(within(levels).queryByText(strings['levels.yours'])).toBeNull();
    expect(within(levels).queryByText(strings['levels.next'])).toBeNull();
    const earn = document.getElementById('referral-earn') as HTMLElement;
    for (const k of ['earn.what', 'earn.long', 'earn.hold', 'earn.creator'] as const) expect(within(earn).getByRole('group', { name: strings[k] })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: strings['stand.title'] })).toBeNull();
    expect(document.getElementById('referral-people')).toBeNull();
    expect(document.getElementById('referral-monthly')).toBeNull();
  });

  it('can join without a share from the API: "a share", never a number', async () => {
    await ready('canJoinNoRate', strings['first.canJoin.title']);
    const join = card(strings['first.canJoin.title']);
    expect(within(join).getByText(strings['first.fact.rateUnknown'])).toBeInTheDocument();
    const referrer = card(strings['levels.referrer']);
    expect(within(referrer).queryByText(/\d+(\.\d+)?%/)).toBeNull();
    // no number guessed, and the lead still reads as a sentence: "A share" / "of what the people you invite pay…"
    expect(within(referrer).getByText(strings['levels.share'])).toBeInTheDocument();
    expect(within(referrer).getByText(strings['levels.referrerLead'])).toBeInTheDocument();
  });

  it('not eligible: See plans and "Which purchases count" in the Join card, the facts in "What you earn"', async () => {
    await ready('notEligible', strings['first.notEligible.title']);
    const join = card(strings['first.notEligible.title']);
    expect(within(join).getByRole('button', { name: strings['first.seePlans'] })).toBeInTheDocument();
    expect(within(join).getByText(strings['first.eligibleLink'])).toBeInTheDocument();
    expect(within(join).queryByText(strings['first.fact.credit'])).toBeNull();
    const earn = card(strings['first.earn.title']);
    expect(within(earn).getByText('You earn 5% of what they pay for servers')).toBeInTheDocument();
    expect(within(earn).getByText(strings['first.fact.credit'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['join.action'] })).toBeNull();
  });

  it('joining paused: no action at all, the facts in "What you earn"', async () => {
    await ready('paused', strings['first.paused.title']);
    const join = card(strings['first.paused.title']);
    expect(within(join).queryAllByRole('button')).toHaveLength(0);
    expect(within(card(strings['first.earn.title'])).getByText(strings['first.fact.credit'])).toBeInTheDocument();
  });

  // Every fact line of the Join, side and preview cards is visible in each state.
  const FACTS = ['You earn 5% of what they pay for servers', '10% as a Creator, from 11 customers who count', strings['first.fact.credit']];
  const PREVIEW = [strings['levels.referrerLead'], strings['levels.fromJoin'], strings['levels.withdraw'], "from the month after 11 or more customers you referred have earned you credit that wasn't all reversed", strings['levels.newSpend'], strings['earn.what.lead'], strings['earn.long.lead'], strings['earn.hold.lead']];
  it.each([
    ['canJoin', 'first.canJoin.title', 'first.canJoin.body', 'first.canJoin.title', ['first.get.link', 'first.get.credit', 'first.get.totals']],
    ['notEligible', 'first.notEligible.title', 'first.notEligible.body', 'first.earn.title', []],
    ['paused', 'first.paused.title', 'first.paused.body', 'first.earn.title', []],
  ] as const)('%s: every fact line is shown, in its card, and every preview line', async (state, title, body, factsIn, side) => {
    await ready(state, strings[title]);
    const holder = card(strings[factsIn]);
    for (const f of FACTS) expect(within(holder).getByText(f)).toBeInTheDocument();
    expect(within(card(strings[title])).getByText(strings[body])).toBeInTheDocument();
    if (side.length) for (const k of side) expect(within(card(strings['first.get.title'])).getByText(strings[k])).toBeInTheDocument();
    const levels = document.getElementById('referral-levels') as HTMLElement;
    // the preview's two rates, as the API sends them, in every state
    expect(within(card(strings['levels.referrer'])).getByText('5%')).toBeInTheDocument();
    expect(within(card(strings['levels.creator'])).getByText('10%')).toBeInTheDocument();
    for (const line of PREVIEW) expect(within(levels).getAllByText(line).length).toBeGreaterThan(0);
    expect(within(levels).getAllByText(strings['levels.pays'])).toHaveLength(2);
  });

  it('a Creator share or number the API did not send drops the Creator line; nothing is guessed', () => {
    function Facts({ data }: { data: Record<string, unknown> }) {
      const t = useStrings(strings);
      return <ul>{programFacts(t, selectMe({ data: { ...MEMBER, ...data } })).map((f) => <li key={f}>{f}</li>)}</ul>;
    }
    for (const data of [{ creator_rate_percent: undefined }, { creator_threshold_active_customers: null }]) {
      const { unmount } = render(<Facts data={data} />);
      expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You earn 5% of what they pay for servers', strings['first.fact.credit']]);
      unmount();
    }
  });
});
