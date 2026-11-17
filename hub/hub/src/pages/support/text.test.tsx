// Vitest: support text is text. No file of the page renders HTML or Markdown
// (no dangerouslySetInnerHTML, no MarkdownViewer, Prose or CodeBlock), and a hostile ticket shows its markup, its
// javascript: link literally, its bidi override never reaches the page (the Link rule shows no bidi control), and
// the only links in a message are http(s) ones.
import { renderPage, screen, within } from '@app/testing';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { T_HOSTILE } from './fixtures';
import page from './page';

const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));

describe('support text is text', () => {
  it('no page file renders HTML or Markdown', () => {
    const hits = files(__dirname)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /dangerouslySetInnerHTML|\bMarkdownViewer\b|\bProse\b|\bCodeBlock\b/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('a hostile message and subject render literally', async () => {
    const { container } = await renderPage(page, { path: `/support?sel=${String(T_HOSTILE.id)}` });
    const body = await screen.findByText(/<b>not bold<\/b> \*\*not bold\*\* <script>alert\(1\)<\/script>/, undefined, { timeout: 10000 });
    expect(container.querySelector('b, strong, script')).toBeNull();
    // Link rule (kit/controls/Link.tsx safeShown/autolink): no bidi control is ever shown, so the bidi override
    // pair is dropped and the name reads in its real order.
    expect(body.textContent).toContain('A reversed txt.exe name');
    expect(container.textContent).not.toMatch(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u);
    expect(body.textContent).toContain('[click](javascript:alert(1)) javascript:alert(2)');
    const links = within(body).queryAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://hoody.com/help']);
    expect(container.querySelector('a[href^="javascript:" i]')).toBeNull();
    expect(screen.getAllByText('<b>bold</b> **subject**').length).toBeGreaterThan(0);
  });
});
