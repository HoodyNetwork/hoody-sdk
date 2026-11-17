// One section container. A SettingsPage
// section takes AnatomySection's slots (actions, notices, state, empty, note, count, About, promise), drawn by the same
// kit parts, so a settings section and an AnatomySection read and behave alike. The settings chrome stays as it was.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, within } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Band } from '../states/Band';
import type { EmptyProof, SectionState } from './anatomy/types';
import { SettingsPage, type SettingsSection } from './Layouts';

const PROOF = {} as unknown as EmptyProof;

async function show(sections: SettingsSection[]) {
  const ui = (): ReactElement => <SettingsPage header={{ title: 'Account' }} sections={sections} />;
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const sectionOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section')!;

describe('SettingsSection: the AnatomySection slots', () => {
  it('actions draw the kit ActionBar in the head; the primary is off while the section is still reading', async () => {
    const onPress = vi.fn();
    await show([
      { id: 'keys', title: 'Keys', content: <p>rows</p>, actions: { primary: { id: 'add', label: 'Add a key', onPress } } },
      { id: 'more', title: 'More keys', content: <p>rows</p>, state: { kind: 'loading' }, actions: { primary: { id: 'add2', label: 'Add another', onPress } } },
    ]);
    const add = within(sectionOf('Keys')).getByRole('button', { name: 'Add a key' });
    expect(add).toBeEnabled();
    const off = within(sectionOf('More keys')).getByRole('button', { name: /Add another/ });
    expect(off.getAttribute('aria-disabled') === 'true' || (off as HTMLButtonElement).disabled).toBe(true);
  });

  it('notices sit above the body, a note under it, the promise always shown', async () => {
    await show([{ id: 'pw', title: 'Password', content: <p>form</p>, notices: <Band tone="warn">Your password is old.</Band>, note: 'Changes sign out other devices.', promise: 'We never see your password.' }]);
    const sec = sectionOf('Password');
    const text = sec.textContent!;
    expect(text.indexOf('Your password is old.')).toBeLessThan(text.indexOf('form'));
    expect(text.indexOf('form')).toBeLessThan(text.indexOf('Changes sign out other devices.'));
    expect(within(sec).getByText('We never see your password.')).toBeTruthy();
  });

  it('a failed read draws the kit ErrorState in place of the content; an empty one its empty spec', async () => {
    await show([
      { id: 'a', title: 'Sessions', content: <p>table</p>, state: { kind: 'failed', error: new Error('x'), onRetry: () => undefined } },
      { id: 'b', title: 'Devices', content: <p>list</p>, state: { kind: 'empty', proof: PROOF }, empty: { title: 'No devices yet', body: 'Sign in on a phone to see it here.' } },
    ]);
    expect(within(sectionOf('Sessions')).queryByText('table')).toBeNull();
    expect(within(sectionOf('Sessions')).getByRole('button', { name: /Try again|Retry/ })).toBeTruthy();
    expect(within(sectionOf('Devices')).queryByText('list')).toBeNull();
    expect(within(sectionOf('Devices')).getByText('No devices yet')).toBeTruthy();
  });

  it('a whole count shows beside the title, and About holds the extra words', async () => {
    await show([{ id: 'k', title: 'Keys', content: <p>rows</p>, count: { total: 3 } as never, info: 'Keys sign you in from a terminal.' }]);
    const sec = sectionOf('Keys');
    expect(within(sec).getByText('3')).toBeTruthy();
    expect(within(sec).getByRole('button', { name: /About|Keys/ })).toBeTruthy();
  });

  it('without the new slots a section is drawn as before', async () => {
    await show([{ id: 'p', title: 'Plain', content: <p>body</p> }]);
    const sec = sectionOf('Plain');
    expect(sec).toHaveAttribute('data-section', 'p');
    expect(within(sec).getByText('body')).toBeTruthy();
    expect(within(sec).queryByRole('button')).toBeNull();
  });

  it('focus follows the primary between the head and the empty state, both ways', async () => {
    let setState: (st: SectionState) => void = () => undefined;
    const EMPTY = { title: 'No keys yet', body: 'Add a key to sign in from a terminal.' };
    function Host() {
      const [st, set] = useState<SectionState>({ kind: 'ready' });
      setState = set;
      return <SettingsPage header={{ title: 'Account' }} sections={[{ id: 'keys', title: 'Keys', content: <p>rows</p>, actions: { primary: { id: 'add', label: 'Add a key', onPress: () => undefined } }, state: st, empty: EMPTY }]} />;
    }
    const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    const head = screen.getByRole('button', { name: 'Add a key' });
    act(() => head.focus());
    act(() => setState({ kind: 'empty', proof: PROOF }));
    const moved = screen.getByRole('button', { name: 'Add a key' });
    expect(moved).not.toBe(head);
    expect(moved).toHaveFocus();
    act(() => setState({ kind: 'ready' }));
    const back = screen.getByRole('button', { name: 'Add a key' });
    expect(back).not.toBe(moved);
    expect(back).toHaveFocus();
  });

  it('a section with the slots takes the anatomy rhythm; a plain one keeps its old classes', async () => {
    await show([
      { id: 'a', title: 'Slotted', content: <p>x</p>, note: 'A note.' },
      { id: 'b', title: 'Plain', content: <p>y</p> },
    ]);
    expect(sectionOf('Slotted').className).toMatch(/rhythm/);
    expect(sectionOf('Plain').className).not.toMatch(/rhythm/);
  });
});
