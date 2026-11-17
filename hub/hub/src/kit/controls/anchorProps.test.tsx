// The external-link rule (one anchorProps for Link and both LinkButton branches): an absolute http(s) URL opens a new tab
// without opener whatever the caller passed; every other href keeps the caller's own target and rel.
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { anchorProps, LinkButton } from './Button';
import { Link } from './Link';

const EXTERNAL = ['https://hoody.com/docs', 'http://hoody.com', 'HTTPS://hoody.com/docs', 'Http://hoody.com'];
const INTERNAL = ['/bots?sel=x', '#/bots', 'mailto:help@hoody.com', 'httpsx://hoody.com', 'ftp://hoody.com', ' https://hoody.com', 'xhttps://hoody.com'];

describe('anchorProps', () => {
  it.each(EXTERNAL)('%s opens a new tab without opener, over the caller own target and rel', (href) => {
    expect(anchorProps(href, {})).toEqual({ href, target: '_blank', rel: 'noopener noreferrer' });
    expect(anchorProps(href, { target: '_self', rel: 'author' })).toEqual({ href, target: '_blank', rel: 'noopener noreferrer' });
  });

  it.each(INTERNAL)('%s keeps the caller own target and rel (and sets none of its own)', (href) => {
    expect(anchorProps(href, {})).toEqual({ href, target: undefined, rel: undefined });
    expect(anchorProps(href, { target: '_self', rel: 'author' })).toEqual({ href, target: '_self', rel: 'author' });
  });
});

// Link, LinkButton in a G6 colour (the chip branch) and LinkButton in a plain colour (the other branch): three render paths.
const PATHS: Array<[string, (href: string, own?: { target?: '_self'; rel?: string }) => ReactElement]> = [
  ['Link', (href, own) => <Link href={href} {...own}>Go</Link>],
  ['LinkButton chip branch', (href, own) => <LinkButton href={href} variant="primary" {...own}>Go</LinkButton>],
  ['LinkButton plain branch', (href, own) => <LinkButton href={href} variant="danger" {...own}>Go</LinkButton>],
];

describe.each(PATHS)('%s', (_name, make) => {
  it.each(EXTERNAL)('external %s: new tab, noopener noreferrer, caller values replaced', (href) => {
    render(make(href, { target: '_self', rel: 'author' }));
    const a = screen.getByRole('link', { name: 'Go' });
    expect(a).toHaveAttribute('href', href);
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each(INTERNAL)('internal %s: no target or rel of its own; the caller values pass through', (href) => {
    const { unmount } = render(make(href));
    const bare = screen.getByRole('link', { name: 'Go' });
    expect(bare).toHaveAttribute('href', href);
    expect(bare).not.toHaveAttribute('target');
    expect(bare).not.toHaveAttribute('rel');
    unmount();
    render(make(href, { target: '_self', rel: 'author' }));
    const own = screen.getByRole('link', { name: 'Go' });
    expect(own).toHaveAttribute('target', '_self');
    expect(own).toHaveAttribute('rel', 'author');
  });
});
