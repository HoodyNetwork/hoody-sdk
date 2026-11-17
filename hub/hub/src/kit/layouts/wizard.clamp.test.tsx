// A deep link past what is reachable is clamped only once the
// draft's restoration is done (`ready`), by replacing the URL, never pushing. The old call useWizardStep(steps[, param])
// keeps its behaviour (New realm).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { parseSearch, stringifySearch } from '@app/router';
import { useWizardStep, type WizardStepOptions } from './Layouts';

const steps = [
  { id: 'what', label: 'What' },
  { id: 'where', label: 'Where' },
  { id: 'check', label: 'Check' },
];

let seen: { index: number; go: (i: number) => void } | null = null;
function Probe({ opts }: { opts?: string | WizardStepOptions }) {
  const [index, go] = useWizardStep(steps, opts);
  seen = { index, go };
  return <p>step {index}</p>;
}

let setOpts: (o: string | WizardStepOptions | undefined) => void = () => undefined;
async function mount(at: string, first: string | WizardStepOptions | undefined) {
  const history = createMemoryHistory({ initialEntries: [at] });
  const Root = () => {
    const [o, set] = useState(first);
    setOpts = set;
    return <Probe opts={o} />;
  };
  const router = createRouter({ routeTree: createRootRoute({ component: Root }), history, parseSearch, stringifySearch });
  render(<RouterProvider router={router} />);
  await act(async () => { await router.load(); });
  return { history, router };
}

describe('wizard_clamp_waits_for_ready', () => {
  it('before ready the link step stays and the URL is untouched; once ready it is clamped with a replace', async () => {
    const { history, router } = await mount('/?step=check', { reachable: 1, ready: false });
    expect(await screen.findByText('step 2')).toBeTruthy();
    expect(history.location.search).toBe('?step=check');
    const length = history.length;
    await act(async () => { setOpts({ reachable: 1, ready: true }); });
    expect(await screen.findByText('step 1')).toBeTruthy();
    await act(async () => { await router.load(); });
    expect(history.location.search).toBe('?step=where');
    expect(history.length).toBe(length);
  });
  it('a link within reach is never touched', async () => {
    const { history } = await mount('/?step=where', { reachable: 2, ready: true });
    expect(await screen.findByText('step 1')).toBeTruthy();
    expect(history.location.search).toBe('?step=where');
  });
  it('without options (or with a param name) nothing is clamped, as before', async () => {
    const { history } = await mount('/?s=check', 's');
    expect(await screen.findByText('step 2')).toBeTruthy();
    expect(history.location.search).toBe('?s=check');
    expect(seen).not.toBeNull();
  });
  it('going to a step pushes it (Back walks the steps)', async () => {
    const { history } = await mount('/', { reachable: 2 });
    const length = history.length;
    await act(async () => { seen!.go(2); });
    expect(history.location.search).toBe('?step=check');
    expect(history.length).toBe(length + 1);
  });
});
