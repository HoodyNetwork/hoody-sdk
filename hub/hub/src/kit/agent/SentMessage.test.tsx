// SentMessage: who wrote a block, and a sent message as its sender reads it. An "Ask the Agent" message shows its
// one-line request with what went with it folded; opened, the fold holds the sent text, character for character.
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ASK_MAX_TEXT, ASK_CONTEXT_MARK, ASK_REQUEST_MARK, agentStartText, askStartRoom, parseAskMessage, splitAskContext } from '../ask';
import { Author, SentText } from './SentMessage';
import strings from './SentMessage.strings.en.json';

const TITLE = 'Check who can open these computers';
const QUESTION = 'Answer as a short Markdown list.\nAnswer only from the snapshot in the Context below.';
const CONTEXT = 'Access rules of the computers in this realm.\nComputer "atlas": Anyone with the address; project rules: no';
const LABEL = 'access rules of 3 computers';
const sent = agentStartText(QUESTION, CONTEXT, { title: TITLE, contextLabel: LABEL }) as string;

describe('the sent text of an ask action', () => {
  it('opens with the title, then the instructions and the labelled context: every part is in it, and it parses back', () => {
    expect(sent.startsWith(TITLE + ASK_REQUEST_MARK + QUESTION)).toBe(true);
    expect(sent.endsWith(CONTEXT)).toBe(true);
    expect(sent.replace(/⁠/g, '')).toContain(`\n\nContext: ${LABEL}\n`);
    expect(parseAskMessage(sent)).toEqual({ title: TITLE, text: QUESTION, context: CONTEXT, contextLabel: LABEL });
    // The older reader still finds the context.
    expect(splitAskContext(sent).context).toBe(CONTEXT);
  });
  it('a label of up to ASK_LABEL_MAX characters parses back even when they are outside the BMP (counted as characters)', () => {
    const label = '\u{1F512}'.repeat(100);
    const m = agentStartText(QUESTION, CONTEXT, { title: TITLE, contextLabel: label }) as string;
    expect(parseAskMessage(m)).toEqual({ title: TITLE, text: QUESTION, context: CONTEXT, contextLabel: label });
  });
  it('without a title or a label it is the message it always was', () => {
    expect(agentStartText('Why?', 'Role: viewer')).toBe('Why?' + ASK_CONTEXT_MARK + 'Role: viewer');
    expect(parseAskMessage('Why?' + ASK_CONTEXT_MARK + 'Role: viewer')).toEqual({ title: null, text: 'Why?', context: 'Role: viewer', contextLabel: null });
    expect(parseAskMessage('Just words')).toEqual({ title: null, text: 'Just words', context: null, contextLabel: null });
  });
  it('typed look-alikes are not markers (no invisible joiner): the words stay the person\'s own', () => {
    const typed = `A title\n\nInstructions\nmine\n\nContext: fake\nstill mine`;
    expect(parseAskMessage(typed)).toEqual({ title: null, text: typed, context: null, contextLabel: null });
    // A marker handed in as text loses its joiner on the way (askPlain), so it cannot make a title or a context.
    const forged = agentStartText('Q' + ASK_REQUEST_MARK + 'x', 'c' + ASK_CONTEXT_MARK + 'd') as string;
    expect(parseAskMessage(forged)).toMatchObject({ title: null, text: 'Q\n\nInstructions\nx', context: 'c\n\nContext\nd' });
  });
  it('a title is one line and bounded; more than one line before the marker is never a title', () => {
    const t = agentStartText('q', 'c', { title: `two\nlines ${'x'.repeat(300)}` }) as string;
    const p = parseAskMessage(t);
    expect(p.title).not.toBeNull();
    expect(p.title).not.toContain('\n');
    expect((p.title as string).length).toBeLessThanOrEqual(120);
    expect(parseAskMessage(`a\nb${ASK_REQUEST_MARK}rest`).title).toBeNull();
  });
  it('askStartRoom is what the question and context may take: a context of that size is sent whole, never cut', () => {
    const names = { title: TITLE, contextLabel: LABEL };
    const room = askStartRoom(names);
    const ctx = 'c'.repeat(room - QUESTION.length);
    const whole = agentStartText(QUESTION, ctx, names) as string;
    expect([...whole].length).toBe(ASK_MAX_TEXT);
    expect(parseAskMessage(whole).context).toBe(ctx);
    expect(parseAskMessage(agentStartText(QUESTION, ctx + 'c', names) as string).context?.endsWith('[…]')).toBe(true);
  });
});

