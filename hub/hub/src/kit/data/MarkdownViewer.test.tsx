// MarkdownViewer: a long Markdown document in a box. Rendered through the reply renderer,
// Raw as text with its reason, every view, Copy and Download scrubbed again; one loading state, an empty file, a file too
// long to render (UTF-8 bytes); a loading prop that wins, and a dev error for a missing source; Download names the file; at 390 px the head folds into ⋯ with the same actions.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type * as ReplyMod from '../agent/Reply';
import { MarkdownViewer, VIEWER_RENDER_MAX } from './MarkdownViewer';
import strings from './MarkdownViewer.strings.en.json';

// What each download got: its name and text; `refuse` makes the next save refuse.
const saved: Array<{ name: string; text: string }> = [];
let refuse = false;
vi.mock('@core', async (orig) => {
  const mod = await orig<typeof CoreMod>();
  return {
    ...mod,
    save: (name: unknown, parts: unknown) => {
      if (refuse) return { refused: 'TOO_LARGE' };
      const text = String((parts as unknown[])[0] ?? '');
      saved.push({ name: String(name), text });
      return { ok: true, name: String(name), bytes: text.length };
    },
  };
});

// Every Prose render is counted: a document too long to render is never parsed for Rendered.
const prose = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../agent/Reply', async (orig) => {
  const mod = await orig<typeof ReplyMod>();
  const Real = mod.Prose;
  return { ...mod, Prose: (p: ComponentProps<typeof Real>) => { prose.calls++; return <Real {...p} />; } };
});

let copied: string[] = [];
beforeEach(() => {
  prose.calls = 0;
  saved.length = 0;
  refuse = false;
  copied = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } });
});

const SECRET = 'sk-live_ABCDEFGHIJKLMNOP1234';
const DOC = ['# Deploy', '', 'Run the *checks* first, see [the guide](https://example.com/guide).', '', '- one', '- two', '', '```json', '{"a": 1}', '```', ''].join('\n');
const region = () => screen.getByRole('region', { name: 'SKILL.md' });
const toggle = () => screen.getByRole('radiogroup', { name: `How SKILL.md shows` });
const tx = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

