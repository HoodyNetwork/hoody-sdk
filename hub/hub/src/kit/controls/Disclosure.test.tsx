import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('starts closed, opens on press and reports aria-expanded', () => {
    render(
      <Disclosure title="More options" description="Model and memory">
        <p>Inside</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole('button', { name: /More options/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Inside')).toBeVisible();
  });

  it('puts `id` on the root element as its DOM id (a FAQ item is the anchor faq-<id>)', () => {
    const { container } = render(
      <Disclosure id="faq-hold" title="When can I use my credit?">
        <p>After 60 days.</p>
      </Disclosure>,
    );
    const root = document.getElementById('faq-hold');
    expect(root).not.toBeNull();
    // The root is the element that holds both the heading and the panel.
    expect(root).toBe(container.firstElementChild);
    expect(root?.contains(screen.getByRole('button', { name: /When can I use/ }))).toBe(true);
    expect(root?.contains(screen.getByText('After 60 days.'))).toBe(true);
  });

  it('sets the heading level of the trigger heading, and keeps the default without `level`', () => {
    render(
      <>
        <Disclosure level={4} title="Deep question">
          <p>a</p>
        </Disclosure>
        <Disclosure title="Default question">
          <p>b</p>
        </Disclosure>
      </>,
    );
    expect(screen.getByRole('heading', { level: 4, name: /Deep question/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Default question/ })).toBeInTheDocument();
  });

  it('hands the trigger button to `triggerRef`', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Disclosure triggerRef={ref} title="Ref question">
        <p>a</p>
      </Disclosure>,
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: /Ref question/ }));
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });
});

describe('Disclosure heading={false}: a fold inside a list row', () => {
  it('draws the same trigger and panel with no heading around the trigger', () => {
    const { container } = render(
      <Disclosure heading={false} title="Advanced details">
        <p>Inside</p>
      </Disclosure>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Advanced details' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-row-fold]')).not.toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });

  it('by default the trigger still sits in a heading', () => {
    render(
      <Disclosure title="More options">
        <p>Inside</p>
      </Disclosure>,
    );
    expect(screen.getByRole('heading', { name: /More options/ })).toBeInTheDocument();
  });
});

