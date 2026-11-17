// The page FAQ's answers in blocks: an answer is plain text, and a blank line in it starts a new block, a paragraph, a
// list (every line "- …") or numbered steps (every line "1. …"). The section and the peek draw the same blocks. An answer
// with no blank line stays the one paragraph it always was, text untouched.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { describe, expect, it } from 'vitest';
import { hubHref, hubNavigate } from '../../app/hrefs';
import { Faq, FaqLink, type FaqItem } from './Faq';

const PLAIN: FaqItem = { id: 'plain', q: 'What is the rate?', a: 'Five percent of what a referral pays. It never changes.' };
const PARAS: FaqItem = { id: 'paras', q: 'Why is a payout held?', a: 'Payouts are held for 60 days.\n\nA refund in that time takes the payout back.' };
const LIST: FaqItem = {
  id: 'list',
  q: 'Which kinds are there?',
  a: 'Each port has one of three kinds:\n\n- Web: it gets an address.\n- Local only: no address.\n- Other: not the web.\n\nPort 3000 is a web port.',
};
const STEPS: FaqItem = { id: 'steps', q: 'How do I make one?', a: '1. Choose Create.\n2. Pick a name.\n10. Save it.\n\nThat is all.' };
const ODD: FaqItem = { id: 'odd', q: 'What about odd text?', a: 'A lead line\n- with a dash line under it, no blank line.\n\n3000 is a port, not a step.\n\n\n\n- alone' };

function Bridge({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AriaRouterProvider navigate={(to) => hubNavigate(to, (href) => void router.navigate({ href } as never))} useHref={hubHref}>
      {children}
    </AriaRouterProvider>
  );
}

async function mount(el: () => ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Bridge>{el()}</Bridge> }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const open = async (item: FaqItem): Promise<HTMLElement> => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: item.q })));
  return document.getElementById(`faq-${item.id}`)!;
};
/** The answer's blocks as [tag, text] in reading order (list items inside their list). */
const shape = (root: HTMLElement): string[][] => [...root.querySelectorAll('p, ul, ol')].map((el) => [el.tagName.toLowerCase(), ...(el.tagName === 'P' ? [el.textContent ?? ''] : [...el.querySelectorAll('li')].map((li) => li.textContent ?? ''))]);

describe('Faq: an answer in blocks', () => {
  it('an answer with no blank line is one paragraph with its text as written', async () => {
    await mount(() => <Faq faq={{ items: [PLAIN] }} />);
    const root = await open(PLAIN);
    expect(shape(root)).toEqual([['p', PLAIN.a]]);
    expect(screen.getByText(PLAIN.a)).toBeVisible();
  });

  it('a blank line starts a new paragraph', async () => {
    await mount(() => <Faq faq={{ items: [PARAS] }} />);
    expect(shape(await open(PARAS))).toEqual([['p', 'Payouts are held for 60 days.'], ['p', 'A refund in that time takes the payout back.']]);
  });

  it('a block whose every line starts with a dash is a list, between its paragraphs, markers dropped', async () => {
    await mount(() => <Faq faq={{ items: [LIST] }} />);
    const root = await open(LIST);
    expect(shape(root)).toEqual([
      ['p', 'Each port has one of three kinds:'],
      ['ul', 'Web: it gets an address.', 'Local only: no address.', 'Other: not the web.'],
      ['p', 'Port 3000 is a web port.'],
    ]);
    expect(within(root).getByRole('list')).toBeVisible();
    expect(within(root).getAllByRole('listitem')).toHaveLength(3);
  });

  it('a block whose every line starts with a number and a dot is numbered steps, numbers dropped (the list numbers them)', async () => {
    await mount(() => <Faq faq={{ items: [STEPS] }} />);
    expect(shape(await open(STEPS))).toEqual([['ol', 'Choose Create.', 'Pick a name.', 'Save it.'], ['p', 'That is all.']]);
  });

  it('a block is a list only when every line is marked: mixed lines read as one paragraph, a number without a dot is text, extra blank lines add nothing', async () => {
    await mount(() => <Faq faq={{ items: [ODD] }} />);
    expect(shape(await open(ODD))).toEqual([
      ['p', 'A lead line - with a dash line under it, no blank line.'],
      ['p', '3000 is a port, not a step.'],
      ['ul', 'alone'],
    ]);
  });

  it('Windows line ends split the same way', async () => {
    const crlf: FaqItem = { id: 'crlf', q: 'What about CRLF?', a: 'First.\r\n\r\n- one\r\n- two' };
    await mount(() => <Faq faq={{ items: [crlf] }} />);
    expect(shape(await open(crlf))).toEqual([['p', 'First.'], ['ul', 'one', 'two']]);
  });

  it('the peek draws the same blocks as the section', async () => {
    await mount(() => <FaqLink item={LIST}>More</FaqLink>);
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'More' })));
    await act(async () => {
      await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 5));
    });
    const peek = screen.getByRole('dialog', { name: 'Answer' });
    expect(shape(peek)).toEqual([
      ['p', 'Each port has one of three kinds:'],
      ['ul', 'Web: it gets an address.', 'Local only: no address.', 'Other: not the web.'],
      ['p', 'Port 3000 is a web port.'],
    ]);
  });
});
