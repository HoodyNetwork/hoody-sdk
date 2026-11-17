// Vitest: the reply pieces the dock and the AI page share. Prose draws markdown as React text (no HTML),
// FoldedCode folds past 14 lines, the footer carries Copy, cost and time, and a link opens in a new tab.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoldedCode, Prose, ReplyBox, ReplyFooter } from './Reply';
import strings from './Conversation.strings.en.json';
import cs from './Conversation.module.css';

describe('Prose', () => {
  it('draws paragraphs, lists and inline code as text', () => {
    const { container } = render(<Prose text={'Hello **bold** and `code`\n\n- one\n- two'} />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
  it('never makes HTML of model text', () => {
    const { container } = render(<Prose text={'<img src=x onerror=alert(1)> <b>x</b>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
  });
  it('a link opens in a new tab with no opener; javascript: stays text', () => {
    const { container } = render(<Prose text={'[ok](https://example.com/a) [bad](javascript:alert(1))'} />);
    const a = container.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://example.com/a');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
  it('a heading keeps its level: read out as a heading, the top two levels drawn larger than the rest', () => {
    render(<Prose text={'# One\n\n## Two\n\n### Three\n\n###### Six\n\nbody'} />);
    const hs = screen.getAllByRole('heading');
    expect(hs.map((h) => [h.textContent, h.getAttribute('aria-level')])).toEqual([['One', '1'], ['Two', '2'], ['Three', '3'], ['Six', '6']]);
    expect(hs.map((h) => h.classList.contains(cs.h1 as string))).toEqual([true, true, false, false]);
    expect(hs.map((h) => h.classList.contains(cs.h3 as string))).toEqual([false, false, true, true]);
    expect(screen.getByText('body').getAttribute('role')).toBeNull();
  });
  it('the caret follows the last paragraph while streaming', () => {
    const { container } = render(<Prose text="Streaming" caret />);
    expect(container.querySelector('p > span[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('FoldedCode', () => {
  const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
  it('a block past 14 lines folds with the count of hidden lines; Show less puts it back', () => {
    render(<FoldedCode text={long} lang="text" />);
    const more = screen.getByRole('button', { name: /more lines/ });
    expect(more.textContent).toMatch(/18 more lines/);
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: strings['agent.showLess'] })).toBeTruthy();
  });
  it('a short block has no fold control', () => {
    render(<FoldedCode text={'a\nb'} lang="text" />);
    expect(screen.queryByRole('button', { name: /more lines|Show less/ })).toBeNull();
  });
});

describe('ReplyFooter', () => {
  it('Copy always; cost only when positive; the time when known', () => {
    const { rerender } = render(<ReplyBox><ReplyFooter text="hi" cost={null} at={null} /></ReplyBox>);
    expect(screen.getByRole('button', { name: new RegExp(strings['agent.copy']) })).toBeTruthy();
    expect(screen.queryByText(/^\$/)).toBeNull();
    rerender(<ReplyBox><ReplyFooter text="hi" cost={0} at={null} /></ReplyBox>);
    expect(screen.queryByText(/^\$/)).toBeNull();
    rerender(<ReplyBox><ReplyFooter text="hi" cost={0.0042} at={Date.UTC(2026, 9, 27, 12, 30)} /></ReplyBox>);
    expect(screen.getByText('$0.0042')).toBeTruthy();
  });
});
