// Vitest (New script): the scripts page's questions at the bottom of the flow. They are drawn under the step as the kit's
// Questions section, after the step's body, each a closed disclosure with its `#faq-<id>` anchor; opening one sends nothing.
// The two questions a first script raises (do I need to code, what can a script do) are among them, and their answers use
// the flow's own words for its choices. Replaced: the overview (one computer whose assistant is on) and the bound sends (spies).
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  const spy = (name: string) => async () => { io.sent.push(name); return { outcome: 'done', data: {} }; };
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useBoundSends: () => ({ shown: true, validate: spy('validate'), write: spy('write'), instantiate: spy('instantiate') }),
  };
});

import page from './page';
import { pageFaq } from './faq';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import strings from './strings.en.json';

const SLOW = { timeout: 14000 };
const S = strings as Record<string, string>;
const t = ((k: string) => S[k]) as never;

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  io.sent.length = 0;
});

describe('New script questions', () => {
  it('a first script\'s questions come first after "What is a script?", in the flow\'s own words, naming no AI backend', () => {
    const { items } = pageFaq(t);
    expect(items.slice(0, 3).map((i) => i.id)).toEqual(['whatIsScript', 'needCode', 'whatCan']);
    expect(S['faq.needCode.a']).toContain(S['flow.what.writeCard']);
    expect(S['faq.needCode.a']).toContain(S['flow.what.ideaCard']);
    for (const i of items) expect(i.a, i.id).not.toMatch(/openrouter|openai|anthropic|claude|gpt/i);
  });

  it('are drawn under the step as closed questions with their anchors, and opening one sends nothing', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    const describeBox = await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW);
    const heading = await screen.findByRole('heading', { name: kitStrings['faq.title'] }, SLOW);
    const section = heading.closest('section') as HTMLElement;
    expect(section).toBeTruthy();
    // After the step's body in reading order.
    expect(describeBox.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const { items } = pageFaq(t);
    const questions = items.map((i) => within(section).getByRole('button', { name: i.q }));
    for (const b of questions) expect(b.getAttribute('aria-expanded')).toBe('false');
    for (const i of items) expect(document.getElementById(`faq-${i.id}`), i.id).not.toBeNull();
    const whatCan = within(section).getByRole('button', { name: strings['faq.whatCan.q'] });
    await user.click(whatCan);
    await waitFor(() => expect(whatCan.getAttribute('aria-expanded')).toBe('true'));
    expect(within(section).getByText(strings['faq.whatCan.a'])).toBeTruthy();
    expect(io.sent).toEqual([]);
  });
});
