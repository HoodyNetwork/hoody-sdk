// A folded code block copies the whole block: the fold only shortens what shows. The kit CodeBlock's `fullText` is what
// its Copy gives when `code` is only a part of the text; without it Copy gives `code`, as before.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeBlock } from '../data/Ids';
import kitStrings from '../strings.en.json';
import { FoldedCode } from './Reply';
import strings from './Conversation.strings.en.json';

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => { cleanup(); });

const copy = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: kitStrings['code.copy'] }));
  });
};

describe('FoldedCode: Copy gives the whole block', () => {
  const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');

  it('folded: only the first lines show, Copy gives all 30', async () => {
    const { container } = render(<FoldedCode text={long} lang="text" />);
    expect(screen.getByRole('button', { name: /more lines/ })).toBeTruthy();
    expect(container.textContent).not.toContain('line 29');
    await copy();
    expect(written).toEqual([long]);
  });

  it('opened: the same whole text', async () => {
    render(<FoldedCode text={long} lang="text" />);
    fireEvent.click(screen.getByRole('button', { name: /more lines/ }));
    expect(screen.getByRole('button', { name: strings['agent.showLess'] })).toBeTruthy();
    await copy();
    expect(written).toEqual([long]);
  });

  it('a short block copies its text', async () => {
    render(<FoldedCode text={'a\nb'} lang="text" />);
    await copy();
    expect(written).toEqual(['a\nb']);
  });
});

describe('CodeBlock fullText', () => {
  it('shows `code`, copies `fullText`', async () => {
    const { container } = render(<CodeBlock code="one" fullText={'one\ntwo'} lang="plain" />); // reason: a test block with no language
    expect(container.textContent).not.toContain('two');
    await copy();
    expect(written).toEqual(['one\ntwo']);
  });

  it("'ansi': the whole text is copied without escapes, as `code` is", async () => {
    render(<CodeBlock code={'\u001b[31mred\u001b[0m'} fullText={'\u001b[31mred\u001b[0m\n\u001b[1mbold\u001b[0m'} lang="ansi" />);
    await copy();
    expect(written).toEqual(['red\nbold']);
  });

  it('without fullText Copy gives `code`, unchanged', async () => {
    render(<CodeBlock code="only" lang="plain" />); // reason: a test block with no language
    await copy();
    expect(written).toEqual(['only']);
  });
});
