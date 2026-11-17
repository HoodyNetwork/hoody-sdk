import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { SecretInput } from './Secret';

// A browser pairs a password input with the text field before it and fills a saved login into both, and it ignores
// autocomplete="off" on a password input. Every SecretInput says new-password and opts out of the password managers.
const NO_FILL = { 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' };

beforeEach(() => {
  boot();
});

async function show(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

function Field(props: { multiline?: boolean; reveal?: boolean; kind?: 'secret' | 'current-password' | 'new-password' }) {
  const [v, setV] = useState('');
  return <SecretInput label="Bot token" value={v} onChange={setV} {...props} />;
}

function expectNoFill(el: HTMLElement) {
  expect(el.getAttribute('autocomplete')).toBe('new-password');
  for (const [k, v] of Object.entries(NO_FILL)) expect(el.getAttribute(k), k).toBe(v);
}

describe('SecretInput autofill', () => {
  it('single line: new-password, never off, and the password-manager opt-outs on the input itself', async () => {
    await show(() => <Field />);
    const input = screen.getByLabelText('Bot token');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('autocomplete')).not.toBe('off');
    expectNoFill(input);
  });

  it('single line without a reveal button and while shown keeps the same attributes', async () => {
    await show(() => <Field reveal={false} />);
    expectNoFill(screen.getByLabelText('Bot token'));
  });

  it('shown (text type) keeps the same attributes', async () => {
    await show(() => <Field />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Bot token'), { target: { value: 'sk-123' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show what you typed' }));
    });
    const input = screen.getByLabelText('Bot token') as HTMLInputElement;
    expect(input.type).toBe('text');
    expectNoFill(input);
  });

  it('multiline: the textarea has the same attributes, never off', async () => {
    await show(() => <Field multiline />);
    const area = screen.getByLabelText('Bot token');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('autocomplete')).not.toBe('off');
    expectNoFill(area);
  });
});

describe('SecretInput kind', () => {
  it('current-password: says current-password and carries none of the opt-outs, so a saved password fills', async () => {
    await show(() => <Field kind="current-password" />);
    const input = screen.getByLabelText('Bot token');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    for (const k of Object.keys(NO_FILL)) expect(input.hasAttribute(k), k).toBe(false);
  });

  it('current-password stays itself while shown and without a reveal button', async () => {
    await show(() => <Field kind="current-password" />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Bot token'), { target: { value: 'sk-123' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show what you typed' }));
    });
    const input = screen.getByLabelText('Bot token') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    expect(input.hasAttribute('data-1p-ignore')).toBe(false);
  });

  it('current-password on a multiline field also drops the opt-outs', async () => {
    await show(() => <Field kind="current-password" multiline />);
    const area = screen.getByLabelText('Bot token');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('autocomplete')).toBe('current-password');
    for (const k of Object.keys(NO_FILL)) expect(area.hasAttribute(k), k).toBe(false);
  });

  it('secret (named) is the default: new-password plus the opt-outs', async () => {
    await show(() => <Field kind="secret" />);
    expectNoFill(screen.getByLabelText('Bot token'));
  });

  it('new-password: says new-password and carries none of the opt-outs, so a manager may offer to save or generate', async () => {
    await show(() => <Field kind="new-password" />);
    const input = screen.getByLabelText('Bot token');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    for (const k of Object.keys(NO_FILL)) expect(input.hasAttribute(k), k).toBe(false);
  });

  it('new-password on a multiline field also drops the opt-outs', async () => {
    await show(() => <Field kind="new-password" multiline />);
    const area = screen.getByLabelText('Bot token');
    expect(area.getAttribute('autocomplete')).toBe('new-password');
    for (const k of Object.keys(NO_FILL)) expect(area.hasAttribute(k), k).toBe(false);
  });
});