describe('MarkdownViewer: anatomy and the two views', () => {
  it('a head with the label, Rendered/Raw as a radio group, Copy and a Download named by the file; a focusable region named by the label', () => {
    render(<MarkdownViewer label="SKILL.md" source={DOC} />);
    expect(toggle()).toBeInTheDocument();
    expect(within(toggle()).getByRole('radio', { name: 'Rendered' })).toBeChecked();
    expect(within(toggle()).getByRole('radio', { name: 'Raw' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tx('viewer.copy', { label: 'SKILL.md' }) })).toBeInTheDocument();
    expect(region()).toHaveAttribute('tabindex', '0');
  });

  it('Rendered: the reply renderer: a heading, a list, a clickable link, a coloured fence; prose reads in its own direction', () => {
    render(<MarkdownViewer label="SKILL.md" source={DOC} />);
    const r = region();
    expect(within(r).getByText('Deploy')).toBeInTheDocument();
    expect(within(r).getAllByRole('listitem')).toHaveLength(2);
    expect(within(r).getByRole('link', { name: /the guide/ })).toHaveAttribute('href', 'https://example.com/guide');
    expect(r.querySelector('[class*="hl_"]')).not.toBeNull();
    expect(r.querySelector('[dir="auto"]')).not.toBeNull();
  });

  it('a code fence in a right-to-left document reads left to right, as Raw does', () => {
    render(<MarkdownViewer label="SKILL.md" source={['# נסה', '', 'הרץ את זה:', '', '```json', '{"a": 1}', '```', ''].join('\n')} />);
    expect(region().querySelector('[dir="auto"][class*="rendered"] figure')).not.toBeNull();
    const css = readFileSync(join(import.meta.dirname, 'MarkdownViewer.module.css'), 'utf8');
    expect(css).toMatch(/\.rendered figure \{\s*direction: ltr;\s*unicode-bidi: isolate;/);
  });

  it('a javascript: link stays text (the renderer\'s rule holds)', () => {
    render(<MarkdownViewer label="SKILL.md" source={'[x](javascript:alert(1))'} />);
    expect(within(region()).queryByRole('link')).toBeNull();
  });

  it('Raw shows the text as written, left to right; back to Rendered shows the prose', async () => {
    render(<MarkdownViewer label="SKILL.md" source={DOC} />);
    await userEvent.click(within(toggle()).getByRole('radio', { name: 'Raw' }));
    const pre = region().querySelector('pre');
    expect(pre?.textContent).toBe(DOC.replace(/\n$/, ''));
    expect(region().querySelector('[dir="ltr"]')).not.toBeNull();
    expect(within(region()).queryByRole('link')).toBeNull();
    await userEvent.click(within(toggle()).getByRole('radio', { name: 'Rendered' }));
    expect(within(region()).getByRole('link', { name: /the guide/ })).toBeInTheDocument();
  });

  it('the height is the prop\'s (md by default)', () => {
    const { container, rerender } = render(<MarkdownViewer label="SKILL.md" source={DOC} />);
    expect(container.firstElementChild?.className).toMatch(/\bmd\b/);
    rerender(<MarkdownViewer label="SKILL.md" source={DOC} height="lg" />);
    expect(container.firstElementChild?.className).toMatch(/\blg\b/);
  });
});

describe('MarkdownViewer: secrets, Copy and Download', () => {
  const src = `token ${SECRET} here\n`;

  it('a token-shaped value is hidden in Rendered, in Raw, in what Copy writes and in the downloaded file', async () => {
    render(<MarkdownViewer label="SKILL.md" source={src} />);
    expect(document.body.textContent).not.toContain(SECRET);
    await userEvent.click(within(toggle()).getByRole('radio', { name: 'Raw' }));
    expect(document.body.textContent).not.toContain(SECRET);
    expect(region().textContent).toContain('[hidden]');
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.copy', { label: 'SKILL.md' }) }));
    expect(copied).toHaveLength(1);
    expect(copied[0]).not.toContain(SECRET);
    expect(copied[0]).toContain('[hidden]');
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) }));
    expect(saved).toEqual([{ name: 'SKILL.md', text: 'token [hidden] here\n' }]);
  });

  it('Download takes fileName when given; a refusal shows its text', async () => {
    render(<MarkdownViewer label="SKILL.md" fileName="deploy-skill.md" source={DOC} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'deploy-skill.md' }) }));
    expect(saved.map((x) => x.name)).toEqual(['deploy-skill.md']);
    refuse = true;
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'deploy-skill.md' }) }));
    expect(screen.getByText(strings['viewer.saveRefused'])).toHaveAttribute('role', 'status');
  });

  it('a token-shaped label, file name or fact is hidden in the head, every name, the menu, the saved name and the Facts', async () => {
    render(<MarkdownViewer label={`notes ${SECRET}`} fileName={`${SECRET}.md`} source={DOC} frontmatter={[[`key ${SECRET}`, `value ${SECRET}`]]} />);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(screen.getByText('notes [hidden]')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'notes [hidden]' })).toBeInTheDocument();
    expect(screen.getByText('key [hidden]')).toBeInTheDocument();
    expect(screen.getByText('value [hidden]')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: '[hidden].md' }) }));
    expect(saved.map((x) => x.name)).toEqual(['[hidden].md']);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.more', { label: 'notes [hidden]' }) }));
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('Raw names its block with the scrubbed label', async () => {
    render(<MarkdownViewer label={`notes ${SECRET}`} source={DOC} />);
    await userEvent.click(within(screen.getByRole('radiogroup', { name: tx('viewer.view', { label: 'notes [hidden]' }) })).getByRole('radio', { name: 'Raw' }));
    const region = screen.getByRole('region', { name: 'notes [hidden]' });
    expect(region.querySelector('pre')).not.toBeNull();
    expect(within(region).getByRole('figure', { name: 'notes [hidden]' })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('a label alone names the saved file, scrubbed', async () => {
    render(<MarkdownViewer label={`${SECRET}.md`} source={DOC} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: '[hidden].md' }) }));
    expect(saved.map((x) => x.name)).toEqual(['[hidden].md']);
  });

  it('a refusal belongs to its document: another source, another file name or a reload shows none', async () => {
    refuse = true;
    const { rerender } = render(<MarkdownViewer label="SKILL.md" source={DOC} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) }));
    expect(screen.getByText(strings['viewer.saveRefused'])).toHaveAttribute('role', 'status');
    rerender(<MarkdownViewer label="SKILL.md" source={`${DOC}more\n`} />);
    expect(screen.queryByText(strings['viewer.saveRefused'])).toBeNull();
    rerender(<MarkdownViewer label="SKILL.md" source={DOC} />);
    expect(screen.queryByText(strings['viewer.saveRefused'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) }));
    rerender(<MarkdownViewer label="SKILL.md" fileName="other.md" source={DOC} />);
    expect(screen.queryByText(strings['viewer.saveRefused'])).toBeNull();
    rerender(<MarkdownViewer label="SKILL.md" fileName="other.md" source={DOC} loading />);
    expect(screen.queryByText(strings['viewer.saveRefused'])).toBeNull();
  });

  it('a refusal is keyed on the document as given: two secrets that both read [hidden] are two documents, and two file names too', async () => {
    const OTHER = 'sk-live_QRSTUVWXYZ987654';
    refuse = true;
    const { rerender } = render(<MarkdownViewer label="SKILL.md" source={`token ${SECRET}\n`} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) }));
    expect(screen.getByText(strings['viewer.saveRefused'])).toHaveAttribute('role', 'status');
    rerender(<MarkdownViewer label="SKILL.md" source={`token ${OTHER}\n`} />);
    expect(screen.queryByText(strings['viewer.saveRefused'])).toBeNull();
    rerender(<MarkdownViewer label="SKILL.md" fileName={`${SECRET}.md`} source={DOC} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: '[hidden].md' }) }));
    expect(screen.getByText(strings['viewer.saveRefused'])).toHaveAttribute('role', 'status');
    rerender(<MarkdownViewer label="SKILL.md" fileName={`${OTHER}.md`} source={DOC} />);
    expect(screen.queryByText(strings['viewer.saveRefused'])).toBeNull();
  });
});

