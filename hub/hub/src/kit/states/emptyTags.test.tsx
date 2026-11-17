// An EmptyState body that holds Tags inline (a row of names that wraps) spaces its lines for them: each line is one Tag
// plus one line gap tall, so two rows of Tags never touch. jsdom has no layout, so the proof is in two parts: the rule
// (a body holding a Tag as a direct child gets the taller line) and the markup it keys on (a Tag carries data-hx-tag,
// and the Tags written into the body are direct children of the body).
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Tag } from '../data/Display';
import { EmptyState } from './States';

const css = readFileSync(join(__dirname, 'States.module.css'), 'utf8');
const tokens = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');

describe('EmptyState body with inline Tags', () => {
  it('a body holding a Tag sets every line one Tag plus one line gap tall', () => {
    const rule = css.match(/^\.emptyBody:has\(> \[data-hx-tag\]\) \{([^}]*)\}/m)?.[1] ?? '';
    expect(rule).toMatch(/line-height:\s*calc\(var\(--tag-h\) \+ var\(--gap-line\)\);/);
    // Both tokens exist, and the gap is a real step (not 0).
    expect(tokens).toMatch(/--tag-h:\s*\d+px;/);
    expect(tokens).toMatch(/--gap-line:\s*var\(--sp-\d\);/);
  });

  it('plain text bodies keep the kit line height (the rule keys on a Tag only)', () => {
    const plain = css.match(/^\.emptyBody \{([^}]*)\}/m)?.[1] ?? '';
    expect(plain).toMatch(/line-height:\s*var\(--lh-box-body\);/);
  });

  it('every Tag carries the marker, removable ones too', () => {
    const { container } = render(
      <>
        <Tag>Photos</Tag>
        <Tag onRemove={() => undefined}>Backups</Tag>
      </>,
    );
    expect(container.querySelectorAll('[data-hx-tag]')).toHaveLength(2);
  });

  it('Tags written into the body are direct children of the body the rule reads', () => {
    const { container } = render(
      <EmptyState
        title="Nothing connected yet"
        body={
          <>
            Works with{'\n'}
            <Tag>Photos</Tag> <Tag>Backups</Tag>
            {'\n'}and 40 more
          </>
        }
      />,
    );
    const tags = container.querySelectorAll('[data-hx-tag]');
    expect(tags).toHaveLength(2);
    tags.forEach((tag) => expect(tag.parentElement!.tagName).toBe('P'));
  });
});
