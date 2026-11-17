import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExtLink, Link, TextButton } from './Link';

const linkCss = readFileSync(path.join(import.meta.dirname, 'Link.module.css'), 'utf8');

describe('Link', () => {
  it('opens external links in a new tab without opener', () => {
    render(<Link href="https://hoody.com/docs">Docs</Link>);
    const a = screen.getByRole('link', { name: 'Docs' });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('an upper-case scheme is external too (the rule app/hrefs.ts uses)', () => {
    render(<Link href="HTTPS://hoody.com/docs">Docs</Link>);
    const a = screen.getByRole('link', { name: 'Docs' });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // What a variant looks like is its stylesheet's colour: read the colour rules of the classes the
  // link actually carries (happy-dom does not apply CSS), so this checks what a person would see.
  const colourOf = (el: HTMLElement): string[] =>
    [...el.classList].flatMap((c) => [...linkCss.matchAll(new RegExp(`(?:^|\\s|,)\\.${c}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => /(?:^|;|\s)color:\s*([^;]+);/.exec(m[1] ?? '')?.[1]?.trim()).filter((x): x is string => Boolean(x)));

  // "Blue go": a link that goes somewhere is blue whether it is running text (inline) or a page link
  // (nav, once grey); plain wraps a tile or tag and keeps its own colour.
  it('inline (default) and nav are link-coloured; plain never is', () => {
    render(
      <>
        <Link href="/a">A</Link>
        <Link href="/n" variant="nav">
          N
        </Link>
        <Link href="/p" variant="plain">
          P
        </Link>
      </>,
    );
    for (const name of ['A', 'N']) expect(colourOf(screen.getByRole('link', { name }))).toEqual(['var(--hx-link)']);
    const c = colourOf(screen.getByRole('link', { name: 'P' }));
    expect(c.length).toBeGreaterThan(0);
    for (const v of c) expect(v).not.toMatch(/--hx-link/);
  });

  // A secret address opens through a button that must look like the link (the same blue, whatever the pointer
  // or focus does): it carries the go class, and no rule of the secret button sets a colour of its own.
  it('a secret ExtLink button is link-coloured, in both looks, and no extButton rule recolours it', () => {
    render(
      <>
        <ExtLink url="https://docs.example.test/start?token=abc" secret look="nav" name="Nav secret" />
        <ExtLink url="https://docs.example.test/start?token=def" secret name="Inline secret" />
      </>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
    for (const b of buttons) expect(colourOf(b)).toContain('var(--hx-link)');
    const recolours = [...linkCss.matchAll(/([^{}]*\bextButton\b[^{}]*)\{([^}]*)\}/g)].filter((m) => /(?:^|[;\s])color:/.test(m[2] ?? '')).map((m) => (m[1] ?? '').trim());
    expect(recolours).toEqual([]);
  });

  it('every variant is a real link to its place', () => {
    render(
      <Link href="/computers?sel=x" variant="nav">
        Computers
      </Link>,
    );
    expect(screen.getByRole('link', { name: 'Computers' })).toHaveAttribute('href', '/computers?sel=x');
  });
});

describe('TextButton', () => {
  it('is a button that runs its action', () => {
    const onPress = vi.fn();
    render(<TextButton onPress={onPress}>Try again</TextButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    const onPress = vi.fn();
    render(
      <TextButton onPress={onPress} isDisabled>
        Try again
      </TextButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