describe('MarkdownViewer: a key with what a reader cannot see', () => {
  const TAIL = '0123456789abcdef';
  describe.each([
    ['a zero-width space', '\u200b'],
    ['a bell', '\u0007'],
    ['a colour escape', '\u001b[0m'],
    ['a variation selector', '\ufe0f'],
    ['a blank braille cell', '\u2800'],
  ])('%s', (_name, x) => {
    it.each([
      ['inside the key', `sk-live${x}${TAIL}`, 'token [hidden] here\n'],
      ['right after a word', `note${x}sk-live${TAIL}`, `token note${x}[hidden] here\n`],
    ])('%s: Raw, Copy and Download never hold it', async (_where, key, want) => {
      render(<MarkdownViewer label="SKILL.md" source={`token ${key} here\n`} />);
      await userEvent.click(within(toggle()).getByRole('radio', { name: 'Raw' }));
      expect(region().textContent).not.toContain(TAIL);
      expect(region().textContent).toContain('[hidden]');
      await userEvent.click(screen.getByRole('button', { name: tx('viewer.copy', { label: 'SKILL.md' }) }));
      expect(copied).toEqual([want]);
      await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) }));
      expect(saved).toEqual([{ name: 'SKILL.md', text: want }]);
    });

    it('in the label, the file name and a fact: never shown or saved', async () => {
      const key = `sk-live${x}${TAIL}`;
      const { container } = render(<MarkdownViewer label={`notes ${key}`} fileName={`${key}.md`} source="x" frontmatter={[[`key ${key}`, `value ${key}`]]} />);
      expect(container.textContent).not.toContain(TAIL);
      expect(screen.getByText('notes [hidden]')).toBeInTheDocument();
      expect(screen.getByText('key [hidden]')).toBeInTheDocument();
      expect(screen.getByText('value [hidden]')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: '[hidden].md' }) }));
      expect(saved.map((f) => f.name)).toEqual(['[hidden].md']);
    });
  });

  it('a document with no key keeps its joined emoji, colours and invisible characters in Copy and Download', async () => {
    const text = 'family \u{1F468}\u200d\u{1F469}\u200d\u{1F467} a\u200bb \u001b[32mok\u001b[0m\n';
    render(<MarkdownViewer label="SKILL.md" source={text} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.copy', { label: 'SKILL.md' }) }));
    expect(copied).toEqual([text]);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.download', { file: 'SKILL.md' }) }));
    expect(saved).toEqual([{ name: 'SKILL.md', text }]);
  });
});

