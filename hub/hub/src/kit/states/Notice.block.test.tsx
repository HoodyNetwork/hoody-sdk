// Notice `block`: a warning frame that holds structured content (a heading and a list) with the notice look and no
// live role; with a `title` it is a group named by its kit Heading. The sentence notice is unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Band';

const css = readFileSync(join(__dirname, 'Band.module.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

describe('Notice block', () => {
  it('titled: a group named by its heading, holding a list, with no live role', () => {
    render(
      <Notice level="warn" block title="Needs you">
        <ul>
          <li>Add funds</li>
        </ul>
      </Notice>,
    );
    expect(screen.getByRole('heading', { name: 'Needs you' }).closest('[data-notice]')).not.toBeNull();
    const region = screen.getByRole('group', { name: 'Needs you' });
    expect(region).toHaveAttribute('data-notice', 'warn');
    expect(region.className).toMatch(/warn/);
    // Valid structure: the list and heading sit in a block body, never in a span or a p.
    const list = screen.getByRole('list');
    expect(list.closest('span, p')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('defaults to a div; the sentence notice stays a p with a text span', () => {
    const { container } = render(
      <>
        <Notice block>
          <p>One</p>
          <p>Two</p>
        </Notice>
        <Notice>One sentence.</Notice>
      </>,
    );
    const [blk, line] = [...container.querySelectorAll('[data-notice]')];
    expect(blk!.tagName).toBe('DIV');
    expect(line!.tagName).toBe('P');
    expect(line!.querySelector('span')).toHaveTextContent('One sentence.');
  });

  it('CSS: the block body stacks its children and the icon sits at the top start', () => {
    expect(rule('.block > .text')).toMatch(/display: grid;/);
    expect(rule('.block > .icon')).toMatch(/align-self: flex-start;/);
  });
});