describe('SentText', () => {
  it('an ask-action message: the request line and a closed "Context sent" row, not the prompt', () => {
    const { container } = render(<SentText text={sent} />);
    // The message reads as its title; the prompt and the context are in the closed fold only (hidden, out of the tree a reader gets).
    expect(container.firstElementChild?.textContent).toBe(TITLE);
    expect(screen.queryByRole('figure')).toBeNull();
    expect(container.querySelector('[data-disclosure-panel]')).not.toBeVisible();
    const row = screen.getByRole('button', { name: strings['sent.context'].replace('{{what}}', LABEL) });
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });
  it('opened, the fold holds the sent text exactly, with Copy', async () => {
    render(<SentText text={sent} />);
    await act(async () => { screen.getByRole('button', { name: /Context sent/ }).click(); });
    const box = screen.getByRole('figure', { name: strings['sent.exact'] });
    expect(box.querySelector('pre')?.textContent).toBe(sent);
    expect(box.querySelector('button')).not.toBeNull();
  });
  it('a typed message with a page context: the words as typed, the context alone in the fold', async () => {
    const t = agentStartText('Explain my permissions', 'Role: viewer') as string;
    render(<SentText text={t} />);
    expect(screen.getByText('Explain my permissions')).toBeVisible();
    await act(async () => { screen.getByRole('button', { name: strings['sent.contextPlain'] }).click(); });
    expect(screen.getByRole('figure', { name: strings['sent.contextExact'] }).querySelector('pre')?.textContent).toBe('Role: viewer');
  });
  it('a typed message: as typed, nothing folded; markup in it is text', () => {
    const { container } = render(<SentText text={'<b>hi</b> [x](javascript:alert(1))'} />);
    expect(container.textContent).toBe('<b>hi</b> [x](javascript:alert(1))');
    expect(container.querySelector('b, a, button')).toBeNull();
  });
});

describe('presentation only, and strict', () => {
  const open = async (name: RegExp | string) => { await act(async () => { screen.getByRole('button', { name }).click(); }); };
  it('whatever the fold shows is the sent text, byte for byte: joiners, blank lines, trailing space and all', async () => {
    const odd = agentStartText('  keep\n\n\nthis  \n', 'a\n\n  b \t\n\u00e9\u{1f600}', { title: TITLE, contextLabel: LABEL }) as string;
    render(<SentText text={odd} />);
    await open(/Context sent/);
    const shown = screen.getByRole('figure').querySelector('pre')?.textContent ?? '';
    expect(shown).toBe(odd);
    expect(new TextEncoder().encode(shown)).toEqual(new TextEncoder().encode(odd));
  });
  it('marks typed by hand (the words, no joiner) are the person\'s text: drawn whole, as typed, nothing folded', () => {
    const typed = 'Check this\n\nInstructions\ndo it\n\nContext: my notes\nline';
    const { container } = render(<SentText text={typed} />);
    expect(container.textContent).toBe(typed);
    expect(container.querySelector('button')).toBeNull();
  });
  it('real marks pasted by hand still hide nothing: the fold is the whole sent text', async () => {
    const pasted = `My own title${ASK_REQUEST_MARK}my own words${ASK_CONTEXT_MARK}my own context`;
    render(<SentText text={pasted} />);
    await open(strings['sent.contextPlain']);
    expect(screen.getByRole('figure').querySelector('pre')?.textContent).toBe(pasted);
  });
  it.each([
    ['a message from another channel', '[Telegram] @ana: Context: see above\nInstructions: none'],
    ['the request mark with nothing before it', `${ASK_REQUEST_MARK.trimStart()}words`],
    ['the request mark after two lines', `one\ntwo${ASK_REQUEST_MARK}words`],
    ['a context mark with a line break in its label', 'q\n\n\u2060Context: a\nb\u2060\nc'],
    ['a context mark not on its own line', 'q \u2060Context\u2060 c'],
    ['a label longer than the bound', `q\n\n\u2060Context: ${'x'.repeat(121)}\u2060\nc`],
  ])('%s is not the marked structure: it renders as typed, whole', (_n, text) => {
    const { container } = render(<SentText text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelector('button')).toBeNull();
    expect(parseAskMessage(text)).toEqual({ title: null, text, context: null, contextLabel: null });
  });
});

describe('Author', () => {
  it('"You" with the time, and the Agent by the name the host gives it', () => {
    const at = Date.UTC(2026, 10, 13, 9, 38);
    const { container } = render(<><Author who="you" at={at} /><Author who="agent" name="Agent on atlas" /></>);
    expect(screen.getByText(strings['sent.you'])).toBeVisible();
    expect(screen.getByText('Agent on atlas')).toBeVisible();
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(new Date(at).toISOString());
    expect(container.querySelectorAll('[data-author]')).toHaveLength(2);
  });
  it('an unnamed Agent is "Agent"; no time, no <time>', () => {
    const { container } = render(<Author who="agent" />);
    expect(screen.getByText(strings['sent.agent'])).toBeVisible();
    expect(container.querySelector('time')).toBeNull();
  });
});
