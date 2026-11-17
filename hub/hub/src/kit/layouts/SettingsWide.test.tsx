// SettingsSection `wide`: with a summary rail, the sections from the
// first wide one onward render in a second part placed under the form and summary columns at
// >= 1180; without a summary, `wide` changes nothing.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SettingsPage, type SettingsSection } from './Layouts';

const sections: SettingsSection[] = [
  { id: 'password', title: 'Password', content: <p>pw</p> },
  { id: 'sessions', title: 'Sign-in sessions', content: <p>table</p>, wide: true },
  { id: 'agent', title: 'Agent sign-in', content: <p>agent</p> },
];

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const partOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section')!.parentElement!;

describe('SettingsSection wide', () => {
  it('with a summary, the first wide section and every later one move to the wide part', async () => {
    await inRouter(() => <SettingsPage header={{ title: 'Account' }} sections={sections} summary={<p>sum</p>} footer={<p>save</p>} />);
    const head = partOf('Password');
    const wide = partOf('Sign-in sessions');
    expect(wide).not.toBe(head);
    expect(wide).toHaveAttribute('data-hub-wide-part');
    expect(partOf('Agent sign-in')).toBe(wide);
    expect(screen.getByRole('heading', { level: 2, name: 'Sign-in sessions' }).closest('section')).toHaveAttribute('data-wide');
    expect(screen.getByRole('heading', { level: 2, name: 'Agent sign-in' }).closest('section')).not.toHaveAttribute('data-wide');
    // The save bar stays at the end of the form, after the last section.
    expect(wide.lastElementChild).toHaveTextContent('save');
    // Reading order: form sections, the summary, then the wide part.
    const order = [...document.querySelectorAll('section h2, aside')].map((el) => el.textContent);
    expect(order).toEqual(['Password', 'sum', 'Sign-in sessions', 'Agent sign-in']);
  });

  it('without a summary, wide changes nothing: one body holds every section', async () => {
    await inRouter(() => <SettingsPage header={{ title: 'Account' }} sections={sections} />);
    expect(partOf('Sign-in sessions')).toBe(partOf('Password'));
    expect(document.querySelector('[data-hub-wide-part]')).toBeNull();
  });

  it('the wide part spans form + summary at >= 1180 and follows the form column below it', () => {
    const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');
    expect(css).toMatch(/\.withSummary \.settingsWide \{[^}]*grid-column: -3 \/ -1;[^}]*grid-row: 2;/);
    expect(css).toMatch(/\.settingsWide > \.settingsSection:not\(\[data-wide\]\),\s*\.settingsWide > \.saveBar \{[^}]*max-inline-size: var\(--form-max\);/);
    expect(css).toMatch(/\.withRail\.withSummary\.hasWide \.settingsNav \{[^}]*grid-row: 1 \/ span 2;/);
  });
});
