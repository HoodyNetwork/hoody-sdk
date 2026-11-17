// The First steps checklist and its "Try next" suggestions are the kit's widget list
// (WidgetList/WidgetRow, as the kit gallery's own Start widget), with the kit progress bar kept. A milestone's state is
// a kit row part: a done step shows the Done pill, an unknown one says "Checking" in the row's meta (visibly,
// in words) and offers no link, an open one is the row's own link to where it is done. Each suggestion's name is its row link,
// and Ask the agent is not a suggestion.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon, WidgetList, WidgetRow } from '@kit';
import { render, screen, within } from '@app/testing';
import strings from '../strings.en.json';
import type { Step, TryId } from '../logic';
import { FirstStepsBody, FirstStepsCard } from './FirstSteps';

// The pages this load serves; a test hides some to see a row with nowhere to go.
const hidden = vi.hoisted(() => new Set<string>());
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePageLink: (id: string) => (hidden.has(id) ? null : { kind: 'hub', href: `/${id}` }),
}));
afterEach(() => hidden.clear());

const computer = { name: 'atlas', handle: 'atlas.abcd' };
const tries: TryId[] = ['open', 'bot'];

/** The class the kit gives one widget row's <li>, and the markup of a kit icon, read from the kit itself. */
function kitRow(): string {
  const { container, unmount } = render(
    <WidgetList label="x">
      <WidgetRow label="y" />
    </WidgetList>,
  );
  const cls = container.querySelector('li')!.className;
  unmount();
  return cls;
}
function iconMarkup(name: 'check-circle' | 'computer' | 'key' | 'bot'): string {
  const { container, unmount } = render(<Icon name={name} size="sm" />);
  const html = container.querySelector('svg')!.innerHTML;
  unmount();
  return html;
}

const steps = (computerStep: Partial<Step>, keyStep: Partial<Step>): Step[] => [
  { id: 'computer', done: false, unknown: false, ...computerStep },
  { id: 'key', done: false, unknown: false, ...keyStep },
];

const rowOf = (list: HTMLElement, text: string) => within(list).getAllByRole('listitem').find((li) => li.textContent?.includes(text))!;

