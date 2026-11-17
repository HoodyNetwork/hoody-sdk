// RowNote: a muted sentence in a table row's cell that wraps inside the cell. jsdom has no layout, so the
// wrap is checked on the rule the layout relies on; the browser fit is for a Playwright run.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RowNote } from './Display';
import * as kit from '../index';

const css = readFileSync(path.join(import.meta.dirname, 'Display.module.css'), 'utf8');
const rule = (sel: string) => new RegExp(`(?:^|\\n)\\.${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('RowNote', () => {
  it('shows its sentence and its children, keeping the page placement class beside its own', () => {
    render(
      <RowNote className="placed">
        <span aria-hidden="true" data-testid="dot" />
        Couldn't confirm it stopped
      </RowNote>,
    );
    const note = screen.getByText("Couldn't confirm it stopped");
    expect(note.tagName).toBe('SPAN');
    expect(note).toHaveClass('placed');
    expect(note.className.split(/\s+/).length).toBeGreaterThan(1);
    expect(screen.getByTestId('dot').parentElement).toBe(note);
    // A sentence, never an announcement: a state that changes on its own says so through its own region.
    expect(note).not.toHaveAttribute('role');
  });

  it('wraps inside the cell: table cells keep one line, so the note sets normal wrapping and breaks long words', () => {
    const r = rule('rowNote');
    expect(r).toMatch(/white-space:\s*normal/);
    expect(r).toMatch(/overflow-wrap:\s*anywhere/);
    expect(r).toMatch(/min-width:\s*0/);
    expect(r).toMatch(/color:\s*var\(--hx-muted\)/);
  });

  it('cut: one line ending in an ellipsis, still the muted note (the more specific rule wins over the wrap)', () => {
    render(<RowNote cut>ada@laptop</RowNote>);
    const note = screen.getByText('ada@laptop');
    expect(note.className.split(/\s+/).length).toBe(2);
    const r = /(?:^|\n)\.rowNote\.rowNoteCut\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(r).toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/overflow:\s*hidden/);
    expect(r).toMatch(/text-overflow:\s*ellipsis/);
    expect(r).toMatch(/overflow-wrap:\s*normal/);
    // Without hover there is no tooltip to read it by, so it wraps whole there.
    const touch = /@media \(pointer: coarse\), \(hover: none\) \{\s*\.rowNote\.rowNoteCut\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(touch).toMatch(/white-space:\s*normal/);
    expect(touch).toMatch(/overflow:\s*visible/);
    expect(touch).toMatch(/overflow-wrap:\s*anywhere/);
    // Keyboard: focus in its row wraps it whole (no tab stop of its own).
    const kb = /:is\(tr, \[role=(['"]?)row\1\], \[role=(['"]?)listitem\2\], li\):focus-within \.rowNote\.rowNoteCut\s*\{([^}]*)\}/.exec(css)?.[3] ?? '';
    expect(kb).toMatch(/white-space:\s*normal/);
    expect(kb).toMatch(/overflow:\s*visible/);
    render(<RowNote>plain</RowNote>);
    expect(screen.getByText('plain').className.split(/\s+/).length).toBe(1);
  });

  it('is a kit export', () => {
    expect(kit.RowNote).toBe(RowNote);
  });
});
