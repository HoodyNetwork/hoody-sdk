// ActionCards: a named list of cards; each card has a heading one level below its section, one line, and real links and
// buttons in its action row; the card itself is no press (no role, no tab stop, no click handler). Tokens only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { HeadingLevel } from '../layouts/anatomy/Heading';
import { ActionCards } from './ActionCards';

const css = readFileSync(join(__dirname, 'ActionCards.module.css'), 'utf8');

beforeEach(() => {
  boot();
});

describe('ActionCards', () => {
  it('is a list named by its label; each card has a heading, its line and its own actions', async () => {
    const add = vi.fn();
    render(
      <HeadingLevel>
        <ActionCards
          label="Tools"
          cards={[
            { id: 'terminal', icon: 'terminal', title: 'Terminal', body: 'A shell on the computer.', actions: <><a href="#/computers">Open</a><Button onPress={add}>Add to Board</Button></> },
            { id: 'files', title: 'Files', body: 'Browse and edit.' },
          ]}
        />
      </HeadingLevel>,
    );
    const list = screen.getByRole('list', { name: 'Tools' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const h = within(items[0]!).getByRole('heading', { name: 'Terminal' });
    expect(h.tagName).toBe('H3');
    expect(items[0]).toHaveTextContent('A shell on the computer.');
    expect(within(items[0]!).getByRole('link', { name: 'Open' })).toBeTruthy();
    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Add to Board' }));
    expect(add).toHaveBeenCalledTimes(1);
    // The card is not a press: no role, no tab stop of its own.
    expect(items[0]).not.toHaveAttribute('tabindex');
    expect(items[0]).not.toHaveAttribute('role');
    // A card without actions draws no empty action row.
    expect(items[1]!.children).toHaveLength(2);
  });

  it('CSS: a list reset, the CardGrid column formula, tokens only', () => {
    expect(css).toMatch(/list-style: none;/);
    expect(css).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, calc\(4 \* var\(--sp-10\)\)\), 1fr\)\);/);
    // No raw px or colour values.
    expect(css).not.toMatch(/\d+px|#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
