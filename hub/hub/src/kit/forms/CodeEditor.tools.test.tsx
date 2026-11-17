// CodeEditor `tools`: a page's controls sit at the end of the editor's own button row (Find, Tab moves focus), before
// the spacer, so they never ride the Ln/Col status line at the far end.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeEditor } from './CodeEditor';
import s from './CodeEditor.module.css';

describe('CodeEditor tools', () => {
  it('follow the editor buttons and come before the spacer and the caret line', () => {
    render(<CodeEditor value="x" onChange={() => undefined} tools={<button type="button">Download</button>} />);
    const row = document.querySelector(`.${s.tools}`)!;
    const kids = [...row.children];
    const at = (el: Element) => kids.findIndex((k) => k === el || k.contains(el));
    const tool = at(screen.getByRole('button', { name: 'Download' }));
    const find = at(screen.getByRole('button', { name: /find/i }));
    const spacer = kids.findIndex((k) => k.classList.contains(s.spacer ?? 'spacer'));
    const caret = at(screen.getByText(/Ln 1/));
    expect(find).toBeGreaterThanOrEqual(0);
    expect(tool).toBeGreaterThan(find);
    expect(tool).toBeLessThan(spacer);
    expect(spacer).toBeLessThan(caret);
  });
});
