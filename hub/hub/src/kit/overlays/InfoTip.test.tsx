// InfoTip: both forms and their names; press, Enter and Space toggle a non-modal popover;
// Escape and an outside press close it with focus left on the trigger; one open at a time; aria-expanded, and
// aria-describedby only while open; a role="dialog" labelled by the trigger that never takes focus; hover opens it
// after 400 ms with a mouse, never with touch; text over 200 characters is refused; the FAQ link.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FaqItem } from '../layouts/Faq';
import { InfoTip, plainText } from './InfoTip';
import strings from './InfoTip.strings.en.json';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const TEXT = 'A realm is a separate space for your computers, keys and settings.';
const about = (subject: string) => strings['info.about'].replace('{{subject}}', subject);

const settle = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const tipDialog = () => screen.queryByRole('dialog');

describe('InfoTip names and forms', () => {
  it('the icon form is a button named "About {subject}", closed and collapsed', () => {
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.hasAttribute('aria-describedby')).toBe(false);
    expect(tipDialog()).toBeNull();
  });

  it('the term form is named by its visible words', () => {
    render(
      <p>
        Uses{' '}
        <InfoTip text={TEXT} subject="tools">
          7 tools
        </InfoTip>
      </p>,
    );
    const b = screen.getByRole('button', { name: '7 tools' });
    expect(b.hasAttribute('aria-label')).toBe(false);
    expect(b.textContent).toBe('7 tools');
  });

  it('an empty subject names the icon form "More information"', () => {
    render(<InfoTip text={TEXT} subject="" />);
    expect(screen.getByRole('button', { name: strings['info.more'] })).toBeTruthy();
  });

  it('plainText reads the words of a label', () => {
    expect(plainText('Realm')).toBe('Realm');
    expect(plainText(7)).toBe('7');
    expect(plainText(['Exec ', 'id'])).toBe('Exec id');
    expect(plainText(<b>Cwd</b>)).toBe('Cwd');
    expect(plainText(null)).toBe('');
  });
});

describe('InfoTip opening and closing', () => {
  it('a press opens a role=dialog labelled by the trigger; its text describes the trigger only while open; focus stays', async () => {
    const user = userEvent.setup();
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    await user.click(b);
    await settle();
    const d = screen.getByRole('dialog', { name: about('Realm') });
    expect(within(d).getByText(TEXT)).toBeTruthy();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const described = b.getAttribute('aria-describedby');
    expect(described && document.getElementById(described)?.textContent).toBe(TEXT);
    expect(document.activeElement).toBe(b);
    expect(d.contains(document.activeElement)).toBe(false);
    await user.click(b);
    await settle();
    expect(tipDialog()).toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.hasAttribute('aria-describedby')).toBe(false);
  });

  it('Enter and Space toggle it from the keyboard, focus never leaves the trigger', async () => {
    const user = userEvent.setup();
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    b.focus();
    await user.keyboard('{Enter}');
    await settle();
    expect(tipDialog()).not.toBeNull();
    expect(document.activeElement).toBe(b);
    await user.keyboard('{Enter}');
    await settle();
    expect(tipDialog()).toBeNull();
    await user.keyboard(' ');
    await settle();
    expect(tipDialog()).not.toBeNull();
    expect(document.activeElement).toBe(b);
    await user.keyboard(' ');
    await settle();
    expect(tipDialog()).toBeNull();
  });

  it('Escape closes it, focus stays on the trigger, and the Escape goes no further (one layer)', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    const onOuter = (e: KeyboardEvent) => e.key === 'Escape' && outer();
    document.addEventListener('keydown', onOuter);
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    await user.click(b);
    await settle();
    expect(tipDialog()).not.toBeNull();
    await user.keyboard('{Escape}');
    await settle();
    expect(tipDialog()).toBeNull();
    expect(document.activeElement).toBe(b);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onOuter);
  });

  it('an outside press closes it and leaves focus on the trigger', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoTip text={TEXT} subject="Realm" />
        <p data-testid="away">Elsewhere</p>
      </div>,
    );
    const b = screen.getByRole('button', { name: about('Realm') });
    await user.click(b);
    await settle();
    expect(tipDialog()).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId('away'));
    await settle();
    expect(tipDialog()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it('a press inside the popover keeps it open', async () => {
    const user = userEvent.setup();
    render(<InfoTip text={TEXT} subject="Realm" />);
    await user.click(screen.getByRole('button', { name: about('Realm') }));
    await settle();
    fireEvent.pointerDown(screen.getByText(TEXT));
    await settle();
    expect(tipDialog()).not.toBeNull();
  });

  // The second opens from the keyboard: no pointer press, so no outside press closes the first; only the one-open rule does.
  it('one InfoTip is open at a time, whatever opened the second', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoTip text="First explanation." subject="One" />
        <InfoTip text="Second explanation." subject="Two" />
      </div>,
    );
    const one = screen.getByRole('button', { name: about('One') });
    const two = screen.getByRole('button', { name: about('Two') });
    await user.click(one);
    await settle();
    two.focus();
    await user.keyboard('{Enter}');
    await settle();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: about('Two') })).toBeTruthy();
    expect(one.getAttribute('aria-expanded')).toBe('false');
    expect(two.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('InfoTip hover', () => {
  it('a mouse resting on the trigger opens it after 400 ms, not before; leaving closes a hover-opened tip', async () => {
    vi.useFakeTimers();
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    fireEvent.pointerOver(b, { pointerType: 'mouse' });
    fireEvent.pointerEnter(b, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(399));
    expect(tipDialog()).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(tipDialog()).not.toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerOut(b, { pointerType: 'mouse' });
    fireEvent.pointerLeave(b, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(200));
    expect(tipDialog()).toBeNull();
  });

  it('touch never opens it on hover', () => {
    vi.useFakeTimers();
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    fireEvent.pointerOver(b, { pointerType: 'touch' });
    fireEvent.pointerEnter(b, { pointerType: 'touch' });
    act(() => void vi.advanceTimersByTime(1000));
    expect(tipDialog()).toBeNull();
  });

  it('a press on a hover-opened tip pins it open', () => {
    vi.useFakeTimers();
    render(<InfoTip text={TEXT} subject="Realm" />);
    const b = screen.getByRole('button', { name: about('Realm') });
    fireEvent.pointerOver(b, { pointerType: 'mouse' });
    fireEvent.pointerEnter(b, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.click(b);
    fireEvent.pointerOut(b, { pointerType: 'mouse' });
    fireEvent.pointerLeave(b, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(500));
    expect(tipDialog()).not.toBeNull();
  });
});

describe('InfoTip text and FAQ', () => {
  it('refuses text over 200 characters; 200 is fine', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<InfoTip text={'x'.repeat(201)} subject="Realm" />)).toThrow(/at most 200/);
    expect(() => render(<InfoTip text={'x'.repeat(200)} subject="Edge" />)).not.toThrow();
  });

  it('shows the FAQ link after the text, reachable by Tab from the trigger', async () => {
    const item: FaqItem = { id: 'realm', q: 'What is a realm?', a: 'A separate space.' };
    const user = userEvent.setup();
    await mount(() => <InfoTip text={TEXT} subject="Realm" faq={{ item, label: 'More about realms' }} />);
    const b = screen.getByRole('button', { name: about('Realm') });
    await user.click(b);
    await settle();
    const d = screen.getByRole('dialog', { name: about('Realm') });
    const link = within(d).getByText('More about realms');
    expect(within(d).getByText(TEXT).compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(b);
    await user.tab();
    expect(d.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    await settle();
    expect(document.activeElement).toBe(b);
  });
});