describe('MarkdownViewer: states', () => {
  it('loading: Skeleton rows only, no actions and no region; loading wins over a source', () => {
    const { container } = render(<MarkdownViewer label="SKILL.md" loading source={DOC} />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(strings['viewer.empty'])).toBeNull();
    expect(container.querySelector('[aria-busy="true"], [data-skeleton], [class*="skeleton"]')).not.toBeNull();
  });

  it('no source and not loading is a caller\'s bug: a dev error, and the empty state (never a Skeleton that waits forever)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { container } = render(<MarkdownViewer label="SKILL.md" />);
      expect(screen.getByText(strings['viewer.empty'])).toBeInTheDocument();
      expect(container.querySelector('[aria-busy="true"], [data-skeleton], [class*="skeleton"]')).toBeNull();
      expect(err.mock.calls.some((c) => String(c[0]).includes('MarkdownViewer') && String(c[0]).includes('SKILL.md'))).toBe(true);
    } finally {
      err.mockRestore();
    }
  });

  it('the missing-source error names the file scrubbed', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<MarkdownViewer label={`notes ${SECRET}`} />);
      const said = err.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('MarkdownViewer'));
      expect(said.length).toBeGreaterThan(0);
      expect(said.every((m) => m.includes('notes [hidden]') && !m.includes(SECRET))).toBe(true);
    } finally {
      err.mockRestore();
    }
  });

  it('empty: "This file is empty", no box', () => {
    render(<MarkdownViewer label="SKILL.md" source="" />);
    expect(screen.getByText(strings['viewer.empty'])).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });

  // Text with spaces: one unbroken run past 40k characters is hidden whole by the scrub (the next test).
  const words = (ch: string, n: number) => `${ch.repeat(999)} `.repeat(Math.ceil(n / 1000)).slice(0, n);
  it('past 256 KiB (in bytes): Raw only, no toggle, the note; exactly at the limit it still renders', () => {
    const at = words('a', VIEWER_RENDER_MAX);
    const { unmount } = render(<MarkdownViewer label="SKILL.md" source={at} />);
    expect(toggle()).toBeInTheDocument();
    expect(screen.queryByText(strings['viewer.tooLong'])).toBeNull();
    expect(prose.calls).toBeGreaterThan(0);
    unmount();
    // One byte past the limit: Raw only, and the renderer never runs.
    prose.calls = 0;
    const over = render(<MarkdownViewer label="SKILL.md" source={`${at}a`} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText(strings['viewer.tooLong'])).toBeInTheDocument();
    expect(prose.calls).toBe(0);
    over.unmount();
    // Under the limit in characters, over it in bytes: é is 2 bytes.
    const wide = words('é', VIEWER_RENDER_MAX / 2 + 1000);
    render(<MarkdownViewer label="SKILL.md" source={wide} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText(strings['viewer.tooLong'])).toBeInTheDocument();
    expect(region().querySelector('pre')).not.toBeNull();
  });

  it('one unbroken run past 256 KiB shows as hidden, never its text', () => {
    render(<MarkdownViewer label="SKILL.md" source={'a'.repeat(VIEWER_RENDER_MAX + 1)} />);
    expect(screen.queryByText('a'.repeat(100), { exact: false })).toBeNull();
    expect(region().textContent).toContain('[hidden]');
  });

  it('frontmatter shows as Facts above the body, in order; none shows no Facts', () => {
    const { unmount } = render(<MarkdownViewer label="SKILL.md" source={DOC} frontmatter={[['name', 'deploy'], ['version', '2']]} />);
    const labels = screen.getAllByText(/^(name|version)$/).map((e) => e.textContent);
    expect(labels).toEqual(['name', 'version']);
    expect(screen.getByText('deploy').compareDocumentPosition(region()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    render(<MarkdownViewer label="SKILL.md" source={DOC} />);
    expect(screen.queryByText('name')).toBeNull();
  });

  it('loading shows no Facts: they wait with the body', () => {
    render(<MarkdownViewer label="SKILL.md" loading frontmatter={[['name', 'deploy']]} />);
    expect(screen.queryByText('deploy')).toBeNull();
    expect(screen.queryByText('name')).toBeNull();
  });
});

describe('MarkdownViewer: 390 px', () => {
  it('the ⋯ menu holds the same three actions, and they act as the head controls do', async () => {
    render(<MarkdownViewer label="SKILL.md" fileName="deploy-skill.md" source={DOC} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.more', { label: 'SKILL.md' }) }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent ?? '');
    expect(items.some((x) => x.includes('Raw'))).toBe(true);
    expect(items.some((x) => x.includes('Copy'))).toBe(true);
    expect(items.some((x) => x.includes(tx('viewer.download', { file: 'deploy-skill.md' })))).toBe(true);
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(tx('viewer.download', { file: 'deploy-skill.md' })) }));
    expect(saved.map((x) => x.name)).toEqual(['deploy-skill.md']);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.more', { label: 'SKILL.md' }) }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Raw/ }));
    expect(region().querySelector('pre')?.textContent).toBe(DOC.replace(/\n$/, ''));
  });

  it('the ⋯ menu Copy writes the scrubbed text, as the head Copy does', async () => {
    render(<MarkdownViewer label="SKILL.md" source={`token ${SECRET} here\n`} />);
    await userEvent.click(screen.getByRole('button', { name: tx('viewer.more', { label: 'SKILL.md' }) }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Copy/ }));
    expect(copied).toEqual(['token [hidden] here\n']);
  });
});

describe('MarkdownViewer: a text hidden whole says so', () => {
  it('says the text is withheld, before anyone saves the placeholder', () => {
    render(<MarkdownViewer label="Doc" source="sk-live0123456789abcdef" />);
    expect(screen.queryByText(strings['viewer.withheld'])).not.toBeNull();
  });
  it('says nothing when a key inside a text is hidden and the rest shows', () => {
    render(<MarkdownViewer label="Doc" source="before sk-live0123456789abcdef after" />);
    expect(screen.queryByText(strings['viewer.withheld'])).toBeNull();
  });
  it('says nothing for an ordinary text', () => {
    render(<MarkdownViewer label="Doc" source="plain words" />);
    expect(screen.queryByText(strings['viewer.withheld'])).toBeNull();
  });
});