describe('First steps on the kit widget list (19c)', () => {
  it('the milestones are a kit widget list named First steps, one kit row per step, under the kept progress bar', () => {
    const row = kitRow();
    render(<FirstStepsBody steps={steps({ done: true }, {})} tries={[]} />);
    const list = screen.getByRole('list', { name: strings['steps.title'] });
    expect(list.tagName).toBe('UL');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const li of items) expect(li.className).toBe(row);
    expect(document.querySelector('ol')).toBeNull();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('2');
    // the bar sits above the list it counts
    expect(bar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a done step says so in the kit Done pill, with the check icon, and offers no action', () => {
    const { container } = render(<FirstStepsBody steps={steps({ done: true }, {})} tries={[]} />);
    const li = rowOf(screen.getByRole('list', { name: strings['steps.title'] }), strings['steps.computer.done']);
    expect(within(li).getByText(strings['steps.status.done'])).toBeVisible();
    expect(within(li).queryByRole('link')).toBeNull();
    expect(within(li).queryByRole('button')).toBeNull();
    expect(li.querySelector('svg')!.innerHTML).toBe(iconMarkup('check-circle'));
    expect(container.textContent).not.toContain(strings['steps.computer']);
  });

  it("an open step's row is its own link to where it is done, with its page icon and no second button", () => {
    render(<FirstStepsBody steps={steps({ done: true }, {})} tries={[]} />);
    const li = rowOf(screen.getByRole('list', { name: strings['steps.title'] }), strings['steps.key']);
    const link = within(li).getByRole('link', { name: strings['steps.key'] });
    expect(link.getAttribute('href')).toBe('/keys?new=1');
    expect(within(li).getAllByRole('link')).toHaveLength(1);
    expect(within(li).queryByRole('button')).toBeNull();
    expect(li.querySelector('svg')!.innerHTML).toBe(iconMarkup('key'));
    expect(within(li).queryByText(strings['steps.status.done'])).toBeNull();
  });

  it('an open step whose page this load does not serve stays listed and counted, as plain text with no link or button', () => {
    hidden.add('keys');
    render(<FirstStepsBody steps={steps({ done: true }, {})} tries={[]} />);
    const list = screen.getByRole('list', { name: strings['steps.title'] });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const li = rowOf(list, strings['steps.key']);
    expect(within(li).getByText(strings['steps.key'])).toBeVisible();
    expect(within(li).queryByRole('link')).toBeNull();
    expect(within(li).queryByRole('button')).toBeNull();
    expect(li.querySelector('a')).toBeNull();
    expect(within(li).queryByText(strings['steps.status.done'])).toBeNull();
    expect(li.querySelector('svg')!.innerHTML).toBe(iconMarkup('key'));
    // Still not done, so the count says 1 of 2: hiding the row would make it look like progress.
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('2');
  });

  it('an unknown step says Checking visibly in the row, with no action, no Done and no count', () => {
    render(<FirstStepsBody steps={steps({ unknown: true }, {})} tries={[]} />);
    const li = rowOf(screen.getByRole('list', { name: strings['steps.title'] }), strings['steps.computer']);
    expect(within(li).getByText(strings['steps.checking'])).toBeVisible();
    expect(within(li).queryByRole('link')).toBeNull();
    expect(within(li).queryByText(strings['steps.status.done'])).toBeNull();
    expect(li.querySelector('svg')!.innerHTML).toBe(iconMarkup('computer'));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('the Try next suggestions are a kit widget list; each name is its row link, with its page icon', () => {
    const row = kitRow();
    render(<FirstStepsBody steps={steps({ done: true }, { done: true })} tries={tries} computer={computer} />);
    const list = screen.getByRole('list', { name: strings['steps.try'] });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const li of items) expect(li.className).toBe(row);
    const open = within(rowOf(list, 'Open atlas')).getByRole('link', { name: 'Open atlas' });
    expect(open.getAttribute('href')).toBe('/computers?sel=atlas.abcd');
    expect(rowOf(list, 'Open atlas').querySelector('svg')!.innerHTML).toBe(iconMarkup('computer'));
    const bot = rowOf(list, strings['steps.try.bot']);
    expect(within(bot).getByRole('link', { name: strings['steps.try.bot'] }).getAttribute('href')).toMatch(/^\/bots/);
    expect(bot.querySelector('svg')!.innerHTML).toBe(iconMarkup('bot'));
  });

  it('shows no Try next heading or list when no suggestion has a page this load serves', () => {
    hidden.add('computers');
    hidden.add('bots');
    render(<FirstStepsBody steps={steps({ done: true }, {})} tries={tries} computer={computer} />);
    expect(screen.queryByRole('list', { name: strings['steps.try'] })).toBeNull();
    expect(screen.queryByText(strings['steps.try'])).toBeNull();
    expect(screen.getByRole('list', { name: strings['steps.title'] })).toBeTruthy();
  });

  it('keeps Try next for the suggestions that have a page, and only those', () => {
    hidden.add('computers');
    render(<FirstStepsBody steps={steps({ done: true }, {})} tries={tries} computer={computer} />);
    const list = screen.getByRole('list', { name: strings['steps.try'] });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('link', { name: strings['steps.try.bot'] })).toBeTruthy();
  });

  it('offers no Ask row in Try next and no button in either list (Ask fills the Ask strip, it is no place to go)', () => {
    render(<FirstStepsBody steps={steps({}, {})} tries={tries} computer={computer} />);
    expect(within(screen.getByRole('list', { name: strings['steps.try'] })).queryByRole('button')).toBeNull();
    expect(within(screen.getByRole('list', { name: strings['steps.title'] })).queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Ask the agent/);
  });

  it('the card keeps its own kit title and lists the same two kit lists', () => {
    render(<FirstStepsCard steps={steps({}, {})} tries={['bot']} onHide={() => undefined} />);
    expect(screen.getByRole('list', { name: strings['steps.title'] })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: strings['steps.try'] })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('FirstSteps.tsx writes no list markup of its own', () => {
    const src = readFileSync(join(__dirname, 'FirstSteps.tsx'), 'utf8');
    expect(src).not.toMatch(/<(ol|ul|li)\b/);
    expect(src).toMatch(/<WidgetList\b/);
    expect(src).toMatch(/<WidgetRow\b/);
  });
});
