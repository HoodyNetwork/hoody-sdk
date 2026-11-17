// Stop, Restart and Delete name the computer in a title that also shows its mark;
// the dialog's accessible name stays the plain title string. Run's danger confirm gains an "On <mark> name" line.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { queryClient } from '@core';
import { boot } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { renderPage } from '@app/testing';
import { DeleteComputer, StopConfirm } from './parts/Dialogs';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';


const atlas = computers.find((c) => c.name === 'atlas')!;
const heading = () => document.querySelector('[slot="title"]') as HTMLElement;

describe('computers: confirms that name a computer show its mark', () => {
  it.each([
    ['stop', 'Stop atlas?'],
    ['restart', 'Restart atlas?'],
  ] as const)('%s: accessible name is the plain title; the heading starts with the mark', (op, title) => {
    boot();
    expect(strings[`confirm.${op}.title`]).toBe(title.replace('atlas', '{{name}}'));
    render(<StopConfirm c={atlas} op={op} onClose={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByRole('alertdialog', { name: title })).toBeInTheDocument();
    const mark = heading().querySelector('[data-computer-color]');
    expect(mark).toHaveAttribute('data-computer-color', atlas.color?.toUpperCase());
    expect(heading().firstElementChild?.contains(mark)).toBe(true);
    expect(heading().textContent).toBe(title);
  });

  it('delete: the same, on the typed confirm', () => {
    boot();
    render(<QueryClientProvider client={queryClient}><DeleteComputer c={atlas} onClose={() => undefined} onDone={() => undefined} /></QueryClientProvider>);
    expect(screen.getByRole('alertdialog', { name: 'Delete atlas' })).toBeInTheDocument();
    expect(heading().querySelector('[data-computer-color]')).not.toBeNull();
    expect(heading().textContent).toBe('Delete atlas');
  });

  it('a computer without a valid colour: the title shows no mark and still reads the same', () => {
    boot();
    render(<StopConfirm c={{ ...atlas, color: 'red;x:url()' }} op="stop" onClose={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByRole('alertdialog', { name: 'Stop atlas?' })).toBeInTheDocument();
    expect(heading().querySelector('[data-computer-color]')).toBeNull();
    expect(document.body.innerHTML).not.toContain('url()');
  });
});

describe('computers: Run’s danger confirm names the computer with its mark', () => {
  it('shows "On <mark> borealis" above the body for a destructive command', async () => {
    const user = userEvent.setup();
    const target = computers.find((c) => c.name === 'borealis')!;
    await renderPage(page, { path: `/computers?sel=borealis.${target.id.slice(-4)}&tab=run` });
    const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 });
    await user.type(box, 'rm -rf /tmp/x');
    fireEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['run.confirm.title'] });
    const unit = within(dialog).getByText('borealis', { selector: 'strong' }).parentElement as HTMLElement;
    const line = unit.parentElement as HTMLElement;
    expect(line.textContent).toBe('On borealis');
    const mark = line.querySelector('[data-computer-color]');
    expect(mark).toHaveAttribute('data-computer-color', target.color?.toUpperCase());
    // the mark and the name are ONE unit (a long name can wrap inside it, never away from the mark), after "On"
    expect([...line.childNodes].map((n) => (n as Element).tagName ?? n.textContent?.trim())).toEqual(['On', 'SPAN']);
    expect([...unit.children].map((n) => n.tagName)).toEqual(['SPAN', 'STRONG']);
    expect(unit.className).toMatch(/markedName/);
    expect(within(dialog).getByText(/can delete data on borealis/)).toBeInTheDocument();
  });
});
