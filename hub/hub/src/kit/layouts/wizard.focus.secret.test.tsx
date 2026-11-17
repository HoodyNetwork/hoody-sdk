// A step whose first field is the kit SecretField
// (a value with Show and Copy, no input) focuses its first control on a transition, not a later field, a heading or
// the page title.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { capture, holdSecret, type HeldSecret } from '@core';
import { boot } from '@core/test/env';
import { SecretField } from '../forms/Secret';
import { WizardPage } from './Layouts';

const steps = [
  { id: 'a', label: 'One' },
  { id: 'b', label: 'Two' },
];

beforeEach(() => boot());

function held(): HeldSecret {
  const h = holdSecret('hk_3f9a7c2e5b8d1a0f4e6c9b2a7d5e8f1c', capture());
  if (!h) throw new Error('no held secret');
  return h;
}

let go: (i: number) => void = () => undefined;
async function mount(after: 'input' | 'heading' | 'none') {
  const h = held();
  const Root = () => {
    const [current, set] = useState(0);
    go = set;
    return (
      <WizardPage header={{ title: 'New key' }} steps={steps} current={current}>
        {current === 1 ? (
          <>
            <SecretField label="Your key" held={h} />
            {after === 'input' && <input aria-label="Later field" />}
            {after === 'heading' && <h2>Later heading</h2>}
          </>
        ) : (
          <h2>Start</h2>
        )}
      </WizardPage>
    );
  };
  const router = createRouter({ routeTree: createRootRoute({ component: Root }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  await act(async () => go(1));
}

describe('wizard_focus_secret_field_first', () => {
  for (const after of ['input', 'heading', 'none'] as const) {
    it(`a SecretField step focuses its Show control (followed by ${after})`, async () => {
      await mount(after);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show' }));
    });
  }
});
