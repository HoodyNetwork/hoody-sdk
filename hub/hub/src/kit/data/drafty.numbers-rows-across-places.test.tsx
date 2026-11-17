// Drafty-panel pieces: StepList numbering across places and its rows' parts,
// CodeLine's shown text, title and Copy, Why closed by default ending with its FAQ link, Facts layout="spec".
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memo, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Why } from '../layouts/Why';
import { Facts } from './Display';
import { CodeLine, IdChip, maskId } from './Ids';
import { readableText, StepList, stepNumber, STEP_TEXT_MAX } from './StepList';

afterEach(() => vi.restoreAllMocks());

const here = dirname(fileURLToPath(import.meta.url));
const css = (file: string) => readFileSync(join(here, file), 'utf8');

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

describe('StepList', () => {
  const groups = [
    {
      where: 'In Telegram',
      open: { label: 'Open @BotFather', url: 'https://t.me/BotFather' },
      items: [
        { id: 'a', text: 'Send /setprivacy' },
        { id: 'b', text: 'Pick your bot', note: 'It is the one you made' },
      ],
    },
    { where: 'Back here', items: [{ id: 'c', text: 'Check the bot again', act: <button type="button">Check again</button> }] },
  ];

  it('numbers its rows across places, each place a list named by its label', () => {
    render(<StepList label="How to turn privacy off" groups={groups} />);
    const all = screen.getByRole('group', { name: 'How to turn privacy off' });
    const tg = within(all).getByRole('list', { name: 'In Telegram' });
    const back = within(all).getByRole('list', { name: 'Back here' });
    expect(within(tg).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['01Send /setprivacy', '02Pick your botIt is the one you made']);
    expect(back).toHaveAttribute('start', '3');
    expect(within(back).getByRole('listitem').textContent).toMatch(/^03Check the bot again/);
  });

  it("puts the place's link at the end of its label, a note on its own line and a control at the row's end", () => {
    render(<StepList label="Steps" groups={groups} />);
    expect(screen.getByRole('link', { name: /Open @BotFather/ })).toHaveAttribute('href', 'https://t.me/BotFather');
    expect(screen.getByText('It is the one you made').previousElementSibling).toHaveTextContent('Pick your bot');
    const row = screen.getByRole('button', { name: 'Check again' }).closest('li')!;
    expect(row.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Check again' }));
  });

  it('a list with one place and no label has no place heading', () => {
    render(<StepList label="Steps" groups={[{ items: [{ text: 'One' }, { text: 'Two' }] }]} />);
    const list = screen.getByRole('list');
    expect(list).not.toHaveAttribute('aria-labelledby');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['01One', '02Two']);
  });

  it('warns once in dev for a row over 70 characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const long = 'x'.repeat(STEP_TEXT_MAX + 1);
    const { rerender } = render(<StepList label="Steps" groups={[{ items: [{ text: long }, { text: 'x'.repeat(STEP_TEXT_MAX) }] }]} />);
    rerender(<StepList label="Steps" groups={[{ items: [{ text: long }] }]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/over 70 characters/);
  });

  it('counts a rich row by the words it reads, a CodeLine by the value it shows, and warns for an overlong one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rich = (
      <>
        Point the record at <strong>this</strong> name: <CodeLine value={'a'.repeat(50)} />
      </>
    );
    expect(readableText(rich)).toBe(`Point the record at this name: ${'a'.repeat(50)}`);
    expect(readableText([1, ' ', false, null, 'x'])).toBe('1 x');
    render(<StepList label="Steps" groups={[{ items: [{ text: rich }] }]} />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a masked CodeLine counts and warns only as it shows: the hidden characters never reach the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const id = 'f00dfacecafe0123456789abcdef0123456789ab';
    const row = (
      <>
        Paste this key into the app settings on your phone or tablet: <CodeLine value={id} masked />
      </>
    );
    expect(readableText(row)).toBe(`Paste this key into the app settings on your phone or tablet: ${maskId(id)}`);
    render(<StepList label="Steps" groups={[{ items: [{ text: row }] }]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain(id.slice(4, -4));
  });

  it('a masked CodeLine handed children too still reads as it shows, and an early masked id never reaches the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const id = 'beadfeed0123456789abcdef0123456789abcdef';
    const extra = { children: id } as object; // reason: a caller's spread that CodeLine ignores
    const row = (
      <>
        <CodeLine value={id} masked {...extra} /> is the key: paste it into the field under these steps, then save
      </>
    );
    expect(readableText(row)).toBe(`${maskId(id)} is the key: paste it into the field under these steps, then save`);
    render(<StepList label="Steps" groups={[{ items: [{ text: row }] }]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const said = String(warn.mock.calls[0]![0]);
    expect(said).not.toContain(id.slice(4, -4));
  });

  it('any element with a masked value reads masked before its children: a memo-wrapped CodeLine too', () => {
    const Wrapped = memo(CodeLine);
    const id = 'cafebabe0123456789abcdef0123456789abcdef';
    const extra = { children: id } as object; // reason: a caller's spread that the component ignores
    expect(readableText(<Wrapped value={id} masked {...extra} />)).toBe(maskId(id));
    expect(readableText(<span {...({ value: id, masked: true } as object)}>{id}</span>)).toBe(maskId(id));
  });

  it('an IdChip counts as it shows (label and masked id, never its children); the warning names the list and the row, never the row text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const id = 'deadbeef0123456789abcdef0123456789abcdef';
    const extra = { children: id } as object; // reason: a caller's spread that IdChip ignores (it shows `id` masked)
    const short = (
      <>
        Paste the key into the field under these steps: <IdChip id={id} {...extra} />
      </>
    );
    const long = (
      <>
        Paste the key into the field under these steps, then press Save: <IdChip id={id} label="Key" {...extra} />
      </>
    );
    expect(readableText(short)).toBe(`Paste the key into the field under these steps: ${maskId(id)}`);
    expect(readableText(long)).toBe(`Paste the key into the field under these steps, then press Save: Key ${maskId(id)}`);
    expect(readableText(short).length).toBeLessThanOrEqual(STEP_TEXT_MAX);
    expect(readableText(long).length).toBeGreaterThan(STEP_TEXT_MAX);
    render(<StepList label="Connect the bot" groups={[{ items: [{ text: short }, { text: long }] }]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const said = String(warn.mock.calls[0]![0]);
    expect(said).toMatch(/hub StepList "Connect the bot": row 2 is over 70 characters/);
    expect(said).not.toContain(id.slice(4, -4));
    expect(said).not.toContain('Paste the key');
  });

  it('a CodeLine or an IdChip handed props it ignores still counts as it shows', () => {
    const id = 'feedface0123456789abcdef0123456789abcdef';
    const stray = { value: 'x'.repeat(80), masked: true } as object; // reason: a caller's spread IdChip ignores
    expect(readableText(<IdChip id={id} label="Key" {...stray} />)).toBe(`Key ${maskId(id)}`);
    expect(readableText(<CodeLine value="/setprivacy" {...({ children: 'x'.repeat(80) } as object)} />)).toBe('/setprivacy');
    expect(readableText(<CodeLine value={id} masked />)).toBe(maskId(id));
  });

  it('two digits up to 99, then as written', () => {
    expect([1, 9, 10, 99, 100].map(stepNumber)).toEqual(['01', '09', '10', '99', '100']);
  });

  it('the stylesheet drops a row control under its text below 600 px of the list', () => {
    expect(css('StepList.module.css')).toMatch(/@container \(width < 600px\) \{[^@]*\.withAct \.act \{[^}]*grid-column: 2;/);
  });
});

describe('CodeLine', () => {
  it('shows the value in mono with its title, and Copy gives the value', () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
    render(<p>Send <CodeLine value="/setprivacy" copyLabel="Copy the command" /> to the bot</p>);
    const code = screen.getByText('/setprivacy');
    expect(code.tagName).toBe('CODE');
    expect(code).toHaveAttribute('title', '/setprivacy');
    fireEvent.click(screen.getByRole('button', { name: 'Copy the command' }));
    expect(write).toHaveBeenCalledWith('/setprivacy');
  });

  it('a masked id shows masked and copies whole; `copy` overrides what Copy gives', () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
    const id = '0123456789abcdef01234567';
    render(
      <>
        <CodeLine value={id} masked copyLabel="Copy the id" />
        <CodeLine value="npx hoody" copy="npx hoody@latest" copyLabel="Copy the command" />
      </>,
    );
    expect(screen.queryByText(id)).toBeNull();
    expect(screen.getByText(maskId(id))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the id' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy the command' }));
    expect(write.mock.calls).toEqual([[id], ['npx hoody@latest']]);
  });

  it('the stylesheet gives a coarse pointer a 44 px copy cell', () => {
    expect(css('Ids.module.css')).toMatch(/@media \(pointer: coarse\) \{\s*\.codeInline > button\.codeInlineCopy \{\s*inline-size: var\(--touch-min\);\s*min-block-size: var\(--touch-min\);/);
  });
});

describe('Why', () => {
  const item = { id: 'privacy', q: 'What does group privacy change?', a: 'With it on, the bot reads only commands.' };

  it('is closed by default, the question its label; open, the answer ends with the FAQ link', async () => {
    await mount(() => (
      <Why question="Why does the bot need this?" faq={{ item, label: 'More about group privacy' }}>
        Telegram hides group messages from bots.
      </Why>
    ));
    const q = screen.getByRole('button', { name: 'Why does the bot need this?' });
    expect(q).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Telegram hides group messages from bots.')).not.toBeVisible();
    fireEvent.click(q);
    expect(q).toHaveAttribute('aria-expanded', 'true');
    const answer = screen.getByText('Telegram hides group messages from bots.', { exact: false });
    expect(answer).toBeVisible();
    const link = screen.getByRole('link', { name: 'More about group privacy' });
    expect(answer.lastElementChild).toContainElement(link);
  });

  it('the FAQ link is required: rule 17 ends every answer with it', () => {
    // @ts-expect-error a Why without its FAQ question does not type-check
    const none = <Why question="Which one should I pick?">The first one.</Why>;
    expect(none).toBeTruthy();
  });
});

describe('Facts layout="spec"', () => {
  const items = [
    { label: 'Bot', value: '@shop_atlas_bot' },
    { label: 'Reads in groups', value: 'Commands and mentions only' },
  ];

  it('marks the facts as a spec sheet and keeps the grid default unchanged', () => {
    const { container, rerender } = render(<Facts items={items} label="The bot" layout="spec" />);
    const wrap = container.firstElementChild!;
    expect(wrap.className).toMatch(/spec/);
    expect(screen.getAllByRole('term').map((d) => d.textContent)).toEqual(['Bot', 'Reads in groups']);
    rerender(<Facts items={items} label="The bot" />);
    expect(container.firstElementChild!.className).not.toMatch(/spec/);
  });

  it('the stylesheet: label at the start, value at the end, a hairline per row, no row gap', () => {
    const c = css('Display.module.css');
    expect(c).toMatch(/\.spec \.facts \{\s*row-gap: 0;/);
    expect(c).toMatch(/\.spec \.fact \{\s*grid-template-columns: fit-content\(50%\) minmax\(0, 1fr\);[^}]*border-block-end: var\(--bw\) solid var\(--hx-line\);/);
    expect(c).toMatch(/\.spec \.factValue \{\s*text-align: end;/);
    // The two columns follow the one phone breakpoint (std: a 560-639 condition is that decision): no spec-only width rule.
    expect(c).not.toMatch(/\.spec \.cols2/);
    expect(c).toMatch(/@container \(width < 600px\) \{\s*\.cols2,\s*\.cols3 \{\s*grid-auto-flow: row;\s*grid-template-columns: minmax\(0, 1fr\);/);
  });
});
